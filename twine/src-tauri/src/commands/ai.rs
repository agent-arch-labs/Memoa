// AI 命令处理 - LLM 聊天 / 向量嵌入 / 检索 / 摘要
//
// 核心功能:
//   model_chat        - 非流式 LLM 聊天 (RAG 增强: 检索知识库片段拼入 system prompt)
//   model_chat_stream - 流式 LLM 聊天 (通过 Tauri Event 推送 SSE chunk 到前端)
//   model_embed       - 文本嵌入 (统一适配器接口)
//   model_health_check / model_chat_check - 模型可用性检查
//   ollama_embed / ollama_chat - Ollama 本地模型专用接口
//   vector_search     - 纯向量语义检索
//   bm25_build / bm25_search - BM25 关键词检索
//   multi_search      - 混合检索 (RRF 融合 BM25 + 向量)
//   vector_index_batch - 增量向量索引
//   summarize_note    - AI 笔记摘要
//
// RAG (检索增强生成) 工作流:
//   1. multi_search 检索知识库相关片段
//   2. 拼接到 system prompt 作为上下文
//   3. LLM 基于上下文生成回答，引用 [来源 N]

use crate::{
    adapters::base::{create_adapter as new_adapter, Message, ModelConfig, StreamChunk},
    bm25::Bm25Index,
    config::AppConfig,
    error::{AppError, AppResult},
    fusion::{self, FusionInput},
    ollama,
};
use serde::Serialize;
use tauri::{Emitter, State};
use tokio::sync::mpsc;

#[derive(Debug, Serialize)]
pub struct EmbeddingResult {
    pub embedding: Vec<f32>,
    pub token_count: u32,
}

#[derive(Debug, Serialize)]
pub struct ChatChunk {
    pub content: String,
    pub done: bool,
}

#[derive(Debug, Serialize)]
pub struct VectorSearchResult {
    pub note_id: String,
    pub note_title: String,
    pub chunk_index: u32,
    pub text: String,
    pub score: f64,
    pub chunk_offset: u64,
    pub chunk_length: u64,
}

#[derive(Debug, Serialize)]
pub struct SummarizeResult {
    pub summary: String,
    pub key_points: Vec<String>,
}

#[tauri::command]
pub async fn model_chat(
    prompt: String,
    context: Vec<String>,
    model_config: ModelConfig,
) -> AppResult<String> {
    let adapter = new_adapter(&model_config);

    let system_prompt = "你是 Memoa AI 助手，基于用户个人知识库回答问题。\n\
        严格遵守以下规则：\n\
        1. 用中文回答，简洁清晰。\n\
        2. 回答中引用具体笔记片段时，标注来源编号 [来源 N]。\n\
        3. 如果知识库中有相关但信息不完整，说明已知部分并指出缺失。\n\
        4. 如果知识库中完全没有相关信息，诚实说明。不要编造信息。\n\
        5. 优先使用知识库中的信息，而非你的训练数据。";

    let mut messages = vec![Message {
        role: "system".to_string(),
        content: system_prompt.to_string(),
    }];

    if !context.is_empty() {
        let context_text = context
            .iter()
            .enumerate()
            .map(|(i, c)| format!("[来源 {}]:\n{}\n", i + 1, c))
            .collect::<Vec<_>>()
            .join("\n---\n");
        messages.push(Message {
            role: "system".to_string(),
            content: format!(
                "以下是来自知识库的相关笔记片段，请基于这些片段回答用户问题：\n{}",
                context_text
            ),
        });
    }

    messages.push(Message {
        role: "user".to_string(),
        content: prompt,
    });

    let result = adapter.chat(messages, &model_config).await?;
    Ok(result.content)
}

#[tauri::command]
pub async fn model_chat_stream(
    prompt: String,
    context: Vec<String>,
    model_config: ModelConfig,
    request_id: String,
    app_handle: tauri::AppHandle,
) -> AppResult<()> {
    let adapter = new_adapter(&model_config);

    let system_prompt = "你是 Memoa AI 助手，基于用户个人知识库回答问题。\n\
        严格遵守以下规则：\n\
        1. 用中文回答，简洁清晰。\n\
        2. 回答中引用具体笔记片段时，标注来源编号 [来源 N]。\n\
        3. 如果知识库中有相关但信息不完整，说明已知部分并指出缺失。\n\
        4. 如果知识库中完全没有相关信息，诚实说明。不要编造信息。\n\
        5. 优先使用知识库中的信息，而非你的训练数据。";

    let mut messages = vec![Message {
        role: "system".to_string(),
        content: system_prompt.to_string(),
    }];

    if !context.is_empty() {
        let context_text = context
            .iter()
            .enumerate()
            .map(|(i, c)| format!("[来源 {}]:\n{}\n", i + 1, c))
            .collect::<Vec<_>>()
            .join("\n---\n");
        messages.push(Message {
            role: "system".to_string(),
            content: format!(
                "以下是来自知识库的相关笔记片段，请基于这些片段回答用户问题：\n{}",
                context_text
            ),
        });
    }

    messages.push(Message {
        role: "user".to_string(),
        content: prompt,
    });

    let (tx, mut rx) = mpsc::unbounded_channel::<StreamChunk>();

    let adapter_task = tokio::spawn(async move {
        let _ = adapter.chat_stream(messages, &model_config, tx).await;
    });

    let event_name = format!("chat-stream-{}", request_id);
    while let Some(chunk) = rx.recv().await {
        let _ = app_handle.emit(&event_name, &chunk);
    }

    let _ = adapter_task.await;
    Ok(())
}

#[tauri::command]
pub async fn model_embed(
    text: String,
    model_config: ModelConfig,
) -> AppResult<EmbeddingResult> {
    let adapter = new_adapter(&model_config);
    let (embedding, token_count) = adapter.embed(&text, &model_config).await?;

    Ok(EmbeddingResult {
        embedding,
        token_count,
    })
}

#[tauri::command]
pub async fn model_health_check(model_config: ModelConfig) -> AppResult<bool> {
    let adapter = new_adapter(&model_config);
    match adapter.embed("测试连接", &model_config).await {
        Ok((embedding, _)) => Ok(!embedding.is_empty()),
        Err(e) => {
            tracing::warn!("向量化模型健康检查失败: {}", e);
            Ok(false)
        }
    }
}

#[tauri::command]
pub async fn model_chat_check(model_config: ModelConfig) -> AppResult<bool> {
    let adapter = new_adapter(&model_config);
    let messages = vec![
        Message {
            role: "user".to_string(),
            content: "hi".to_string(),
        },
    ];
    match adapter.chat(messages, &model_config).await {
        Ok(result) => Ok(!result.content.is_empty()),
        Err(e) => {
            tracing::warn!("LLM 模型健康检查失败: {}", e);
            Ok(false)
        }
    }
}

#[tauri::command]
pub async fn ollama_embed(
    text: String,
    model: Option<String>,
    ollama_url: Option<String>,
    config: State<'_, AppConfig>,
) -> AppResult<EmbeddingResult> {
    let url = ollama_url.unwrap_or_else(|| config.ollama_url.clone());
    let client = ollama::OllamaClient::new(&url);
    let (embedding, token_count) = client.embed_with_model(&text, model.as_deref()).await?;

    Ok(EmbeddingResult {
        embedding,
        token_count,
    })
}

#[tauri::command]
pub async fn ollama_chat(
    prompt: String,
    context: Vec<String>,
    model: Option<String>,
    ollama_url: Option<String>,
    config: State<'_, AppConfig>,
) -> AppResult<String> {
    let url = ollama_url.unwrap_or_else(|| config.ollama_url.clone());
    let client = ollama::OllamaClient::new(&url);

    let system_prompt = "你是 Memoa AI 助手，基于用户个人知识库回答问题。\n\
        用中文回答。引用来源时注明笔记名。\n\
        如果知识库中没有相关信息，诚实说明。不要编造信息。";

    let context_text = if context.is_empty() {
        String::new()
    } else {
        format!(
            "Context（来自用户知识库的相关笔记片段）:\n{}\n\n---\n\n",
            context
                .iter()
                .enumerate()
                .map(|(i, c)| format!("[来源 {}]:\n{}\n", i + 1, c))
                .collect::<Vec<_>>()
                .join("\n")
        )
    };

    let full_prompt = format!("{}\n{}User Question:\n{}", system_prompt, context_text, prompt);

    let model = model.unwrap_or_else(|| "llama3.2:3b".to_string());
    let response = client.chat(&model, &full_prompt).await?;

    Ok(response)
}

#[tauri::command]
pub async fn vector_search(
    query: String,
    top_k: Option<u32>,
    config: State<'_, AppConfig>,
    embed_config: Option<ModelConfig>,
    folder_filter: Option<String>,
) -> AppResult<Vec<VectorSearchResult>> {
    let (query_embedding, _) = if let Some(mc) = &embed_config {
        let adapter = new_adapter(mc);
        adapter.embed(&query, mc).await?
    } else {
        let client = ollama::OllamaClient::new(&config.ollama_url);
        client.embed_with_model(&query, None).await?
    };

    let vault_path = {
        let guard = config.vault_path.lock().unwrap();
        guard.clone().ok_or(AppError::VaultNotOpen)?
    };

    let folder_filter = folder_filter.map(|f| {
        let f = f.trim_end_matches('/').trim_end_matches('\\');
        if let Ok(rel) = std::path::Path::new(&f).strip_prefix(&vault_path) {
            rel.to_string_lossy().to_string()
        } else {
            f.to_string()
        }
    });

    let top_k = top_k.unwrap_or(10);
    let results = crate::embedding::search_similar_chunks(
        &vault_path,
        &query_embedding,
        top_k as usize,
    )?;

    let formatted: Vec<VectorSearchResult> = results
        .into_iter()
        .filter(|r| {
            if let Some(ref folder) = folder_filter {
                r.note_path.starts_with(folder)
            } else {
                true
            }
        })
        .map(|r| VectorSearchResult {
            note_id: r.note_id,
            note_title: r.title,
            chunk_index: r.chunk_index,
            text: r.text,
            score: r.score,
            chunk_offset: r.chunk_offset,
            chunk_length: r.chunk_length,
        })
        .collect();

    tracing::info!(
        "vector_search: {} results (folder_filter={:?})",
        formatted.len(),
        folder_filter
    );

    Ok(formatted)
}

#[tauri::command]
pub async fn bm25_build(config: State<'_, AppConfig>) -> AppResult<()> {
    let vault_path = {
        let guard = config.vault_path.lock().unwrap();
        guard.clone().ok_or(AppError::VaultNotOpen)?
    };
    Bm25Index::build_from_vault(&vault_path)?;
    Ok(())
}

#[tauri::command]
pub fn bm25_search(
    query: String,
    top_k: Option<usize>,
    config: State<'_, AppConfig>,
    folder_filter: Option<String>,
) -> AppResult<Vec<VectorSearchResult>> {
    let vault_path = {
        let guard = config.vault_path.lock().unwrap();
        guard.clone().ok_or(AppError::VaultNotOpen)?
    };

    let folder_filter = folder_filter.map(|f| {
        let f = f.trim_end_matches('/').trim_end_matches('\\');
        if let Ok(rel) = std::path::Path::new(&f).strip_prefix(&vault_path) {
            rel.to_string_lossy().to_string()
        } else {
            f.to_string()
        }
    });

    let top_k = top_k.unwrap_or(10);
    let index = Bm25Index::open(&vault_path)?.ok_or_else(|| {
        AppError::Other("BM25 索引不存在，请先构建索引".into())
    })?;
    let hits = index.search(&query, top_k * 2)?;
    let filtered: Vec<_> = hits
        .into_iter()
        .filter(|h| {
            if let Some(ref folder) = folder_filter {
                h.note_path.starts_with(folder)
            } else {
                true
            }
        })
        .take(top_k)
        .collect();
    let max_score = filtered.iter().map(|h| h.score as f64).fold(0.0f64, f64::max);
    let results: Vec<VectorSearchResult> = filtered
        .into_iter()
        .map(|h| VectorSearchResult {
            note_id: h.note_path,
            note_title: h.note_title,
            chunk_index: h.chunk_index,
            text: h.snippet,
            score: if max_score > 0.0 { h.score as f64 / max_score } else { 0.0 },
            chunk_offset: h.chunk_offset,
            chunk_length: h.chunk_length,
        })
        .collect();
    Ok(results)
}

#[tauri::command]
pub async fn multi_search(
    query: String,
    top_k: Option<usize>,
    config: State<'_, AppConfig>,
    embed_config: Option<ModelConfig>,
    folder_filter: Option<String>,
) -> AppResult<Vec<VectorSearchResult>> {
    let vault_path = {
        let guard = config.vault_path.lock().unwrap();
        guard.clone().ok_or(AppError::VaultNotOpen)?
    };

    let folder_filter = folder_filter.map(|f| {
        let f = f.trim_end_matches('/').trim_end_matches('\\');
        if let Ok(rel) = std::path::Path::new(&f).strip_prefix(&vault_path) {
            rel.to_string_lossy().to_string()
        } else {
            f.to_string()
        }
    });

    let top_k = top_k.unwrap_or(10);

    tracing::info!(
        "multi_search: query=\"{}\", top_k={:?}, folder_filter={:?}",
        query,
        top_k,
        folder_filter
    );

    let mut bm25_results: Vec<FusionInput> = Vec::new();
    let mut vector_results: Vec<FusionInput> = Vec::new();
    let mut bm25_err: Option<String> = None;
    let mut vector_err: Option<String> = None;

    if let Ok(Some(index)) = Bm25Index::open(&vault_path) {
        match index.search(&query, top_k) {
            Ok(hits) => {
                let before = hits.len();
                bm25_results = hits
                    .into_iter()
                    .filter(|h| {
                        if let Some(ref folder) = folder_filter {
                            h.note_path.starts_with(folder)
                        } else {
                            true
                        }
                    })
                    .map(|h| FusionInput {
                        source_id: h.note_path,
                        note_title: h.note_title,
                        chunk_index: h.chunk_index,
                        text: h.snippet,
                        score: h.score as f64,
                        chunk_offset: h.chunk_offset,
                        chunk_length: h.chunk_length,
                    })
                    .collect();
                tracing::info!(
                    "bm25 search: {} results before filter, {} after (folder_filter={:?})",
                    before,
                    bm25_results.len(),
                    folder_filter
                );
            }
            Err(e) => {
                bm25_err = Some(format!("BM25 搜索失败: {}", e));
                tracing::warn!("{}", bm25_err.as_ref().unwrap());
            }
        }
    } else {
        bm25_err = Some("BM25 索引不存在，请先构建索引".into());
    }

    {
        let embedding_result = if let Some(mc) = &embed_config {
            let adapter = new_adapter(mc);
            adapter.embed(&query, mc).await
        } else {
            let client = ollama::OllamaClient::new(&config.ollama_url);
            client.embed_with_model(&query, None).await
        };

        match embedding_result {
            Ok((query_embedding, _)) => {
                match crate::embedding::search_similar_chunks(&vault_path, &query_embedding, top_k)
                {
                    Ok(results) => {
                        let before = results.len();
                        vector_results = results
                            .into_iter()
                            .filter(|r| {
                                if let Some(ref folder) = folder_filter {
                                    r.note_path.starts_with(folder)
                                } else {
                                    true
                                }
                            })
                            .map(|r| FusionInput {
                                source_id: r.note_id,
                                note_title: r.title,
                                chunk_index: r.chunk_index,
                                text: r.text,
                                score: r.score,
                                chunk_offset: r.chunk_offset,
                                chunk_length: r.chunk_length,
                            })
                            .collect();
                        tracing::info!(
                            "vector search: {} results before filter, {} after (folder_filter={:?})",
                            before,
                            vector_results.len(),
                            folder_filter
                        );
                    }
                    Err(e) => {
                        vector_err = Some(format!("向量搜索失败: {}", e));
                        tracing::warn!("{}", vector_err.as_ref().unwrap());
                    }
                }
            }
            Err(e) => {
                vector_err = Some(format!("向量化失败: {}", e));
                tracing::warn!("{}", vector_err.as_ref().unwrap());
            }
        }
    }

    if bm25_results.is_empty() && vector_results.is_empty() {
        if bm25_err.is_some() && vector_err.is_some() {
            return Err(AppError::Other(format!(
                "BM25 和向量检索均失败。BM25: {} 向量: {}",
                bm25_err.unwrap_or_default(),
                vector_err.unwrap_or_default(),
            )));
        }
        return Ok(Vec::new());
    }

    if bm25_results.is_empty() {
        let max_score = vector_results.iter().map(|r| r.score).fold(0.0f64, f64::max);
        return Ok(vector_results
            .into_iter()
            .map(|r| VectorSearchResult {
                note_id: r.source_id,
                note_title: r.note_title,
                chunk_index: r.chunk_index,
                text: r.text,
                score: if max_score > 0.0 { (r.score / max_score).max(0.0) } else { 0.0 },
                chunk_offset: r.chunk_offset,
                chunk_length: r.chunk_length,
            })
            .collect());
    }

    if vector_results.is_empty() {
        let max_score = bm25_results.iter().map(|r| r.score).fold(0.0f64, f64::max);
        return Ok(bm25_results
            .into_iter()
            .map(|r| VectorSearchResult {
                note_id: r.source_id,
                note_title: r.note_title,
                chunk_index: r.chunk_index,
                text: r.text,
                score: if max_score > 0.0 { r.score / max_score } else { 0.0 },
                chunk_offset: r.chunk_offset,
                chunk_length: r.chunk_length,
            })
            .collect());
    }

    let fused = fusion::reciprocal_rank_fusion(&bm25_results, &vector_results, 60.0, top_k);
    Ok(fusion::fusion_hits_to_vector_results(fused))
}

#[tauri::command]
pub async fn vector_index_batch(
    chunks: Vec<ChunkInput>,
    embeddings: Vec<Vec<f32>>,
    config: State<'_, AppConfig>,
) -> AppResult<()> {
    if chunks.len() != embeddings.len() {
        return Err(AppError::Other(format!(
            "chunks 和 embeddings 数量不匹配: {} vs {}",
            chunks.len(),
            embeddings.len()
        )));
    }

    let vault_path = {
        let guard = config.vault_path.lock().unwrap();
        guard.clone().ok_or(AppError::VaultNotOpen)?
    };

    let chunk_records: Vec<crate::embedding::ChunkRecord> = chunks
        .into_iter()
        .zip(embeddings.into_iter())
        .map(|(chunk, vector)| crate::embedding::ChunkRecord {
            note_id: chunk.note_id,
            note_path: chunk.note_path.unwrap_or_default(),
            chunk_index: chunk.chunk_index,
            text: chunk.text,
            vector,
            chunk_offset: 0,
            chunk_length: 0,
        })
        .collect();

    crate::embedding::index_chunks(&vault_path, &chunk_records)?;

    Ok(())
}

#[tauri::command]
pub async fn summarize_note(
    content: String,
    note_title: String,
    config: State<'_, AppConfig>,
    model_config: Option<ModelConfig>,
) -> AppResult<SummarizeResult> {
    let prompt = format!(
        "请为以下笔记生成摘要和关键要点。\n\
        输出格式:\n\
        摘要: [一段话概括]\n\
        关键要点:\n\
        1. [要点1]\n\
        2. [要点2]\n\
        ...\n\n\
        笔记标题: {}\n\
        笔记内容:\n{}",
        note_title,
        if content.len() > 8000 {
            format!("{}...(内容已截断)", &content[..8000])
        } else {
            content
        }
    );

    let response = if let Some(mc) = &model_config {
        let adapter = new_adapter(mc);
        let messages = vec![
            Message {
                role: "user".to_string(),
                content: prompt,
            },
        ];
        adapter.chat(messages, mc).await?.content
    } else {
        let client = ollama::OllamaClient::new(&config.ollama_url);
        client.chat("llama3.2:3b", &prompt).await?
    };

    let mut summary = String::new();
    let mut key_points = Vec::new();
    let mut in_points = false;

    for line in response.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("摘要:") || trimmed.starts_with("摘要：") {
            summary = trimmed
                .strip_prefix("摘要:")
                .or_else(|| trimmed.strip_prefix("摘要："))
                .unwrap_or("")
                .trim()
                .to_string();
        } else if trimmed.starts_with("关键要点:") || trimmed.starts_with("关键要点：") {
            in_points = true;
        } else if in_points {
            if let Some(captured) = trimmed
                .strip_prefix(|c: char| c.is_ascii_digit() || c == '.')
                .or_else(|| {
                    trimmed.strip_prefix(|c: char| c.is_ascii_digit() || c == '.' || c == ' ')
                })
            {
                let point = captured.trim().trim_start_matches('.').trim_start_matches(' ');
                if !point.is_empty() {
                    key_points.push(point.to_string());
                }
            } else if !trimmed.is_empty() && (trimmed.starts_with('-') || trimmed.starts_with('*'))
            {
                let point = trimmed.trim_start_matches('-').trim_start_matches('*').trim();
                if !point.is_empty() {
                    key_points.push(point.to_string());
                }
            }
        }
    }

    Ok(SummarizeResult {
        summary,
        key_points,
    })
}

#[derive(Debug, serde::Deserialize)]
pub struct ChunkInput {
    pub note_id: String,
    #[serde(default)]
    pub note_path: Option<String>,
    pub chunk_index: u32,
    pub text: String,
}