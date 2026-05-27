use crate::ai_runtime::mcp_bridge::types::{McpContentItem, McpToolCallResult};
use crate::error::{AppError, AppResult};
use crate::ai_runtime::tool_registry::trait_def::McpTool;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

pub struct ToolRegistry {
    tools: RwLock<HashMap<String, Arc<dyn McpTool>>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: RwLock::new(HashMap::new()),
        }
    }

    pub fn register(&self, tool: Box<dyn McpTool>) {
        let mut tools = self.tools.write().unwrap();
        tools.insert(tool.name().to_string(), Arc::from(tool));
    }

    pub fn register_sync(&self, tool: Box<dyn McpTool>) {
        self.register(tool)
    }

    pub fn get_tool_names_sync(&self) -> Vec<String> {
        let tools = self.tools.read().unwrap();
        tools.keys().cloned().collect()
    }

    pub fn list_tools_sync(&self) -> Vec<ToolInfo> {
        let tools = self.tools.read().unwrap();
        tools
            .values()
            .map(|t| ToolInfo {
                name: t.name().to_string(),
                description: t.description().to_string(),
                input_schema: t.input_schema(),
            })
            .collect()
    }

    pub async fn execute(&self, name: &str, params: Value) -> AppResult<McpToolCallResult> {
        let tool = {
            let tools = self.tools.read().unwrap();
            tools
                .get(name)
                .cloned()
                .ok_or_else(|| AppError::Other(format!("Tool not found: {name}")))?
        };

        if tool.is_async() {
            tool.execute(params).await
        } else {
            tool.execute_sync(params)
                .map_err(|e| AppError::Other(e))
        }
    }

    pub fn execute_sync(&self, name: &str, params: Value) -> AppResult<McpToolCallResult> {
        let tool = {
            let tools = self.tools.read().unwrap();
            tools
                .get(name)
                .cloned()
                .ok_or_else(|| AppError::Other(format!("Tool not found: {name}")))?
        };

        if tool.is_async() {
            Err(AppError::Other(format!(
                "Tool '{name}' requires async execution"
            )))
        } else {
            tool.execute_sync(params)
                .map_err(|e| AppError::Other(e))
        }
    }
}

pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_runtime::mcp_bridge::types::McpContentItem;
    use async_trait::async_trait;

    struct MockTool {
        name: &'static str,
        desc: &'static str,
        schema: Value,
    }

    #[async_trait]
    impl McpTool for MockTool {
        fn name(&self) -> &'static str {
            self.name
        }
        fn description(&self) -> &'static str {
            self.desc
        }
        fn input_schema(&self) -> Value {
            self.schema.clone()
        }
        fn execute_sync(&self, params: Value) -> Result<McpToolCallResult, String> {
            Ok(McpToolCallResult {
                content: vec![McpContentItem {
                    content_type: "text".to_string(),
                    text: Some(format!("executed {}", self.name)),
                    resource: None,
                }],
                is_error: false,
            })
        }
        fn is_async(&self) -> bool {
            false
        }
    }

    #[test]
    fn test_registry_register_and_list() {
        let registry = ToolRegistry::new();
        registry.register(Box::new(MockTool {
            name: "test_tool",
            desc: "A test tool",
            schema: serde_json::json!({"type": "object"}),
        }));

        let tools = registry.list_tools_sync();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "test_tool");
    }

    #[test]
    fn test_registry_execute_sync() {
        let registry = ToolRegistry::new();
        registry.register(Box::new(MockTool {
            name: "test_tool",
            desc: "A test tool",
            schema: serde_json::json!({"type": "object"}),
        }));

        let result = registry
            .execute_sync("test_tool", serde_json::json!({}))
            .unwrap();
        assert_eq!(result.content[0].text.as_deref(), Some("executed test_tool"));
    }

    #[test]
    fn test_registry_tool_not_found() {
        let registry = ToolRegistry::new();
        let result = registry.execute_sync("nonexistent", serde_json::json!({}));
        assert!(result.is_err());
    }
}