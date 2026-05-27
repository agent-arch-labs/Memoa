use crate::ai_runtime::mcp_bridge::types::{
    JsonRpcError, JsonRpcRequest, JsonRpcResponse, McpContentItem, McpToolCallParams,
    McpToolCallResult, McpToolInfo,
};
use crate::ai_runtime::tool_registry::registry::ToolRegistry;
use serde_json::Value;
use std::sync::Arc;

pub struct AgentServer {
    registry: Arc<ToolRegistry>,
}

impl AgentServer {
    pub fn new(registry: Arc<ToolRegistry>) -> Self {
        Self { registry }
    }

    pub async fn handle_message(
        &self,
        message: &str,
    ) -> Result<String, String> {
        let request: JsonRpcRequest = serde_json::from_str(message)
            .map_err(|e| format!("Invalid JSON-RPC request: {}", e))?;

        let response = self.process_request(&request).await;
        serde_json::to_string(&response)
            .map_err(|e| format!("Failed to serialize response: {}", e))
    }

    pub fn handle_sync(&self, message: &str) -> Result<String, String> {
        let request: JsonRpcRequest = serde_json::from_str(message)
            .map_err(|e| format!("Invalid JSON-RPC request: {}", e))?;

        if request.id.is_none() {
            return Ok(String::new());
        }

        let response = match request.method.as_str() {
            "initialize" => self.handle_initialize_sync(&request),
            "tools/list" => self.handle_list_tools_sync(&request),
            "tools/call" => self.handle_tool_call_sync(&request),
            _ => JsonRpcResponse::error(
                request.id,
                -32601,
                &format!("Method not found: {}", request.method),
            ),
        };

        serde_json::to_string(&response)
            .map_err(|e| format!("Failed to serialize response: {}", e))
    }

    async fn process_request(&self, request: &JsonRpcRequest) -> JsonRpcResponse {
        if request.id.is_none() {
            return JsonRpcResponse::error(None, -32600, "Notification not supported");
        }

        match request.method.as_str() {
            "initialize" => self.handle_initialize(request),
            "tools/list" => self.handle_list_tools(request),
            "tools/call" => self.handle_tool_call(request).await,
            _ => JsonRpcResponse::error(
                request.id.clone(),
                -32601,
                &format!("Method not found: {}", request.method),
            ),
        }
    }

    fn handle_initialize(&self, request: &JsonRpcRequest) -> JsonRpcResponse {
        JsonRpcResponse::success(
            request.id.clone().unwrap_or_default(),
            serde_json::json!({
                "protocolVersion": "2024-11-05",
                "serverInfo": {
                    "name": "Memoa",
                    "version": "0.1.0"
                },
                "capabilities": {
                    "tools": {}
                }
            }),
        )
    }

    fn handle_list_tools(&self, request: &JsonRpcRequest) -> JsonRpcResponse {
        let tools: Vec<McpToolInfo> = self
            .registry
            .list_tools_sync()
            .into_iter()
            .map(|t| McpToolInfo {
                name: t.name,
                description: t.description,
                input_schema: t.input_schema,
            })
            .collect();

        JsonRpcResponse::success(
            request.id.clone().unwrap_or_default(),
            serde_json::json!({ "tools": tools }),
        )
    }

    async fn handle_tool_call(&self, request: &JsonRpcRequest) -> JsonRpcResponse {
        let params: McpToolCallParams = match request.params.as_ref() {
            Some(p) => match serde_json::from_value(p.clone()) {
                Ok(params) => params,
                Err(e) => {
                    return JsonRpcResponse::error(
                        request.id.clone(),
                        -32602,
                        &format!("Invalid params: {}", e),
                    )
                }
            },
            None => {
                return JsonRpcResponse::error(
                    request.id.clone(),
                    -32602,
                    "Missing params",
                )
            }
        };

        match self.registry.execute(&params.name, params.arguments).await {
            Ok(result) => JsonRpcResponse::success(
                request.id.clone().unwrap_or_default(),
                serde_json::to_value(result).unwrap_or_default(),
            ),
            Err(e) => JsonRpcResponse::error(
                request.id.clone(),
                -32000,
                &format!("Tool execution error: {}", e),
            ),
        }
    }

    fn handle_initialize_sync(&self, request: &JsonRpcRequest) -> JsonRpcResponse {
        self.handle_initialize(request)
    }

    fn handle_list_tools_sync(&self, request: &JsonRpcRequest) -> JsonRpcResponse {
        self.handle_list_tools(request)
    }

    fn handle_tool_call_sync(&self, request: &JsonRpcRequest) -> JsonRpcResponse {
        let params: McpToolCallParams = match request.params.as_ref() {
            Some(p) => match serde_json::from_value(p.clone()) {
                Ok(params) => params,
                Err(e) => {
                    return JsonRpcResponse::error(
                        request.id.clone(),
                        -32602,
                        &format!("Invalid params: {}", e),
                    )
                }
            },
            None => {
                return JsonRpcResponse::error(
                    request.id.clone(),
                    -32602,
                    "Missing params",
                )
            }
        };

        match self.registry.execute_sync(&params.name, params.arguments) {
            Ok(result) => JsonRpcResponse::success(
                request.id.clone().unwrap_or_default(),
                serde_json::to_value(result).unwrap_or_default(),
            ),
            Err(e) => JsonRpcResponse::error(
                request.id.clone(),
                -32000,
                &format!("Tool execution error: {}", e),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_runtime::tool_registry::registry::ToolRegistry;
    use crate::ai_runtime::tool_registry::trait_def::McpTool;
    use async_trait::async_trait;
    use serde_json::Value;
    use std::sync::Arc;

    struct EchoTool;

    #[async_trait]
    impl McpTool for EchoTool {
        fn name(&self) -> &'static str {
            "echo"
        }
        fn description(&self) -> &'static str {
            "Echoes back the input"
        }
        fn input_schema(&self) -> Value {
            serde_json::json!({
                "type": "object",
                "properties": {
                    "message": { "type": "string" }
                }
            })
        }
        fn execute_sync(&self, params: Value) -> Result<McpToolCallResult, String> {
            let msg = params["message"].as_str().unwrap_or("");
            Ok(McpToolCallResult {
                content: vec![McpContentItem {
                    content_type: "text".to_string(),
                    text: Some(msg.to_string()),
                    resource: None,
                }],
                is_error: false,
            })
        }
    }

    #[test]
    fn test_server_initialize() {
        let registry = Arc::new(ToolRegistry::new());
        let server = AgentServer::new(registry);

        let msg = r#"{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}"#;
        let resp = server.handle_sync(msg).unwrap();
        let parsed: JsonRpcResponse = serde_json::from_str(&resp).unwrap();
        assert!(parsed.result.is_some());
        assert!(parsed.error.is_none());
    }

    #[test]
    fn test_server_list_tools() {
        let registry = Arc::new(ToolRegistry::new());
        registry.register_sync(Box::new(EchoTool));
        let server = AgentServer::new(registry);

        let msg = r#"{"jsonrpc":"2.0","method":"tools/list","id":1}"#;
        let resp = server.handle_sync(msg).unwrap();
        let parsed: JsonRpcResponse = serde_json::from_str(&resp).unwrap();
        let result = parsed.result.unwrap();
        let tools = result["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], "echo");
    }

    #[test]
    fn test_server_tool_call() {
        let registry = Arc::new(ToolRegistry::new());
        registry.register_sync(Box::new(EchoTool));
        let server = AgentServer::new(registry);

        let msg = r#"{"jsonrpc":"2.0","method":"tools/call","params":{"name":"echo","arguments":{"message":"hello"}},"id":1}"#;
        let resp = server.handle_sync(msg).unwrap();
        let parsed: JsonRpcResponse = serde_json::from_str(&resp).unwrap();
        assert!(parsed.error.is_none());
        let result = parsed.result.unwrap();
        let content = result["content"].as_array().unwrap();
        assert_eq!(content[0]["text"], "hello");
    }

    #[test]
    fn test_server_unknown_method() {
        let registry = Arc::new(ToolRegistry::new());
        let server = AgentServer::new(registry);

        let msg = r#"{"jsonrpc":"2.0","method":"unknown","id":1}"#;
        let resp = server.handle_sync(msg).unwrap();
        let parsed: JsonRpcResponse = serde_json::from_str(&resp).unwrap();
        assert!(parsed.error.is_some());
        assert_eq!(parsed.error.unwrap().code, -32601);
    }
}