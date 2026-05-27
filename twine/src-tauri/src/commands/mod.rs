// Tauri 命令模块 - 前端调用的 Rust 入口
//
// ai.rs      - AI 功能: LLM 聊天 (RAG)、向量嵌入、BM25/向量/混合检索、摘要
// file.rs    - 文件操作: 仓库列表、笔记 CRUD、文件读写
// search.rs  - 搜索功能: 标题搜索 + 全文 Grep、反向链接查询
// tag.rs     - 标签功能: 标签列表、按标签查询笔记
// vault.rs   - 仓库操作: 打开/关闭仓库、重建索引

pub mod ai;
pub mod agent_rag;
pub mod file;
pub mod search;
pub mod tag;
pub mod tavily;
pub mod vault;