#!/bin/bash
set -e
cd /home/zhen/works/Memoa/twine

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "  Memoa 一键部署打包"
echo "========================================="

# --- 前置检查 ---
echo ""
echo "[1/5] TypeScript 类型检查..."
npm run typecheck
echo -e "  ${GREEN}✓${NC} 类型检查通过"

# --- Rust 测试 ---
echo ""
echo "[2/5] Rust 测试..."
cd src-tauri
cargo test -- --test-threads=1
cd ..
echo -e "  ${GREEN}✓${NC} 所有测试通过"

# --- 检查 Windows 工具链 ---
echo ""
echo "[3/5] 检查工具链..."
rustup target list --installed | grep -q x86_64-pc-windows-gnu || rustup target add x86_64-pc-windows-gnu
echo -e "  ${GREEN}✓${NC} Windows 编译目标就绪"

# --- 构建 Linux ---
echo ""
echo "[4/5] 构建 Linux 安装包..."
npm run tauri:build
echo -e "  ${GREEN}✓${NC} Linux 安装包构建完成"
ls -lh src-tauri/target/release/bundle/deb/*.deb 2>/dev/null || echo "  (deb 未生成)"
ls -lh src-tauri/target/release/bundle/rpm/*.rpm 2>/dev/null || echo "  (rpm 未生成)"

# --- 构建 Windows ---
echo ""
echo "[5/5] 构建 Windows..."
WINDOWS_EXE="src-tauri/target/x86_64-pc-windows-gnu/release/twine.exe"
NSIS_DIR="src-tauri/target/release/bundle/nsis"
MSI_DIR="src-tauri/target/release/bundle/msi"

# 尝试完整打包（含 NSIS/MSI 安装包）
if npx tauri build --target x86_64-pc-windows-gnu 2>&1; then
    echo -e "  ${GREEN}✓${NC} Windows NSIS/MSI 安装包构建完成"
else
    echo -e "  ${YELLOW}⚠${NC} NSIS/MSI 打包失败（可能是网络问题），回落为便携版 exe"
    # 如果 exe 还没编译，用 --no-bundle 编译
    if [ ! -f "$WINDOWS_EXE" ]; then
        npx tauri build --target x86_64-pc-windows-gnu --no-bundle
    fi
    # 复制 exe 到 nsis 输出目录作为便携版
    mkdir -p "$NSIS_DIR"
    cp "$WINDOWS_EXE" "$NSIS_DIR/Memoa_0.1.0_x64-portable.exe"
    echo -e "  ${GREEN}✓${NC} Windows 便携版 exe 已生成"
fi

# --- 产物汇总 ---
echo ""
echo "========================================="
echo "  构建完成！产物清单："
echo "========================================="
echo ""
echo "  Linux:"
ls -lh src-tauri/target/release/bundle/deb/*.deb 2>/dev/null || echo "  (无)"
ls -lh src-tauri/target/release/bundle/rpm/*.rpm 2>/dev/null || echo "  (无)"
echo ""
echo "  Windows:"
ls -lh "$NSIS_DIR"/*.exe 2>/dev/null || echo "  (无)"
ls -lh "$MSI_DIR"/*.msi 2>/dev/null || echo "  (无)"
echo ""
echo "  Android APK 构建请使用: ./scripts/build-android.sh"
echo ""
echo "========================================="
echo "  部署打包完成"
echo "========================================="