use crate::config::AppConfig;
use crate::error::AppError;
use crate::error::AppResult;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use std::fs;
use std::path::Path;
use tauri::State;

const KEY_FILE: &str = ".secret_key";
const NONCE_SIZE: usize = 12;
const KEY_SIZE: usize = 32;

fn ensure_key_file(data_dir: &Path) -> AppResult<Vec<u8>> {
    let key_path = data_dir.join(KEY_FILE);

    if key_path.exists() {
        let key = fs::read(&key_path)
            .map_err(|e| AppError::Other(format!("读取密钥文件失败: {}", e)))?;
        if key.len() != KEY_SIZE {
            return Err(AppError::Other("密钥文件损坏，长度不正确".to_string()));
        }
        return Ok(key);
    }

    use rand::RngCore;
    let mut key = vec![0u8; KEY_SIZE];
    OsRng.fill_bytes(&mut key);

    fs::create_dir_all(data_dir)?;
    fs::write(&key_path, &key)
        .map_err(|e| AppError::Other(format!("写入密钥文件失败: {}", e)))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&key_path)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&key_path, perms)?;
    }

    Ok(key)
}

pub fn encrypt_value(data_dir: &Path, plaintext: &str) -> AppResult<String> {
    let raw_key = ensure_key_file(data_dir)?;
    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(&raw_key);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; NONCE_SIZE];
    use rand::RngCore;
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| AppError::Other(format!("加密失败: {}", e)))?;

    let mut result = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(hex::encode(result))
}

pub fn decrypt_value(data_dir: &Path, encrypted_hex: &str) -> AppResult<String> {
    let raw_key = ensure_key_file(data_dir)?;
    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(&raw_key);
    let cipher = Aes256Gcm::new(key);

    let data = hex::decode(encrypted_hex)
        .map_err(|e| AppError::Other(format!("hex 解码失败: {}", e)))?;

    if data.len() < NONCE_SIZE + 16 {
        return Err(AppError::Other("加密数据长度不足".to_string()));
    }

    let nonce = Nonce::from_slice(&data[..NONCE_SIZE]);
    let ciphertext = &data[NONCE_SIZE..];

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| AppError::Other(format!("解密失败，密钥可能不匹配: {}", e)))?;

    String::from_utf8(plaintext)
        .map_err(|e| AppError::Other(format!("解密结果无效 UTF-8: {}", e)))
}

pub fn encrypt_api_key(data_dir: &Path, plaintext: &str) -> AppResult<String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }
    encrypt_value(data_dir, plaintext)
}

pub fn decrypt_api_key(data_dir: &Path, encrypted: &str) -> AppResult<String> {
    if encrypted.is_empty() {
        return Ok(String::new());
    }
    decrypt_value(data_dir, encrypted)
}

#[tauri::command]
pub fn secret_encrypt_api_key(value: String, config: State<'_, AppConfig>) -> AppResult<String> {
    encrypt_api_key(&config.data_dir, &value)
}

#[tauri::command]
pub fn secret_decrypt_api_key(encrypted: String, config: State<'_, AppConfig>) -> AppResult<String> {
    decrypt_api_key(&config.data_dir, &encrypted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let dir = TempDir::new().unwrap();
        let data_dir = dir.path();

        let plain = "sk-test-api-key-12345678";
        let encrypted = encrypt_api_key(data_dir, plain).unwrap();
        assert!(!encrypted.is_empty());
        assert_ne!(encrypted, plain);

        let decrypted = decrypt_api_key(data_dir, &encrypted).unwrap();
        assert_eq!(decrypted, plain);
    }

    #[test]
    fn test_encrypt_empty_string() {
        let dir = TempDir::new().unwrap();
        let encrypted = encrypt_api_key(dir.path(), "").unwrap();
        assert!(encrypted.is_empty());
        let decrypted = decrypt_api_key(dir.path(), "").unwrap();
        assert!(decrypted.is_empty());
    }

    #[test]
    fn test_decrypt_wrong_key() {
        let dir1 = TempDir::new().unwrap();
        let dir2 = TempDir::new().unwrap();

        let encrypted = encrypt_api_key(dir1.path(), "secret").unwrap();
        let result = decrypt_api_key(dir2.path(), &encrypted);
        assert!(result.is_err());
    }

    #[test]
    fn test_key_reuse_across_encryptions() {
        let dir = TempDir::new().unwrap();
        let data_dir = dir.path();

        let e1 = encrypt_api_key(data_dir, "key1").unwrap();
        let e2 = encrypt_api_key(data_dir, "key2").unwrap();

        assert_eq!(decrypt_api_key(data_dir, &e1).unwrap(), "key1");
        assert_eq!(decrypt_api_key(data_dir, &e2).unwrap(), "key2");
    }

    #[test]
    fn test_encrypt_special_chars() {
        let dir = TempDir::new().unwrap();
        let plain = "sk-中文字符🔑!@#$%^&*()";
        let encrypted = encrypt_api_key(dir.path(), plain).unwrap();
        assert_eq!(decrypt_api_key(dir.path(), &encrypted).unwrap(), plain);
    }

    #[test]
    fn test_tampered_data() {
        let dir = TempDir::new().unwrap();
        let encrypted = encrypt_api_key(dir.path(), "secret").unwrap();

        let mut tampered = encrypted.clone();
        if let Some(c) = tampered.chars().last() {
            tampered.pop();
            let new_char = if c == 'a' { 'b' } else { 'a' };
            tampered.push(new_char);
        }

        let result = decrypt_api_key(dir.path(), &tampered);
        assert!(result.is_err());
    }

    #[test]
    fn test_key_file_persistence() {
        let dir = TempDir::new().unwrap();
        let data_dir = dir.path();

        let encrypted = encrypt_api_key(data_dir, "persistent_test").unwrap();
        let decrypted = decrypt_api_key(data_dir, &encrypted).unwrap();
        assert_eq!(decrypted, "persistent_test");
    }
}