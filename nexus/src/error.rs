// 统一错误处理
//
// AppError 枚举覆盖了服务所有可能的错误类型:
//   - 业务错误: NotFound/Unauthorized/Forbidden/BadRequest/Conflict
//   - 基础设施错误: Database/Io/Reqwest/Jwt/Serde/Hex/Argon2
//   - 上游错误: Upstream (透传上游服务的错误)
//
// 错误响应格式 (JSON):
//   {
//     "error": {
//       "code": "unauthorized",
//       "message": "invalid email or password"
//     }
//   }
//
// 安全设计:
//   - 5xx 错误对外只显示 "internal server error", 详细信息记录到日志
//   - 4xx 错误完整返回给客户端, 方便调试

use axum::response::{IntoResponse, Response};
use axum::http::StatusCode;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not found: {0}")]
    NotFound(String),

    #[error("unauthorized: {0}")]
    Unauthorized(String),

    #[error("forbidden: {0}")]
    Forbidden(String),

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("internal error: {0}")]
    Internal(String),

    #[error("config error: {0}")]
    Config(String),

    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("jwt error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),

    #[error("reqwest error: {0}")]
    Reqwest(#[from] reqwest::Error),

    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("hex error: {0}")]
    Hex(#[from] hex::FromHexError),

    #[error("argon2 error: {0}")]
    Argon2(argon2::password_hash::Error),

    #[error("upstream error: status={status}, body={body}")]
    Upstream { status: u16, body: String },
}

impl From<argon2::password_hash::Error> for AppError {
    fn from(e: argon2::password_hash::Error) -> Self {
        AppError::Argon2(e)
    }
}

impl AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            AppError::Forbidden(_) => StatusCode::FORBIDDEN,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::Config(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Jwt(_) => StatusCode::UNAUTHORIZED,
            AppError::Reqwest(_) => StatusCode::BAD_GATEWAY,
            AppError::Serde(_) => StatusCode::BAD_REQUEST,
            AppError::Hex(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Argon2(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Upstream { .. } => StatusCode::BAD_GATEWAY,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let is_internal = status == StatusCode::INTERNAL_SERVER_ERROR;

        if is_internal {
            tracing::error!(error = %self, "internal server error");
        }

        let body = serde_json::json!({
            "error": {
                "code": self.error_code(),
                "message": if is_internal {
                    "internal server error".to_string()
                } else {
                    self.to_string()
                },
            }
        });

        (status, axum::Json(body)).into_response()
    }
}

impl AppError {
    fn error_code(&self) -> &'static str {
        match self {
            AppError::NotFound(_) => "not_found",
            AppError::Unauthorized(_) => "unauthorized",
            AppError::Forbidden(_) => "forbidden",
            AppError::BadRequest(_) => "bad_request",
            AppError::Conflict(_) => "conflict",
            AppError::Internal(_) => "internal_error",
            AppError::Config(_) => "config_error",
            AppError::Database(_) => "database_error",
            AppError::Io(_) => "io_error",
            AppError::Jwt(_) => "jwt_error",
            AppError::Reqwest(_) => "upstream_error",
            AppError::Serde(_) => "serde_error",
            AppError::Hex(_) => "hex_error",
            AppError::Argon2(_) => "argon2_error",
            AppError::Upstream { .. } => "upstream_error",
        }
    }
}

pub type Result<T> = std::result::Result<T, AppError>;