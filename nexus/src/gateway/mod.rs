// AI 网关 - 多模型路由 + 限流 + 流式代理
//
// 架构:
//   客户端 → Nexus Gateway → 上游 AI 服务 (OpenAI / 百炼 / 智谱 / ...)
//
// 端点:
//   POST /v1/chat/completions  - 聊天补全 (支持 stream=true 的 SSE 流式响应)
//   POST /v1/embeddings         - 文本嵌入
//   GET  /v1/models             - 列出可用模型
//
// 限流器 (RateLimiter):
//   基于 Token Bucket 算法, 以用户ID为key
//   每分钟 N 次请求 (由 NEXUS_GATEWAY_RATE_LIMIT 控制, 默认 30)
//
// 安全:
//   - 所有网关接口需要 Bearer Token 认证
//   - API Key 通过环境变量注入, 不返回给客户端
//   - 上游请求设置超时 (NEXUS_GATEWAY_TIMEOUT_SECS, 默认 120s)

use crate::error::{AppError, Result};
use crate::AppState;
use axum::extract::State;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::Extension;
use axum::Json;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub stream: bool,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,
}

fn default_temperature() -> f32 {
    0.7
}

fn default_max_tokens() -> u32 {
    4096
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingRequest {
    pub model: String,
    pub input: EmbeddingInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EmbeddingInput {
    Single(String),
    Multiple(Vec<String>),
}

pub struct RateLimiter {
    counters: Mutex<HashMap<String, (Instant, u32)>>,
    max_per_minute: u32,
}

impl RateLimiter {
    pub fn new(max_per_minute: u32) -> Self {
        Self {
            counters: Mutex::new(HashMap::new()),
            max_per_minute,
        }
    }

    pub async fn check(&self, key: &str) -> Result<()> {
        let mut counters = self.counters.lock().await;
        let now = Instant::now();
        let entry = counters.entry(key.to_string()).or_insert((now, 0));

        if now.duration_since(entry.0).as_secs() >= 60 {
            *entry = (now, 1);
            return Ok(());
        }

        if entry.1 >= self.max_per_minute {
            return Err(AppError::BadRequest(format!(
                "rate limit exceeded: {} requests per minute",
                self.max_per_minute
            )));
        }

        entry.1 += 1;
        Ok(())
    }
}

pub async fn chat_completions(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<crate::auth::AuthenticatedUser>,
    Json(req): Json<ChatCompletionRequest>,
) -> Result<axum::response::Response> {
    if !state.config.gateway.enabled {
        return Err(AppError::BadRequest("ai gateway is disabled".into()));
    }

    state.gateway_rate_limiter.check(&user.user_id).await?;

    let upstream = state
        .config
        .gateway
        .upstream_models
        .iter()
        .find(|m| m.name == req.model)
        .ok_or_else(|| {
            AppError::BadRequest(format!(
                "unknown model: {}. available: {}",
                req.model,
                state
                    .config
                    .gateway
                    .upstream_models
                    .iter()
                    .map(|m| m.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            ))
        })?;

    let api_key = state
        .config
        .gateway
        .api_keys
        .get(&upstream.api_key_env)
        .cloned()
        .or_else(|| std::env::var(&upstream.api_key_env).ok())
        .ok_or_else(|| {
            AppError::Config(format!(
                "api key not found for model {}: check env {}",
                req.model, upstream.api_key_env
            ))
        })?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(state.config.gateway.request_timeout_secs))
        .build()?;

    let url = format!(
        "{}/v1/chat/completions",
        upstream.base_url.trim_end_matches('/')
    );

    let upstream_req = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&req)
        .send()
        .await?;

    let status = upstream_req.status();
    let headers = upstream_req.headers().clone();

    if req.stream {
        let stream = upstream_req.bytes_stream();
        let sse_stream = stream.map(|chunk| match chunk {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes).to_string();
                Ok(Event::default().data(text))
            }
            Err(e) => Err(axum::Error::new(e)),
        });

        Ok(
            Sse::new(sse_stream)
                .keep_alive(KeepAlive::default())
                .into_response(),
        )
    } else {
        let body = upstream_req.bytes().await?;

        if !status.is_success() {
            let body_str = String::from_utf8_lossy(&body).to_string();
            tracing::warn!(
                upstream_status = %status.as_u16(),
                model = %req.model,
                "upstream error"
            );
            return Err(AppError::Upstream {
                status: status.as_u16(),
                body: body_str,
            });
        }

        let mut response = axum::response::Response::new(axum::body::Body::from(body));
        *response.status_mut() = status;
        for (key, value) in headers.iter() {
            if key != "transfer-encoding" && key != "content-length" {
                response.headers_mut().insert(key.clone(), value.clone());
            }
        }

        Ok(response)
    }
}

pub async fn embeddings(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<crate::auth::AuthenticatedUser>,
    Json(req): Json<EmbeddingRequest>,
) -> Result<Json<serde_json::Value>> {
    if !state.config.gateway.enabled {
        return Err(AppError::BadRequest("ai gateway is disabled".into()));
    }

    state.gateway_rate_limiter.check(&user.user_id).await?;

    let upstream = state
        .config
        .gateway
        .upstream_models
        .iter()
        .find(|m| m.name == req.model)
        .ok_or_else(|| {
            AppError::BadRequest(format!("unknown embedding model: {}", req.model))
        })?;

    let api_key = state
        .config
        .gateway
        .api_keys
        .get(&upstream.api_key_env)
        .cloned()
        .or_else(|| std::env::var(&upstream.api_key_env).ok())
        .ok_or_else(|| {
            AppError::Config(format!("api key not found for model {}", req.model))
        })?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(state.config.gateway.request_timeout_secs))
        .build()?;

    let url = format!(
        "{}/v1/embeddings",
        upstream.base_url.trim_end_matches('/')
    );

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&req)
        .send()
        .await?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await?;

    if !status.is_success() {
        return Err(AppError::Upstream {
            status: status.as_u16(),
            body: body.to_string(),
        });
    }

    Ok(Json(body))
}

pub async fn list_models(
    State(state): State<Arc<AppState>>,
    Extension(_user): Extension<crate::auth::AuthenticatedUser>,
) -> Json<serde_json::Value> {
    let models: Vec<serde_json::Value> = state
        .config
        .gateway
        .upstream_models
        .iter()
        .map(|m| {
            serde_json::json!({
                "id": m.name,
                "provider": m.provider,
            })
        })
        .collect();

    Json(serde_json::json!({
        "object": "list",
        "data": models
    }))
}