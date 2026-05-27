// 向量嵌入存储与检索
//
// 存储:
//   - 向量块存储在仓库的 .memoa/vectors.json 中
//   - JSON 数组格式，每项包含 note_id, chunk_index, text, vector 等字段
//   - index_chunks: 追加新块 + 清理旧块
//   - cleanup_note: 移除指定笔记的所有分块
//
// 检索:
//   - search_similar_chunks: 余弦相似度排序取 top_k
//   - 全量内存计算，适用于个人知识库规模 (千级笔记)

use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkRecord {
    pub note_id: String,
    #[serde(default)]
    pub note_path: String,
    pub chunk_index: u32,
    pub text: String,
    pub vector: Vec<f32>,
    #[serde(default)]
    pub chunk_offset: u64,
    #[serde(default)]
    pub chunk_length: u64,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub note_id: String,
    pub note_path: String,
    pub title: String,
    pub chunk_index: u32,
    pub text: String,
    pub score: f64,
    pub chunk_offset: u64,
    pub chunk_length: u64,
}

fn index_file_path(vault_path: &Path) -> PathBuf {
    AppConfig::memoa_config_dir(vault_path).join("vectors.json")
}

pub fn search_similar_chunks(
    vault_path: &Path,
    query_embedding: &[f32],
    top_k: usize,
) -> AppResult<Vec<SearchResult>> {
    let index_path = index_file_path(vault_path);

    if !index_path.exists() {
        return Ok(Vec::new());
    }

    let data = fs::read_to_string(&index_path)?;
    let chunks: Vec<ChunkRecord> = serde_json::from_str(&data)?;

    let mut scored: Vec<(f64, &ChunkRecord)> = chunks
        .iter()
        .map(|chunk| (cosine_similarity(query_embedding, &chunk.vector), chunk))
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let results: Vec<SearchResult> = scored
        .into_iter()
        .take(top_k)
        .map(|(score, chunk)| SearchResult {
            note_id: chunk.note_id.clone(),
            note_path: chunk.note_path.clone(),
            title: String::new(),
            chunk_index: chunk.chunk_index,
            text: chunk.text.clone(),
            score,
            chunk_offset: chunk.chunk_offset,
            chunk_length: chunk.chunk_length,
        })
        .collect();

    Ok(results)
}

pub fn index_chunks(vault_path: &Path, new_chunks: &[ChunkRecord]) -> AppResult<()> {
    let index_path = index_file_path(vault_path);

    let mut existing: Vec<ChunkRecord> = if index_path.exists() {
        let data = fs::read_to_string(&index_path)?;
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        Vec::new()
    };

    existing.retain(|c| !new_chunks.iter().any(|nc| nc.note_id == c.note_id));

    existing.extend(new_chunks.iter().cloned());

    let json = serde_json::to_string(&existing)?;
    fs::write(&index_path, json)?;

    Ok(())
}

pub fn cleanup_note(vault_path: &Path, note_id: &str) -> AppResult<()> {
    let index_path = index_file_path(vault_path);
    if !index_path.exists() {
        return Ok(());
    }

    let data = fs::read_to_string(&index_path)?;
    let mut chunks: Vec<ChunkRecord> = serde_json::from_str(&data).unwrap_or_default();
    chunks.retain(|c| c.note_id != note_id);

    let json = serde_json::to_string(&chunks)?;
    fs::write(&index_path, json)?;

    Ok(())
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    let dot: f64 = a.iter().zip(b.iter()).map(|(x, y)| (*x as f64) * (*y as f64)).sum();
    let norm_a: f64 = a.iter().map(|x| (*x as f64).powi(2)).sum::<f64>().sqrt();
    let norm_b: f64 = b.iter().map(|x| (*x as f64).powi(2)).sum::<f64>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot / (norm_a * norm_b)
}

struct AppConfig;

impl AppConfig {
    fn memoa_config_dir(vault_path: &Path) -> PathBuf {
        vault_path.join(".memoa")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_cosine_similarity_identical_vectors() {
        let v = vec![1.0, 2.0, 3.0];
        let score = cosine_similarity(&v, &v);
        assert!((score - 1.0).abs() < 1e-6, "identical vectors should have similarity 1.0");
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        let score = cosine_similarity(&a, &b);
        assert!((score - 0.0).abs() < 1e-6, "orthogonal vectors should have similarity 0.0");
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let a = vec![1.0, 0.0];
        let b = vec![-1.0, 0.0];
        let score = cosine_similarity(&a, &b);
        assert!((score - (-1.0)).abs() < 1e-6, "opposite vectors should have similarity -1.0");
    }

    #[test]
    fn test_cosine_similarity_zero_vector() {
        let a = vec![0.0, 0.0];
        let b = vec![1.0, 2.0];
        let score = cosine_similarity(&a, &b);
        assert_eq!(score, 0.0, "zero vector should give similarity 0.0");
    }

    #[test]
    fn test_cosine_similarity_empty() {
        let score = cosine_similarity(&[], &[]);
        assert_eq!(score, 0.0);
    }

    #[test]
    fn test_search_empty_index() {
        let tmp = TempDir::new().unwrap();
        let vault = tmp.path();
        fs::create_dir_all(vault.join(".memoa")).unwrap();

        let query = vec![0.1, 0.2, 0.3];
        let results = search_similar_chunks(vault, &query, 5).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_index_and_search_chunks() {
        let tmp = TempDir::new().unwrap();
        let vault = tmp.path();
        fs::create_dir_all(vault.join(".memoa")).unwrap();

        let chunks = vec![
            ChunkRecord {
                note_id: "note1.md".to_string(),
                note_path: "note1.md".to_string(),
                chunk_index: 0,
                text: "hello world".to_string(),
                vector: vec![1.0, 0.0, 0.0],
                chunk_offset: 0,
                chunk_length: 0,
            },
            ChunkRecord {
                note_id: "note1.md".to_string(),
                note_path: "note1.md".to_string(),
                chunk_index: 1,
                text: "second chunk".to_string(),
                vector: vec![0.0, 1.0, 0.0],
                chunk_offset: 0,
                chunk_length: 0,
            },
            ChunkRecord {
                note_id: "note2.md".to_string(),
                note_path: "note2.md".to_string(),
                chunk_index: 0,
                text: "other note".to_string(),
                vector: vec![0.0, 0.0, 1.0],
                chunk_offset: 0,
                chunk_length: 0,
            },
        ];

        index_chunks(vault, &chunks).unwrap();

        let query = vec![1.0, 0.1, 0.0];
        let results = search_similar_chunks(vault, &query, 3).unwrap();
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].note_id, "note1.md");
        assert_eq!(results[0].chunk_index, 0);
        // The chunk most similar to query should be the first one
        assert!(results[0].score > results[1].score);
    }

    #[test]
    fn test_cleanup_note() {
        let tmp = TempDir::new().unwrap();
        let vault = tmp.path();
        fs::create_dir_all(vault.join(".memoa")).unwrap();

        let chunks = vec![
            ChunkRecord {
                note_id: "keep.md".to_string(),
                note_path: "keep.md".to_string(),
                chunk_index: 0,
                text: "keep me".to_string(),
                vector: vec![1.0, 0.0],
                chunk_offset: 0,
                chunk_length: 0,
            },
            ChunkRecord {
                note_id: "remove.md".to_string(),
                note_path: "remove.md".to_string(),
                chunk_index: 0,
                text: "remove me".to_string(),
                vector: vec![0.0, 1.0],
                chunk_offset: 0,
                chunk_length: 0,
            },
        ];

        index_chunks(vault, &chunks).unwrap();
        cleanup_note(vault, "remove.md").unwrap();

        let query = vec![1.0, 1.0];
        let results = search_similar_chunks(vault, &query, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].note_id, "keep.md");
    }

    #[test]
    fn test_index_chunks_replaces_existing() {
        let tmp = TempDir::new().unwrap();
        let vault = tmp.path();
        fs::create_dir_all(vault.join(".memoa")).unwrap();

        let old_chunks = vec![ChunkRecord {
            note_id: "note1.md".to_string(),
            note_path: "note1.md".to_string(),
            chunk_index: 0,
            text: "old content".to_string(),
            vector: vec![1.0, 0.0],
            chunk_offset: 0,
            chunk_length: 0,
        }];

        index_chunks(vault, &old_chunks).unwrap();

        let new_chunks = vec![ChunkRecord {
            note_id: "note1.md".to_string(),
            note_path: "note1.md".to_string(),
            chunk_index: 0,
            text: "new content".to_string(),
            vector: vec![0.0, 1.0],
            chunk_offset: 0,
            chunk_length: 0,
        }];

        index_chunks(vault, &new_chunks).unwrap();

        let query = vec![0.0, 1.0];
        let results = search_similar_chunks(vault, &query, 5).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].text, "new content");
    }
}