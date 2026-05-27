use std::sync::Arc;

pub fn create_test_state() -> Arc<nexus::AppState> {
    let config = nexus::config::AppConfig {
        server: nexus::config::ServerConfig {
            host: "127.0.0.1".into(),
            port: 0,
            upload_limit_mb: 1,
        },
        database: nexus::config::DatabaseConfig {
            path: ":memory:".into(),
        },
        auth: nexus::config::AuthConfig {
            jwt_secret: "test-secret".into(),
            token_expiry_hours: 1,
        },
        gateway: nexus::config::GatewayConfig {
            enabled: false,
            upstream_models: vec![],
            rate_limit_per_minute: 100,
            request_timeout_secs: 30,
            api_keys: std::collections::HashMap::new(),
        },
        storage: nexus::config::StorageConfig {
            storage_type: "local".into(),
            data_dir: std::env::temp_dir().to_string_lossy().to_string(),
            s3_endpoint: None,
            s3_bucket: None,
            s3_region: None,
            s3_access_key: None,
            s3_secret_key: None,
        },
    };

    nexus::db::init(":memory:").expect("failed to init test db");
    Arc::new(nexus::AppState::new(config))
}

pub fn create_test_token(user_id: &str, email: &str) -> String {
    nexus::auth::create_token(user_id, email, "test-secret", 1)
        .expect("failed to create test token")
}