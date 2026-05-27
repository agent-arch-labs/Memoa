use crate::ai_runtime::mcp_bridge::transport::AgentProcess;
use crate::ai_runtime::mcp_bridge::types::{JsonRpcRequest, JsonRpcResponse, RequestId};
use crate::error::{AppError, AppResult};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AgentClient {
    process: Arc<Mutex<Option<AgentProcess>>>,
    id_gen: RequestId,
    server_info: Arc<Mutex<Option<Value>>>,
}

impl AgentClient {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            id_gen: RequestId::new(),
            server_info: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn is_running(&self) -> bool {
        self.process.lock().await.is_some()
    }

    pub async fn start(&self, command: &str, args: &[&str]) -> AppResult<()> {
        let mut proc_guard = self.process.lock().await;
        if proc_guard.is_some() {
            return Err(AppError::Other("Agent is already running".to_string()));
        }

        let mut proc = AgentProcess::spawn(command, args).await?;

        let init_req = JsonRpcRequest::with_params(
            "initialize",
            self.id_gen.next(),
            serde_json::json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "Memoa",
                    "version": "0.1.0"
                }
            }),
        );

        proc.send(&init_req).await?;
        let response: JsonRpcResponse = serde_json::from_value(proc.recv().await?).map_err(|e| {
            AppError::Other(format!("MCP init response parse error: {}", e))
        })?;

        if response.error.is_some() {
            return Err(AppError::Other(format!(
                "MCP init failed: {}",
                response.error.unwrap().message
            )));
        }

        let mut info_guard = self.server_info.lock().await;
        *info_guard = response.result;

        let notified = JsonRpcRequest::notification(
            "notifications/initialized",
            serde_json::json!({}),
        );
        proc.send(&notified).await?;

        *proc_guard = Some(proc);
        Ok(())
    }

    pub async fn stop(&self) -> AppResult<()> {
        let mut proc_guard = self.process.lock().await;
        if let Some(mut proc) = proc_guard.take() {
            proc.kill().await?;
        }
        let mut info_guard = self.server_info.lock().await;
        *info_guard = None;
        Ok(())
    }

    pub async fn list_tools(&self) -> AppResult<Value> {
        let req =
            JsonRpcRequest::new("tools/list", self.id_gen.next());

        let response = self.send_recv(&req).await?;
        let resp: JsonRpcResponse =
            serde_json::from_value(response).map_err(|e| AppError::Other(e.to_string()))?;

        if let Some(err) = resp.error {
            return Err(AppError::Other(format!("MCP list_tools error: {}", err.message)));
        }

        Ok(resp.result.unwrap_or_default())
    }

    pub async fn call_tool(&self, name: &str, arguments: Value) -> AppResult<Value> {
        let req = JsonRpcRequest::with_params(
            "tools/call",
            self.id_gen.next(),
            serde_json::json!({
                "name": name,
                "arguments": arguments
            }),
        );

        let response = self.send_recv(&req).await?;
        let resp: JsonRpcResponse =
            serde_json::from_value(response).map_err(|e| AppError::Other(e.to_string()))?;

        if let Some(err) = resp.error {
            return Err(AppError::Other(format!(
                "MCP tool '{}' error: {}",
                name, err.message
            )));
        }

        Ok(resp.result.unwrap_or_default())
    }

    pub async fn deep_research(
        &self,
        query: &str,
        max_steps: Option<u32>,
    ) -> AppResult<Value> {
        let mut args = serde_json::json!({
            "query": query,
        });
        if let Some(steps) = max_steps {
            args["max_steps"] = serde_json::Value::Number(serde_json::Number::from(steps));
        }
        self.call_tool("deep_research", args).await
    }

    async fn send_recv(&self, request: &JsonRpcRequest) -> AppResult<Value> {
        let mut proc_guard = self.process.lock().await;
        let proc = proc_guard
            .as_mut()
            .ok_or_else(|| AppError::Other("Agent is not running".to_string()))?;

        proc.send(request).await?;

        let value = proc.recv().await?;
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_new() {
        let client = AgentClient::new();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let running = rt.block_on(client.is_running());
        assert!(!running);
    }
}