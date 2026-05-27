<div align="center">

<img src="twine/src-tauri/icons/128x128.png" alt="Memoa Logo" width="128" height="128" />

# Memoa

**你的第二大脑 — 本地优先、AI 驱动的知识管理工具**

[![Rust](https://img.shields.io/badge/Rust-1.77+-orange.svg)](https://www.rust-lang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-purple.svg)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://react.dev)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[English](README.md) | [中文](README_zh.md)

</div>

---

## 概述

Memoa 是一款**本地优先、注重隐私的知识管理应用**，融合了 Markdown 笔记、Wiki 风格的双向链接、知识图谱可视化以及基于本地 AI 的语义搜索。所有数据都保存在你的设备上 — 无需云端，无追踪。

### ✨ 核心功能

- **📝 Markdown 编辑器** — 基于 Milkdown 的所见即所得编辑体验，支持 Frontmatter
- **🔗 双向链接** — Wiki 风格的 `[[链接]]`，连接你的笔记
- **🗺️ 知识图谱** — 交互式力导向图，可视化笔记间的关联
- **🏷️ 标签系统** — 使用 `#标签` 组织笔记，支持嵌套标签如 `#主题/子主题`
- **🔍 语义搜索** — 通过 Ollama 本地嵌入模型实现 AI 驱动的语义搜索
- **💬 AI 对话** — 与你的知识库对话 — 向你的笔记提问
- **📂 本地优先** — 所有数据以纯 Markdown 文件形式存储在本地仓库文件夹中
- **🎨 简洁界面** — 自定义标题栏、可折叠侧边栏、深色主题
- **🔒 隐私保护** — 无遥测、无云端，你的数据永不离开你的设备

### 🔧 技术栈

| 层级 | 技术 |
|------|------|
| **框架** | [Tauri 2.0](https://tauri.app)（Rust + WebView） |
| **后端** | Rust — SQLite（rusqlite）、reqwest、tokio |
| **前端** | React 18 + TypeScript |
| **编辑器** | [Milkdown](https://milkdown.dev) 7.5 |
| **状态管理** | Zustand |
| **样式** | Tailwind CSS 3.4 |
| **UI 组件** | Radix UI、Lucide React |
| **AI / 嵌入** | Ollama（nomic-embed-text） |
| **图谱** | d3-force |

### 📁 项目架构

```
Memoa/
├── twine/
│   ├── src/                          # React 前端
│   │   ├── components/
│   │   │   ├── chat/                 # AI 对话面板
│   │   │   ├── editor/               # Markdown 编辑器
│   │   │   ├── layout/               # 标题栏、窗口控制
│   │   │   └── sidebar/              # 侧边栏（文件、标签、图谱、搜索、设置、日记）
│   │   ├── hooks/                    # 自定义 React Hooks
│   │   ├── stores/                   # Zustand 状态存储
│   │   └── types/                    # TypeScript 类型定义
│   └── src-tauri/                    # Rust 后端
│       └── src/
│           ├── adapters/             # AI 模型适配器（Ollama、OpenAI 兼容、智谱）
│           ├── commands/             # Tauri 命令处理器（仓库、文件、AI、搜索）
│           ├── db/                   # SQLite 数据库层（笔记、标签、链接）
│           ├── embedding/            # 向量嵌入索引与相似度搜索
│           ├── indexer/              # Markdown 解析、分块、标签/链接提取
│           ├── ollama/               # Ollama HTTP 客户端
│           ├── config.rs             # 应用配置
│           ├── error.rs              # 错误类型与转换
│           └── lib.rs                # Tauri 初始化与命令注册
```

---

## 🚀 快速开始

### 环境要求

- **Rust** 1.77+（[rustup](https://rustup.rs)）
- **Node.js** 18+（[nodejs.org](https://nodejs.org)）
- **系统依赖**（Linux）：
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
  ```
- **Ollama**（可选，用于 AI 功能）：
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ollama pull nomic-embed-text
  ollama pull llama3.2  # 或你偏好的对话模型
  ```

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/memoa.git
cd memoa/twine

# 安装前端依赖
npm install

# 开发模式运行
npm run tauri:dev

# 生产构建
npm run tauri:build
```

### 配置

首次启动时，打开一个仓库文件夹（任意包含 Markdown 文件的目录）。配置文件存储在：

- **Linux**：`~/.config/memoa/`
- **macOS**：`~/Library/Preferences/memoa/`
- **Windows**：`%APPDATA%/memoa/`

AI 模型配置存储在仓库内的 `data/config/llm.json`。

---

## 🧪 测试

### Rust 后端测试

```bash
cd twine/src-tauri
cargo test
```

后端包含全面的单元测试，覆盖：
- 错误处理与序列化
- 余弦相似度与向量索引
- Markdown 解析（Wiki 链接、标签、Frontmatter 提取）
- AI 模型适配器配置
- Ollama 客户端构建
- 应用配置工具函数

### 前端

```bash
cd twine
npm run typecheck    # TypeScript 类型检查
npm run lint         # ESLint 代码检查
```

---

## 🤝 参与贡献

欢迎贡献！请随时提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feature/amazing-feature`）
3. 提交你的更改（`git commit -m '添加某个很棒的功能'`）
4. 推送到分支（`git push origin feature/amazing-feature`）
5. 创建一个 Pull Request

---

## 📄 许可证

本项目使用 MIT 许可证 — 详情请参阅 [LICENSE](LICENSE) 文件。

---

## 🙏 致谢

- [Tauri](https://tauri.app) — 跨平台桌面应用框架
- [Milkdown](https://milkdown.dev) — 所见即所得的 Markdown 编辑器框架
- [Ollama](https://ollama.com) — 本地 LLM 运行时
- [Tailwind CSS](https://tailwindcss.com) — 实用优先的 CSS 框架
- [Radix UI](https://www.radix-ui.com) — 无障碍 React 组件原语
- [Zustand](https://github.com/pmndrs/zustand) — 状态管理

---

<div align="center">
  <sub>由 Memoa 团队用 ❤️ 构建</sub>
</div>