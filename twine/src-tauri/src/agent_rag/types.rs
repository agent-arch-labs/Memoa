use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Strategy {
    VanillaRag,
    IRCoT,
    LightResearch,
    RankCoT,
    MemoryRag,
    DeepResearch,
    Auto,
}

impl Strategy {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "vanilla_rag" => Some(Self::VanillaRag),
            "ircot" => Some(Self::IRCoT),
            "light_research" => Some(Self::LightResearch),
            "rankcot" => Some(Self::RankCoT),
            "memory_rag" => Some(Self::MemoryRag),
            "deep_research" => Some(Self::DeepResearch),
            "auto" => Some(Self::Auto),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            Self::VanillaRag => "vanilla_rag",
            Self::IRCoT => "ircot",
            Self::LightResearch => "light_research",
            Self::RankCoT => "rankcot",
            Self::MemoryRag => "memory_rag",
            Self::DeepResearch => "deep_research",
            Self::Auto => "auto",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagContext {
    pub query: String,
    pub retrieved_chunks: Vec<ChunkSource>,
    pub intermediate_results: Vec<String>,
    pub reasoning_trace: Vec<String>,
    pub final_answer: Option<String>,
    pub user_profile: Option<String>,
    pub recent_memory: Vec<MemoryTurn>,
    pub loop_count: u32,
    pub max_loops: u32,
}

impl RagContext {
    pub fn new(query: String, max_loops: u32) -> Self {
        Self {
            query,
            retrieved_chunks: Vec::new(),
            intermediate_results: Vec::new(),
            reasoning_trace: Vec::new(),
            final_answer: None,
            user_profile: None,
            recent_memory: Vec::new(),
            loop_count: 0,
            max_loops,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkSource {
    pub note_id: String,
    pub note_title: String,
    pub note_path: String,
    pub chunk_index: u32,
    pub text: String,
    pub score: f64,
    pub chunk_offset: u64,
    pub chunk_length: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryTurn {
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "step_type")]
pub enum StepEvent {
    #[serde(rename = "tool_call")]
    ToolCall {
        tool: String,
        params: Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool: String,
        summary: String,
        detail: Value,
    },
    #[serde(rename = "reasoning")]
    Reasoning {
        text: String,
    },
    #[serde(rename = "route_decision")]
    RouteDecision {
        router: String,
        decision: String,
    },
    #[serde(rename = "token")]
    Token {
        token: String,
    },
    #[serde(rename = "done")]
    Done {
        answer: String,
        sources: Vec<ChunkSource>,
    },
    #[serde(rename = "error")]
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct PipelineStep {
    pub tool: String,
    pub params: Value,
    #[serde(default)]
    pub output_key: Option<String>,
}

pub enum BranchDirection {
    Complete,
    Incomplete,
    NeedRetrieval,
    DirectAnswer,
}

impl BranchDirection {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Complete => "complete",
            Self::Incomplete => "incomplete",
            Self::NeedRetrieval => "need_retrieval",
            Self::DirectAnswer => "direct_answer",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct PipelineConfig {
    #[serde(default = "default_max_loops")]
    pub max_loops: u32,
    #[serde(default = "default_top_k")]
    pub top_k: usize,
    #[serde(default)]
    pub retrieval_strategy: RetrievalStrategy,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RetrievalStrategy {
    #[default]
    Hybrid,
    Bm25,
    Vector,
}

fn default_max_loops() -> u32 {
    4
}

fn default_top_k() -> usize {
    10
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMemoryState {
    pub user_profile: String,
    pub conversations: Vec<ConversationRecord>,
    pub learned_facts: Vec<LearnedFact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationRecord {
    pub id: String,
    pub timestamp: String,
    pub turns: Vec<MemoryTurn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearnedFact {
    pub fact: String,
    pub confidence: f64,
}