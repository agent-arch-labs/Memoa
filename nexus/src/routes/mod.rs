// 路由组装 - RESTful API 端点映射
//
// 路由分组:
//   PUBLIC (无需认证):
//     GET  /api/v1/health          - 健康检查
//     POST /api/v1/auth/register   - 用户注册
//     POST /api/v1/auth/login      - 用户登录
//
//   SYNC (需要认证):
//     GET    /api/v1/sync/vaults                     - 列出仓库
//     POST   /api/v1/sync/vaults                     - 创建仓库
//     GET    /api/v1/sync/vaults/:id/manifest        - 获取文件清单
//     POST   /api/v1/sync/vaults/:id/upload?file_path= - 上传文件
//     GET    /api/v1/sync/vaults/:id/files?file_path=  - 下载文件
//     DELETE /api/v1/sync/vaults/:id/files?file_path=  - 逻辑删除文件
//
//   GATEWAY (需要认证):
//     POST /v1/chat/completions  - AI 聊天补全
//     POST /v1/embeddings        - 文本嵌入
//     GET  /v1/models            - 模型列表
//
// 认证中间件通过 middleware::from_fn 注入 auth_middleware
// 成功认证后, AuthenticatedUser 通过 Extension 注入请求

use axum::{middleware, routing::{get, post, delete}, Router};
use std::sync::Arc;
use crate::AppState;

pub fn build_router(state: Arc<AppState>) -> Router {
    let public = Router::new()
        .route("/api/v1/health", get(health_check))
        .route("/api/v1/auth/register", post(auth::register))
        .route("/api/v1/auth/login", post(auth::login));

    let sync = Router::new()
        .route("/vaults", get(sync::list_vaults).post(sync::create_vault))
        .route("/vaults/{vault_id}/manifest", get(sync::get_manifest))
        .route("/vaults/{vault_id}/upload", post(sync::upload_file))
        .route("/vaults/{vault_id}/files", get(sync::download_file))
        .route("/vaults/{vault_id}/files", delete(sync::delete_file))
        .route_layer(middleware::from_fn(crate::auth::auth_middleware));

    let gateway = Router::new()
        .route("/chat/completions", post(gateway::chat_completions))
        .route("/embeddings", post(gateway::embeddings))
        .route("/models", get(gateway::list_models))
        .route_layer(middleware::from_fn(crate::auth::auth_middleware));

    Router::new()
        .merge(public)
        .nest("/api/v1/sync", sync)
        .nest("/v1", gateway)
        .with_state(state)
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "status": "ok",
        "service": "nexus",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

mod auth {
    use axum::extract::State;
    use axum::Json;
    use serde::{Deserialize, Serialize};
    use std::sync::Arc;

    use crate::auth::{hash_password, verify_password, create_token};
    use crate::db;
    use crate::error::{AppError, Result};
    use crate::AppState;

    #[derive(Debug, Deserialize)]
    pub struct RegisterRequest {
        pub email: String,
        pub password: String,
    }

    #[derive(Debug, Deserialize)]
    pub struct LoginRequest {
        pub email: String,
        pub password: String,
    }

    #[derive(Debug, Serialize)]
    pub struct AuthResponse {
        pub token: String,
        pub user: UserInfo,
    }

    #[derive(Debug, Serialize)]
    pub struct UserInfo {
        pub id: String,
        pub email: String,
    }

    pub async fn register(
        State(state): State<Arc<AppState>>,
        Json(req): Json<RegisterRequest>,
    ) -> Result<Json<AuthResponse>> {
        if req.email.is_empty() || !req.email.contains('@') {
            return Err(AppError::BadRequest("invalid email".into()));
        }

        if req.password.len() < 8 {
            return Err(AppError::BadRequest("password must be at least 8 characters".into()));
        }

        let password_hash = hash_password(&req.password)?;

        let user = db::with_conn(|conn| {
            if db::user::find_by_email(conn, &req.email)?.is_some() {
                return Err(AppError::Conflict("email already registered".into()));
            }
            db::user::create_user(conn, &req.email, &password_hash)
        })?;

        let token = create_token(
            &user.id,
            &user.email,
            &state.config.auth.jwt_secret,
            state.config.auth.token_expiry_hours,
        )?;

        tracing::info!(user_id = %user.id, email = %user.email, "user registered");

        Ok(Json(AuthResponse {
            token,
            user: UserInfo {
                id: user.id,
                email: user.email,
            },
        }))
    }

    pub async fn login(
        State(state): State<Arc<AppState>>,
        Json(req): Json<LoginRequest>,
    ) -> Result<Json<AuthResponse>> {
        let user = db::with_conn(|conn| {
            let user = db::user::find_by_email(conn, &req.email)?
                .ok_or_else(|| AppError::Unauthorized("invalid email or password".into()))?;

            if !verify_password(&req.password, &user.password_hash)? {
                return Err(AppError::Unauthorized("invalid email or password".into()));
            }

            Ok(user)
        })?;

        let token = create_token(
            &user.id,
            &user.email,
            &state.config.auth.jwt_secret,
            state.config.auth.token_expiry_hours,
        )?;

        tracing::info!(user_id = %user.id, "user logged in");

        Ok(Json(AuthResponse {
            token,
            user: UserInfo {
                id: user.id,
                email: user.email,
            },
        }))
    }
}

mod sync {
    use axum::extract::State;
    use axum::Extension;
    use axum::Json;
    use serde::{Deserialize, Serialize};
    use std::sync::Arc;

    use crate::AppState;
    use crate::auth::AuthenticatedUser;
    use crate::db;
    use crate::error::Result;

    #[derive(Debug, Deserialize)]
    pub struct CreateVaultRequest {
        pub name: String,
    }

    #[derive(Debug, Serialize)]
    pub struct VaultInfo {
        pub id: String,
        pub name: String,
        pub role: String,
        pub created_at: String,
    }

    pub async fn list_vaults(
        State(_state): State<Arc<AppState>>,
        Extension(user): Extension<AuthenticatedUser>,
    ) -> Result<Json<Vec<VaultInfo>>> {
        let vaults = db::with_conn(|conn| {
            db::vault::list_vaults_by_user(conn, &user.user_id)
        })?;

        let infos: Vec<VaultInfo> = vaults
            .into_iter()
            .map(|v| VaultInfo {
                id: v.id,
                name: v.name,
                role: "owner".to_string(),
                created_at: v.created_at,
            })
            .collect();

        Ok(Json(infos))
    }

    pub async fn create_vault(
        State(_state): State<Arc<AppState>>,
        Extension(user): Extension<AuthenticatedUser>,
        Json(req): Json<CreateVaultRequest>,
    ) -> Result<Json<VaultInfo>> {
        if req.name.trim().is_empty() {
            return Err(crate::error::AppError::BadRequest("vault name is required".into()));
        }

        let vault = db::with_conn(|conn| {
            db::vault::create_vault(conn, &user.user_id, &req.name)
        })?;

        tracing::info!(user_id = %user.user_id, vault_id = %vault.id, "vault created");

        Ok(Json(VaultInfo {
            id: vault.id,
            name: vault.name,
            role: "owner".to_string(),
            created_at: vault.created_at,
        }))
    }

    pub use crate::sync::{get_manifest, upload_file, download_file, delete_file};
}

mod gateway {
    pub use crate::gateway::{chat_completions, embeddings, list_models};
}