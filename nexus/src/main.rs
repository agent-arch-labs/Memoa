// Nexus 服务入口
//
// 启动流程:
//   1. 初始化日志系统 (tracing)
//   2. 加载环境变量配置 (支持 .env 文件)
//   3. 初始化 SQLite 数据库 (WAL 模式 + 自动建表)
//   4. 启动 Axum HTTP 服务器
//
// 环境变量参考 .env.example 文件

use nexus::config::AppConfig;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "nexus=info,tower_http=debug".into()),
        )
        .init();

    let config = AppConfig::from_env().unwrap_or_else(|e| {
        eprintln!("failed to load config: {}", e);
        std::process::exit(1);
    });

    nexus::db::init(&config.database.path).unwrap_or_else(|e| {
        eprintln!("failed to initialize database: {}", e);
        std::process::exit(1);
    });

    nexus::start_server(config).await.unwrap_or_else(|e| {
        tracing::error!("server error: {}", e);
        std::process::exit(1);
    });
}