use crate::adapters::base::{ChatResult, Message, StreamChunk, UsageInfo, ModelConfig};
use crate::error::{AppError, AppResult};
use futures_util::stream::StreamExt;

pub struct OllamaAdapter;

impl OllamaAdapter {
    pub async fn chat(&self, messages: Vec<Message>, config: &ModelConfig) -> AppResult<ChatResult> {
        let url = format!("{}/api/chat", config.api_url);
        let client = reqwest::Client::new();

        let request = serde_json::json!({
            "model": config.model_id,
            "messages": messages.iter().map(|m| {
                serde_json::json!({ "role": m.role, "content": m.content })
            }).collect::<Vec<_>>(),
            "stream": false,
        });

        let response = client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::OllamaNotAvailable(format!("连接失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AppError::OllamaNotAvailable(format!("Ollama HTTP {}: {}", status, text)));
        }

        let body: serde_json::Value = response.json().await?;
        let content = body["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let prompt_tokens = body.get("prompt_eval_count")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        let completion_tokens = body.get("eval_count")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);

        let usage = match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(UsageInfo {
                prompt_tokens: p,
                completion_tokens: c,
            }),
            _ => None,
        };

        Ok(ChatResult {
            content,
            model: config.model_id.clone(),
            usage,
        })
    }

    pub async fn embed(&self, text: &str, config: &ModelConfig) -> AppResult<(Vec<f32>, u32)> {
        let url = format!("{}/api/embeddings", config.api_url);
        let client = reqwest::Client::new();

        let response = client
            .post(&url)
            .json(&serde_json::json!({
                "model": config.model_id,
                "input": text,
            }))
            .send()
            .await
            .map_err(|e| AppError::OllamaNotAvailable(format!("连接失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AppError::OllamaNotAvailable(format!("Ollama HTTP {}: {}", status, text)));
        }

        let body: serde_json::Value = response.json().await?;
        let embedding: Vec<f32> = body["embeddings"][0]
            .as_array()
            .ok_or_else(|| AppError::EmbeddingError("响应格式错误".to_string()))?
            .iter()
            .filter_map(|v| v.as_f64().map(|f| f as f32))
            .collect();

        let token_count = embedding.len() as u32;
        Ok((embedding, token_count))
    }

    pub async fn health_check(&self, config: &ModelConfig) -> AppResult<bool> {
        let url = format!("{}/api/tags", config.api_url);
        let client = reqwest::Client::new();

        match client.get(&url).send().await {
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
        let url = format!("{}/api/chat", config.api_url);
        let client = reqwest::Client::new();

        let request = serde_json::json!({
            "model": config.model_id,
            "messages": messages.iter().map(|m| {
                serde_json::json!({ "role": m.role, "content": m.content })
            }).collect::<Vec<_>>(),
            "stream": true,
        });

        let response = client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::OllamaNotAvailable(format!("连接失败: {}", e)))?;

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
                if line.is_empty() {
                    continue;
                }

                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                    if let Some(content) = val["message"]["content"].as_str() {
                        let _ = tx.send(StreamChunk {
                            content: content.to_string(),
                            done: val["done"].as_bool().unwrap_or(false),
                        });
                    }
                }
            }
        }

        let _ = tx.send(StreamChunk { content: String::new(), done: true });
        Ok(())
    }
}