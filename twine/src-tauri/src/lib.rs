// Twine - Memoa 本地知识库引擎 (Tauri 后端)
//
// 架构概述:
//   Twine 是 Memoa 的本地核心引擎，基于 Tauri 框架构建，
//   提供 Markdown 笔记管理、全文搜索、AI 辅助功能。
//
// 核心模块:
//   1. 文件管理 (commands/file) - 笔记的增删改查、文件树浏览
//   2. 仓库管理 (commands/vault) - 知识库打开/索引
//   3. 搜索系统 (commands/search) - 标题搜索 + 全文 Grep + BM25 + 向量检索
//   4. AI 服务 (commands/ai) - LLM 聊天 (含 RAG)、向量嵌入、混合检索
//   5. 数据库 (db/) - SQLite 存储笔记索引、标签、双向链接
//   6. 索引引擎 (indexer/) - Markdown 解析、Frontmatter 提取、批量重建
//   7. 分块器 (chunker/) - 文本语义分块 (800-1200 字符/块)
//   8. 向量嵌入 (embedding/) - 余弦相似度搜索、分块存储
//   9. BM25 检索 (bm25/) - 关键词全文检索
//   10. 融合排序 (fusion/) - RRF 算法融合 BM25 + 向量结果
//   11. 模型适配 (adapters/) - Ollama / OpenAI / 智谱多模型适配
//
// 设计原则:
//   - 本地优先: 所有数据以 Markdown 文件存储在本地
//   - 离线可用: Ollama 本地模型支持完全离线 AI
//   - 隐私保护: 数据不上传，用户自主决定是否使用云 AI
//   - 可扩展: 适配器模式支持多种 AI 服务提供商

mod adapters;
pub mod agent_rag;
mod ai_runtime;
mod bm25;
mod chunker;
mod commands;
mod config;
mod db;
mod embedding;
mod error;
mod fusion;
mod indexer;
mod ollama;

pub use config::AppConfig;
pub use error::{AppError, AppResult};
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::file::get_home_dir,
            commands::file::read_file,
            commands::file::write_file,
            commands::file::list_vault,
            commands::file::create_note,
            commands::file::create_folder,
            commands::file::delete_note,
            commands::file::rename_note,
            commands::file::list_recent_notes,
            commands::file::find_note_by_title,
            commands::file::find_note_by_path,
            commands::file::find_note_by_path_flexible,
            commands::file::open_with_default_app,
            commands::vault::open_vault,
            commands::vault::switch_vault,
            commands::vault::get_vault_info,
            commands::vault::reindex_vault,
            commands::search::search_notes,
            commands::search::get_backlinks,
            commands::search::get_graph_data,
            commands::search::get_local_graph,
            commands::ai::model_chat,
            commands::ai::model_chat_stream,
            commands::ai::model_embed,
            commands::ai::model_health_check,
            commands::ai::model_chat_check,
            commands::ai::ollama_embed,
            commands::ai::ollama_chat,
            commands::ai::vector_search,
            commands::ai::bm25_build,
            commands::ai::bm25_search,
            commands::ai::multi_search,
            commands::ai::vector_index_batch,
            commands::ai::summarize_note,
            commands::tag::list_tags_with_counts,
            commands::tag::get_notes_by_tag,
            commands::tavily::tavily_search,
            ai_runtime::commands::agent_start,
            ai_runtime::commands::agent_stop,
            ai_runtime::commands::agent_status,
            ai_runtime::commands::agent_list_tools,
            ai_runtime::commands::agent_call_tool,
            ai_runtime::commands::agent_deep_research,
            ai_runtime::commands::agent_run_workflow,
            commands::agent_rag::agent_rag_run,
            commands::agent_rag::agent_rag_list_strategies,
            commands::agent_rag::agent_rag_memory_load,
            commands::agent_rag::agent_rag_memory_update_profile,
            commands::agent_rag::agent_rag_memory_clear,
        ])
        .manage(AppConfig::new())
        .run(tauri::generate_context!())
        .expect("error while running Memoa");
}