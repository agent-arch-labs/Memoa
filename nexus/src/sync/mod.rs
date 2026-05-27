// 同步中心 - 文件清单 / 上传 / 下载 / 逻辑删除
//
// 同步协议 (Phase 1 - 文件级同步):
//   客户端在本地维护文件清单 (manifest), 对比云端清单决定同步方向
//
//   GET  /api/v1/sync/vaults/:vault_id/manifest
//     - 获取云端所有文件清单 (file_path + file_hash + file_size + last_modified)
//     - 客户端本地比较 hash 决定: 上传变更 | 下载更新 | 跳过
//
//   POST /api/v1/sync/vaults/:vault_id/upload?file_path=...
//     - multipart/form-data 上传文件
//     - 服务端计算 SHA256 hash, 存储文件, 记录元信息
//
//   GET  /api/v1/sync/vaults/:vault_id/files?file_path=...
//     - 下载指定文件
//
//   DELETE /api/v1/sync/vaults/:vault_id/files?file_path=...
//     - 逻辑删除 (tombstone), 标记 is_deleted=1, 不会从存储删除
//
//   GET  /api/v1/sync/vaults
//     - 列出用户所有仓库
//
//   POST /api/v1/sync/vaults
//     - 创建新仓库
//
// 未来演进:
//   Phase 2: 块级同步 + CRDT (分块上传, 差分同步, 冲突解决)
//   Phase 3: 实时推送 (WebSocket/SSE 通知客户端变更)

pub mod manifest;
pub mod storage;

use crate::error::Result;
use crate::auth::AuthenticatedUser;
use crate::db;
use axum::extract::{Multipart, Path, Query, State};
use axum::Extension;
use axum::Json;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub file_path: String,
    pub file_hash: String,
    pub file_size: i64,
    pub last_modified: String,
}

#[derive(Debug, Serialize)]
pub struct ManifestResponse {
    pub vault_id: String,
    pub files: Vec<ManifestEntry>,
}

#[derive(Debug, Deserialize)]
pub struct FilePathQuery {
    pub file_path: String,
}

pub async fn get_manifest(
    State(_state): State<Arc<AppState>>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(vault_id): Path<String>,
) -> Result<Json<ManifestResponse>> {
    db::with_conn(|conn| {
        if !db::vault::is_vault_member(conn, &vault_id, &user.user_id)? {
            return Err(crate::error::AppError::Forbidden("not a member of this vault".into()));
        }

        let files = db::vault::get_file_manifest(conn, &vault_id)?;
        let entries: Vec<ManifestEntry> = files
            .into_iter()
            .map(|(path, hash, size, modified)| ManifestEntry {
                file_path: path,
                file_hash: hash,
                file_size: size,
                last_modified: modified,
            })
            .collect();

        Ok(Json(ManifestResponse {
            vault_id,
            files: entries,
        }))
    })
}

pub async fn upload_file(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(vault_id): Path<String>,
    Query(query): Query<FilePathQuery>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>> {
    db::with_conn(|conn| {
        if !db::vault::is_vault_member(conn, &vault_id, &user.user_id)? {
            return Err(crate::error::AppError::Forbidden("not a member of this vault".into()));
        }
        Ok(())
    })?;

    let file_path = query.file_path.clone();
    let max_size = state.config.server.upload_limit_mb * 1024 * 1024;

    let mut file_data = Vec::new();
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        crate::error::AppError::BadRequest(format!("multipart error: {}", e))
    })? {
        let data = field.bytes().await.map_err(|e| {
            crate::error::AppError::BadRequest(format!("read error: {}", e))
        })?;

        if data.len() > max_size {
            return Err(crate::error::AppError::BadRequest(format!(
                "file exceeds max size of {} MB",
                state.config.server.upload_limit_mb
            )));
        }
        file_data = data.to_vec();
    }

    if file_data.is_empty() {
        return Err(crate::error::AppError::BadRequest("no file data provided".into()));
    }

    let file_hash = storage::compute_hash(&file_data);
    let file_size = file_data.len() as i64;
    let now = chrono::Utc::now().to_rfc3339();

    storage::store_file(&state, &vault_id, &file_path, &file_data).await?;

    db::with_conn(|conn| {
        db::vault::upsert_file_record(conn, &vault_id, &file_path, &file_hash, file_size, &now)
    })?;

    tracing::info!(
        user_id = %user.user_id,
        vault_id = %vault_id,
        file_path = %file_path,
        file_size = %file_size,
        "file uploaded"
    );

    Ok(Json(serde_json::json!({
        "file_path": file_path,
        "file_hash": file_hash,
        "file_size": file_size,
        "status": "uploaded"
    })))
}

pub async fn download_file(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(vault_id): Path<String>,
    Query(query): Query<FilePathQuery>,
) -> Result<impl axum::response::IntoResponse> {
    db::with_conn(|conn| {
        if !db::vault::is_vault_member(conn, &vault_id, &user.user_id)? {
            return Err(crate::error::AppError::Forbidden("not a member of this vault".into()));
        }
        Ok(())
    })?;

    let data = storage::read_file(&state, &vault_id, &query.file_path).await?;
    let mime = mime_guess::from_path(&query.file_path)
        .first_or_octet_stream();

    Ok(axum::response::Response::builder()
        .header("content-type", mime.to_string())
        .header("content-disposition", format!("attachment; filename=\"{}\"",
            std::path::Path::new(&query.file_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("file")))
        .body(axum::body::Body::from(data))
        .unwrap())
}

pub async fn delete_file(
    State(_state): State<Arc<AppState>>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(vault_id): Path<String>,
    Query(query): Query<FilePathQuery>,
) -> Result<Json<serde_json::Value>> {
    db::with_conn(|conn| {
        if !db::vault::is_vault_member(conn, &vault_id, &user.user_id)? {
            return Err(crate::error::AppError::Forbidden("not a member of this vault".into()));
        }
        db::vault::mark_file_deleted(conn, &vault_id, &query.file_path)?;
        Ok(())
    })?;

    tracing::info!(
        user_id = %user.user_id,
        vault_id = %vault_id,
        file_path = %query.file_path,
        "file tombstoned"
    );

    Ok(Json(serde_json::json!({
        "file_path": query.file_path,
        "status": "deleted"
    })))
}