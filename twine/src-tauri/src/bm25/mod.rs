use crate::chunker;
use crate::error::AppResult;
use std::{collections::HashSet, fs, path::{Path, PathBuf}};
use std::sync::Mutex;
use tantivy::collector::TopDocs;
use tantivy::query::{BooleanQuery, Occur, TermQuery};
use tantivy::schema::*;
use tantivy::tokenizer::{LowerCaser, NgramTokenizer, TextAnalyzer};
use tantivy::{doc, Index, IndexReader, ReloadPolicy, TantivyDocument, Term};

static BUILD_LOCK: Mutex<()> = Mutex::new(());

fn bm25_dir(vault_path: &Path) -> PathBuf {
    vault_path.join(".memoa").join("bm25")
}

pub struct Bm25Chunk {
    pub note_path: String,
    pub note_title: String,
    pub chunk_index: u32,
    pub text: String,
    pub chunk_offset: u64,
    pub chunk_length: u64,
}

pub struct Bm25Index {
    index: Index,
    schema: Schema,
    reader: IndexReader,
}

fn register_cjk_tokenizer(index: &Index) -> AppResult<()> {
    let ngram_tokenizer = TextAnalyzer::builder(
        NgramTokenizer::new(1, 3, false)
            .map_err(|e| crate::error::AppError::Other(format!("创建分词器失败: {}", e)))?,
    )
    .filter(LowerCaser)
    .build();
    index.tokenizers().register("cjk_ngram", ngram_tokenizer);
    Ok(())
}

impl Bm25Index {
    pub fn open(vault_path: &Path) -> AppResult<Option<Self>> {
        let dir = bm25_dir(vault_path);
        if !dir.join("meta.json").exists() {
            return Ok(None);
        }
        let index = Index::open_in_dir(&dir)
            .map_err(|e| crate::error::AppError::Other(format!("打开 BM25 索引失败: {}", e)))?;

        let schema = index.schema();
        if schema.get_field("chunk_offset").is_err() || schema.get_field("chunk_length").is_err() {
            tracing::info!("BM25 index has old schema, will be rebuilt");
            return Ok(None);
        }

        register_cjk_tokenizer(&index)?;

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| crate::error::AppError::Other(format!("BM25 reader 创建失败: {}", e)))?;
        Ok(Some(Bm25Index {
            index,
            schema,
            reader,
        }))
    }

    pub fn build(vault_path: &Path, chunks: &[Bm25Chunk]) -> AppResult<Self> {
        let dir = bm25_dir(vault_path);
        if dir.exists() {
            let _ = fs::remove_dir_all(&dir);
        }
        fs::create_dir_all(&dir)?;

        let mut schema_builder = Schema::builder();

        schema_builder.add_text_field("chunk_id", STRING | STORED);
        schema_builder.add_text_field("note_path", STRING | STORED);
        schema_builder.add_text_field("note_title", STRING | STORED);

        schema_builder.add_u64_field("chunk_index", STORED);
        schema_builder.add_u64_field("chunk_offset", STORED);
        schema_builder.add_u64_field("chunk_length", STORED);

        let cjk_indexing = TextFieldIndexing::default()
            .set_tokenizer("cjk_ngram")
            .set_index_option(IndexRecordOption::WithFreqsAndPositions);
        let cjk_opts = TextOptions::default()
            .set_indexing_options(cjk_indexing)
            .set_stored();
        schema_builder.add_text_field("body", cjk_opts);

        let schema = schema_builder.build();
        let index = Index::create_in_dir(&dir, schema.clone())
            .map_err(|e| crate::error::AppError::Other(format!("创建 BM25 索引失败: {}", e)))?;

        register_cjk_tokenizer(&index)?;

        let chunk_id_field = schema.get_field("chunk_id").unwrap();
        let note_path_field = schema.get_field("note_path").unwrap();
        let note_title_field = schema.get_field("note_title").unwrap();
        let chunk_index_field = schema.get_field("chunk_index").unwrap();
        let chunk_offset_field = schema.get_field("chunk_offset").unwrap();
        let chunk_length_field = schema.get_field("chunk_length").unwrap();
        let body_field = schema.get_field("body").unwrap();

        let mut writer: tantivy::IndexWriter<TantivyDocument> = index
            .writer(50_000_000)
            .map_err(|e| crate::error::AppError::Other(format!("BM25 writer 创建失败: {}", e)))?;

        let mut doc_count = 0u32;
        for chunk in chunks {
            if chunk.text.trim().is_empty() {
                continue;
            }
            let chunk_id = format!("{}::{}", chunk.note_path, chunk.chunk_index);
            let _ = writer.add_document(doc!(
                chunk_id_field => chunk_id,
                note_path_field => chunk.note_path.clone(),
                note_title_field => chunk.note_title.clone(),
                chunk_index_field => chunk.chunk_index as u64,
                chunk_offset_field => chunk.chunk_offset,
                chunk_length_field => chunk.chunk_length,
                body_field => chunk.text.clone(),
            ));
            doc_count += 1;
        }

        tracing::info!("BM25 build: indexed {} chunks", doc_count);

        writer
            .commit()
            .map_err(|e| crate::error::AppError::Other(format!("BM25 commit 失败: {}", e)))?;

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| crate::error::AppError::Other(format!("BM25 reader 创建失败: {}", e)))?;

        Ok(Bm25Index { index, schema, reader })
    }

    pub fn build_from_vault(vault_path: &Path) -> AppResult<Self> {
        let _lock = BUILD_LOCK.lock().unwrap();
        let mut chunks: Vec<Bm25Chunk> = Vec::new();
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
            let rel = path.strip_prefix(vault_path).unwrap_or(path);
            let note_path = rel.to_string_lossy().to_string();
            let note_title = rel
                .file_stem()
                .and_then(|n| n.to_str())
                .unwrap_or(&note_path)
                .to_string();
            let content = match fs::read_to_string(path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let text_chunks = chunker::chunk_text(&content);
            for (i, chunk) in text_chunks.into_iter().enumerate() {
                chunks.push(Bm25Chunk {
                    note_path: note_path.clone(),
                    note_title: note_title.clone(),
                    chunk_index: i as u32,
                    text: chunk.text,
                    chunk_offset: chunk.offset as u64,
                    chunk_length: chunk.length as u64,
                });
            }
        }
        Self::build(vault_path, &chunks)
    }

    pub fn upsert_note(
        vault_path: &Path,
        note_path: &str,
        note_title: &str,
        content: &str,
    ) -> AppResult<()> {
        let Some(index) = Self::open(vault_path)? else {
            return Ok(());
        };

        let note_path_field = index.schema.get_field("note_path").unwrap();
        let note_title_field = index.schema.get_field("note_title").unwrap();
        let chunk_id_field = index.schema.get_field("chunk_id").unwrap();
        let chunk_index_field = index.schema.get_field("chunk_index").unwrap();
        let chunk_offset_field = index.schema.get_field("chunk_offset").unwrap();
        let chunk_length_field = index.schema.get_field("chunk_length").unwrap();
        let body_field = index.schema.get_field("body").unwrap();

        let mut writer: tantivy::IndexWriter<TantivyDocument> = index
            .index
            .writer(50_000_000)
            .map_err(|e| crate::error::AppError::Other(format!("BM25 writer 创建失败: {}", e)))?;

        let term = Term::from_field_text(note_path_field, note_path);
        let _ = writer.delete_term(term);

        let chunks = chunker::chunk_text(content);
        let chunk_count = chunks.len();
        for (i, chunk) in chunks.into_iter().enumerate() {
            if chunk.text.trim().is_empty() {
                continue;
            }
            let chunk_id = format!("{}::{}", note_path, i);
            if let Err(e) = writer.add_document(doc!(
                chunk_id_field => chunk_id.clone(),
                note_path_field => note_path.to_string(),
                note_title_field => note_title.to_string(),
                chunk_index_field => i as u64,
                chunk_offset_field => chunk.offset as u64,
                chunk_length_field => chunk.length as u64,
                body_field => chunk.text,
            )) {
                tracing::warn!("BM25 upsert: add_document failed for chunk {}: {}", chunk_id, e);
            }
        }

        writer
            .commit()
            .map_err(|e| crate::error::AppError::Other(format!("BM25 commit 失败: {}", e)))?;

        tracing::info!("BM25 upsert: {} ({} chunks)", note_path, chunk_count);
        Ok(())
    }

    pub fn remove_note(vault_path: &Path, note_path: &str) -> AppResult<()> {
        let Some(index) = Self::open(vault_path)? else {
            return Ok(());
        };

        let note_path_field = index.schema.get_field("note_path").unwrap();

        let mut writer: tantivy::IndexWriter<TantivyDocument> = index
            .index
            .writer(50_000_000)
            .map_err(|e| crate::error::AppError::Other(format!("BM25 writer 创建失败: {}", e)))?;

        let term = Term::from_field_text(note_path_field, note_path);
        let _ = writer.delete_term(term);

        writer
            .commit()
            .map_err(|e| crate::error::AppError::Other(format!("BM25 commit 失败: {}", e)))?;

        tracing::info!("BM25 remove: {}", note_path);
        Ok(())
    }

    pub fn search(&self, query: &str, top_k: usize) -> AppResult<Vec<Bm25Hit>> {
        let body_field = self.schema.get_field("body").unwrap();
        let note_path_field = self.schema.get_field("note_path").unwrap();
        let note_title_field = self.schema.get_field("note_title").unwrap();
        let chunk_index_field = self.schema.get_field("chunk_index").unwrap();
        let chunk_offset_field = self.schema.get_field("chunk_offset").unwrap();
        let chunk_length_field = self.schema.get_field("chunk_length").unwrap();

        let query_str = query.to_string();

        let mut ngram_tokenizer = TextAnalyzer::builder(
            NgramTokenizer::new(1, 3, false)
                .map_err(|e| crate::error::AppError::Other(format!("创建分词器失败: {}", e)))?,
        )
        .filter(LowerCaser)
        .build();

        let mut token_stream = ngram_tokenizer.token_stream(query);
        let mut seen = HashSet::new();
        let mut subqueries: Vec<(Occur, Box<dyn tantivy::query::Query>)> = Vec::new();

        while token_stream.advance() {
            let term_text = token_stream.token().text.clone();
            if seen.insert(term_text.clone()) {
                let term = tantivy::Term::from_field_text(body_field, &term_text);
                subqueries.push((
                    Occur::Should,
                    Box::new(TermQuery::new(term, IndexRecordOption::WithFreqs)),
                ));
            }
        }

        if subqueries.is_empty() {
            return Ok(Vec::new());
        }

        let query = BooleanQuery::new(subqueries);

        let searcher = self.reader.searcher();
        tracing::info!(
            "BM25 search: query=\"{}\", num_docs={}, terms={}",
            query_str,
            searcher.num_docs(),
            seen.len()
        );
        let top_docs = searcher
            .search(&query, &TopDocs::with_limit(top_k))
            .map_err(|e| crate::error::AppError::Other(format!("BM25 搜索失败: {}", e)))?;

        let hits: Vec<Bm25Hit> = top_docs
            .into_iter()
            .map(|(score, doc_addr)| {
                let doc: TantivyDocument = searcher.doc(doc_addr).unwrap();
                let note_path = doc
                    .get_first(note_path_field)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let note_title = doc
                    .get_first(note_title_field)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let chunk_index = doc
                    .get_first(chunk_index_field)
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32;
                let snippet = doc
                    .get_first(body_field)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let chunk_offset = doc
                    .get_first(chunk_offset_field)
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let chunk_length = doc
                    .get_first(chunk_length_field)
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                Bm25Hit {
                    score,
                    note_path,
                    note_title,
                    chunk_index,
                    chunk_offset,
                    chunk_length,
                    snippet,
                }
            })
            .collect();

        Ok(hits)
    }
}

#[derive(Debug, Clone)]
pub struct Bm25Hit {
    pub score: f32,
    pub note_path: String,
    pub note_title: String,
    pub chunk_index: u32,
    pub chunk_offset: u64,
    pub chunk_length: u64,
    pub snippet: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_bm25_chinese_search() {
        let dir = TempDir::new().unwrap();
        let chunks = vec![
            Bm25Chunk {
                note_path: "reservoir/xiaolangdi.md".into(),
                note_title: "小浪底水库".into(),
                chunk_index: 0,
                chunk_offset: 0,
                chunk_length: 0,
                text: "小浪底水利枢纽位于黄河中游最后一段峡谷的出口处，是黄河干流上最大的水利枢纽工程。".into(),
            },
            Bm25Chunk {
                note_path: "reservoir/sanmenxia.md".into(),
                note_title: "三门峡水库".into(),
                chunk_index: 0,
                chunk_offset: 0,
                chunk_length: 0,
                text: "三门峡水库是黄河上的第一个大型水利枢纽工程。".into(),
            },
        ];
        let index = Bm25Index::build(dir.path(), &chunks).unwrap();
        let hits = index.search("小浪底", 5).unwrap();
        assert!(!hits.is_empty());
        assert!(hits.iter().any(|h| h.note_title.contains("小浪底")));
    }

    #[test]
    fn test_bm25_chunk_indexing() {
        let dir = TempDir::new().unwrap();
        let chunks = vec![
            Bm25Chunk {
                note_path: "test.md".into(),
                note_title: "测试".into(),
                chunk_index: 0,
                chunk_offset: 0,
                chunk_length: 0,
                text: "第一个段落的内容。".into(),
            },
            Bm25Chunk {
                note_path: "test.md".into(),
                note_title: "测试".into(),
                chunk_index: 1,
                chunk_offset: 0,
                chunk_length: 0,
                text: "第二个段落的内容。".into(),
            },
        ];
        let index = Bm25Index::build(dir.path(), &chunks).unwrap();
        let hits = index.search("第二", 5).unwrap();
        assert!(hits.len() >= 1);
        assert!(hits.iter().any(|h| h.chunk_index == 1));
    }

    #[test]
    fn test_bm25_open_and_search() {
        let dir = TempDir::new().unwrap();
        let chunks = vec![Bm25Chunk {
            note_path: "a.md".into(),
            note_title: "A".into(),
            chunk_index: 0,
            chunk_offset: 0,
            chunk_length: 0,
            text: "黄河小浪底水库位于河南省洛阳市。".into(),
        }];
        let _ = Bm25Index::build(dir.path(), &chunks).unwrap();

        let index = Bm25Index::open(dir.path()).unwrap().unwrap();
        let hits = index.search("小浪底", 5).unwrap();
        assert!(!hits.is_empty());
    }
}