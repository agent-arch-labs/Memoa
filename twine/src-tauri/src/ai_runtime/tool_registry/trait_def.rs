use crate::ai_runtime::mcp_bridge::types::McpToolCallResult;
use crate::error::AppResult;
use async_trait::async_trait;
use serde_json::Value;

#[async_trait]
pub trait McpTool: Send + Sync {
    fn name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    fn input_schema(&self) -> Value;

    async fn execute(&self, params: Value) -> AppResult<McpToolCallResult> {
        self.execute_sync(params)
            .map_err(|e| crate::error::AppError::Other(e))
    }

    fn execute_sync(&self, params: Value) -> Result<McpToolCallResult, String> {
        Err("Async execution required".to_string())
    }

    fn is_async(&self) -> bool {
        false
    }
}