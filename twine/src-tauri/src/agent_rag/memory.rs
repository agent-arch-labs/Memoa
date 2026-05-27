use crate::agent_rag::types::{
    AgentMemoryState, ChunkSource, ConversationRecord, LearnedFact, MemoryTurn,
};
use crate::error::AppResult;
use chrono::Utc;
use std::path::{Path, PathBuf};
use uuid::Uuid;

fn memory_file_path(vault_path: &Path) -> PathBuf {
    crate::config::AppConfig::memoa_config_dir(vault_path).join("agent_memory.json")
}

pub fn load_memory_state(vault_path: &Path) -> AppResult<AgentMemoryState> {
    let path = memory_file_path(vault_path);
    if !path.exists() {
        return Ok(AgentMemoryState {
            user_profile: String::new(),
            conversations: Vec::new(),
            learned_facts: Vec::new(),
        });
    }
    let data = std::fs::read_to_string(&path)?;
    let state: AgentMemoryState = serde_json::from_str(&data)?;
    Ok(state)
}

pub fn save_memory_state(vault_path: &Path, state: &AgentMemoryState) -> AppResult<()> {
    let path = memory_file_path(vault_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(state)?;
    std::fs::write(&path, data)?;
    Ok(())
}

pub fn save_turn(
    vault_path: &Path,
    query: &str,
    answer: &str,
    _sources: &[ChunkSource],
) -> AppResult<()> {
    let mut state = load_memory_state(vault_path).unwrap_or(AgentMemoryState {
        user_profile: String::new(),
        conversations: Vec::new(),
        learned_facts: Vec::new(),
    });

    let conv = ConversationRecord {
        id: Uuid::new_v4().to_string(),
        timestamp: Utc::now().to_rfc3339(),
        turns: vec![
            MemoryTurn {
                role: "user".to_string(),
                content: query.to_string(),
                timestamp: Utc::now().to_rfc3339(),
            },
            MemoryTurn {
                role: "assistant".to_string(),
                content: answer.to_string(),
                timestamp: Utc::now().to_rfc3339(),
            },
        ],
    };

    state.conversations.push(conv);
    if state.conversations.len() > 100 {
        state.conversations = state.conversations.split_off(state.conversations.len() - 100);
    }

    save_memory_state(vault_path, &state)
}

pub fn get_profile(vault_path: &Path) -> AppResult<String> {
    let state = load_memory_state(vault_path)?;
    Ok(state.user_profile)
}

pub fn update_profile(vault_path: &Path, text: &str) -> AppResult<()> {
    let mut state = load_memory_state(vault_path)?;
    if state.user_profile.is_empty() {
        state.user_profile = text.to_string();
    } else {
        state.user_profile = format!("{}\n{}", state.user_profile, text);
    }
    save_memory_state(vault_path, &state)
}

pub fn add_fact(vault_path: &Path, fact: &str, confidence: f64) -> AppResult<()> {
    let mut state = load_memory_state(vault_path)?;
    state.learned_facts.push(LearnedFact {
        fact: fact.to_string(),
        confidence,
    });
    save_memory_state(vault_path, &state)
}

pub fn load_recent_conversations(vault_path: &Path, n: usize) -> AppResult<Vec<MemoryTurn>> {
    let state = load_memory_state(vault_path)?;
    let mut turns: Vec<MemoryTurn> = Vec::new();
    for conv in state.conversations.iter().rev().take(n) {
        for turn in &conv.turns {
            turns.push(turn.clone());
        }
    }
    turns.reverse();
    Ok(turns)
}