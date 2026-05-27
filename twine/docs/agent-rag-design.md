# Memoa Agent RAG 设计文档

## 一、背景与目标

### 1.1 现状

Memoa 已具备完整的个人知识管理基础设施：

| 能力层 | 已有模块 | 成熟度 |
|--------|----------|--------|
| 文件系统 | `commands/file.rs` — 创建、重命名、删除、路径引用 | 高 |
| 索引引擎 | `indexer/` — 笔记遍历、checksum、tags、wikilinks、embedding | 高 |
| 检索 | `bm25/`, `embedding/`, `fusion/` — BM25、向量、RRF 混合检索 | 高 |
| LLM 适配 | `adapters/` — OpenAI 兼容、Ollama、Zhipu | 高 |
| 图表 | `commands/search.rs` — 知识图谱节点与边 | 高 |
| 工具注册 | `tool_registry/` — `McpTool` trait + `ToolRegistry` | 中 |
| MCP 桥 | `mcp_bridge/` — stdio/HTTP 传输、JSON-RPC 协议 | 中 |
| 流程引擎 | `workflow/` — DAG 校验、拓扑排序、节点执行 | 低 |
| 网页搜索 | `commands/tavily.rs` | 低 |

### 1.2 目标

参考 UltraRAG 的 MCP 微服务架构与 Agent RAG 设计模式，将 Memoa 从 **"增强型检索聊天"** 升级为 **"Agent RAG（智能体检索增强生成）"**：

1. **工具化检索**：将现有检索能力包装为统一 `McpTool`，支持 LLM 自主决策调用
2. **多策略 Agent 管道**：实现 RAG、LightResearch、IRCoT、RankCoT 等可组合管道
3. **本地记忆持久化**：Agent 对话状态与用户偏好记忆落盘到 vault
4. **流程可观测**：前端实时展示 Agent 思考链（检索 → 推理 → 重检索 → 回答）
5. **渐进式部署**：不破坏现有 `model_chat` 接口，新能力作为增强通道

---

## 二、UltraRAG 架构参考

### 2.1 三层架构

```
┌─────────────────────────────────────────────────┐
│  Interface Layer                                 │
│  CLI (ultrarag run/build) / Python API / UI      │
├─────────────────────────────────────────────────┤
│  Orchestration Layer                             │
│  client.py: build → load_pipeline → execute      │
│  Pipeline DSL: YAML steps / loop / branch         │
├─────────────────────────────────────────────────┤
│  Execution Layer                                  │
│  MCP Servers: retriever / generation / prompt /   │
│               memory / router / evaluation / ...  │
└─────────────────────────────────────────────────┘
```

### 2.2 核心设计模式

**模式一：MCP 工具组合**
每个 server 暴露 tools/prompts，通过 YAML pipeline 编排调用顺序。

**模式二：分支路由 (branch + router)**
```
- branch:
    router:
    - router.check_complete    # 返回 complete 或 incomplete
    branches:
      complete:   []           # 终止
      incomplete:              # 继续
      - retriever.search
      - generation.generate
```

**模式三：循环推理 (loop)**
```
- loop:
    times: 10
    steps:
    - retriever.search
    - generation.generate
    - router.check_end         # 回答完即跳出
```

### 2.3 Agent RAG 策略矩阵

| 策略 | 检索时机 | 推理轮次 | 适合场景 |
|------|---------|---------|---------|
| **Vanilla RAG** | 一次检索 | 1 轮 | 事实查询 |
| **IRCoT** | 链式多轮 | 2-4 轮 | 多跳推理 |
| **LightResearch** | 结构化解耦 | 最长 10 轮 | 深度调研 |
| **RankCoT** | 检索 + 精炼 | 2 轮 | 知识排序 |
| **Memory RAG** | 用户记忆 + 文档 | 1 轮 | 个性化回答 |

---

## 三、Memoa Agent RAG 设计

### 3.1 总体架构

```
┌──────────────────────────────────────────────────────────┐
│  Frontend (React)                                        │
│  AgentPanel: 策略选择 → 实时步骤展示 → Markdown 回答       │
├──────────────────────────────────────────────────────────┤
│  Tauri Commands (commands/agent_rag.rs)   [新增]          │
│  agent_rag_run(strategy, query, params) → Stream<Step>   │
│  agent_rag_memory_save() / agent_rag_memory_load()       │
├──────────────────────────────────────────────────────────┤
│  RAG Engine (agent_rag/)   [新增]                        │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │Strategy │  │ Pipeline │  │  Router  │  │  Memory  │ │
│  │Registry │  │ Executor │  │ (branch) │  │  Store   │ │
│  └─────────┘  └──────────┘  └──────────┘  └──────────┘ │
├──────────────────────────────────────────────────────────┤
│  Existing Infrastructure (复用)                          │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ToolReg  │  │Retrieval │  │ Adapters │  │  Indexer │ │
│  │(McpTool)│  │(bm25+vec)│  │(openai+)│  │(markdown)│ │
│  └─────────┘  └──────────┘  └──────────┘  └──────────┘ │
│  ┌──────────┐  ┌──────────┐                             │
│  │  Tavily  │  │  db/note │                             │
│  │ websearch│  │  db/link │                             │
│  └──────────┘  └──────────┘                             │
└──────────────────────────────────────────────────────────┘
```

### 3.2 新增模块清单

| 文件路径 | 职责 |
|---------|------|
| `src-tauri/src/agent_rag/mod.rs` | 模块入口 |
| `src-tauri/src/agent_rag/tools.rs` | RAG 专用 McpTool 实现（检索、获取笔记、图谱查询、网页搜索） |
| `src-tauri/src/agent_rag/strategies.rs` | 策略注册表 + 策略定义（vanilla_rag / ircot / light_research / rankcot） |
| `src-tauri/src/agent_rag/pipeline.rs` | Agent RAG 管道执行器（支持 loop/branch，逐步 yield Step） |
| `src-tauri/src/agent_rag/router.rs` | 路由工具：回答完整性检查、检索必要性判断 |
| `src-tauri/src/agent_rag/memory.rs` | Agent 记忆读写：用户偏好、对话历史落盘到 `.memoa/agent_memory.json` |
| `src-tauri/src/agent_rag/types.rs` | 共享类型：Step/StepKind/Strategy/RagContext 等 |
| `src-tauri/src/commands/agent_rag.rs` | Tauri Command 层：`agent_rag_run`、`agent_rag_memory_*` |

### 3.3 复用现有模块

`agent_rag` 不重新实现以下能力，而是通过 `ToolRegistry` + 直接函数调用复用：

| 能力 | 复用方式 |
|------|---------|
| BM25 检索 | 调用 `bm25::` 模块函数 |
| 向量检索 | 调用 `embedding::search_similar_chunks` |
| 混合检索 (RRF) | 调用 `fusion::reciprocal_rank_fusion` |
| LLM 调用 | 通过 `adapters::base::create_adapter` 创建适配器 |
| 笔记读取 | 通过 `db::note::` 或已有的 `GetNoteTool` |
| 图谱查询 | 通过 `db::link::` 获取链接关系 |
| 网页搜索 | 通过 `commands::tavily` 的 HTTP 调用 |
| ToolRegistry | 注册新 tool 到现有注册表 |

---

## 四、核心设计

### 4.1 工具矩阵（agent_rag/tools.rs）

注册到 `ToolRegistry` 的工具：

```rust
// 检索工具
RetrieveTool {
    name: "retrieve",
    description: "搜索知识库中的笔记片段，支持混合检索(BM25+向量)",
    params: { query, top_k, strategy: "hybrid"|"bm25"|"vector" }
}

// 获取笔记全文
FetchNoteTool {
    name: "fetch_note",
    description: "根据路径获取笔记完整内容",
    params: { path }
}

// 图谱查询
GraphQueryTool {
    name: "graph_query",
    description: "查询笔记的双向链接关系，发现关联知识",
    params: { note_path, depth: 1|2 }
}

// 网页搜索
WebSearchTool {
    name: "web_search",
    description: "在互联网搜索补充信息",
    params: { query, max_results }
}

// 知识库概览
VaultStatsTool {
    name: "vault_stats",
    description: "获取知识库规模统计：笔记总数、最近更新、热门标签",
    params: {}
}

// 答案生成
GenerateTool {
    name: "generate",
    description: "基于上下文生成最终回答",
    params: { prompt, context_chunks, system_prompt }
}
```

### 4.2 管道执行器（agent_rag/pipeline.rs）

管道 DSL 使用 Rust 结构体定义，不引入额外 YAML 解析层：

```rust
pub struct PipelineDef {
    pub strategy: Strategy,
    pub steps: Vec<PipelineStep>,
    pub config: PipelineConfig,
}

pub enum PipelineStep {
    ToolCall { tool: String, params: Value },
    Branch { router: Box<PipelineStep>, branches: HashMap<String, Vec<PipelineStep>> },
    Loop { max_rounds: u32, steps: Vec<PipelineStep> },
    Generate { system_prompt: String },
}
```

执行器采用 **async generator** 模式，每次工具调用 yield 一个 `Step` 事件给前端：

```rust
pub async fn execute_pipeline(
    def: &PipelineDef,
    ctx: &mut RagContext,
    tx: mpsc::UnboundedSender<Step>,
) -> AppResult<String>
```

### 4.3 路由逻辑（agent_rag/router.rs）

参考 UltraRAG 的 router server，实现规则路由 + LLM 路由：

```rust
// 规则路由（快速、无需 LLM 调用）
pub fn rule_based_router(
    context: &RagContext,
    router_type: RouterType,
) -> BranchDirection;

pub enum RouterType {
    AnswerComplete,     // 检查回答是否完整（匹配结束短语）
    NeedRetrieval,      // 检查是否需要检索（问句 vs 闲聊）
    NeedDeepResearch,   // 是否需要深度调研（复杂度判断）
}

// LLM 路由（需要 LLM 判断时使用）
pub async fn llm_router(
    context: &RagContext,
    prompt_template: &str,
    adapter: &dyn ModelAdapter,
) -> AppResult<BranchDirection>;
```

### 4.4 记忆系统（agent_rag/memory.rs）

在 vault `.memoa/agent_memory.json` 中持久化：

```json
{
  "user_profile": "用户偏好中文回答，关注 Rust 和 Tauri 开发",
  "conversations": [
    {
      "id": "conv_001",
      "timestamp": "2026-05-25T10:00:00Z",
      "turns": [
        { "role": "user", "content": "Rust 的生命周期怎么理解" },
        { "role": "assistant", "content": "...", "sources": ["note_123"] }
      ]
    }
  ],
  "learned_facts": [
    { "fact": "用户正在开发 Memoa 项目", "confidence": 0.95 }
  ]
}
```

记忆能力：
- `save_turn(q, a, sources)` — 保存一轮对话
- `load_recent(n)` — 加载最近 n 轮
- `get_profile()` — 获取用户画像
- `update_profile(text)` — 追加/更新画像
- `add_fact(fact)` — 学到一个事实

---

## 五、策略实现

### 5.1 Vanilla RAG（基础检索增强）

**对应 UltraRAG**: `examples/demos/RAG.yaml`、`experiments/rag_full.yaml`

```
用户问题 → retrieve(hybrid, top_k=10) → generate(context + question) → 回答
```

步骤：
1. `retrieve` — 混合检索相关片段
2. `generate` — 基于片段生成引用标注的回答

### 5.2 IRCoT（链式推理检索）

**对应 UltraRAG**: `examples/demos/IRCoT.yaml`、`examples/experiments/ircot.yaml`

```
用户问题
  → retrieve(初始检索)
  → generate(生成第一步推理 + 提取下一步检索词)
  → loop(最多 4 轮):
      retrieve(用提取的检索词)
      → generate(基于新检索结果继续推理)
      → route(回答是否完整？)
        完整 → break
        不完整 → 提取下一检索词，继续
  → generate(整理最终回答)
```

关键：每轮 LLM 生成后提取其中隐含的下一个检索方向，实现 **链式多跳推理**。

### 5.3 LightResearch（轻量深度调研）

**对应 UltraRAG**: `examples/demos/LightResearch.yaml`

```
用户问题
  → generate(生成调研计划 plan)
  → generate(初始化页面结构 page)
  → loop(最多 10 轮):
      route(页面是否完整？)
        不完整 →
          generate(生成子问题 subq)
          → retrieve(搜索子问题)
          → generate(填充页面 page)
        完整 → []
  → generate(基于完整页面生成最终回答)
```

关键：**结构化解耦** — 先生成调研框架，再逐子问题填充，最后汇总。适合复杂/开放式问题。

### 5.4 RankCoT（排序增强检索）

**对应 UltraRAG**: `examples/demos/RankCoT.yaml`

```
用户问题
  → retrieve(混合检索)
  → generate(知识精炼 kr: 对检索结果排序、去重、摘要)
  → generate(基于精炼知识生成回答)
```

关键：**检索结果精炼** — 在回答前做一次"知识排序与去噪"。

### 5.5 RAG with Memory（记忆增强检索）

**对应 UltraRAG**: `examples/demos/RAG_memory.yaml`

```
用户问题
  → memory_load(加载用户画像 + 最近对话)
  → retrieve(融合用户画像的个性化检索)
  → generate(上下文 + 记忆 + 问题 → 回答)
  → memory_save(保存当前轮)
```

### 5.6 Deep Research（研究级深度）

```
用户问题
  → generate(生成研究计划)
  → loop(最多 5 轮):
      generate(当前阶段子问题)
      → retrieve(知识库)
      → web_search(互联网)
      → generate(汇总当前阶段)
  → generate(最终综合报告)
```

---

## 六、前端交互设计

### 6.1 Agent 对话面板

```
┌─────────────────────────────────────────────┐
│  Agent 对话                        策略: [▼] │
│  ┌─────────────────────────────────────────┐│
│  │ 用户: Rust 的生命周期和借用检查器        ││
│  │ 是如何协同工作的？                      ││
│  └─────────────────────────────────────────┘│
│                                             │
│  ┌ 思考链 ─────────────────────────────────┐│
│  │ 🔍 检索 "Rust 生命周期" ...  ✓ (8条)    ││
│  │ 🔍 检索 "借用检查器" ...      ✓ (5条)   ││
│  │ 🧠 推理: 生命周期确保引用有效性，       ││
│  │    借用检查器在编译期验证所有权规则...   ││
│  │ ❓ 检查完整性...             不完整      ││
│  │ 🔍 检索 "NLL 非词法生命周期" ... ✓ (3条)││
│  │ 🧠 推理完成...                           ││
│  │ 📝 生成最终回答...                       ││
│  └──────────────────────────────────────────┘│
│                                             │
│  ┌ 回答 ───────────────────────────────────┐│
│  │ Rust 的生命周期(lifetime)与借用检查器    ││
│  │ (borrow checker)协同工作...              ││
│  │ [来源 1] note_rust_basics.md            ││
│  │ [来源 2] note_borrow_checker.md          ││
│  └──────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### 6.2 策略下拉选单

- 🔹 智能（自动选择策略）
- 📄 Vanilla RAG（快速问答）
- 🔗 IRCoT（链式推理）
- 📊 LightResearch（深度调研）
- 🎯 RankCoT（精准回答）
- 🧠 Memory RAG（个性化回答）

---

## 七、数据流

### 7.1 一次完整 Agent RAG 调用

```
Frontend                          Tauri Command                  Agent RAG Engine
   │                                  │                              │
   │ agent_rag_run(strategy, query)   │                              │
   │─────────────────────────────────►│                              │
   │                                  │ StrategyRegistry::get()      │
   │                                  │─────────────────────────────►│
   │                                  │                              │
   │                                  │ PipelineExecutor::execute()  │
   │                                  │─────────────────────────────►│
   │                                  │                              │
   │          Step(tool: "retrieve")  │                              │
   │◄─────────────────────────────────│◄─────────────────────────────│
   │          Step(result: chunks)    │                              │
   │◄─────────────────────────────────│◄─────────────────────────────│
   │          Step(tool: "generate")  │                              │
   │◄─────────────────────────────────│◄─────────────────────────────│
   │          Step(token: "Rust")     │  (streaming)                 │
   │◄─────────────────────────────────│◄─────────────────────────────│
   │          Step(token: "的")       │                              │
   │◄─────────────────────────────────│◄─────────────────────────────│
   │          ...                     │                              │
   │          Step(done, sources)     │                              │
   │◄─────────────────────────────────│◄─────────────────────────────│
```

### 7.2 Step 事件类型

```rust
#[derive(Debug, Serialize)]
#[serde(tag = "kind")]
pub enum Step {
    ToolCall {
        tool: String,
        params: Value,
    },
    ToolResult {
        tool: String,
        summary: String,    // "检索到 8 条片段"
        detail: Value,      // 完整结果（上下文使用）
    },
    Reasoning {
        text: String,       // LLM 推理过程
    },
    RouteDecision {
        router: String,
        decision: String,   // "complete" / "incomplete" / "need_retrieval"
    },
    Token {
        token: String,      // 流式 token
    },
    Done {
        answer: String,
        sources: Vec<Source>,
    },
    Error {
        message: String,
    },
}
```

---

## 八、与现有代码的关系

### 8.1 不变更的文件

- `commands/ai.rs` — 保留原有 `model_chat` / `model_chat_stream` 作为快速问答通道
- `commands/search.rs` — `search_notes` 保留作为手动搜索入口
- `adapters/` — 模型适配器完全复用
- `embedding/`、`bm25/`、`fusion/` — 检索能力复用

### 8.2 需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `src-tauri/src/lib.rs` | 注册 `agent_rag` 模块 |
| `src-tauri/Cargo.toml` | 无需新增依赖（全部复用现有） |
| `ai_runtime/tool_registry/mod.rs` | `use crate::agent_rag::tools::{...}` 仅在初始化时注册 |

### 8.3 渐进增强路径

```
Phase 1（当前）:  model_chat + 手动检索    ← 已实现
Phase 2（本期）:  Vanilla RAG + IRCoT      ← 本设计实现
Phase 3（后续）:  LightResearch + Memory   ← 复用 PipelineExecutor
Phase 4（后续）:  Deep Research + 多模态   ← 扩展 Router + Tool
```

---

## 九、实现优先级与工作量

| 优先级 | 模块 | 说明 | 依赖 |
|--------|------|------|------|
| P0 | `agent_rag/types.rs` | 共享类型定义 | 无 |
| P0 | `agent_rag/tools.rs` | RAG 工具实现（retrieve、fetch_note、generate） | types |
| P0 | `agent_rag/router.rs` | 规则路由（AnswerComplete） | types |
| P0 | `agent_rag/pipeline.rs` | 管道执行器（loop + branch） | types, tools, router |
| P0 | `agent_rag/strategies.rs` | Vanilla RAG + IRCoT 策略定义 | pipeline |
| P0 | `commands/agent_rag.rs` | Tauri Command + SSE 事件推送 | strategies |
| P1 | `agent_rag/memory.rs` | Agent 记忆系统 | types |
| P1 | `strategies.rs` 扩展 | LightResearch + RankCoT + Memory RAG | pipeline, router |
| P2 | 前端 AgentPanel | React 组件（思考链展示 + 策略选择） | commands |
| P2 | `router.rs` 扩展 | LLM 路由（NeedRetrieval、NeedDeepResearch） | adapters |

---

## 十、测试策略

```rust
// 单元测试
#[test] fn test_rule_router_answer_complete()  { ... }
#[test] fn test_rule_router_answer_incomplete() { ... }
#[test] fn test_pipeline_branch_execution()     { ... }
#[test] fn test_pipeline_loop_max_rounds()      { ... }
#[test] fn test_memory_save_and_load()          { ... }

// 集成测试（需要 test vault）
#[tokio::test] async fn test_vanilla_rag_basic_question() { ... }
#[tokio::test] async fn test_ircot_multi_hop_reasoning()  { ... }
#[tokio::test] async fn test_rag_with_memory              { ... }

// 测试 vault 结构
// test_fixtures/vault/
//   note_rust.md         ← Rust 基础笔记
//   note_borrow.md       ← 借用检查器笔记
//   note_lifetime.md     ← 生命周期笔记
//   note_async.md        ← 异步编程笔记
//   link: [[rust]] ↔ [[borrow]] ↔ [[lifetime]]
```

---

## 十一、总结

本设计遵循以下核心哲学：

1. **复用优先**：不重新造轮子，所有检索/LLM/存储能力复用现有基础设施
2. **工具化思维**：将能力封装为 `McpTool`，LLM 可自主组合调用
3. **管道式编排**：借鉴 UltraRAG 的 step/loop/branch DSL，用 Rust 结构体实现
4. **渐进增强**：从 Vanilla RAG 起步，逐步叠加复杂策略
5. **本地优先**：所有数据在用户 vault 中，无外部依赖
6. **可观测性**：每一步工具调用/推理决策实时推送到前端