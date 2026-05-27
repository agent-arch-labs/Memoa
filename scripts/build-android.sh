#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "  ${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "  ${GREEN}[OK]${NC}   $*"; }
log_warn()  { echo -e "  ${YELLOW}[WARN]${NC} $*"; }
log_err()   { echo -e "  ${RED}[ERR]${NC}  $*"; }
log_step()  { echo -e "\n${BOLD}${MAGENTA}--- $* ---${NC}"; }
log_header(){ echo -e "\n${CYAN}${BOLD}[$1]${NC} $2"; }

NOW=$(date '+%Y-%m-%d %H:%M:%S')

echo ""
echo "========================================="
echo "  Memoa Android APK 构建"
echo "  $NOW"
echo "========================================="

PROJECT_ROOT="/home/zhen/works/Memoa/twine"
SRC_TAURI="$PROJECT_ROOT/src-tauri"
ANDROID_DIR="$SRC_TAURI/gen/android"
APK_OUTPUT_DIR="/home/zhen/works/Memoa/release/android"

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/home/zhen/.local/share/android-sdk}"
ANDROID_HOME="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk/27.0.12077973}"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"

ANDROID_TARGET="aarch64-linux-android"
NDK_ARCH="arm64-v8a"
BUILD_START=$(date +%s)

# =============================================
# 1. 环境检查
# =============================================
log_header "1/4" "环境检查"

log_step "检查 ANDROID_SDK_ROOT"
if [ ! -d "$ANDROID_SDK_ROOT" ]; then
    log_err "ANDROID_SDK_ROOT 不存在: $ANDROID_SDK_ROOT"
    log_info "请先运行 scripts/setup-android-sdk.sh 安装 Android SDK"
    exit 1
fi
log_ok "ANDROID_SDK_ROOT = $ANDROID_SDK_ROOT"
log_info "  platforms: $(ls "$ANDROID_SDK_ROOT/platforms/" 2>/dev/null | tr '\n' ' '  || echo '(无)')"
log_info "  build-tools: $(ls "$ANDROID_SDK_ROOT/build-tools/" 2>/dev/null | tr '\n' ' ' || echo '(无)')"

log_step "检查 ANDROID_NDK_HOME"
if [ ! -d "$ANDROID_NDK_HOME" ]; then
    log_err "ANDROID_NDK_HOME 不存在: $ANDROID_NDK_HOME"
    exit 1
fi
NDK_VER=$(grep -oP 'Pkg\.Revision = \K.*' "$ANDROID_NDK_HOME/source.properties" 2>/dev/null || echo "unknown")
log_ok "ANDROID_NDK_HOME = $ANDROID_NDK_HOME (version $NDK_VER)"

log_step "检查 JAVA_HOME"
if [ ! -d "$JAVA_HOME" ]; then
    log_err "JAVA_HOME 不存在: $JAVA_HOME"
    exit 1
fi
JAVA_VER=$("$JAVA_HOME/bin/java" -version 2>&1 | head -1)
log_ok "JAVA_HOME = $JAVA_HOME ($JAVA_VER)"

log_step "检查 Rust 工具链"
if ! command -v rustup &> /dev/null; then
    log_err "rustup 未安装"
    exit 1
fi
RUST_VER=$(rustc --version 2>/dev/null || echo "unknown")
log_ok "rustc: $RUST_VER"
log_info "CARGO_HOME: ${CARGO_HOME:-$HOME/.cargo}"

if ! rustup target list --installed 2>/dev/null | grep -q "$ANDROID_TARGET"; then
    log_warn "缺少 Rust Android 目标: $ANDROID_TARGET，正在安装..."
    rustup target add "$ANDROID_TARGET"
    log_ok "$ANDROID_TARGET 目标已安装"
else
    log_ok "Rust 目标 $ANDROID_TARGET 已安装"
fi

INSTALLED_TARGETS=$(rustup target list --installed 2>/dev/null | tr '\n' ' ')
log_info "已安装的 Rust 目标: $INSTALLED_TARGETS"

log_step "检查 Node.js / npm"
NODE_VER=$(node --version 2>/dev/null || echo "未安装")
NPM_VER=$(npm --version 2>/dev/null || echo "未安装")
log_info "node: $NODE_VER, npm: $NPM_VER"

log_step "检查 NDK 链接器"
NDK_TOOLCHAIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"
CC_PATH="$NDK_TOOLCHAIN/aarch64-linux-android26-clang"
if [ ! -f "$CC_PATH" ]; then
    log_err "NDK 链接器不存在: $CC_PATH"
    log_info "请确认 NDK 安装完整（工具链路径: $NDK_TOOLCHAIN）"
    ls "$NDK_TOOLCHAIN/" 2>/dev/null | head -5 || log_err "  工具链目录为空或不存在"
    exit 1
fi
log_ok "CC 链接器就绪: $CC_PATH"

log_ok "环境检查全部通过"

# =============================================
# 2. 签名 keystore 准备
# =============================================
log_header "2/4" "签名 keystore 准备"

KEYSTORE_JKS="$ANDROID_DIR/keystore/memoa-release.jks"
KEYSTORE_PROPERTIES="$ANDROID_DIR/keystore/keystore.properties"

if [ ! -f "$KEYSTORE_JKS" ]; then
    log_warn "未找到签名 keystore，正在生成..."
    mkdir -p "$(dirname "$KEYSTORE_JKS")"
    log_info "  keyalg: RSA 2048, 别名: memoa, 有效期: 36500天"
    keytool -genkey -v \
        -keystore "$KEYSTORE_JKS" \
        -keyalg RSA -keysize 2048 -validity 36500 \
        -alias memoa \
        -storepass memoa123 \
        -keypass memoa123 \
        -dname "CN=Memoa, OU=Dev, O=Memoa, L=Beijing, ST=Beijing, C=CN" 2>&1
    cat > "$KEYSTORE_PROPERTIES" << PROPEOF
storeFile=keystore/memoa-release.jks
storePassword=memoa123
keyAlias=memoa
keyPassword=memoa123
PROPEOF
    log_ok "Keystore 已生成: $KEYSTORE_JKS"
    log_info "keystore.properties 已生成: $KEYSTORE_PROPERTIES"
else
    log_ok "Keystore 已存在: $KEYSTORE_JKS"
fi

log_info "Keystore 大小: $(du -h "$KEYSTORE_JKS" | cut -f1)"

# =============================================
# 3. 配置 Android 项目
# =============================================
log_header "3/4" "配置 Android 项目"

log_step "检查 Android 项目结构"
if [ ! -f "$ANDROID_DIR/app/src/main/AndroidManifest.xml" ]; then
    log_warn "Android 项目未初始化，正在初始化..."
    cd "$PROJECT_ROOT"
    npx tauri android init 2>&1 | while IFS= read -r line; do
        echo "         $line"
    done
    log_ok "Android 项目初始化完成"
else
    log_ok "Android 项目已存在: $ANDROID_DIR"
fi

log_step "配置 local.properties"
cat > "$ANDROID_DIR/local.properties" << ANDEOF
sdk.dir=$ANDROID_SDK_ROOT
ANDEOF
log_ok "local.properties 已配置 (sdk.dir=$ANDROID_SDK_ROOT)"

log_step "验证项目关键文件"
for f in \
    "$ANDROID_DIR/app/build.gradle.kts" \
    "$ANDROID_DIR/gradle.properties" \
    "$ANDROID_DIR/buildSrc/src/main/java/com/memoa/twine/kotlin/BuildTask.kt"
do
    if [ -f "$f" ]; then
        log_ok "$(basename "$(dirname "$f")")/$(basename "$f")"
    else
        log_warn "缺少文件: $f"
    fi
done

log_step "检查 gradle.properties 签名配置"
SIGNING_CONF=$(grep "enableV1Signing\|enableV2Signing" "$ANDROID_DIR/app/build.gradle.kts" 2>/dev/null || echo "")
if [ -n "$SIGNING_CONF" ]; then
    log_ok "签名配置已就绪 (v1+v2)"
else
    log_warn "未检测到 enableV1Signing/enableV2Signing 配置，APK 可能未签名"
fi

JVM_ARGS=$(grep "jvmargs" "$ANDROID_DIR/gradle.properties" 2>/dev/null || echo "")
if echo "$JVM_ARGS" | grep -q "urandom"; then
    log_ok "JVM 熵值参数已配置 (urandom)"
else
    log_warn "JVM 未配置 urandom，熵不足时签名可能挂起"
fi

# =============================================
# 4. Tauri Android 构建
# =============================================
log_header "4/4" "Tauri Android 构建"

export ANDROID_SDK_ROOT
export ANDROID_HOME
export ANDROID_NDK_HOME
export JAVA_HOME
export CC_aarch64_linux_android="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android26-clang"
export AR_aarch64_linux_android="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-ar"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android26-clang"

log_info "构建命令: npx tauri android build --target aarch64"
log_info "前端目录: $PROJECT_ROOT/dist"
log_info "so 输出: $SRC_TAURI/target/aarch64-linux-android/release/libtwine_lib.so"
log_info "APK 输出: $ANDROID_DIR/app/build/outputs/apk/universal/release/"
echo ""

STEP4_START=$(date +%s)
cd "$PROJECT_ROOT"
npx tauri android build --target aarch64 2>&1 | while IFS= read -r line; do
    if echo "$line" | grep -qiE "error|fail|panic|abort"; then
        echo -e "  ${RED}$line${NC}"
    elif echo "$line" | grep -qiE "warning"; then
        echo -e "  ${YELLOW}$line${NC}"
    elif echo "$line" | grep -qiE "finish|success|completed|✓"; then
        echo -e "  ${GREEN}$line${NC}"
    else
        echo "  $line"
    fi
done
STEP4_ELAPSED=$(( $(date +%s) - STEP4_START ))
log_ok "Tauri Android 构建完成 (耗时 ${STEP4_ELAPSED}s)"

# =============================================
# 产物验证
# =============================================
log_step "产物验证"

APK_SRC="$ANDROID_DIR/app/build/outputs/apk/universal/release/app-universal-release.apk"

if [ ! -f "$APK_SRC" ]; then
    log_err "未找到 APK: $APK_SRC"
    log_info "尝试搜索可能的 APK 位置..."
    find "$ANDROID_DIR/app/build/outputs" -name "*.apk" 2>/dev/null | while read -r apk; do
        log_info "  发现: $apk"
    done
    exit 1
fi

APK_SIZE=$(du -h "$APK_SRC" | cut -f1)
log_ok "APK 已生成: $APK_SRC ($APK_SIZE)"

log_step "检查 APK 内容"
log_info "完整文件列表（非 META-INF）："
unzip -l "$APK_SRC" 2>/dev/null | grep -v "META-INF\|------\|^$" | awk '{print "    "$4" ("$1" bytes)"}' | head -30

echo ""
log_step "关键组件检查"

# 前端资源
if unzip -l "$APK_SRC" 2>/dev/null | grep -q "index.html"; then
    log_ok "前端资源: index.html 已包含"
    HTML_COUNT=$(unzip -l "$APK_SRC" 2>/dev/null | grep -c "\.html$" || echo 0)
    CSS_COUNT=$(unzip -l "$APK_SRC" 2>/dev/null | grep -c "\.css$" || echo 0)
    JS_COUNT=$(unzip -l "$APK_SRC" 2>/dev/null | grep -c "\.js$" || echo 0)
    log_info "  HTML: $HTML_COUNT 个, CSS: $CSS_COUNT 个, JS: $JS_COUNT 个"
else
    log_err "前端资源: index.html 缺失！APK 打开会闪退！"
fi

# Native 库
if unzip -l "$APK_SRC" 2>/dev/null | grep -q "lib/"; then
    SO_COUNT=$(unzip -l "$APK_SRC" 2>/dev/null | grep "lib/" | grep -c "\.so" || echo 0)
    log_ok "Native 库: $SO_COUNT 个 .so 文件"
    unzip -l "$APK_SRC" 2>/dev/null | grep "lib/" | grep "\.so" | awk '{print "    "$4" ("$1" bytes)"}'
else
    log_err "Native 库: 未找到 lib/ 下的 .so 文件！"
fi

# 签名
if unzip -l "$APK_SRC" 2>/dev/null | grep -q "META-INF/.*\.RSA"; then
    log_ok "签名: v1 JAR 签名已检测到"
    unzip -l "$APK_SRC" 2>/dev/null | grep "META-INF.*RSA\|META-INF.*SF" | awk '{print "    "$4" ("$1" bytes)"}'
else
    log_err "签名: META-INF 中未找到 RSA 签名文件！APK 无法安装！"
fi

# v2 签名检查
python3 -c "
import os
apk = '$APK_SRC'
sz = os.path.getsize(apk)
with open(apk, 'rb') as f:
    f.seek(max(0, sz-200))
    tail = f.read(200)
    if b'APK Sig Block 42' in tail:
        print('\x1b[32m  [OK]   v2/v3 APK 签名块: 已检测到\x1b[0m')
    else:
        print('\x1b[33m  [WARN] v2/v3 APK 签名块: 未检测到 (v1-only，minSdk=24 仍可安装)\x1b[0m')
" 2>/dev/null || log_warn "无法执行 v2 签名检查 (python3 不可用)"

# AndroidManifest
if unzip -l "$APK_SRC" 2>/dev/null | grep -q "AndroidManifest.xml"; then
    log_ok "AndroidManifest.xml 已包含"
else
    log_err "AndroidManifest.xml 缺失！"
fi

# 收集构建产物
echo ""
log_step "收集构建产物"
mkdir -p "$APK_OUTPUT_DIR"
rm -f "$APK_OUTPUT_DIR"/*.apk
cp "$APK_SRC" "$APK_OUTPUT_DIR/app-universal-release.apk"
log_ok "已复制到: $APK_OUTPUT_DIR/app-universal-release.apk ($APK_SIZE)"

# =============================================
# 构建完成
# =============================================
BUILD_END=$(date +%s)
TOTAL_ELAPSED=$((BUILD_END - BUILD_START))
MINUTES=$((TOTAL_ELAPSED / 60))
SECONDS=$((TOTAL_ELAPSED % 60))

echo ""
echo "========================================="
echo "  Android APK 构建完成"
echo "========================================="
echo ""
log_ok "产物: $APK_OUTPUT_DIR/app-universal-release.apk ($APK_SIZE)"
log_info "总耗时: ${MINUTES}分${SECONDS}秒"
echo ""
echo "  文件列表:"
ls -lh "$APK_OUTPUT_DIR/"*.apk 2>/dev/null | awk '{print "    "$NF" ("$5")"}'
echo ""
echo "  安装到设备:"
echo "    adb install $APK_OUTPUT_DIR/app-universal-release.apk"
echo ""
echo "========================================="