// 仓库操作命令 - 打开/关闭知识库、重建索引
//
// open_vault 初始化流程:
//   1. 创建仓库目录 (如不存在)
//   2. 创建 .memoa 配置目录
//   3. 初始化 SQLite 数据库 (notes/links/tags 表)
//   4. 后台线程构建 BM25 全文索引
//
// reindex_vault:
//   重建 BM25 索引 + 遍历所有 .md 笔记更新 SQLite + 可选向量化

use crate::{
    adapters::base::ModelConfig,
    bm25::Bm25Index,
    config::AppConfig,
    db,
    error::AppResult,
    indexer,
};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct VaultInfo {
    pub name: String,
    pub path: String,
    pub note_count: u64,
    pub last_indexed_at: Option<String>,
}

#[tauri::command]
pub fn open_vault(
    path: String,
    config: State<AppConfig>,
) -> AppResult<VaultInfo> {
    let vault_path = std::path::Path::new(&path);
    if !vault_path.exists() {
        std::fs::create_dir_all(vault_path)?;
    }

    *config.vault_path.lock().unwrap() = Some(vault_path.to_path_buf());

    let data_dir = AppConfig::memoa_config_dir(vault_path);
    std::fs::create_dir_all(&data_dir)?;

    db::init(&config.db_path)?;

    let _ = db::note::create_table();
    let _ = db::link::create_table();
    let _ = db::tag::create_table();
    let _ = db::tag::cleanup_orphans();
    let _ = db::financial::create_table();

    let note_count = db::note::count_all().unwrap_or(0);

    let vault_clone = vault_path.to_path_buf();
    std::thread::spawn(move || {
        match Bm25Index::build_from_vault(&vault_clone) {
            Ok(_) => tracing::info!("BM25 索引构建完成"),
            Err(e) => tracing::warn!("BM25 索引构建失败: {}", e),
        }
    });

    Ok(VaultInfo {
        name: vault_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Memoa")
            .to_string(),
        path: path.clone(),
        note_count,
        last_indexed_at: None,
    })
}

#[tauri::command]
pub fn switch_vault(
    path: String,
    config: State<AppConfig>,
) -> AppResult<VaultInfo> {
    let vault_path = std::path::Path::new(&path);
    if !vault_path.exists() {
        std::fs::create_dir_all(vault_path)?;
    }

    db::with_conn(|conn| {
        conn.execute_batch(
            "DELETE FROM note_tags;
             DELETE FROM tags;
             DELETE FROM links;
             DELETE FROM notes;",
        )?;
        Ok(())
    })?;

    *config.vault_path.lock().unwrap() = Some(vault_path.to_path_buf());

    let data_dir = AppConfig::memoa_config_dir(vault_path);
    std::fs::create_dir_all(&data_dir)?;

    let _ = db::note::create_table();
    let _ = db::link::create_table();
    let _ = db::tag::create_table();

    let vault_clone = vault_path.to_path_buf();
    std::thread::spawn(move || {
        match Bm25Index::build_from_vault(&vault_clone) {
            Ok(_) => tracing::info!("BM25 索引构建完成 (vault switched)"),
            Err(e) => tracing::warn!("BM25 索引构建失败: {}", e),
        }
    });

    Ok(VaultInfo {
        name: vault_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Memoa")
            .to_string(),
        path: path.clone(),
        note_count: 0,
        last_indexed_at: None,
    })
}

#[tauri::command]
pub fn get_vault_info(config: State<AppConfig>) -> AppResult<Option<VaultInfo>> {
    let vault_path = config.vault_path.lock().unwrap();
    match vault_path.as_ref() {
        Some(path) => {
            let note_count = db::note::count_all().unwrap_or(0);
            Ok(Some(VaultInfo {
                name: path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Memoa")
                    .to_string(),
                path: path.to_string_lossy().to_string(),
                note_count,
                last_indexed_at: None,
            }))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn reindex_vault(
    config: State<'_, AppConfig>,
    embed_config: Option<ModelConfig>,
) -> AppResult<indexer::IndexStats> {
    let vault_path = {
        let guard = config.vault_path.lock().unwrap();
        guard
            .clone()
            .ok_or_else(|| crate::error::AppError::VaultNotOpen)?
    };

    db::with_conn(|conn| {
        conn.execute_batch(
            "DELETE FROM links;
             DELETE FROM note_tags;
             DELETE FROM tags;",
        )
        .map_err(|e| crate::error::AppError::Other(format!("clear index data failed: {}", e)))
    })
    .ok();

    match crate::bm25::Bm25Index::build_from_vault(&vault_path) {
        Ok(_) => tracing::info!("BM25 索引已在 reindex 中重建"),
        Err(e) => tracing::warn!("BM25 reindex 构建失败: {}", e),
    }

    let stats = indexer::reindex_vault(&vault_path, embed_config).await?;
    tracing::info!("reindex 完成: {} notes, {} new, {} updated, {} skipped, {} errors",
        stats.total_notes, stats.new_notes, stats.updated_notes, stats.skipped_notes, stats.errors.len());

    Ok(stats)
}