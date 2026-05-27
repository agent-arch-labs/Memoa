#!/usr/bin/env bash
# =============================================================================
# Twine (Memoa) 本地开发启动脚本
#
# 用法:
#   bash start_dev.sh              # 开发模式 (前端 + Tauri Dev)
#   bash start_dev.sh --frontend   # 仅启动前端 Vite Dev Server
#   bash start_dev.sh --tauri      # 仅启动 Tauri App (需要先 build 前端)
#   bash start_dev.sh --build      # 构建前端 + Tauri Release Build
#   bash start_dev.sh --help       # 查看帮助
#
# 前置条件:
#   - Node.js >= 18
#   - Rust >= 1.77
#   - 系统依赖: libwebkit2gtk-4.1-dev (Linux), Xcode (macOS)
#
# 可选:
#   - Ollama (用于本地 AI): https://ollama.com
# =============================================================================

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

show_help() {
    echo "Twine (Memoa) 本地开发启动脚本"
    echo ""
    echo "用法:"
    echo "  bash start_dev.sh              默认: 检查依赖 + 安装 npm + Tauri Dev"
    echo "  bash start_dev.sh --frontend   仅启动前端 Vite Dev Server (http://localhost:1420)"
    echo "  bash start_dev.sh --tauri      仅启动 Tauri App (需要先 build 前端)"
    echo "  bash start_dev.sh --build      构建前端 + Tauri Release 打包"
    echo "  bash start_dev.sh --help       显示此帮助"
    echo ""
    echo "环境变量:"
    echo "  OLLAMA_HOST                    Ollama 服务地址 (默认 http://127.0.0.1:11434)"
    echo ""
    echo "前置条件:"
    echo "  Node.js >= 18, Rust >= 1.77"
    echo "  Linux: sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev"
    echo "  macOS: Xcode Command Line Tools"
}

check_deps() {
    if ! command -v node > /dev/null 2>&1; then
        echo "错误: 未找到 Node.js，请安装 Node.js >= 18"
        echo "  https://nodejs.org/"
        exit 1
    fi

    if ! command -v cargo > /dev/null 2>&1; then
        echo "错误: 未找到 Rust，请安装 Rust >= 1.77"
        echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        exit 1
    fi

    echo "==> Node.js: $(node --version)"
    echo "==> Rust: $(rustc --version)"
    echo "==> Cargo: $(cargo --version)"
}

install_deps() {
    if [ ! -d "node_modules" ]; then
        echo "==> 安装 npm 依赖..."
        npm install
    fi
}

MODE="${1:-default}"

case "$MODE" in
    --help|-h)
        show_help
        exit 0
        ;;
    --frontend)
        check_deps
        install_deps
        echo "==> 启动前端 Vite Dev Server (http://localhost:1420)"
        exec npm run dev
        ;;
    --tauri)
        check_deps
        install_deps
        echo "==> 仅启动 Tauri App..."
        exec npm run tauri dev
        ;;
    --build)
        check_deps
        install_deps
        echo "==> 构建前端..."
        npm run build
        echo "==> Tauri Release 打包..."
        exec npm run tauri build
        ;;
    default)
        check_deps
        install_deps

        if command -v ollama > /dev/null 2>&1; then
            echo "==> 检测到 Ollama，如需离线 AI 确保 Ollama 正在运行"
        else
            echo "==> 提示: 未检测到 Ollama。如需本地 AI 功能，请安装:"
            echo "    curl -fsSL https://ollama.com/install.sh | sh"
            echo "    ollama pull llama3.2:3b"
        fi

        echo "==> 启动 Tauri 开发模式 (前端 + 后端)..."
        exec npm run tauri dev
        ;;
esac