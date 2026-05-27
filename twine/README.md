# Twine (Memoa) - 你的第二大脑

Twine 是 Memoa 的桌面客户端，一个**本地优先**的 Markdown 知识库管理工具，内置 AI 助手。

## 核心功能

| 功能 | 描述 |
|------|------|
| **Markdown 编辑器** | 基于 Milkdown 的所见即所得编辑器，支持实时预览 |
| **知识库管理** | 本地文件夹即知识库，文件树浏览、笔记 CRUD、文件夹管理 |
| **全文搜索** | 标题搜索 + 内容 Grep + BM25 关键词检索 + 向量语义检索 |
| **混合检索** | RRF 算法融合 BM25 和向量检索结果，精准排序 |
| **AI 助手 (RAG)** | 基于知识库的检索增强生成，智能问答引用笔记来源 |
| **双向链接** | `[[wikilink]]` 语法，自动提取链接关系，反向链接面板 |
| **标签系统** | YAML Frontmatter 标签支持，标签聚合浏览 |
| **知识图谱** | D3.js 力导向图可视化笔记间的链接关系 |
| **本地 AI** | 支持 Ollama 本地模型，完全离线可用 |
| **云端同步** | 通过 Nexus 服务实现多端同步 |

## 技术栈

| 层 | 技术 |
|----|------|
| **桌面框架** | Tauri 2 (Rust + WebView) |
| **前端** | React 18 + TypeScript + Tailwind CSS |
| **编辑器** | Milkdown 7 (ProseMirror) |
| **搜索引擎** | BM25 (Tantivy) + 向量检索 (余弦相似度) |
| **AI 适配** | Ollama / OpenAI 兼容 / 智谱 (GLM) |
| **数据库** | SQLite (WAL 模式) |
| **关系可视化** | D3.js Force |

## 快速开始

### 环境要求

- **Node.js** >= 18
- **Rust** >= 1.77
- **Linux**: `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev libssl-dev`
- **macOS**: Xcode Command Line Tools

### 本地启动

```bash
cd twine

# 一键开发模式启动（前端 + Tauri）
./start_dev.sh

# 仅启动前端 Vite Dev Server
./start_dev.sh --frontend

# 构建 Release 版本
./start_dev.sh --build

# 或手动
npm install
npm run tauri dev
```

### 安装 Ollama (可选，本地 AI)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:3b         # 聊天模型
ollama pull nomic-embed-text     # 嵌入模型
```

## AI 配置

在应用设置中配置 AI 模型：

```json
// 本地 Ollama
{
  "provider": "ollama",
  "model_id": "llama3.2:3b",
  "api_url": "http://127.0.0.1:11434"
}

// OpenAI
{
  "provider": "openai_compatible",
  "model_id": "gpt-4o",
  "api_url": "https://api.openai.com/v1",
  "api_key": "sk-xxxx"
}

// 智谱 GLM
{
  "provider": "zhipu",
  "model_id": "glm-4",
  "api_url": "https://open.bigmodel.cn/api/paas/v4",
  "api_key": "your-api-key"
}
```

也支持百炼 (bailian) 等 OpenAI 兼容接口的模型。

## 项目结构

```
twine/
├── src/                        # React 前端源代码
├── src-tauri/
│   ├── src/
│   │   ├── main.rs             # Tauri 入口
│   │   ├── lib.rs              # 核心库: 模块注册, Tauri Builder 配置
│   │   ├── config.rs           # 应用配置: 路径/状态管理
│   │   ├── error.rs            # 统一错误处理: AppError 枚举
│   │   ├── adapters/
│   │   │   ├── mod.rs          # 适配器模块入口
│   │   │   ├── base.rs         # ModelAdapter 枚举 + ModelConfig + create_adapter 工厂
│   │   │   ├── ollama_adapter.rs     # Ollama 适配 (本地模型)
│   │   │   ├── openai_compatible.rs  # OpenAI 兼容适配 (OpenAI/百炼等)
│   │   │   └── zhipu.rs              # 智谱 AI 适配
│   │   ├── bm25/
│   │   │   └── mod.rs          # BM25 关键词全文检索 (Tantivy)
│   │   ├── chunker/
│   │   │   └── mod.rs          # 文本语义分块器 (800-1200 字符)
│   │   ├── commands/
│   │   │   ├── mod.rs          # 命令模块入口
│   │   │   ├── ai.rs           # AI 命令: 聊天/RAG/嵌入/检索/摘要
│   │   │   ├── file.rs         # 文件命令: 笔记CRUD/文件树
│   │   │   ├── search.rs       # 搜索命令: 标题搜索/Grep/反向链接
│   │   │   ├── tag.rs          # 标签命令: 标签列表/按标签查询
│   │   │   └── vault.rs        # 仓库命令: 打开/索引
│   │   ├── db/
│   │   │   ├── mod.rs          # DB 连接管理 (WAL 模式)
│   │   │   ├── note.rs         # 笔记表 CRUD
│   │   │   ├── link.rs         # 双向链接表 CRUD
│   │   │   └── tag.rs          # 标签表 CRUD
│   │   ├── embedding/
│   │   │   └── mod.rs          # 向量存储与检索 (余弦相似度)
│   │   ├── fusion/
│   │   │   └── mod.rs          # RRF 混合检索融合排序
│   │   ├── indexer/
│   │   │   ├── mod.rs          # 索引引擎: 批量重建
│   │   │   └── markdown.rs     # Markdown 解析: Frontmatter/链接/标签提取
│   │   └── ollama/
│   │       └── mod.rs          # Ollama HTTP 客户端
│   ├── Cargo.toml              # Rust 依赖
│   ├── build.rs                # Tauri 构建脚本
│   └── icons/                  # 应用图标
├── package.json                 # Node.js 依赖和脚本
├── index.html                   # SPA 入口
├── start_dev.sh                 # 本地开发启动脚本
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## npm 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 前端开发服务器 |
| `npm run tauri dev` | 启动 Tauri 桌面应用 (开发模式) |
| `npm run tauri build` | 打包 Tauri 桌面应用 |
| `npm run build` | TypeScript 编译 + Vite 构建 |
| `npm run lint` | ESLint 代码检查 |
| `npm run typecheck` | TypeScript 类型检查 |

## 设计原则

- **本地优先 (Local First)**: 所有笔记以 `.md` 文件存储在本地文件夹，你完全拥有数据
- **编辑器中立**: 笔记是纯 Markdown 文件，可用任何编辑器打开
- **离线可用**: 核心功能完全离线，Ollama 本地模型支持离线 AI
- **隐私保护**: 数据不上传，AI API Key 仅存本地，可自主选择是否使用云服务
- **渐进增强**: 从简单笔记到知识图谱到 AI 助手，功能层层递进

## 相关项目

- [Nexus](../nexus) - 云同步与 AI 网关服务 (可选，用于多端同步)