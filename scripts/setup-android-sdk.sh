#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/.local/share/android-sdk}"
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-12334624_latest.zip"
NDK_VERSION="27.0.12077973"

echo "========================================="
echo "  Memoa Android SDK 环境安装"
echo "========================================="

# 1. 安装 Java (JDK 17+)
echo ""
echo "[1/6] 检查 Java..."
if ! command -v java &> /dev/null; then
    echo -e "  ${YELLOW}⚠${NC} Java 未安装，正在安装 OpenJDK 17..."
    sudo apt update && sudo apt install -y openjdk-17-jdk-headless
fi
echo -e "  ${GREEN}✓${NC} $(java -version 2>&1 | head -1)"

# 2. 安装 Python
echo ""
echo "[2/6] 检查 Python..."
if ! command -v python3 &> /dev/null; then
    sudo apt install -y python3
fi
echo -e "  ${GREEN}✓${NC} $(python3 --version)"

# 3. 安装 Android SDK Command-line Tools
echo ""
echo "[3/6] 安装 Android SDK..."
if [ ! -d "$ANDROID_SDK_ROOT/cmdline-tools" ]; then
    echo "  下载 Android Command-line Tools..."
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    wget -q --show-progress "$CMDLINE_TOOLS_URL" -O cmdline-tools.zip
    mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"
    unzip -qo cmdline-tools.zip -d "$ANDROID_SDK_ROOT/cmdline-tools/"
    mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest"
    cd /
    rm -rf "$TEMP_DIR"
    echo -e "  ${GREEN}✓${NC} Android SDK 安装完成: $ANDROID_SDK_ROOT"
else
    echo -e "  ${GREEN}✓${NC} Android SDK 已安装"
fi

# 4. 设置环境变量
echo ""
echo "[4/6] 配置环境变量..."
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

# 5. 安装 SDK 组件
echo ""
echo "[5/6] 安装 SDK 组件（platforms、build-tools、NDK）..."
yes | sdkmanager --sdk_root="$ANDROID_SDK_ROOT" \
    "platforms;android-36" \
    "build-tools;36.0.0" \
    "ndk;$NDK_VERSION" \
    "platform-tools" \
    "cmdline-tools;latest"

echo -e "  ${GREEN}✓${NC} SDK 组件安装完成"

# 6. 安装 Rust Android 目标
echo ""
echo "[6/6] 安装 Rust Android 编译目标..."
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
echo -e "  ${GREEN}✓${NC} Rust Android 目标安装完成"

# 写入环境变量到 .bashrc
echo ""
echo "  写入环境变量到 ~/.bashrc..."
BASHRC="$HOME/.bashrc"
ENV_BLOCK="# ----- Memoa Android SDK 环境变量 -----"

if ! grep -q "$ENV_BLOCK" "$BASHRC"; then
    cat >> "$BASHRC" << EOF

$ENV_BLOCK
export ANDROID_SDK_ROOT="$ANDROID_SDK_ROOT"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export ANDROID_NDK_HOME="$ANDROID_SDK_ROOT/ndk/$NDK_VERSION"
export NDK_HOME="$ANDROID_NDK_HOME"
export PATH="\$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:\$ANDROID_SDK_ROOT/platform-tools:\$PATH"
EOF
    echo -e "  ${GREEN}✓${NC} 环境变量已写入 ~/.bashrc"
    echo "  请执行 source ~/.bashrc 使其生效"
else
    echo -e "  ${GREEN}✓${NC} 环境变量已存在"
fi

echo ""
echo "========================================="
echo "  Android SDK 环境安装完成！"
echo "========================================="
echo ""
echo "  执行以下命令生效环境变量："
echo "    source ~/.bashrc"
echo ""
echo "  然后初始化 Tauri Android 项目："
echo "    cd /home/zhen/works/Memoa/twine"
echo "    npx tauri android init"
echo ""
echo "  构建 APK："
echo "    ./scripts/build-android.sh"
echo "========================================="