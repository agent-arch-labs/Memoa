use crate::agent_rag::types::{ChunkSource, RagContext, StepEvent};
use crate::adapters::base::{
    create_adapter, Message as ChatMessage, ModelConfig, StreamChunk,
};
use crate::bm25::Bm25Index;
use crate::chunker;
use crate::error::AppResult;
use std::collections::HashMap;
use std::path::Path;
use tokio::sync::mpsc;

fn simple_text_search(query: &str, content: &str) -> f64 {
    let query_lower = query.to_lowercase();
    let content_lower = content.to_lowercase();
    let query_terms: Vec<&str> = query_lower.split_whitespace().collect();

    if query_terms.is_empty() {
        return 0.0;
    }

    let mut matches = 0u32;
    for term in &query_terms {
        if content_lower.contains(term) {
            matches += 1;
        }
    }

    matches as f64 / query_terms.len() as f64
}

pub fn run_retrieve(
    query: &str,
    top_k: usize,
    vault_path: &Path,
    _embed_config: Option<&ModelConfig>,
    ctx: &mut RagContext,
) -> AppResult<Vec<ChunkSource>> {
    if let Some(index) = Bm25Index::open(vault_path)? {
        let hits = index.search(query, top_k)?;
        tracing::info!(
            "agent_rag run_retrieve BM25: query=\"{}\", top_k={}, hits={}",
            query,
            top_k,
            hits.len()
        );
        let max_score = hits
            .iter()
            .map(|h| h.score as f64)
            .fold(0.0f64, f64::max);
        let results: Vec<ChunkSource> = hits
            .into_iter()
            .map(|h| ChunkSource {
                note_id: h.note_path.clone(),
                note_title: h.note_title,
                note_path: h.note_path,
                chunk_index: h.chunk_index,
                text: h.snippet,
                score: if max_score > 0.0 {
                    h.score as f64 / max_score
                } else {
                    0.0
                },
                chunk_offset: h.chunk_offset,
                chunk_length: h.chunk_length,
            })
            .collect();
        ctx.retrieved_chunks.extend(results.clone());
        return Ok(results);
    }

    tracing::info!(
        "agent_rag run_retrieve fallback (no BM25 index): query=\"{}\", top_k={}",
        query,
        top_k
    );

    let mut all_hits: Vec<ChunkSource> = Vec::new();

    for entry in walkdir::WalkDir::new(vault_path)
        .max_depth(10)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        if path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }

        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let relative = path
            .strip_prefix(vault_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        let title = std::path::Path::new(&relative)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&relative)
            .to_string();

        let chunks = chunker::chunk_text(&content);

        for (i, chunk) in chunks.iter().enumerate() {
            let score = simple_text_search(query, &chunk.text);
            if score > 0.0 {
                all_hits.push(ChunkSource {
                    note_id: format!("{}:{}", relative, i),
                    note_title: title.clone(),
                    note_path: relative.clone(),
                    chunk_index: i as u32,
                    text: chunk.text.clone(),
                    score,
                    chunk_offset: chunk.offset as u64,
                    chunk_length: chunk.length as u64,
                });
            }
        }
    }

    all_hits
        .sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    all_hits.truncate(top_k);
    all_hits.dedup_by(|a, b| a.note_id == b.note_id);

    ctx.retrieved_chunks.extend(all_hits.clone());

    Ok(all_hits)
}

pub async fn run_generate(
    prompt: &str,
    context_chunks: &[ChunkSource],
    system_prompt: &str,
    model_config: &ModelConfig,
) -> AppResult<String> {
    let adapter = create_adapter(model_config);

    let mut messages = vec![ChatMessage {
        role: "system".to_string(),
        content: system_prompt.to_string(),
    }];

    if !context_chunks.is_empty() {
        let context_text = context_chunks
            .iter()
            .enumerate()
            .map(|(i, c)| {
                format!(
                    "[来源 {}] ({})\n{}\n",
                    i + 1,
                    c.note_path,
                    c.text
                )
            })
            .collect::<Vec<_>>()
            .join("\n---\n");

        messages.push(ChatMessage {
            role: "system".to_string(),
            content: format!(
                "以下是来自知识库的相关笔记片段，请基于这些片段回答用户问题：\n{}",
                context_text
            ),
        });
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: prompt.to_string(),
    });

    let result = adapter.chat(messages, model_config).await?;
    Ok(result.content)
}

pub async fn run_generate_stream(
    prompt: &str,
    context_chunks: &[ChunkSource],
    system_prompt: &str,
    model_config: &ModelConfig,
    event_tx: &mpsc::UnboundedSender<StepEvent>,
) -> AppResult<String> {
    let adapter = create_adapter(model_config);

    let mut messages = vec![ChatMessage {
        role: "system".to_string(),
        content: system_prompt.to_string(),
    }];

    if !context_chunks.is_empty() {
        let context_text = context_chunks
            .iter()
            .enumerate()
            .map(|(i, c)| {
                format!(
                    "[来源 {}] ({})\n{}\n",
                    i + 1,
                    c.note_path,
                    c.text
                )
            })
            .collect::<Vec<_>>()
            .join("\n---\n");

        messages.push(ChatMessage {
            role: "system".to_string(),
            content: format!(
                "以下是来自知识库的相关笔记片段，请基于这些片段回答用户问题：\n{}",
                context_text
            ),
        });
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: prompt.to_string(),
    });

    let (stream_tx, mut stream_rx) = mpsc::unbounded_channel::<StreamChunk>();
    let event_tx_clone = event_tx.clone();

    let reader_task = tokio::spawn(async move {
        let mut text = String::new();
        while let Some(chunk) = stream_rx.recv().await {
            if !chunk.content.is_empty() {
                text.push_str(&chunk.content);
                let _ = event_tx_clone.send(StepEvent::Token {
                    token: chunk.content.clone(),
                });
            }
            if chunk.done {
                break;
            }
        }
        text
    });

    let chat_result = adapter.chat_stream(messages, model_config, stream_tx, tokio_util::sync::CancellationToken::new()).await;

    let full_text = reader_task.await.map_err(|e| {
        crate::error::AppError::Other(format!("流式读取任务失败: {}", e))
    })?;

    chat_result?;

    Ok(full_text)
}

#[allow(dead_code)]
pub fn run_fetch_note(path: &str, vault_path: &Path) -> AppResult<String> {
    let full_path = vault_path.join(path);
    if !full_path.exists() {
        return Err(crate::error::AppError::FileNotFound(full_path));
    }
    let content = std::fs::read_to_string(&full_path)?;
    Ok(content)
}

#[allow(dead_code)]
pub fn run_graph_query(
    note_path: &str,
    vault_path: &Path,
    depth: u32,
) -> AppResult<Vec<ChunkSource>> {
    let config_dir = vault_path.join(".memoa");
    let db_path = config_dir.join("twine.db");
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let conn = rusqlite::Connection::open(&db_path)?;

    let title = Path::new(note_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(note_path);

    let mut visited = std::collections::HashSet::new();
    let mut results: Vec<ChunkSource> = Vec::new();
    let mut current = vec![title.to_string()];

    for _ in 0..depth {
        let mut next: Vec<String> = Vec::new();

        for t in &current {
            if !visited.insert(t.clone()) {
                continue;
            }

            let mut stmt = conn.prepare(
                "SELECT source_title, target_title FROM links WHERE source_title = ?1 OR target_title = ?1 LIMIT 50",
            )?;

            let link_rows: Vec<(String, String)> = stmt
                .query_map([t], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                    ))
                })?
                .filter_map(|r| r.ok())
                .collect();

            for (source, target) in &link_rows {
                let neighbor = if source == t { target } else { source };
                if !visited.contains(neighbor) {
                    next.push(neighbor.clone());
                }
            }

            if !link_rows.is_empty() {
                results.push(ChunkSource {
                    note_id: t.clone(),
                    note_title: t.clone(),
                    note_path: String::new(),
                    chunk_index: 0,
                    text: format!("关联笔记: {} ({} 条链接)", t, link_rows.len()),
                    score: 0.8,
                    chunk_offset: 0,
                    chunk_length: 0,
                });
            }
        }

        current = next;
    }

    Ok(results)
}

pub fn run_vault_stats(vault_path: &Path) -> AppResult<String> {
    let mut note_count = 0u32;
    let mut total_words = 0usize;
    let mut tag_counter: HashMap<String, u32> = HashMap::new();

    for entry in walkdir::WalkDir::new(vault_path)
        .max_depth(10)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        if entry.path().extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }

        note_count += 1;

        if let Ok(content) = std::fs::read_to_string(entry.path()) {
            total_words += content.chars().count();

            for line in content.lines() {
                if let Some(tag) = line.trim().strip_prefix('#') {
                    let tag = tag.split_whitespace().next().unwrap_or("").to_string();
                    if !tag.is_empty() {
                        *tag_counter.entry(tag).or_insert(0) += 1;
                    }
                }
            }
        }
    }

    let mut top_tags: Vec<_> = tag_counter.into_iter().collect();
    top_tags.sort_by(|a, b| b.1.cmp(&a.1));
    top_tags.truncate(10);

    let tag_list = top_tags
        .iter()
        .map(|(t, c)| format!("  #{} ({})", t, c))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(format!(
        "知识库统计:\n  笔记总数: {}\n  总字符数: {}\n  热门标签:\n{}",
        note_count, total_words, tag_list
    ))
}

#[allow(dead_code)]
pub async fn run_web_search(
    query: &str,
    api_key: &str,
) -> AppResult<String> {
    let client = crate::http_client::get_client();
    let body = serde_json::json!({
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "max_results": 5
    });

    let response = client
        .post("https://api.tavily.com/search")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    let result: serde_json::Value = response.json().await?;
    let results = result["results"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|r| {
                    format!(
                        "标题: {}\nURL: {}\n内容: {}\n",
                        r["title"].as_str().unwrap_or(""),
                        r["url"].as_str().unwrap_or(""),
                        r["content"].as_str().unwrap_or("")
                    )
                })
                .collect::<Vec<_>>()
                .join("\n---\n")
        })
        .unwrap_or_default();

    Ok(results)
}

pub fn run_extract_next_query(answer: &str, original_query: &str) -> String {
    let lower = answer.to_lowercase();

    let markers = [
        "需要进一步了解",
        "还需要查询",
        "接下来要搜索",
        "还需要检索",
    ];

    for marker in &markers {
        if let Some(pos) = lower.find(marker) {
            let after = &answer[pos + marker.len()..];
            let extracted = after
                .trim()
                .trim_start_matches(':')
                .trim_start_matches('：')
                .trim();
            if extracted.len() > 5 {
                return extracted.to_string();
            }
        }
    }

    let lines: Vec<&str> = answer.lines().collect();
    if let Some(last) = lines.last() {
        let trimmed = last.trim();
        if trimmed.ends_with('?') || trimmed.ends_with('？') {
            return trimmed.to_string();
        }
    }

    if answer.len() < 100 {
        return original_query.to_string();
    }

    let words: Vec<&str> = answer.split_whitespace().collect();
    if words.len() >= 5 {
        let last_words: String = words
            .iter()
            .rev()
            .take(5)
            .cloned()
            .collect::<Vec<_>>()
            .join(" ");
        return format!("{} {}", original_query, last_words);
    }

    original_query.to_string()
}