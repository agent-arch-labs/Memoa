use crate::agent_rag::types::Strategy;

pub fn list_strategies() -> Vec<StrategyInfo> {
    vec![
        StrategyInfo {
            id: Strategy::Auto,
            name: "智能".to_string(),
            description: "自动选择最优策略".to_string(),
        },
        StrategyInfo {
            id: Strategy::VanillaRag,
            name: "Vanilla RAG".to_string(),
            description: "快速检索增强回答，适合事实性查询".to_string(),
        },
        StrategyInfo {
            id: Strategy::IRCoT,
            name: "IRCoT".to_string(),
            description: "链式推理检索，适合多跳逻辑问题".to_string(),
        },
        StrategyInfo {
            id: Strategy::RankCoT,
            name: "RankCoT".to_string(),
            description: "排序精炼检索，适合需要甄别信息质量的问题".to_string(),
        },
        StrategyInfo {
            id: Strategy::DeepResearch,
            name: "Deep Research".to_string(),
            description: "深度调研，拆解子问题逐步分析".to_string(),
        },
        StrategyInfo {
            id: Strategy::MemoryRag,
            name: "Memory RAG".to_string(),
            description: "结合用户记忆和历史对话的个性化回答".to_string(),
        },
    ]
}

pub fn resolve_strategy(strategy_id: &str) -> Option<Strategy> {
    Strategy::from_str(strategy_id)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StrategyInfo {
    pub id: Strategy,
    pub name: String,
    pub description: String,
}