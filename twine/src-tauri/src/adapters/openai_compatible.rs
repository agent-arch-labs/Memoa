use crate::adapters::base::{ChatResult, Message, StreamChunk, UsageInfo, ModelConfig};
use crate::error::{AppError, AppResult};
use futures_util::stream::StreamExt;
use tokio_util::sync::CancellationToken;

pub struct OpenAiCompatibleAdapter;

impl OpenAiCompatibleAdapter {
    fn build_chat_url(api_url: &str) -> String {
        let mut url = api_url.to_string();
        if !url.contains("/chat/completions") {
            url = url.trim_end_matches('/').to_string();
            if !url.ends_with("/v1") {
                url = format!("{}/v1", url);
            }
            url = format!("{}/chat/completions", url);
        }
        url
    }

    fn build_embed_url(api_url: &str) -> String {
        let mut url = api_url
            .trim_end_matches('/')
            .trim_end_matches("/chat/completions")
            .trim_end_matches("/embeddings")
            .trim_end_matches('/')
            .to_string();
        if !url.ends_with("/v1") {
            url = format!("{}/v1", url);
        }
        format!("{}/embeddings", url)
    }

    fn build_models_url(api_url: &str) -> String {
        let mut url = api_url.to_string();
        url = url.trim_end_matches('/').to_string();
        if !url.ends_with("/v1") {
            url = format!("{}/v1", url);
        }
        format!("{}/models", url)
    }

    fn add_auth(req: reqwest::RequestBuilder, api_key: &str) -> reqwest::RequestBuilder {
        if api_key.is_empty() {
            req
        } else {
            req.header("Authorization", format!("Bearer {}", api_key))
        }
    }

    pub async fn chat(&self, messages: Vec<Message>, config: &ModelConfig) -> AppResult<ChatResult> {
        let url = Self::build_chat_url(&config.api_url);
        let client = crate::http_client::get_client();
        let request = Self::add_auth(client.post(&url), &config.api_key);

        let body = serde_json::json!({
            "model": config.model_id,
            "messages": messages.iter().map(|m| {
                serde_json::json!({ "role": m.role, "content": m.content })
            }).collect::<Vec<_>>(),
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "stream": false,
        });

        let response = request
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Other(format!("API 连接失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AppError::Other(format!("API 错误 HTTP {}: {}", status, text)));
        }

        let body: serde_json::Value = response.json().await?;
        let content = body["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let usage = if let Some(u) = body.get("usage") {
            Some(UsageInfo {
                prompt_tokens: u["prompt_tokens"].as_u64().unwrap_or(0) as u32,
                completion_tokens: u["completion_tokens"].as_u64().unwrap_or(0) as u32,
            })
        } else {
            None
        };

        Ok(ChatResult {
            content,
            model: config.model_id.clone(),
            usage,
        })
    }

    pub async fn embed(&self, text: &str, config: &ModelConfig) -> AppResult<(Vec<f32>, u32)> {
        let url = Self::build_embed_url(&config.api_url);
        let client = crate::http_client::get_client();
        let request = Self::add_auth(client.post(&url), &config.api_key);

        let response = request
            .json(&serde_json::json!({
                "model": config.model_id,
                "input": text,
            }))
            .send()
            .await
            .map_err(|e| AppError::Other(format!("Embedding API 连接失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AppError::Other(format!("Embedding API HTTP {}: {}", status, text)));
        }

        let body: serde_json::Value = response.json().await?;
        let embedding: Vec<f32> = body["data"][0]["embedding"]
            .as_array()
            .ok_or_else(|| AppError::EmbeddingError("响应格式错误".to_string()))?
            .iter()
            .filter_map(|v| v.as_f64().map(|f| f as f32))
            .collect();

        let token_count = embedding.len() as u32;
        Ok((embedding, token_count))
    }

    pub async fn health_check(&self, config: &ModelConfig) -> AppResult<bool> {
        let models_url = Self::build_models_url(&config.api_url);
        let client = crate::http_client::get_client();
        let request = Self::add_auth(client.get(&models_url), &config.api_key);

        match request.send().await {
            Ok(resp) if resp.status().is_success() => return Ok(true),
            Ok(_) => {}
            Err(_) => {}
        }

        let embed_url = Self::build_embed_url(&config.api_url);
        let client = crate::http_client::get_client();
        let request = Self::add_auth(client.post(&embed_url), &config.api_key)
            .json(&serde_json::json!({
                "model": config.model_id,
                "input": "health",
            }));

        match request.send().await {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    pub async fn chat_stream(
        &self,
        messages: Vec<Message>,
        config: &ModelConfig,
        tx: tokio::sync::mpsc::UnboundedSender<StreamChunk>,
        token: CancellationToken,
    ) -> AppResult<()> {
        let url = Self::build_chat_url(&config.api_url);
        let client = crate::http_client::get_client();
        let request = Self::add_auth(client.post(&url), &config.api_key);

        let body = serde_json::json!({
            "model": config.model_id,
            "messages": messages.iter().map(|m| {
                serde_json::json!({ "role": m.role, "content": m.content })
            }).collect::<Vec<_>>(),
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "stream": true,
        });

        let response = match request.json(&body).send().await {
            Ok(resp) => resp,
            Err(e) => {
                let _ = tx.send(StreamChunk {
                    content: format!("API 连接失败: {}", e),
                    done: true,
                });
                return Ok(());
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let _ = tx.send(StreamChunk { content: format!("错误 HTTP {}: {}", status, text), done: true });
            return Ok(());
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            if token.is_cancelled() {
                let _ = tx.send(StreamChunk { content: String::new(), done: true });
                break;
            }
            let chunk = match chunk {
                Ok(c) => c,
                Err(_) => break,
            };
            let text = String::from_utf8_lossy(&chunk);
            buffer.push_str(&text);

            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].to_string();
                buffer = buffer[pos + 1..].to_string();

                let line = line.trim().to_string();
                if line.is_empty() || line == "data: [DONE]" {
                    continue;
                }

                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(choices) = val["choices"].as_array() {
                            for choice in choices {
                                if let Some(delta) = choice.get("delta") {
                                    if let Some(content) = delta["content"].as_str() {
                                        let _ = tx.send(StreamChunk {
                                            content: content.to_string(),
                                            done: false,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let _ = tx.send(StreamChunk { content: String::new(), done: true });
        Ok(())
    }
}