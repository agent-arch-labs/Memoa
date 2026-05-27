use crate::adapters::base::{ChatResult, Message, StreamChunk, UsageInfo, ModelConfig};
use crate::error::{AppError, AppResult};
use futures_util::stream::StreamExt;

pub struct ZhipuAdapter;

impl ZhipuAdapter {
    pub async fn chat(&self, messages: Vec<Message>, config: &ModelConfig) -> AppResult<ChatResult> {
        let url = if config.api_url.contains("/chat/completions") {
            config.api_url.clone()
        } else {
            format!("{}/chat/completions", config.api_url.trim_end_matches('/'))
        };

        let client = reqwest::Client::new();
        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .json(&serde_json::json!({
                "model": config.model_id,
                "messages": messages.iter().map(|m| {
                    serde_json::json!({ "role": m.role, "content": m.content })
                }).collect::<Vec<_>>(),
                "temperature": config.temperature,
                "max_tokens": config.max_tokens,
                "stream": false,
            }))
            .send()
            .await
            .map_err(|e| AppError::Other(format!("智谱 API 连接失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AppError::Other(format!("智谱 API 错误 HTTP {}: {}", status, text)));
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
        let url = if config.api_url.contains("/embeddings") {
            config.api_url.clone()
        } else {
            format!("{}/embeddings", config.api_url.trim_end_matches('/'))
        };

        let client = reqwest::Client::new();
        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .json(&serde_json::json!({
                "model": config.model_id,
                "input": text,
            }))
            .send()
            .await
            .map_err(|e| AppError::Other(format!("智谱 Embedding 连接失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AppError::Other(format!("智谱 Embedding HTTP {}: {}", status, text)));
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
        let url = config.api_url.trim_end_matches('/').to_string();
        let client = reqwest::Client::new();
        let request = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", config.api_key));

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
    ) -> AppResult<()> {
        let url = if config.api_url.contains("/chat/completions") {
            config.api_url.clone()
        } else {
            format!("{}/chat/completions", config.api_url.trim_end_matches('/'))
        };

        let client = reqwest::Client::new();
        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .json(&serde_json::json!({
                "model": config.model_id,
                "messages": messages.iter().map(|m| {
                    serde_json::json!({ "role": m.role, "content": m.content })
                }).collect::<Vec<_>>(),
                "temperature": config.temperature,
                "max_tokens": config.max_tokens,
                "stream": true,
            }))
            .send()
            .await
            .map_err(|e| AppError::Other(format!("智谱 API 连接失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let _ = tx.send(StreamChunk { content: format!("错误 HTTP {}: {}", status, text), done: true });
            return Ok(());
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
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