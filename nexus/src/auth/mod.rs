// 认证模块 - JWT 令牌 + Argon2 密码哈希 + 认证中间件
//
// 认证流程:
//   1. 用户注册/登录时使用 Argon2id 哈希密码存储
//   2. 登录成功后签发 JWT 令牌 (HS256), 包含 sub(用户ID) + email + exp(过期时间)
//   3. 所有受保护接口通过 auth_middleware 中间件拦截
//   4. 中间件从 Authorization: Bearer <token> 头提取令牌, 验证后注入 AuthenticatedUser 到请求扩展
//   5. Handler 通过 Extension<AuthenticatedUser> 提取当前用户
//
// 安全设计:
//   - Argon2id: 抗 GPU/ASIC 暴力破解的最佳选择
//   - JWT HS256: 对称签名, 适合单体/小规模部署
//   - 中间件模式: 每个请求都验证令牌, 不依赖 session
//   - API Key 保护: AI 网关的 API Key 仅存在服务端配置中

use crate::error::{AppError, Result};
use axum::extract::Request;
use axum::http::HeaderMap;
use axum::middleware::Next;
use axum::response::Response;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub exp: usize,
    pub iat: usize,
}

pub fn create_token(
    user_id: &str,
    email: &str,
    secret: &str,
    expiry_hours: u32,
) -> Result<String> {
    let now = chrono::Utc::now();
    let claims = Claims {
        sub: user_id.to_string(),
        email: email.to_string(),
        iat: now.timestamp() as usize,
        exp: (now + chrono::Duration::hours(expiry_hours as i64)).timestamp() as usize,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(AppError::Jwt)
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(AppError::Jwt)
}

fn extract_bearer_token(headers: &HeaderMap) -> Result<String> {
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("missing authorization header".into()))?;

    if !auth_header.starts_with("Bearer ") {
        return Err(AppError::Unauthorized("invalid authorization scheme".into()));
    }

    Ok(auth_header[7..].to_string())
}

#[derive(Clone, Debug)]
pub struct AuthenticatedUser {
    pub user_id: String,
    pub email: String,
}

pub async fn auth_middleware(
    request: Request,
    next: Next,
) -> std::result::Result<Response, AppError> {
    let app_state = request
        .extensions()
        .get::<Arc<crate::AppState>>()
        .cloned()
        .ok_or_else(|| AppError::Internal("app state not found".into()))?;

    let token = extract_bearer_token(request.headers())?;
    let claims = verify_token(&token, &app_state.config.auth.jwt_secret)?;

    let user = AuthenticatedUser {
        user_id: claims.sub,
        email: claims.email,
    };

    let mut request = request;
    request.extensions_mut().insert(user);
    Ok(next.run(request).await)
}

pub fn hash_password(password: &str) -> Result<String> {
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
        Argon2,
    };

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(AppError::Argon2)?
        .to_string();
    Ok(hash)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    use argon2::{
        password_hash::PasswordHash,
        password_hash::PasswordVerifier,
        Argon2,
    };

    let parsed_hash = PasswordHash::new(hash).map_err(AppError::Argon2)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}