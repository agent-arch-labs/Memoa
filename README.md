<div align="center">

<img src="twine/src-tauri/icons/128x128.png" alt="Memoa Logo" width="128" height="128" />

# Memoa

**Your Second Brain — A Local-First, AI-Powered Knowledge Management Tool**

[![Rust](https://img.shields.io/badge/Rust-1.77+-orange.svg)](https://www.rust-lang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-purple.svg)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://react.dev)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[English](README.md) | [中文](README_zh.md)

</div>

---

## Overview

Memoa is a **local-first, privacy-focused knowledge management application** that combines the power of markdown notes, wiki-style bidirectional links, knowledge graph visualization, and local AI-powered semantic search. All data stays on your device — no cloud, no tracking.

### ✨ Key Features

- **📝 Markdown Editor** — Rich WYSIWYG editing powered by Milkdown, with frontmatter support
- **🔗 Bidirectional Links** — Wiki-style `[[links]]` to connect your notes
- **🗺️ Knowledge Graph** — Interactive force-directed graph visualizing your note connections
- **🏷️ Tag System** — Organize notes with `#tags`, including nested tags like `#topic/subtopic`
- **🔍 Semantic Search** — AI-powered search using local embedding models via Ollama
- **💬 AI Chat** — Chat with your knowledge base — ask questions about your notes
- **📂 Local-First** — All data stored locally in your vault folder as plain markdown files
- **🎨 Clean UI** — Custom title bar, collapsible sidebar, dark theme
- **🔒 Privacy** — No telemetry, no cloud, your data never leaves your device

### 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | [Tauri 2.0](https://tauri.app) (Rust + WebView) |
| **Backend** | Rust — SQLite (rusqlite), reqwest, tokio |
| **Frontend** | React 18 + TypeScript |
| **Editor** | [Milkdown](https://milkdown.dev) 7.5 |
| **State** | Zustand |
| **Styling** | Tailwind CSS 3.4 |
| **UI Components** | Radix UI, Lucide React |
| **AI / Embedding** | Ollama (nomic-embed-text) |
| **Graph** | d3-force |

### 📁 Architecture

```
Memoa/
├── twine/
│   ├── src/                          # React frontend
│   │   ├── components/
│   │   │   ├── chat/                 # AI chat panel
│   │   │   ├── editor/               # Markdown editor
│   │   │   ├── layout/               # Title bar, window controls
│   │   │   └── sidebar/              # Sidebar (files, tags, graph, search, settings, daily)
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── stores/                   # Zustand state stores
│   │   └── types/                    # TypeScript type definitions
│   └── src-tauri/                    # Rust backend
│       └── src/
│           ├── adapters/             # AI model adapters (Ollama, OpenAI-compatible, Zhipu)
│           ├── commands/             # Tauri command handlers (vault, files, AI, search)
│           ├── db/                   # SQLite database layer (notes, tags, links)
│           ├── embedding/            # Vector embedding indexing and similarity search
│           ├── indexer/              # Markdown parsing, chunking, tag/link extraction
│           ├── ollama/               # Ollama HTTP client
│           ├── config.rs             # Application configuration
│           ├── error.rs              # Error types and conversions
│           └── lib.rs                # Tauri setup and command registration
```

---

## 🚀 Getting Started

### Prerequisites

- **Rust** 1.77+ ([rustup](https://rustup.rs))
- **Node.js** 18+ ([nodejs.org](https://nodejs.org))
- **System dependencies** (Linux):
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
  ```
- **Ollama** (optional, for AI features):
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ollama pull nomic-embed-text
  ollama pull llama3.2  # or your preferred chat model
  ```

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/memoa.git
cd memoa/twine

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build for production
npm run tauri:build
```

### Configuration

On first launch, open a vault folder (any directory containing markdown files). Configuration is stored in:

- **Linux**: `~/.config/memoa/`
- **macOS**: `~/Library/Preferences/memoa/`
- **Windows**: `%APPDATA%/memoa/`

AI model configuration is stored at `data/config/llm.json` within your vault.

---

## 🧪 Testing

### Rust Backend Tests

```bash
cd twine/src-tauri
cargo test
```

The backend includes comprehensive unit tests covering:
- Error handling and serialization
- Cosine similarity and vector indexing
- Markdown parsing (wiki links, tags, frontmatter extraction)
- AI model adapter configuration
- Ollama client construction
- Application configuration utilities

### Frontend

```bash
cd twine
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint linting
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

- [Tauri](https://tauri.app) — The cross-platform desktop app framework
- [Milkdown](https://milkdown.dev) — The WYSIWYG markdown editor framework
- [Ollama](https://ollama.com) — Local LLM runtime
- [Tailwind CSS](https://tailwindcss.com) — Utility-first CSS framework
- [Radix UI](https://www.radix-ui.com) — Accessible React component primitives
- [Zustand](https://github.com/pmndrs/zustand) — State management

---

<div align="center">
  <sub>Built with ❤️ by the Memoa Team</sub>
</div>