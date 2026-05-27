// 应用配置管理
//
// 所有配置项均支持环境变量覆盖, 提供安全默认值
// 环境变量优先级: 系统环境变量 > .env 文件 > 代码默认值
//
// 关键环境变量:
//   NEXUS_HOST            - 监听地址 (默认 127.0.0.1)
//   NEXUS_PORT            - 监听端口 (默认 3721)
//   NEXUS_DB_PATH         - SQLite 数据库路径 (默认 data/nexus.db)
//   NEXUS_JWT_SECRET      - JWT 签名密钥 (生产环境必须修改)
//   NEXUS_TOKEN_EXPIRY_HOURS - JWT 过期时间 (默认 720 小时 = 30 天)
//   NEXUS_STORAGE_TYPE    - 存储类型: "local" 或 "s3"
//   NEXUS_STORAGE_DATA_DIR - 本地存储目录 (默认 data/files)
//   NEXUS_GATEWAY_ENABLED - 是否启用 AI 网关 (默认 true)
//   NEXUS_GATEWAY_RATE_LIMIT - 每用户每分钟请求限制 (默认 30)
//   NEXUS_GATEWAY_TIMEOUT_SECS - 上游请求超时秒数 (默认 120)
//   NEXUS_UPSTREAM_MODELS - JSON 格式的上游模型列表
//   各模型的 API Key 通过 NEXUS_ 前缀或环境变量注入

use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub auth: AuthConfig,
    pub gateway: GatewayConfig,
    pub storage: StorageConfig,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_upload_limit_mb")]
    pub upload_limit_mb: usize,
}

#[derive(Clone, Debug, Deserialize)]
pub struct DatabaseConfig {
    #[serde(default = "default_db_path")]
    pub path: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AuthConfig {
    #[serde(default = "default_jwt_secret")]
    pub jwt_secret: String,
    #[serde(default = "default_token_expiry_hours")]
    pub token_expiry_hours: u32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct GatewayConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_models")]
    pub upstream_models: Vec<UpstreamModel>,
    #[serde(default = "default_rate_limit_per_minute")]
    pub rate_limit_per_minute: u32,
    #[serde(default = "default_request_timeout_secs")]
    pub request_timeout_secs: u64,
    #[serde(default)]
    pub api_keys: std::collections::HashMap<String, String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpstreamModel {
    pub name: String,
    pub base_url: String,
    pub api_key_env: String,
    pub provider: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StorageConfig {
    #[serde(default = "default_storage_type")]
    pub storage_type: String,
    #[serde(default = "default_data_dir")]
    pub data_dir: String,
    #[serde(default)]
    pub s3_endpoint: Option<String>,
    #[serde(default)]
    pub s3_bucket: Option<String>,
    #[serde(default)]
    pub s3_region: Option<String>,
    #[serde(default)]
    pub s3_access_key: Option<String>,
    #[serde(default)]
    pub s3_secret_key: Option<String>,
}

fn default_host() -> String {
    "127.0.0.1".into()
}

fn default_port() -> u16 {
    3721
}

fn default_upload_limit_mb() -> usize {
    50
}

fn default_db_path() -> String {
    "data/nexus.db".into()
}

fn default_jwt_secret() -> String {
    "nexus-dev-secret-change-in-production".into()
}

fn default_token_expiry_hours() -> u32 {
    720
}

fn default_models() -> Vec<UpstreamModel> {
    vec![]
}

fn default_rate_limit_per_minute() -> u32 {
    30
}

fn default_request_timeout_secs() -> u64 {
    120
}

fn default_storage_type() -> String {
    "local".into()
}

fn default_data_dir() -> String {
    "data/files".into()
}

impl AppConfig {
    pub fn from_env() -> crate::error::Result<Self> {
        let _ = dotenvy::dotenv();

        let server = ServerConfig {
            host: std::env::var("NEXUS_HOST").unwrap_or_else(|_| default_host()),
            port: std::env::var("NEXUS_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(default_port),
            upload_limit_mb: std::env::var("NEXUS_UPLOAD_LIMIT_MB")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(default_upload_limit_mb),
        };

        let database = DatabaseConfig {
            path: std::env::var("NEXUS_DB_PATH").unwrap_or_else(|_| default_db_path()),
        };

        let auth = AuthConfig {
            jwt_secret: std::env::var("NEXUS_JWT_SECRET")
                .unwrap_or_else(|_| default_jwt_secret()),
            token_expiry_hours: std::env::var("NEXUS_TOKEN_EXPIRY_HOURS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(default_token_expiry_hours),
        };

        let gateway = GatewayConfig {
            enabled: std::env::var("NEXUS_GATEWAY_ENABLED")
                .ok()
                .map(|v| v == "true" || v == "1")
                .unwrap_or(true),
            upstream_models: parse_upstream_models_from_env()?,
            rate_limit_per_minute: std::env::var("NEXUS_GATEWAY_RATE_LIMIT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(default_rate_limit_per_minute),
            request_timeout_secs: std::env::var("NEXUS_GATEWAY_TIMEOUT_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(default_request_timeout_secs),
            api_keys: parse_api_keys_from_env(),
        };

        let storage = StorageConfig {
            storage_type: std::env::var("NEXUS_STORAGE_TYPE")
                .unwrap_or_else(|_| default_storage_type()),
            data_dir: std::env::var("NEXUS_STORAGE_DATA_DIR")
                .unwrap_or_else(|_| default_data_dir()),
            s3_endpoint: std::env::var("NEXUS_S3_ENDPOINT").ok(),
            s3_bucket: std::env::var("NEXUS_S3_BUCKET").ok(),
            s3_region: std::env::var("NEXUS_S3_REGION").ok(),
            s3_access_key: std::env::var("NEXUS_S3_ACCESS_KEY").ok(),
            s3_secret_key: std::env::var("NEXUS_S3_SECRET_KEY").ok(),
        };

        Ok(Self {
            server,
            database,
            auth,
            gateway,
            storage,
        })
    }
}

fn parse_upstream_models_from_env() -> crate::error::Result<Vec<UpstreamModel>> {
    let json = std::env::var("NEXUS_UPSTREAM_MODELS").unwrap_or_default();
    if json.is_empty() {
        return Ok(vec![
            UpstreamModel {
                name: "openai-gpt-4o".into(),
                base_url: "https://api.openai.com".into(),
                api_key_env: "OPENAI_API_KEY".into(),
                provider: "openai".into(),
            },
        ]);
    }
    serde_json::from_str(&json).map_err(|e| {
        crate::error::AppError::Config(format!("NEXUS_UPSTREAM_MODELS: {}", e))
    })
}

fn parse_api_keys_from_env() -> std::collections::HashMap<String, String> {
    let mut keys = std::collections::HashMap::new();
    for (key, value) in std::env::vars() {
        if key.starts_with("NEXUS_API_KEY_") {
            keys.insert(key, value);
        }
    }
    keys
}