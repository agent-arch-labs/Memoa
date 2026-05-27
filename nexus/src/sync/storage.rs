// 文件存储层 - 本地文件系统 + S3 兼容存储
//
// 存储策略由 NEXUS_STORAGE_TYPE 环境变量决定:
//   "local" (默认) - 存储在 data_dir/vault_id/file_path
//   "s3"           - 上传到 S3 兼容对象存储 (MinIO / OSS / COS)
//
// 所有文件按 vault_id/file_path 组织, 保持与本地文件系统相同的目录结构

use crate::error::{AppError, Result};
use crate::AppState;

pub fn compute_hash(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

pub async fn store_file(
    state: &AppState,
    vault_id: &str,
    file_path: &str,
    data: &[u8],
) -> Result<()> {
    if state.config.storage.storage_type == "s3" {
        store_to_s3(state, vault_id, file_path, data).await
    } else {
        store_to_local(state, vault_id, file_path, data)
    }
}

fn store_to_local(
    state: &AppState,
    vault_id: &str,
    file_path: &str,
    data: &[u8],
) -> Result<()> {
    let abs_path = std::path::Path::new(&state.config.storage.data_dir)
        .join(vault_id)
        .join(file_path);

    if let Some(parent) = abs_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    std::fs::write(&abs_path, data)?;
    tracing::debug!("stored file locally: {}", abs_path.display());
    Ok(())
}

async fn store_to_s3(
    state: &AppState,
    vault_id: &str,
    file_path: &str,
    data: &[u8],
) -> Result<()> {
    let endpoint = state.config.storage.s3_endpoint.as_ref()
        .ok_or_else(|| AppError::Config("s3 endpoint not configured".into()))?;
    let bucket = state.config.storage.s3_bucket.as_ref()
        .ok_or_else(|| AppError::Config("s3 bucket not configured".into()))?;
    let _access_key = state.config.storage.s3_access_key.as_ref()
        .ok_or_else(|| AppError::Config("s3 access key not configured".into()))?;
    let _secret_key = state.config.storage.s3_secret_key.as_ref()
        .ok_or_else(|| AppError::Config("s3 secret key not configured".into()))?;

    let key = format!("{}/{}", vault_id, file_path);
    let url = format!("{}/{}/{}", endpoint.trim_end_matches('/'), bucket, key);

    let client = reqwest::Client::new();
    let resp = client
        .put(&url)
        .header("x-amz-acl", "private")
        .body(data.to_vec())
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(AppError::Upstream {
            status: resp.status().as_u16(),
            body: resp.text().await.unwrap_or_default(),
        });
    }

    tracing::debug!("stored file to s3: {}", key);
    Ok(())
}

pub async fn read_file(
    state: &AppState,
    vault_id: &str,
    file_path: &str,
) -> Result<Vec<u8>> {
    if state.config.storage.storage_type == "s3" {
        read_from_s3(state, vault_id, file_path).await
    } else {
        read_from_local(state, vault_id, file_path)
    }
}

fn read_from_local(
    state: &AppState,
    vault_id: &str,
    file_path: &str,
) -> Result<Vec<u8>> {
    let abs_path = std::path::Path::new(&state.config.storage.data_dir)
        .join(vault_id)
        .join(file_path);

    if !abs_path.exists() {
        return Err(AppError::NotFound(format!("file not found: {}", file_path)));
    }

    Ok(std::fs::read(&abs_path)?)
}

async fn read_from_s3(
    state: &AppState,
    vault_id: &str,
    file_path: &str,
) -> Result<Vec<u8>> {
    let endpoint = state.config.storage.s3_endpoint.as_ref()
        .ok_or_else(|| AppError::Config("s3 endpoint not configured".into()))?;
    let bucket = state.config.storage.s3_bucket.as_ref()
        .ok_or_else(|| AppError::Config("s3 bucket not configured".into()))?;

    let key = format!("{}/{}", vault_id, file_path);
    let url = format!("{}/{}/{}", endpoint.trim_end_matches('/'), bucket, key);

    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await?;

    if !resp.status().is_success() {
        return Err(AppError::NotFound(format!("file not found in s3: {}", key)));
    }

    Ok(resp.bytes().await?.to_vec())
}