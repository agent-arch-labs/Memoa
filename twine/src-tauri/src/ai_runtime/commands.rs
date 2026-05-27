use crate::ai_runtime::mcp_bridge::client::AgentClient;
use crate::config::AppConfig;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

lazy_static::lazy_static! {
    static ref AGENT_CLIENT: Arc<Mutex<Option<AgentClient>>> = Arc::new(Mutex::new(None));
}

#[derive(Debug, Serialize)]
pub struct AgentStatus {
    pub running: bool,
    pub tools: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct AgentToolInfo {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[tauri::command]
pub async fn agent_start(
    command: String,
    args: Vec<String>,
) -> AppResult<AgentStatus> {
    let mut guard = AGENT_CLIENT.lock().await;

    if guard.is_some() {
        return Err(AppError::Other("Agent is already running".to_string()));
    }

    let client = AgentClient::new();
    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    client.start(&command, &args_refs).await?;

    let tools = client.list_tools().await?;
    let tool_names: Vec<String> = tools["tools"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    *guard = Some(client);

    Ok(AgentStatus {
        running: true,
        tools: tool_names,
    })
}

#[tauri::command]
pub async fn agent_stop() -> AppResult<AgentStatus> {
    let mut guard = AGENT_CLIENT.lock().await;

    if let Some(client) = guard.as_ref() {
        client.stop().await?;
    }

    *guard = None;

    Ok(AgentStatus {
        running: false,
        tools: vec![],
    })
}

#[tauri::command]
pub async fn agent_status() -> AppResult<AgentStatus> {
    let guard = AGENT_CLIENT.lock().await;

    match guard.as_ref() {
        Some(client) => {
            let is_running = client.is_running().await;
            let tools = if is_running {
                match client.list_tools().await {
                    Ok(t) => t["tools"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|t| t["name"].as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default(),
                    Err(_) => vec![],
                }
            } else {
                vec![]
            };

            Ok(AgentStatus {
                running: is_running,
                tools,
            })
        }
        None => Ok(AgentStatus {
            running: false,
            tools: vec![],
        }),
    }
}

#[tauri::command]
pub async fn agent_list_tools() -> AppResult<Vec<AgentToolInfo>> {
    let guard = AGENT_CLIENT.lock().await;

    let client = guard
        .as_ref()
        .ok_or_else(|| AppError::Other("Agent is not running".to_string()))?;

    let tools = client.list_tools().await?;

    let tool_list: Vec<AgentToolInfo> = tools["tools"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|t| AgentToolInfo {
                    name: t["name"].as_str().unwrap_or("").to_string(),
                    description: t["description"].as_str().unwrap_or("").to_string(),
                    input_schema: t["inputSchema"].clone(),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(tool_list)
}

#[tauri::command]
pub async fn agent_call_tool(name: String, arguments: Value) -> AppResult<Value> {
    let guard = AGENT_CLIENT.lock().await;

    let client = guard
        .as_ref()
        .ok_or_else(|| AppError::Other("Agent is not running".to_string()))?;

    client.call_tool(&name, arguments).await
}

#[tauri::command]
pub async fn agent_deep_research(query: String) -> AppResult<Value> {
    let guard = AGENT_CLIENT.lock().await;

    let client = guard
        .as_ref()
        .ok_or_else(|| AppError::Other("Agent is not running".to_string()))?;

    client.deep_research(&query, Some(3)).await
}

#[tauri::command]
pub async fn agent_run_workflow(
    workflow_json: String,
    context: Value,
) -> AppResult<Value> {
    let wf: crate::ai_runtime::workflow::WorkflowDef =
        serde_json::from_str(&workflow_json)
            .map_err(|e| AppError::Other(format!("Invalid workflow JSON: {}", e)))?;

    crate::ai_runtime::workflow::dag::validate_dag(&wf.nodes, &wf.edges)
        .map_err(|e| AppError::Other(format!("Invalid workflow: {}", e)))?;

    let mut executor = crate::ai_runtime::workflow::WorkflowExecutor::new(wf);
    executor.set_context(context);

    let result = executor.execute_all();
    let json = serde_json::to_value(&result)
        .map_err(|e| AppError::Other(format!("Result serialization error: {}", e)))?;

    Ok(json)
}

pub fn get_agent_client() -> Arc<Mutex<Option<AgentClient>>> {
    AGENT_CLIENT.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_agent_status_not_running() {
        let status = agent_status().await.unwrap();
        assert!(!status.running);
        assert!(status.tools.is_empty());
    }

    #[test]
    fn test_agent_run_workflow_valid() {
        let rt = tokio::runtime::Runtime::new().unwrap();

        let wf_json = serde_json::json!({
            "name": "test",
            "nodes": [
                {"id": "search", "type": "retrieve", "config": {"top_k": 5}},
                {"id": "gen", "type": "generate", "config": {"max_tokens": 512}}
            ],
            "edges": [
                {"source": "search", "target": "gen"}
            ],
            "config": {"timeout_secs": 30, "max_retries": 0}
        });

        let result = rt.block_on(agent_run_workflow(
            wf_json.to_string(),
            serde_json::json!({"query": "test"}),
        ));

        assert!(result.is_ok());
        let val = result.unwrap();
        assert_eq!(val["status"], "completed");
    }

    #[test]
    fn test_agent_run_workflow_invalid_json() {
        let rt = tokio::runtime::Runtime::new().unwrap();

        let result = rt.block_on(agent_run_workflow(
            "not json".to_string(),
            serde_json::json!({}),
        ));

        assert!(result.is_err());
    }
}