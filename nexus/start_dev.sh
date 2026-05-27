#!/usr/bin/env bash
# =============================================================================
# Nexus 本地开发启动脚本
#
# 用法:
#   bash start_dev.sh              # 编译并启动
#   bash start_dev.sh --release    # release 模式编译并启动
#   bash start_dev.sh --watch      # 监听模式 (需要 cargo-watch: cargo install cargo-watch)
#
# 环境变量:
#   见 .env.example 文件
#   生产环境务必修改 NEXUS_JWT_SECRET
# =============================================================================

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p data/files 2>/dev/null || true

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "==> 创建 .env 文件 (从 .env.example 复制)"
        cp .env.example .env
        echo "==> 提示: 生产环境请修改 .env 中的 NEXUS_JWT_SECRET"
    fi
fi

export NEXUS_HOST="${NEXUS_HOST:-127.0.0.1}"
export NEXUS_PORT="${NEXUS_PORT:-3721}"
export NEXUS_DB_PATH="${NEXUS_DB_PATH:-data/nexus.db}"

MODE="${1:-debug}"

case "$MODE" in
    --release|-r)
        echo "==> Release 模式编译并启动..."
        cargo build --release
        echo "==> Nexus 启动在 http://${NEXUS_HOST}:${NEXUS_PORT}"
        exec ./target/release/nexus
        ;;
    --watch|-w)
        if ! command -v cargo-watch > /dev/null 2>&1; then
            echo "==> 安装 cargo-watch..."
            cargo install cargo-watch
        fi
        echo "==> Watch 模式启动 (热重载)..."
        exec cargo watch -x run
        ;;
    *)
        echo "==> Debug 模式编译并启动..."
        cargo build
        echo "==> Nexus 启动在 http://${NEXUS_HOST}:${NEXUS_PORT}"
        exec ./target/debug/nexus
        ;;
esac