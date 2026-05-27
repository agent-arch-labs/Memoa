// 搜索命令 - 标题搜索 + 全文 Grep + 反向链接
//
// search_notes 搜索策略 (两级降级):
//   1. 优先 SQLite 标题 LIKE 查询 (精确匹配 title)
//   2. 不足 10 条时启用全文 grep 遍历 .md 文件内容
//   3. 合并去重返回
//
// get_backlinks:
//   查询 links 表中指向目标笔记的所有反向链接
//   返回链接来源笔记 + 上下文片段 + 行号

use crate::{
    config::AppConfig,
    db,
    error::{AppError, AppResult},
};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub path: String,
    pub snippet: String,
    pub score: f64,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct Backlink {
    pub id: String,
    pub source_title: String,
    pub source_path: String,
    pub context: String,
    pub line: u32,
}

#[derive(Debug, Serialize)]
pub struct GraphNodeResult {
    pub id: String,
    pub title: String,
    pub path: String,
    pub link_count: u32,
    pub incoming_count: u32,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct GraphEdgeResult {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Serialize)]
pub struct GraphDataResult {
    pub nodes: Vec<GraphNodeResult>,
    pub edges: Vec<GraphEdgeResult>,
}

#[tauri::command]
pub fn search_notes(
    query: String,
    config: State<AppConfig>,
) -> AppResult<Vec<SearchResult>> {
    let vault_path = {
        let guard = config.vault_path.lock().unwrap();
        guard
            .clone()
            .ok_or(AppError::VaultNotOpen)?
    };

    if query.is_empty() {
        return Ok(Vec::new());
    }

    let sqlite_results = db::note::search_by_title(&query).unwrap_or_default();
    let sqlite_results: Vec<_> = sqlite_results
        .into_iter()
        .filter(|(_, _, path, _)| vault_path.join(path).exists())
        .collect();

    if sqlite_results.len() >= 10 {
        return Ok(sqlite_results
            .into_iter()
            .map(|(id, title, path, updated_at)| SearchResult {
                id,
                title,
                path,
                snippet: String::new(),
                score: 1.0,
                updated_at,
            })
            .collect());
    }

    let remaining = 10 - sqlite_results.len();
    let mut results: Vec<SearchResult> = sqlite_results
        .into_iter()
        .map(|(id, title, path, updated_at)| SearchResult {
            id,
            title,
            path,
            snippet: String::new(),
            score: 1.0,
            updated_at,
        })
        .collect();

    let mut seen_paths: std::collections::HashSet<String> = results
        .iter()
        .map(|r| r.path.clone())
        .collect();

    let mut grep_results = grep_vault(&vault_path, &query, remaining)?;
    grep_results.retain(|r| seen_paths.insert(r.path.clone()));
    results.extend(grep_results);

    Ok(results)
}

#[tauri::command]
pub fn get_backlinks(target_title: String, _config: State<AppConfig>) -> AppResult<Vec<Backlink>> {
    let entries = db::link::find_backlinks(&target_title).unwrap_or_default();
    Ok(entries
        .into_iter()
        .map(|e| Backlink {
            id: e.id,
            source_title: e.source_title,
            source_path: e.source_path,
            context: e.context,
            line: e.line,
        })
        .collect())
}

#[tauri::command]
pub fn get_graph_data(_config: State<AppConfig>) -> AppResult<GraphDataResult> {
    let _ = db::link::cleanup_orphan_links();
    let data = db::link::get_graph_data()?;
    Ok(GraphDataResult {
        nodes: data
            .nodes
            .into_iter()
            .map(|n| GraphNodeResult {
                id: n.id,
                title: n.title,
                path: n.path,
                link_count: n.link_count,
                incoming_count: n.incoming_count,
                tags: n.tags,
            })
            .collect(),
        edges: data
            .edges
            .into_iter()
            .map(|e| GraphEdgeResult {
                source: e.source,
                target: e.target,
            })
            .collect(),
    })
}

#[tauri::command]
pub fn get_local_graph(note_id: String, depth: u32, _config: State<AppConfig>) -> AppResult<GraphDataResult> {
    let _ = db::link::cleanup_orphan_links();
    let data = db::link::get_local_graph(&note_id, depth)?;
    Ok(GraphDataResult {
        nodes: data
            .nodes
            .into_iter()
            .map(|n| GraphNodeResult {
                id: n.id,
                title: n.title,
                path: n.path,
                link_count: n.link_count,
                incoming_count: n.incoming_count,
                tags: n.tags,
            })
            .collect(),
        edges: data
            .edges
            .into_iter()
            .map(|e| GraphEdgeResult {
                source: e.source,
                target: e.target,
            })
            .collect(),
    })
}

fn grep_vault(
    vault_path: &std::path::Path,
    query: &str,
    limit: usize,
) -> AppResult<Vec<SearchResult>> {
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    for entry in walkdir::WalkDir::new(vault_path)
        .max_depth(10)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if results.len() >= limit {
            break;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "md" {
            continue;
        }

        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if content.to_lowercase().contains(&query_lower) {
            let title = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string();

            let rel_path = path
                .strip_prefix(vault_path)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();

            let snippet = extract_snippet(&content, &query_lower, 80);

            results.push(SearchResult {
                id: String::new(),
                title,
                path: rel_path,
                snippet,
                score: 0.6,
                updated_at: String::new(),
            });
        }
    }

    Ok(results)
}

fn extract_snippet(content: &str, query: &str, context_chars: usize) -> String {
    let lower = content.to_lowercase();
    let pos = match lower.find(query) {
        Some(p) => p,
        None => {
            return content
                .chars()
                .take(context_chars * 2)
                .collect::<String>()
                + if content.chars().count() > context_chars * 2 {
                    "..."
                } else {
                    ""
                };
        }
    };

    let char_count = content.chars().count();
    let start = if pos > context_chars { pos - context_chars } else { 0 };
    let end = (pos + query.len() + context_chars).min(char_count);

    let mut snippet = content.chars().skip(start).take(end - start).collect::<String>();

    if start > 0 {
        snippet.insert_str(0, "...");
    }
    if end < char_count {
        snippet.push_str("...");
    }

    snippet
}