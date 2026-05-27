// Memoa Nexus - 云同步与 AI 网关服务
//
// 架构概述:
//   Nexus 是 Memoa 的云端服务，提供三大核心能力:
//
//   1. 认证服务 (Auth)
//      - 用户注册 / 登录
//      - JWT 令牌签发与验证
//      - Argon2 密码哈希
//      - 中间件层认证拦截
//
//   2. 同步中心 (Sync Hub)
//      - 多仓库 (Vault) 管理
//      - 文件清单拉取 (manifest)
//      - 文件上传 / 下载 / 逻辑删除 (tombstone)
//      - 本地文件系统存储 + S3 兼容存储 (可选)
//
//   3. AI 网关 (AI Gateway)
//      - 多模型路由 (OpenAI / 智谱 / 百炼 等)
//      - 流式 (SSE) 和非流式代理转发
//      - 嵌入 (embeddings) 代理
//      - Token bucket 限流
//      - API Key 保护 (服务端集中管理)
//
// 设计原则:
//   - 本地优先 (Local First): 用户本地数据为真理源, 云仅做同步中转
//   - 安全性: 所有同步/网关接口需要认证, API Key 只存服务端
//   - 可扩展: 支持从文件级同步逐步演进到块级 + CRDT 同步

pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod gateway;
pub mod routes;
pub mod sync;

use std::sync::Arc;

pub struct AppState {
    pub config: config::AppConfig,
    pub gateway_rate_limiter: gateway::RateLimiter,
}

impl AppState {
    pub fn new(config: config::AppConfig) -> Self {
        let rate_limiter = gateway::RateLimiter::new(config.gateway.rate_limit_per_minute);
        Self {
            config,
            gateway_rate_limiter: rate_limiter,
        }
    }
}

pub async fn start_server(config: config::AppConfig) -> error::Result<()> {
    let state = Arc::new(AppState::new(config.clone()));
    let router = routes::build_router(state);

    let addr = format!("{}:{}", config.server.host, config.server.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;

    tracing::info!("nexus listening on http://{}", addr);

    axum::serve(listener, router).await?;

    Ok(())
}