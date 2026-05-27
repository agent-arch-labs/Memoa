use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    #[serde(default)]
    pub id: Option<Value>,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(default)]
    pub id: Option<Value>,
    #[serde(default)]
    pub result: Option<Value>,
    #[serde(default)]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(default)]
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerInfo {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolCallParams {
    pub name: String,
    #[serde(default)]
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolCallResult {
    pub content: Vec<McpContentItem>,
    #[serde(default)]
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpContentItem {
    #[serde(rename = "type")]
    pub content_type: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub resource: Option<McpResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResource {
    pub uri: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpListToolsResult {
    pub tools: Vec<McpToolInfo>,
}

pub struct RequestId {
    counter: AtomicU64,
}

impl RequestId {
    pub fn new() -> Self {
        Self {
            counter: AtomicU64::new(1),
        }
    }

    pub fn next(&self) -> u64 {
        self.counter.fetch_add(1, Ordering::SeqCst)
    }
}

impl JsonRpcRequest {
    pub fn new(method: &str, id: u64) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: Some(Value::Number(serde_json::Number::from(id))),
            method: method.to_string(),
            params: None,
        }
    }

    pub fn with_params(method: &str, id: u64, params: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: Some(Value::Number(serde_json::Number::from(id))),
            method: method.to_string(),
            params: Some(params),
        }
    }

    pub fn notification(method: &str, params: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: None,
            method: method.to_string(),
            params: Some(params),
        }
    }
}

impl JsonRpcResponse {
    pub fn success(id: Value, result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: Some(id),
            result: Some(result),
            error: None,
        }
    }

    pub fn error(id: Option<Value>, code: i32, message: &str) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code,
                message: message.to_string(),
                data: None,
            }),
        }
    }
}

pub fn parse_mcp_message(line: &str) -> AppResult<Option<JsonRpcRequest>> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let request: JsonRpcRequest = serde_json::from_str(trimmed)
        .map_err(|e| AppError::Other(format!("MCP parse error: {}", e)))?;
    Ok(Some(request))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jsonrpc_request_new() {
        let req = JsonRpcRequest::new("tools/list", 1);
        assert_eq!(req.jsonrpc, "2.0");
        assert_eq!(req.method, "tools/list");
        assert_eq!(req.id, Some(Value::Number(serde_json::Number::from(1u64))));
    }

    #[test]
    fn test_jsonrpc_request_with_params() {
        let params = serde_json::json!({"name": "search_notes", "arguments": {"query": "test"}});
        let req = JsonRpcRequest::with_params("tools/call", 2, params.clone());
        assert_eq!(req.method, "tools/call");
        assert_eq!(req.params, Some(params));
    }

    #[test]
    fn test_jsonrpc_notification() {
        let params = serde_json::json!({"level": "info"});
        let req = JsonRpcRequest::notification("notifications/log", params);
        assert!(req.id.is_none());
        assert_eq!(req.method, "notifications/log");
    }

    #[test]
    fn test_jsonrpc_response_success() {
        let result = serde_json::json!({"tools": []});
        let resp = JsonRpcResponse::success(Value::Number(serde_json::Number::from(1)), result);
        assert!(resp.result.is_some());
        assert!(resp.error.is_none());
    }

    #[test]
    fn test_jsonrpc_response_error() {
        let resp = JsonRpcResponse::error(
            Some(Value::Number(serde_json::Number::from(1))),
            -32600,
            "Invalid request",
        );
        assert!(resp.result.is_none());
        assert!(resp.error.is_some());
        assert_eq!(resp.error.as_ref().unwrap().code, -32600);
    }

    #[test]
    fn test_jsonrpc_request_serialization() {
        let req = JsonRpcRequest::new("initialize", 1);
        let json = serde_json::to_string(&req).unwrap();
        let parsed: JsonRpcRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.method, "initialize");
    }

    #[test]
    fn test_mcp_tool_call_result() {
        let result = McpToolCallResult {
            content: vec![McpContentItem {
                content_type: "text".to_string(),
                text: Some("hello".to_string()),
                resource: None,
            }],
            is_error: false,
        };
        let json = serde_json::to_string(&result).unwrap();
        let parsed: McpToolCallResult = serde_json::from_str(&json).unwrap();
        assert!(!parsed.is_error);
        assert_eq!(parsed.content[0].text.as_deref(), Some("hello"));
    }

    #[test]
    fn test_request_id_sequence() {
        let id_gen = RequestId::new();
        assert_eq!(id_gen.next(), 1);
        assert_eq!(id_gen.next(), 2);
        assert_eq!(id_gen.next(), 3);
    }
}