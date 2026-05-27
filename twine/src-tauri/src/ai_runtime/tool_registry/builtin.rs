use crate::ai_runtime::mcp_bridge::types::{McpContentItem, McpResource, McpToolCallResult};
use crate::ai_runtime::tool_registry::trait_def::McpTool;
use crate::db;
use async_trait::async_trait;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;

pub struct SearchNotesTool {
    pub vault_path: Arc<std::sync::Mutex<Option<PathBuf>>>,
}

#[async_trait]
impl McpTool for SearchNotesTool {
    fn name(&self) -> &'static str {
        "search_notes"
    }

    fn description(&self) -> &'static str {
        "在 Memoa 知识库中搜索笔记。支持关键词搜索和语义搜索。"
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词"
                },
                "top_k": {
                    "type": "integer",
                    "default": 10,
                    "description": "返回结果数量"
                }
            },
            "required": ["query"]
        })
    }

    fn execute_sync(&self, params: Value) -> Result<McpToolCallResult, String> {
        let query = params["query"].as_str().unwrap_or("");
        let top_k = params.get("top_k").and_then(|v| v.as_u64()).unwrap_or(10) as usize;

        match db::note::search_by_title(query) {
            Ok(notes) => {
                let notes: Vec<_> = notes.into_iter().take(top_k).collect();
                let content: Vec<McpContentItem> = notes
                    .into_iter()
                    .map(|(id, title, path, _updated)| McpContentItem {
                        content_type: "text".to_string(),
                        text: Some(format!(
                            "标题: {}\n路径: {}\nID: {}\n---",
                            title, path, id
                        )),
                        resource: Some(McpResource {
                            uri: format!("memoa://note/{}", id),
                            title: Some(title),
                            mime_type: Some("text/markdown".to_string()),
                        }),
                    })
                    .collect();

                Ok(McpToolCallResult {
                    content,
                    is_error: false,
                })
            }
            Err(e) => Ok(McpToolCallResult {
                content: vec![McpContentItem {
                    content_type: "text".to_string(),
                    text: Some(format!("搜索出错: {}", e)),
                    resource: None,
                }],
                is_error: true,
            }),
        }
    }
}

pub struct GetNoteTool {
    pub vault_path: Arc<std::sync::Mutex<Option<PathBuf>>>,
}

#[async_trait]
impl McpTool for GetNoteTool {
    fn name(&self) -> &'static str {
        "get_note"
    }

    fn description(&self) -> &'static str {
        "根据笔记路径获取完整内容"
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "笔记路径（相对于知识库根目录）"
                }
            },
            "required": ["path"]
        })
    }

    fn execute_sync(&self, params: Value) -> Result<McpToolCallResult, String> {
        let path = params["path"].as_str().unwrap_or("");

        let vault_guard = self.vault_path.lock().map_err(|e| e.to_string())?;
        let vault_path = match vault_guard.as_ref() {
            Some(p) => p.clone(),
            None => {
                return Ok(McpToolCallResult {
                    content: vec![McpContentItem {
                        content_type: "text".to_string(),
                        text: Some("知识库未打开".to_string()),
                        resource: None,
                    }],
                    is_error: true,
                })
            }
        };
        drop(vault_guard);

        let full_path = vault_path.join(path.trim_start_matches('/'));
        match std::fs::read_to_string(&full_path) {
            Ok(content) => {
                let title = std::path::Path::new(path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");

                Ok(McpToolCallResult {
                    content: vec![McpContentItem {
                        content_type: "text".to_string(),
                        text: Some(format!("# {}\n\n{}", title, content)),
                        resource: Some(McpResource {
                            uri: format!("memoa://note/{}", path),
                            title: Some(title.to_string()),
                            mime_type: Some("text/markdown".to_string()),
                        }),
                    }],
                    is_error: false,
                })
            }
            Err(e) => Ok(McpToolCallResult {
                content: vec![McpContentItem {
                    content_type: "text".to_string(),
                    text: Some(format!("读取笔记出错: {}", e)),
                    resource: None,
                }],
                is_error: true,
            }),
        }
    }
}

pub struct ListRecentNotesTool;

#[async_trait]
impl McpTool for ListRecentNotesTool {
    fn name(&self) -> &'static str {
        "list_recent_notes"
    }

    fn description(&self) -> &'static str {
        "列出最近更新的笔记"
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "description": "返回数量"
                }
            }
        })
    }

    fn execute_sync(&self, params: Value) -> Result<McpToolCallResult, String> {
        let limit = params
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(20) as u32;

        match db::note::list_recent(limit) {
            Ok(notes) => {
                let content: Vec<McpContentItem> = notes
                    .into_iter()
                    .map(|(id, title, path, _updated)| McpContentItem {
                        content_type: "text".to_string(),
                        text: Some(format!("- {} ({})", title, path)),
                        resource: Some(McpResource {
                            uri: format!("memoa://note/{}", id),
                            title: Some(title),
                            mime_type: Some("text/markdown".to_string()),
                        }),
                    })
                    .collect();

                Ok(McpToolCallResult {
                    content,
                    is_error: false,
                })
            }
            Err(e) => Ok(McpToolCallResult {
                content: vec![McpContentItem {
                    content_type: "text".to_string(),
                    text: Some(format!("列出笔记出错: {}", e)),
                    resource: None,
                }],
                is_error: true,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_notes_tool_schema() {
        let tool = SearchNotesTool {
            vault_path: Arc::new(std::sync::Mutex::new(None)),
        };
        assert_eq!(tool.name(), "search_notes");
        let schema = tool.input_schema();
        assert!(schema["required"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("query")));
    }

    #[test]
    fn test_get_note_tool_schema() {
        let tool = GetNoteTool {
            vault_path: Arc::new(std::sync::Mutex::new(None)),
        };
        assert_eq!(tool.name(), "get_note");
        let schema = tool.input_schema();
        assert!(schema["required"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("path")));
    }

    #[test]
    fn test_list_recent_notes_tool_schema() {
        let tool = ListRecentNotesTool;
        assert_eq!(tool.name(), "list_recent_notes");
    }
}