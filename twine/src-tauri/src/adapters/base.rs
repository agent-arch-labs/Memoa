use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ModelProvider {
    Ollama,
    #[serde(alias = "openai_compatible", alias = "openai", alias = "bailian")]
    OpenAiCompatible,
    Zhipu,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub provider: ModelProvider,
    pub model_id: String,
    pub api_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
}

fn default_max_tokens() -> u32 {
    4096
}

fn default_temperature() -> f32 {
    0.7
}

#[derive(Debug, Serialize)]
pub struct ChatResult {
    pub content: String,
    pub model: String,
    pub usage: Option<UsageInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamChunk {
    pub content: String,
    pub done: bool,
}

#[derive(Debug, Serialize)]
pub struct UsageInfo {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

pub enum ModelAdapter {
    Ollama(super::ollama_adapter::OllamaAdapter),
    OpenAiCompatible(super::openai_compatible::OpenAiCompatibleAdapter),
    Zhipu(super::zhipu::ZhipuAdapter),
}

impl ModelAdapter {
    pub async fn chat(&self, messages: Vec<Message>, config: &ModelConfig) -> AppResult<ChatResult> {
        match self {
            ModelAdapter::Ollama(a) => a.chat(messages, config).await,
            ModelAdapter::OpenAiCompatible(a) => a.chat(messages, config).await,
            ModelAdapter::Zhipu(a) => a.chat(messages, config).await,
        }
    }

    pub async fn chat_stream(
        &self,
        messages: Vec<Message>,
        config: &ModelConfig,
        tx: mpsc::UnboundedSender<StreamChunk>,
    ) -> AppResult<()> {
        match self {
            ModelAdapter::Ollama(a) => a.chat_stream(messages, config, tx).await,
            ModelAdapter::OpenAiCompatible(a) => a.chat_stream(messages, config, tx).await,
            ModelAdapter::Zhipu(a) => a.chat_stream(messages, config, tx).await,
        }
    }

    pub async fn embed(&self, text: &str, config: &ModelConfig) -> AppResult<(Vec<f32>, u32)> {
        match self {
            ModelAdapter::Ollama(a) => a.embed(text, config).await,
            ModelAdapter::OpenAiCompatible(a) => a.embed(text, config).await,
            ModelAdapter::Zhipu(a) => a.embed(text, config).await,
        }
    }

    pub async fn health_check(&self, config: &ModelConfig) -> AppResult<bool> {
        match self {
            ModelAdapter::Ollama(a) => a.health_check(config).await,
            ModelAdapter::OpenAiCompatible(a) => a.health_check(config).await,
            ModelAdapter::Zhipu(a) => a.health_check(config).await,
        }
    }
}

pub fn create_adapter(config: &ModelConfig) -> ModelAdapter {
    match config.provider {
        ModelProvider::Ollama => ModelAdapter::Ollama(super::ollama_adapter::OllamaAdapter),
        ModelProvider::OpenAiCompatible => {
            ModelAdapter::OpenAiCompatible(super::openai_compatible::OpenAiCompatibleAdapter)
        }
        ModelProvider::Zhipu => ModelAdapter::Zhipu(super::zhipu::ZhipuAdapter),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_config_defaults() {
        let config = ModelConfig {
            provider: ModelProvider::Ollama,
            model_id: "test".to_string(),
            api_url: "http://localhost:11434".to_string(),
            api_key: String::new(),
            max_tokens: 0,
            temperature: 0.0,
        };
        assert_eq!(config.max_tokens, 0);
        assert_eq!(config.temperature, 0.0);
    }

    #[test]
    fn test_model_config_default_values() {
        assert_eq!(default_max_tokens(), 4096);
        assert_eq!(default_temperature(), 0.7);
    }

    #[test]
    fn test_model_config_json_parsing() {
        let json = r#"{
            "provider": "ollama",
            "model_id": "llama3.2",
            "api_url": "http://localhost:11434"
        }"#;
        let config: ModelConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.provider, ModelProvider::Ollama);
        assert_eq!(config.model_id, "llama3.2");
        assert_eq!(config.max_tokens, 4096);
        assert_eq!(config.temperature, 0.7);
    }

    #[test]
    fn test_model_config_parsing_openai_compatible() {
        let json = r#"{
            "provider": "openai_compatible",
            "model_id": "gpt-4",
            "api_url": "https://api.openai.com/v1",
            "api_key": "sk-test"
        }"#;
        let config: ModelConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.provider, ModelProvider::OpenAiCompatible);
        assert_eq!(config.api_key, "sk-test");
    }

    #[test]
    fn test_model_config_parsing_zhipu() {
        let json = r#"{
            "provider": "zhipu",
            "model_id": "glm-4",
            "api_url": "https://open.bigmodel.cn/api/paas/v4",
            "max_tokens": 2048,
            "temperature": 0.5
        }"#;
        let config: ModelConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.provider, ModelProvider::Zhipu);
        assert_eq!(config.max_tokens, 2048);
        assert_eq!(config.temperature, 0.5);
    }

    #[test]
    fn test_model_config_bailian_alias() {
        let json = r#"{
            "provider": "bailian",
            "model_id": "qwen-turbo",
            "api_url": "https://dashscope.aliyuncs.com/compatible-mode/v1"
        }"#;
        let config: ModelConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.provider, ModelProvider::OpenAiCompatible);
    }

    #[test]
    fn test_create_adapter_ollama() {
        let config = ModelConfig {
            provider: ModelProvider::Ollama,
            model_id: "test".to_string(),
            api_url: "http://localhost:11434".to_string(),
            api_key: String::new(),
            max_tokens: 4096,
            temperature: 0.7,
        };
        let adapter = create_adapter(&config);
        assert!(matches!(adapter, ModelAdapter::Ollama(_)));
    }

    #[test]
    fn test_create_adapter_openai_compatible() {
        let config = ModelConfig {
            provider: ModelProvider::OpenAiCompatible,
            model_id: "test".to_string(),
            api_url: "http://localhost".to_string(),
            api_key: String::new(),
            max_tokens: 4096,
            temperature: 0.7,
        };
        let adapter = create_adapter(&config);
        assert!(matches!(adapter, ModelAdapter::OpenAiCompatible(_)));
    }

    #[test]
    fn test_create_adapter_zhipu() {
        let config = ModelConfig {
            provider: ModelProvider::Zhipu,
            model_id: "test".to_string(),
            api_url: "http://localhost".to_string(),
            api_key: String::new(),
            max_tokens: 4096,
            temperature: 0.7,
        };
        let adapter = create_adapter(&config);
        assert!(matches!(adapter, ModelAdapter::Zhipu(_)));
    }
}