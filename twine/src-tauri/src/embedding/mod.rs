use crate::db;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};

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

pub fn ensure_table() -> AppResult<()> {
    db::with_conn(|conn| {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS vector_chunks (
                note_id TEXT NOT NULL,
                note_path TEXT NOT NULL DEFAULT '',
                chunk_index INTEGER NOT NULL DEFAULT 0,
                text TEXT NOT NULL DEFAULT '',
                vector BLOB NOT NULL,
                chunk_offset INTEGER NOT NULL DEFAULT 0,
                chunk_length INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (note_id, chunk_index)
            );
            CREATE INDEX IF NOT EXISTS idx_vector_chunks_note
                ON vector_chunks(note_id);",
        )?;
        Ok(())
    })
}

fn vector_to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

fn blob_to_vector(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

pub fn search_similar_chunks(
    query_embedding: &[f32],
    top_k: usize,
) -> AppResult<Vec<SearchResult>> {
    let chunks: Vec<ChunkRecord> = db::with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT note_id, note_path, chunk_index, text, vector, chunk_offset, chunk_length
             FROM vector_chunks",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ChunkRecord {
                note_id: row.get(0)?,
                note_path: row.get(1)?,
                chunk_index: row.get::<_, i64>(2)? as u32,
                text: row.get(3)?,
                vector: blob_to_vector(&row.get::<_, Vec<u8>>(4)?),
                chunk_offset: row.get::<_, i64>(5)? as u64,
                chunk_length: row.get::<_, i64>(6)? as u64,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    })?;

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

pub fn index_chunks(new_chunks: &[ChunkRecord]) -> AppResult<()> {
    if new_chunks.is_empty() {
        return Ok(());
    }

    db::with_conn(|conn| {
        let mut delete_stmt = conn.prepare("DELETE FROM vector_chunks WHERE note_id = ?1")?;
        for chunk in new_chunks {
            delete_stmt.execute([&chunk.note_id])?;
        }
        drop(delete_stmt);

        let mut insert_stmt = conn.prepare(
            "INSERT OR REPLACE INTO vector_chunks
             (note_id, note_path, chunk_index, text, vector, chunk_offset, chunk_length)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )?;

        for chunk in new_chunks {
            insert_stmt.execute(rusqlite::params![
                chunk.note_id,
                chunk.note_path,
                chunk.chunk_index,
                chunk.text,
                vector_to_blob(&chunk.vector),
                chunk.chunk_offset,
                chunk.chunk_length,
            ])?;
        }

        Ok(())
    })
}

pub fn cleanup_note(note_id: &str) -> AppResult<()> {
    db::with_conn(|conn| {
        conn.execute("DELETE FROM vector_chunks WHERE note_id = ?1", [note_id])?;
        Ok(())
    })
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use tempfile::TempDir;

    fn setup_test_db() -> TempDir {
        let tmp = TempDir::new().unwrap();
        let db_path = tmp.path().join("test.db");
        db::init(&db_path).unwrap();
        ensure_table().unwrap();
        tmp
    }

    #[test]
    fn test_cosine_similarity_identical_vectors() {
        let v = vec![1.0, 2.0, 3.0];
        let score = cosine_similarity(&v, &v);
        assert!((score - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        let score = cosine_similarity(&a, &b);
        assert!((score - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let a = vec![1.0, 0.0];
        let b = vec![-1.0, 0.0];
        let score = cosine_similarity(&a, &b);
        assert!((score - (-1.0)).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_zero_vector() {
        let a = vec![0.0, 0.0];
        let b = vec![1.0, 2.0];
        let score = cosine_similarity(&a, &b);
        assert_eq!(score, 0.0);
    }

    #[test]
    fn test_cosine_similarity_empty() {
        let score = cosine_similarity(&[], &[]);
        assert_eq!(score, 0.0);
    }

    #[test]
    fn test_vector_blob_roundtrip() {
        let v = vec![1.0f32, -2.5, 0.0, 3.14];
        let blob = vector_to_blob(&v);
        let restored = blob_to_vector(&blob);
        assert_eq!(v.len(), restored.len());
        for (a, b) in v.iter().zip(restored.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }

    #[test]
    fn test_vector_blob_empty() {
        let v: Vec<f32> = vec![];
        let blob = vector_to_blob(&v);
        assert!(blob.is_empty());
        let restored = blob_to_vector(&blob);
        assert!(restored.is_empty());
    }

    #[test]
    fn test_search_empty_index() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let _tmp = setup_test_db();
        let query = vec![0.1, 0.2, 0.3];
        let results = search_similar_chunks(&query, 5).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_index_and_search_chunks() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let _tmp = setup_test_db();

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

        index_chunks(&chunks).unwrap();

        let query = vec![1.0, 0.1, 0.0];
        let results = search_similar_chunks(&query, 3).unwrap();
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].note_id, "note1.md");
        assert_eq!(results[0].chunk_index, 0);
        assert!(results[0].score > results[1].score);
    }

    #[test]
    fn test_cleanup_note() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let _tmp = setup_test_db();

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

        index_chunks(&chunks).unwrap();
        cleanup_note("remove.md").unwrap();

        let query = vec![1.0, 1.0];
        let results = search_similar_chunks(&query, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].note_id, "keep.md");
    }

    #[test]
    fn test_index_chunks_replaces_existing() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let _tmp = setup_test_db();

        let old_chunks = vec![ChunkRecord {
            note_id: "note1.md".to_string(),
            note_path: "note1.md".to_string(),
            chunk_index: 0,
            text: "old content".to_string(),
            vector: vec![1.0, 0.0],
            chunk_offset: 0,
            chunk_length: 0,
        }];

        index_chunks(&old_chunks).unwrap();

        let new_chunks = vec![ChunkRecord {
            note_id: "note1.md".to_string(),
            note_path: "note1.md".to_string(),
            chunk_index: 0,
            text: "new content".to_string(),
            vector: vec![0.0, 1.0],
            chunk_offset: 0,
            chunk_length: 0,
        }];

        index_chunks(&new_chunks).unwrap();

        let query = vec![0.0, 1.0];
        let results = search_similar_chunks(&query, 5).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].text, "new content");
    }

    #[test]
    fn test_large_vector() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let _tmp = setup_test_db();

        let large_vec: Vec<f32> = (0..1024).map(|i| (i as f32) * 0.001).collect();
        let chunks = vec![ChunkRecord {
            note_id: "big.md".to_string(),
            note_path: "big.md".to_string(),
            chunk_index: 0,
            text: "large vector".to_string(),
            vector: large_vec.clone(),
            chunk_offset: 0,
            chunk_length: 0,
        }];

        index_chunks(&chunks).unwrap();

        let results = search_similar_chunks(&large_vec, 1).unwrap();
        assert_eq!(results.len(), 1);
        assert!((results[0].score - 1.0).abs() < 1e-4);
    }
}