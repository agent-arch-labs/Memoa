use crate::error::{AppError, AppResult};

pub struct OllamaClient {
    base_url: String,
    client: reqwest::Client,
}

impl OllamaClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.to_string(),
            client: reqwest::Client::new(),
        }
    }

    pub async fn embed_with_model(&self, text: &str, model: Option<&str>) -> AppResult<(Vec<f32>, u32)> {
        let url = format!("{}/api/embeddings", self.base_url);
        let model = model.unwrap_or("nomic-embed-text");

        let response = self
            .client
            .post(&url)
            .json(&serde_json::json!({
                "model": model,
                "input": text,
            }))
            .send()
            .await
            .map_err(|e| AppError::OllamaNotAvailable(format!("连接失败: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::OllamaNotAvailable(format!(
                "HTTP {}: {}",
                response.status(),
                response.text().await.unwrap_or_default()
            )));
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

    pub async fn chat(&self, model: &str, prompt: &str) -> AppResult<String> {
        let url = format!("{}/api/chat", self.base_url);

        let request = serde_json::json!({
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            "stream": false,
        });

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::OllamaNotAvailable(format!("连接失败: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::OllamaNotAvailable(format!(
                "HTTP {}: {}",
                response.status(),
                response.text().await.unwrap_or_default()
            )));
        }

        let body: serde_json::Value = response.json().await?;
        let content = body["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        Ok(content)
    }

    pub async fn health_check(&self) -> AppResult<bool> {
        let url = format!("{}/api/tags", self.base_url);

        let response = self.client.get(&url).send().await;

        match response {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ollama_client_new() {
        let client = OllamaClient::new("http://localhost:11434");
        assert_eq!(client.base_url, "http://localhost:11434");
    }

    #[test]
    fn test_ollama_client_custom_url() {
        let client = OllamaClient::new("http://192.168.1.100:8899");
        assert_eq!(client.base_url, "http://192.168.1.100:8899");
    }

    #[test]
    fn test_ollama_client_trailing_slash() {
        let client = OllamaClient::new("http://localhost:11434/");
        assert_eq!(client.base_url, "http://localhost:11434/");
    }
}