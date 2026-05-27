// 应用配置管理
//
// AppConfig 持有运行时状态和路径配置:
//   - vault_path:  当前打开的知识库路径 (Mutex, Tauri State 需要 Send+Sync)
//   - db_path:     SQLite 数据库文件路径 (~/.local/share/memoa/twine.db)
//   - data_dir:    数据目录 (平台感知)
//   - config_dir:  配置目录 (平台感知)
//   - ollama_url:  Ollama 服务地址 (默认 http://127.0.0.1:11434)
//
// 平台路径约定:
//   Linux:   ~/.local/share/memoa / ~/.config/memoa
//   macOS:   ~/Library/Application Support/memoa / ~/Library/Preferences/memoa
//   Windows: %APPDATA%/memoa

use std::{
    path::PathBuf,
    sync::Mutex,
};

pub struct AppConfig {
    pub vault_path: Mutex<Option<PathBuf>>,
    pub db_path: PathBuf,
    pub data_dir: PathBuf,
    pub config_dir: PathBuf,
    pub ollama_url: String,
}

impl AppConfig {
    pub fn new() -> Self {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));

        let data_dir = if cfg!(target_os = "linux") {
            home.join(".local/share/memoa")
        } else if cfg!(target_os = "macos") {
            home.join("Library/Application Support/memoa")
        } else {
            dirs::data_dir()
                .unwrap_or_else(|| home.join("AppData/Roaming"))
                .join("memoa")
        };

        let config_dir = if cfg!(target_os = "linux") {
            home.join(".config/memoa")
        } else if cfg!(target_os = "macos") {
            home.join("Library/Preferences/memoa")
        } else {
            dirs::config_dir()
                .unwrap_or_else(|| home.join("AppData/Roaming"))
                .join("memoa")
        };

        let db_path = data_dir.join("twine.db");

        let ollama_url = std::env::var("OLLAMA_HOST")
            .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string());

        Self {
            vault_path: Mutex::new(None),
            db_path,
            data_dir,
            config_dir,
            ollama_url,
        }
    }

    pub fn default_vault_path() -> PathBuf {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));

        #[cfg(target_os = "windows")]
        {
            dirs::document_dir()
                .unwrap_or_else(|| home.clone())
                .join("Memoa")
        }

        #[cfg(not(target_os = "windows"))]
        {
            home.join("Memoa")
        }
    }

    pub fn attachments_dir(vault_path: &std::path::Path) -> PathBuf {
        vault_path.join(".attachments")
    }

    pub fn memoa_config_dir(vault_path: &std::path::Path) -> PathBuf {
        vault_path.join(".memoa")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_config_new() {
        let config = AppConfig::new();
        assert!(config.ollama_url.contains("11434"));
        assert!(config.data_dir.to_string_lossy().contains("memoa"));
        assert!(config.config_dir.to_string_lossy().contains("memoa"));
        assert!(config.db_path.to_string_lossy().ends_with("twine.db"));
    }

    #[test]
    fn test_app_config_vault_path() {
        let config = AppConfig::new();
        let guard = config.vault_path.lock().unwrap();
        assert!(guard.is_none());
    }

    #[test]
    fn test_default_vault_path() {
        let path = AppConfig::default_vault_path();
        assert!(path.ends_with("Memoa"));
    }

    #[test]
    fn test_attachments_dir() {
        let path = AppConfig::attachments_dir(std::path::Path::new("/tmp/vault"));
        assert_eq!(path, std::path::PathBuf::from("/tmp/vault/.attachments"));
    }

    #[test]
    fn test_memoa_config_dir() {
        let path = AppConfig::memoa_config_dir(std::path::Path::new("/tmp/vault"));
        assert_eq!(path, std::path::PathBuf::from("/tmp/vault/.memoa"));
    }
}