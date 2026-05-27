use crate::agent_rag::{
    pipeline,
    strategies,
    types::{StepEvent, Strategy},
};
use crate::adapters::base::ModelConfig;
use crate::config::AppConfig;
use crate::error::{AppError, AppResult};
use serde::Serialize;
use serde_json::Value;
use tauri::{Emitter, State};
use tokio::sync::mpsc;

#[derive(Debug, Serialize)]
pub struct StrategyListItem {
    pub id: String,
    pub name: String,
    pub description: String,
}

#[tauri::command]
pub async fn agent_rag_list_strategies() -> AppResult<Vec<StrategyListItem>> {
    Ok(strategies::list_strategies()
        .into_iter()
        .map(|s| StrategyListItem {
            id: s.id.as_str().to_string(),
            name: s.name,
            description: s.description,
        })
        .collect())
}

#[tauri::command]
pub async fn agent_rag_run(
    query: String,
    strategy_id: String,
    model_config: ModelConfig,
    embed_config: Option<ModelConfig>,
    request_id: String,
    app_handle: tauri::AppHandle,
    config: State<'_, AppConfig>,
) -> AppResult<()> {
    let vault_path = {
        let guard = config.vault_path.lock().unwrap();
        guard
            .clone()
            .ok_or(AppError::VaultNotOpen)?
    };

    let strategy = Strategy::from_str(&strategy_id)
        .unwrap_or(Strategy::Auto);

    let (tx, mut rx) = mpsc::unbounded_channel::<StepEvent>();

    let vault_path_clone = vault_path.clone();
    let embed_config_owned = embed_config.clone();
    let model_config_owned = model_config.clone();
    let query_clone = query.clone();
    let strategy_clone = strategy.clone();
    let tx_clone = tx.clone();

    let pipeline_task = tokio::spawn(async move {
        let result = pipeline::execute_strategy(
            &strategy_clone,
            &query_clone,
            &vault_path_clone,
            embed_config_owned.as_ref(),
            &model_config_owned,
            Some(&vault_path_clone),
            &tx_clone,
        )
        .await;

        if let Err(e) = result {
            let _ = tx_clone.send(StepEvent::Error {
                message: e.to_string(),
            });
        }
    });

    let event_name = format!("agent-rag-{}", request_id);
    let handle = app_handle.clone();
    let forward_task = tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            let _ = handle.emit(&event_name, &event);
        }
    });

    let _ = pipeline_task.await;
    drop(tx);
    let _ = forward_task.await;

    Ok(())
}

#[tauri::command]
pub async fn agent_rag_memory_load(
    config: State<'_, AppConfig>,
) -> AppResult<Value> {
    let vault_path = {
        let guard = config.vault_path.lock().unwrap();
        guard
            .clone()
            .ok_or(AppError::VaultNotOpen)?
    };

    let state = crate::agent_rag::memory::load_memory_state(&vault_path)?;
    let json = serde_json::to_value(&state)
        .map_err(|e| AppError::Other(format!("序列化失败: {}", e)))?;
    Ok(json)
}

#[tauri::command]
pub async fn agent_rag_memory_update_profile(
    text: String,
    config: State<'_, AppConfig>,
) -> AppResult<()> {
    let vault_path = {
        let guard = config.vault_path.lock().unwrap();
        guard
            .clone()
            .ok_or(AppError::VaultNotOpen)?
    };

    crate::agent_rag::memory::update_profile(&vault_path, &text)?;
    Ok(())
}

#[tauri::command]
pub async fn agent_rag_memory_clear(
    config: State<'_, AppConfig>,
) -> AppResult<()> {
    let vault_path = {
        let guard = config.vault_path.lock().unwrap();
        guard
            .clone()
            .ok_or(AppError::VaultNotOpen)?
    };

    let empty = crate::agent_rag::types::AgentMemoryState {
        user_profile: String::new(),
        conversations: Vec::new(),
        learned_facts: Vec::new(),
    };

    crate::agent_rag::memory::save_memory_state(&vault_path, &empty)?;
    Ok(())
}