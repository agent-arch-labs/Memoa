use crate::agent_rag::{
    router,
    tools,
    types::{
        BranchDirection, ChunkSource, RagContext, StepEvent,
        Strategy,
    },
};
use crate::adapters::base::ModelConfig;
use crate::error::AppResult;
use std::path::Path;
use tokio::sync::mpsc;

const RAG_SYSTEM_PROMPT: &str = "你是 Memoa AI 助手，基于用户个人知识库进行检索增强推理。\n\
    严格遵守以下规则：\n\
    1. 直接回答用户问题，不要输出搜索策略、检索思路或自言自语。\n\
    2. 用中文组织答案，简洁清晰。下方已提供检索到的知识库片段，直接据此回答。\n\
    3. 引用具体笔记片段时，标注来源编号 [来源 N]。\n\
    4. 当知识库片段足够回答用户问题时，必须直接回答；只有没有任何相关内容时，才简短说明。\n\
    5. 不要编造信息，不要模拟搜索过程，不要反问用户需要什么。";

const IRCOT_SYSTEM_PROMPT: &str = "你是 Memoa AI 助手，使用链式推理(IRCoT)分析问题。\n\
    规则：\n\
    1. 逐步推理，每步基于之前检索到的信息。\n\
    2. 当推理充分后，以 '最终答案:' 开头给出结论。\n\
    3. 用中文回答，引用来源编号 [来源 N]。\n\
    4. 如果当前信息不足以得出结论，说明下一步需要查询什么。";

const RANKCOT_SYSTEM_PROMPT: &str = "你是 Memoa AI 助手，先对检索结果进行精炼排序再回答。\n\
    精炼规则：\n\
    1. 评估每个来源的相关性和可靠性。\n\
    2. 去重相似信息，保留最权威的来源。\n\
    3. 按重要性排序，最多保留 5 条关键信息。\n\
    4. 基于精炼后的信息回答。\n\
    5. 用中文回答，引用来源编号 [来源 N]。";

const DEEP_RESEARCH_SYSTEM_PROMPT: &str = "你是 Memoa 深度研究助手，进行系统性的知识调研。\n\
    规则：\n\
    1. 制定调研计划，分解为子问题。\n\
    2. 逐个子问题进行检索和回答。\n\
    3. 最后综合所有发现给出完整报告。\n\
    4. 用中文回答，结构化呈现（含摘要/发现/结论）。\n\
    5. 引用来源编号 [来源 N]。";

pub async fn execute_vanilla_rag(
    query: &str,
    vault_path: &Path,
    embed_config: Option<&ModelConfig>,
    llm_config: &ModelConfig,
    ctx: &mut RagContext,
    tx: &mpsc::UnboundedSender<StepEvent>,
) -> AppResult<String> {
    let _ = tx.send(StepEvent::ToolCall {
        tool: "retrieve".into(),
        params: serde_json::json!({"query": query, "top_k": 30}),
    });

    let chunks = tools::run_retrieve(query, 30, vault_path, embed_config, ctx)?;

    let _ = tx.send(StepEvent::ToolResult {
        tool: "retrieve".into(),
        summary: format!("检索到 {} 条相关片段", chunks.len()),
        detail: serde_json::to_value(&chunks).unwrap_or_default(),
    });

    let _ = tx.send(StepEvent::ToolCall {
        tool: "generate".into(),
        params: serde_json::json!({"prompt": query}),
    });

    let answer = tools::run_generate_stream(
        query,
        &chunks,
        RAG_SYSTEM_PROMPT,
        llm_config,
        tx,
    )
    .await?;

    ctx.final_answer = Some(answer.clone());

    let _ = tx.send(StepEvent::Done {
        answer: answer.clone(),
        sources: chunks,
    });

    Ok(answer)
}

pub async fn execute_ircot(
    query: &str,
    vault_path: &Path,
    embed_config: Option<&ModelConfig>,
    llm_config: &ModelConfig,
    ctx: &mut RagContext,
    tx: &mpsc::UnboundedSender<StepEvent>,
) -> AppResult<String> {
    let _ = tx.send(StepEvent::ToolCall {
        tool: "retrieve".into(),
        params: serde_json::json!({"query": query, "top_k": 30}),
    });

    let initial_chunks = tools::run_retrieve(query, 30, vault_path, embed_config, ctx)?;

    let _ = tx.send(StepEvent::ToolResult {
        tool: "retrieve".into(),
        summary: format!("初始检索到 {} 条片段", initial_chunks.len()),
        detail: serde_json::to_value(&initial_chunks).unwrap_or_default(),
    });

    let mut context_chunks = initial_chunks;
    let mut current_query = query.to_string();
    let mut reasoning_chain: Vec<String> = Vec::new();

    for round in 0..ctx.max_loops.min(4) {
        let _ = tx.send(StepEvent::ToolCall {
            tool: "generate".into(),
            params: serde_json::json!({"prompt": current_query, "round": round + 1}),
        });

        let answer = tools::run_generate(
            &current_query,
            &context_chunks,
            IRCOT_SYSTEM_PROMPT,
            llm_config,
        )
        .await?;

        reasoning_chain.push(answer.clone());

        let _ = tx.send(StepEvent::Reasoning {
            text: answer.clone(),
        });

        let _ = tx.send(StepEvent::RouteDecision {
            router: "check_answer_complete".into(),
            decision: "checking".into(),
        });

        match router::check_answer_complete(&answer) {
            BranchDirection::Complete => {
                let _ = tx.send(StepEvent::RouteDecision {
                    router: "check_answer_complete".into(),
                    decision: "complete".into(),
                });

                ctx.final_answer = Some(answer.clone());
                ctx.intermediate_results = reasoning_chain;

                let _ = tx.send(StepEvent::Done {
                    answer: answer.clone(),
                    sources: ctx.retrieved_chunks.clone(),
                });

                return Ok(answer);
            }
            BranchDirection::Incomplete => {
                let _ = tx.send(StepEvent::RouteDecision {
                    router: "check_answer_complete".into(),
                    decision: "incomplete".into(),
                });

                current_query = tools::run_extract_next_query(&answer, query);

                let _ = tx.send(StepEvent::ToolCall {
                    tool: "retrieve".into(),
                    params: serde_json::json!({"query": current_query, "top_k": 30}),
                });

                let new_chunks =
                    tools::run_retrieve(&current_query, 30, vault_path, embed_config, ctx)?;

                let _ = tx.send(StepEvent::ToolResult {
                    tool: "retrieve".into(),
                    summary: format!("补充检索到 {} 条片段", new_chunks.len()),
                    detail: serde_json::to_value(&new_chunks).unwrap_or_default(),
                });

                for chunk in new_chunks {
                    let already_has = context_chunks.iter().any(|c| c.note_id == chunk.note_id);
                    if !already_has {
                        context_chunks.push(chunk);
                    }
                }
            }
            _ => {}
        }
    }

    let final_prompt = format!(
        "原始问题: {}\n\n推理过程:\n{}\n\n请基于以上推理给出最终答案。",
        query,
        reasoning_chain.join("\n---\n")
    );

    let final_answer = tools::run_generate_stream(
        &final_prompt,
        &context_chunks,
        RAG_SYSTEM_PROMPT,
        llm_config,
        tx,
    )
    .await?;

    ctx.final_answer = Some(final_answer.clone());

    let _ = tx.send(StepEvent::Done {
        answer: final_answer.clone(),
        sources: ctx.retrieved_chunks.clone(),
    });

    Ok(final_answer)
}

pub async fn execute_rankcot(
    query: &str,
    vault_path: &Path,
    embed_config: Option<&ModelConfig>,
    llm_config: &ModelConfig,
    ctx: &mut RagContext,
    tx: &mpsc::UnboundedSender<StepEvent>,
) -> AppResult<String> {
    let _ = tx.send(StepEvent::ToolCall {
        tool: "retrieve".into(),
        params: serde_json::json!({"query": query, "top_k": 30}),
    });

    let chunks = tools::run_retrieve(query, 30, vault_path, embed_config, ctx)?;

    let _ = tx.send(StepEvent::ToolResult {
        tool: "retrieve".into(),
        summary: format!("检索到 {} 条片段，进入精炼", chunks.len()),
        detail: serde_json::to_value(&chunks).unwrap_or_default(),
    });

    let _ = tx.send(StepEvent::Reasoning {
        text: "正在进行知识精炼排序...".into(),
    });

    let refine_prompt = format!(
        "对以下检索结果进行评估精炼，按相关性排序，去重后保留最关键的 5 条：\n\n{}",
        chunks
            .iter()
            .enumerate()
            .map(|(i, c)| format!("[{}] ({}): {}", i + 1, c.note_path, c.text))
            .collect::<Vec<_>>()
            .join("\n\n")
    );

    let refined =
        tools::run_generate(&refine_prompt, &[], RANKCOT_SYSTEM_PROMPT, llm_config).await?;

    let _ = tx.send(StepEvent::ToolCall {
        tool: "generate".into(),
        params: serde_json::json!({"prompt": query}),
    });

    let answer = tools::run_generate_stream(
        &format!(
            "问题: {}\n\n精炼后的相关知识:\n{}\n\n请回答。",
            query, refined
        ),
        &chunks,
        RAG_SYSTEM_PROMPT,
        llm_config,
        tx,
    )
    .await?;

    ctx.final_answer = Some(answer.clone());

    let _ = tx.send(StepEvent::Done {
        answer: answer.clone(),
        sources: chunks,
    });

    Ok(answer)
}

pub async fn execute_deep_research(
    query: &str,
    vault_path: &Path,
    embed_config: Option<&ModelConfig>,
    llm_config: &ModelConfig,
    ctx: &mut RagContext,
    tx: &mpsc::UnboundedSender<StepEvent>,
) -> AppResult<String> {
    let _ = tx.send(StepEvent::ToolCall {
        tool: "vault_stats".into(),
        params: serde_json::json!({}),
    });

    let vault_stats = tools::run_vault_stats(vault_path).unwrap_or_default();

    let _ = tx.send(StepEvent::ToolResult {
        tool: "vault_stats".into(),
        summary: "已获取知识库概览".into(),
        detail: serde_json::json!({"stats": vault_stats}),
    });

    let plan_prompt = format!(
        "知识库概览:\n{}\n\n问题: {}\n\n请制定一个研究计划，列出 3-5 个子问题，每个子问题一行，以序号开头。",
        vault_stats, query
    );

    let plan = tools::run_generate(&plan_prompt, &[], DEEP_RESEARCH_SYSTEM_PROMPT, llm_config).await?;

    let _ = tx.send(StepEvent::Reasoning {
        text: format!("调研计划:\n{}", plan),
    });

    let sub_questions: Vec<String> = plan
        .lines()
        .filter(|l| {
            let t = l.trim();
            t.starts_with(|c: char| c.is_ascii_digit())
                && t.contains(|c: char| c == '.' || c == ')' || c == '、')
        })
        .map(|l| {
            let t = l.trim();
            t.splitn(2, |c: char| c == '.' || c == ')' || c == '、')
                .nth(1)
                .unwrap_or(t)
                .trim()
                .to_string()
        })
        .take(5)
        .collect();

    let mut findings: Vec<String> = Vec::new();
    let mut all_chunks: Vec<ChunkSource> = Vec::new();

    for (i, sq) in sub_questions.iter().enumerate() {
        let _ = tx.send(StepEvent::ToolCall {
            tool: "retrieve".into(),
            params: serde_json::json!({"query": sq, "sub_question": i + 1}),
        });

        let chunks = tools::run_retrieve(sq, 30, vault_path, embed_config, ctx)?;

        let _ = tx.send(StepEvent::ToolResult {
            tool: "retrieve".into(),
            summary: format!("子问题 {} 检索到 {} 条", i + 1, chunks.len()),
            detail: serde_json::to_value(&chunks).unwrap_or_default(),
        });

        let answer = tools::run_generate(sq, &chunks, RAG_SYSTEM_PROMPT, llm_config).await?;

        findings.push(format!("子问题 {}:\n{}\n答案: {}", i + 1, sq, answer));

        for chunk in chunks {
            let already_has = all_chunks.iter().any(|c| c.note_id == chunk.note_id);
            if !already_has {
                all_chunks.push(chunk);
            }
        }
    }

    let report_prompt = format!(
        "问题: {}\n\n各子问题发现:\n{}\n\n请综合所有发现，撰写一份结构化研究报告（包含摘要、主要发现、结论）。",
        query,
        findings.join("\n\n")
    );

    let report =
        tools::run_generate_stream(&report_prompt, &all_chunks, DEEP_RESEARCH_SYSTEM_PROMPT, llm_config, tx).await?;

    ctx.final_answer = Some(report.clone());

    let _ = tx.send(StepEvent::Done {
        answer: report.clone(),
        sources: all_chunks,
    });

    Ok(report)
}

pub async fn execute_strategy(
    strategy: &Strategy,
    query: &str,
    vault_path: &Path,
    embed_config: Option<&ModelConfig>,
    llm_config: &ModelConfig,
    memory_path: Option<&Path>,
    tx: &mpsc::UnboundedSender<StepEvent>,
) -> AppResult<String> {
    let mut ctx = RagContext::new(query.to_string(), 10);

    if let Some(mem_path) = memory_path {
        if let Ok(state) = crate::agent_rag::memory::load_memory_state(mem_path) {
            ctx.user_profile = Some(state.user_profile);
            for conv in &state.conversations {
                for turn in &conv.turns {
                    ctx.recent_memory.push(turn.clone());
                }
            }
        }
    }

    let result = match strategy {
        Strategy::VanillaRag | Strategy::Auto => {
            execute_vanilla_rag(query, vault_path, embed_config, llm_config, &mut ctx, tx).await
        }
        Strategy::IRCoT => {
            execute_ircot(query, vault_path, embed_config, llm_config, &mut ctx, tx).await
        }
        Strategy::RankCoT => {
            execute_rankcot(query, vault_path, embed_config, llm_config, &mut ctx, tx).await
        }
        Strategy::DeepResearch | Strategy::LightResearch => {
            execute_deep_research(query, vault_path, embed_config, llm_config, &mut ctx, tx)
                .await
        }
        Strategy::MemoryRag => {
            execute_vanilla_rag(query, vault_path, embed_config, llm_config, &mut ctx, tx).await
        }
    };

    if let (Ok(answer), Some(mem_path)) = (&result, memory_path) {
        let _ = crate::agent_rag::memory::save_turn(mem_path, query, answer, &ctx.retrieved_chunks);
    }

    result
}