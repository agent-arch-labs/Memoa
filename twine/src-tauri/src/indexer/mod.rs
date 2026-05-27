// 索引引擎 - 笔记批量重建与单篇索引
//
// reindex_vault:
//   遍历知识库中所有 .md 文件，执行:
//     1. SHA256 校验和计算，判断是否变更
//     2. 写入/更新 SQLite notes 表
//     3. 提取 Frontmatter 中的 tags
//     4. 提取双向链接 ([[wikilink]])
//     5. 若配置了向量模型，分块后生成嵌入向量
//
// 索引策略:
//   - 增量更新: 基于 checksum 比较，只更新变更的笔记
//   - 容错: 单篇笔记失败不中断整体索引流程
//   - 去重: 索引完成后清理 SQLite 中的重复和孤儿记录
//   - 隐藏文件: 自动跳过以 . 开头的文件和目录

pub mod markdown;

use crate::{
    adapters::base::{create_adapter, ModelAdapter, ModelConfig},
    db, embedding,
    error::AppResult,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[derive(Debug, Serialize)]
pub struct IndexStats {
    pub total_notes: u32,
    pub new_notes: u32,
    pub updated_notes: u32,
    pub skipped_notes: u32,
    pub errors: Vec<String>,
}

pub async fn reindex_vault(vault_path: &Path, embed_config: Option<ModelConfig>) -> AppResult<IndexStats> {
    let mut stats = IndexStats {
        total_notes: 0,
        new_notes: 0,
        updated_notes: 0,
        skipped_notes: 0,
        errors: Vec::new(),
    };

    let mut processed_paths: Vec<String> = Vec::new();

    let (adapter, embed_available) = if let Some(ref ec) = embed_config {
        let ad = create_adapter(ec);
        let available = ad.health_check(ec).await.unwrap_or_else(|e| {
            tracing::warn!(
                "reindex: 向量化模型健康检查失败（provider={:?} model={} api_url={}）: {}",
                ec.provider,
                ec.model_id,
                ec.api_url,
                e
            );
            false
        });
        tracing::info!(
            "reindex: provider={:?}, model={}, api_url={}, available={}, vault={}",
            ec.provider,
            ec.model_id,
            ec.api_url,
            available,
            vault_path.display()
        );
        if !available {
            tracing::warn!("向量化模型不可用（provider={:?} model={}），跳过向量索引构建", ec.provider, ec.model_id);
        }
        (Some(ad), available)
    } else {
        tracing::info!("reindex: 未配置向量化模型，跳过向量索引构建");
        (None, false)
    };

    for entry in walkdir::WalkDir::new(vault_path)
        .max_depth(15)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with('.')).unwrap_or(true) {
            continue;
        }
        if path.extension().and_then(|e| e.to_str()).map(|e| e != "md").unwrap_or(true) {
            stats.skipped_notes += 1;
            continue;
        }

        stats.total_notes += 1;
        let rel_path = path.strip_prefix(vault_path).unwrap_or(path);
        let path_str = rel_path.to_string_lossy().to_string();

        processed_paths.push(path_str.clone());

        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(e) => {
                stats.errors.push(format!("读取失败 {}: {}", path_str, e));
                continue;
            }
        };

        let checksum: String = {
            let mut hasher = Sha256::new();
            hasher.update(content.as_bytes());
            hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect()
        };

        let mut is_new = true;
        let note_id = match db::note::upsert_by_path(&path_str, &content, &checksum) {
            Ok(id) => {
                if db::with_conn(|conn| {
                    let count: i64 = conn.query_row(
                        "SELECT COUNT(*) FROM notes WHERE path = ?1",
                        [&path_str],
                        |row| row.get(0),
                    )?;
                    Ok(count)
                })
                .unwrap_or(0) > 0
                {
                    is_new = false;
                }
                id
            }
            Err(e) => {
                stats.errors.push(format!("DB写入失败 {}: {}", path_str, e));
                continue;
            }
        };

        if !is_new {
            stats.updated_notes += 1;
        } else {
            stats.new_notes += 1;
        }

        let extract_result = markdown::extract_frontmatter_and_links(&content);

        let links: Vec<db::link::ParsedLink> = extract_result
            .links
            .into_iter()
            .map(|l| db::link::ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        if let Err(e) = db::link::upsert_links(&note_id, &links) {
            tracing::error!("reindex: 更新链接失败 {}: {}", path_str, e);
        }

        if let Err(e) = db::tag::upsert_note_tags(&note_id, &extract_result.tags) {
            tracing::error!("reindex: 更新标签失败 {}: {}", path_str, e);
        }

        if embed_available {
            if let (Some(ref adapter), Some(ref ec)) = (&adapter, &embed_config) {
                match index_note_embeddings(
                    vault_path,
                    &note_id,
                    path_str.clone(),
                    &content,
                    adapter,
                    ec,
                )
                .await
                {
                    Ok(()) => (),
                    Err(e) => stats
                        .errors
                        .push(format!("向量化失败 {}: {}", path_str, e)),
                }
            }
        }
    }

    db::with_conn(|conn| {
        conn.execute_batch(
            "DELETE FROM note_tags WHERE rowid NOT IN (
                SELECT MIN(rowid) FROM note_tags GROUP BY note_id, tag_id
            );
            DELETE FROM note_tags WHERE note_id NOT IN (
                SELECT id FROM notes
            );
            DELETE FROM links WHERE source_id NOT IN (
                SELECT id FROM notes
            );
            DELETE FROM notes WHERE rowid NOT IN (
                SELECT MIN(rowid) FROM notes GROUP BY path
            );",
        )
        .map_err(|e| crate::error::AppError::Other(format!("reindex dedup failed: {}", e)))
    })
    .ok();

    if !processed_paths.is_empty() {
        let placeholders: Vec<String> = processed_paths.iter().enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect();
        let sql = format!(
            "DELETE FROM notes WHERE path NOT IN ({})",
            placeholders.join(",")
        );
        let _ = db::with_conn(|conn| {
            let mut stmt = conn.prepare(&sql)?;
            let params: Vec<&dyn rusqlite::types::ToSql> = processed_paths
                .iter()
                .map(|p| p as &dyn rusqlite::types::ToSql)
                .collect();
            stmt.execute(params.as_slice())?;
            Ok::<_, crate::error::AppError>(())
        });
    }

    Ok(stats)
}

pub async fn index_single_note(
    vault_path: &Path,
    note_id: &str,
    note_path: &str,
    content: &str,
    embed_config: Option<ModelConfig>,
) -> AppResult<()> {
    if let Some(ref ec) = embed_config {
        let adapter = create_adapter(ec);
        index_note_embeddings(vault_path, note_id, note_path.to_string(), content, &adapter, ec).await
    } else {
        tracing::info!("index_single_note: 未配置向量化模型，跳过 {}", note_path);
        Ok(())
    }
}

async fn index_note_embeddings(
    vault_path: &Path,
    note_id: &str,
    note_path: String,
    content: &str,
    adapter: &ModelAdapter,
    config: &ModelConfig,
) -> AppResult<()> {
    let _ = embedding::cleanup_note(vault_path, note_id);

    let chunks = crate::chunker::chunk_text(content);

    let mut chunk_records = Vec::new();
    for (i, chunk) in chunks.iter().enumerate() {
        if chunk.text.trim().is_empty() {
            continue;
        }
        match adapter.embed(&chunk.text, config).await {
            Ok((vector, _)) => {
                chunk_records.push(embedding::ChunkRecord {
                    note_id: note_id.to_string(),
                    note_path: note_path.clone(),
                    chunk_index: i as u32,
                    text: chunk.text.clone(),
                    vector,
                    chunk_offset: chunk.offset as u64,
                    chunk_length: chunk.length as u64,
                });
            }
            Err(e) => {
                tracing::warn!("向量化分块失败 {}: chunk {}: {}", note_path, i, e);
            }
        }
    }

    if !chunk_records.is_empty() {
        embedding::index_chunks(vault_path, &chunk_records)?;
    }

    Ok(())
}