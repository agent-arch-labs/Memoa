// 统一错误处理
//
// AppError 枚举覆盖本地引擎所有可能的错误类型:
//   Io / Sqlite / Serde / Http  - 外部库错误自动转换 (From trait)
//   DatabaseNotInitialized       - 数据库未初始化
//   VaultNotOpen                 - 知识库未打开
//   NoteNotFound / FileNotFound  - 资源不存在
//   OllamaNotAvailable           - Ollama 服务不可用
//   EmbeddingError / IndexError  - AI 相关错误
//   InvalidPath / Other          - 其他错误
//
// Serialize 实现: 将错误序列化为 JSON 字符串返回给前端
// From<AppError> for tauri::Error: 转换为 Tauri 框架错误

use serde::Serialize;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Serde error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Database not initialized")]
    DatabaseNotInitialized,

    #[error("Vault not open")]
    VaultNotOpen,

    #[error("Note not found: {0}")]
    NoteNotFound(String),

    #[error("Ollama not available: {0}")]
    OllamaNotAvailable(String),

    #[error("Embedding error: {0}")]
    EmbeddingError(String),

    #[error("File not found: {0}")]
    FileNotFound(PathBuf),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Index error: {0}")]
    IndexError(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

impl From<AppError> for tauri::Error {
    fn from(err: AppError) -> Self {
        tauri::Error::from(std::io::Error::new(
            std::io::ErrorKind::Other,
            err.to_string(),
        ))
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        assert_eq!(
            AppError::VaultNotOpen.to_string(),
            "Vault not open"
        );
        assert_eq!(
            AppError::NoteNotFound("test.md".to_string()).to_string(),
            "Note not found: test.md"
        );
        assert_eq!(
            AppError::DatabaseNotInitialized.to_string(),
            "Database not initialized"
        );
    }

    #[test]
    fn test_error_serialization() {
        let err = AppError::Other("custom error".to_string());
        let serialized = serde_json::to_string(&err).unwrap();
        assert_eq!(serialized, "\"custom error\"");
    }

    #[test]
    fn test_error_from_io() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let app_err: AppError = io_err.into();
        assert!(app_err.to_string().contains("file not found"));
    }

    #[test]
    fn test_error_from_json() {
        let json_err = serde_json::from_str::<serde_json::Value>("invalid").unwrap_err();
        let app_err: AppError = json_err.into();
        assert!(app_err.to_string().contains("Serde error"));
    }

    #[test]
    fn test_error_into_string() {
        let err = AppError::EmbeddingError("dimension mismatch".to_string());
        let s: String = err.into();
        assert_eq!(s, "Embedding error: dimension mismatch");
    }

    #[test]
    fn test_app_error_variants() {
        let err = AppError::FileNotFound(std::path::PathBuf::from("/tmp/test.md"));
        assert!(err.to_string().contains("/tmp/test.md"));

        let err = AppError::InvalidPath("bad path".to_string());
        assert_eq!(err.to_string(), "Invalid path: bad path");

        let err = AppError::IndexError("index corrupt".to_string());
        assert_eq!(err.to_string(), "Index error: index corrupt");

        let err = AppError::OllamaNotAvailable("server down".to_string());
        assert_eq!(err.to_string(), "Ollama not available: server down");
    }
}