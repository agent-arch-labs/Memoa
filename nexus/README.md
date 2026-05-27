# Nexus - Memoa 云同步与 AI 网关服务

Nexus 是 Memoa 的云端服务，提供 **认证、同步中心、AI 网关** 三大核心能力。

## 核心功能

| 模块 | 功能 | 描述 |
|------|------|------|
| **Auth** | 用户认证 | 注册/登录、JWT 令牌签发与验证、Argon2 密码哈希 |
| **Sync Hub** | 文件同步 | 多仓库管理、文件清单拉取、上传/下载、逻辑删除 |
| **AI Gateway** | AI 代理 | 多模型路由、流式 SSE 代理、嵌入代理、Token Bucket 限流 |

## 技术栈

- **语言**: Rust (Axum 0.7 框架)
- **数据库**: SQLite (WAL 模式)
- **认证**: JWT (HS256) + Argon2
- **存储**: 本地文件系统 / S3 兼容对象存储 (MinIO, OSS, COS)
- **HTTP 客户端**: reqwest
- **日志**: tracing + tracing-subscriber

## 快速开始

### 环境要求

- Rust 1.77+
- SQLite 3

### 本地启动

```bash
cd nexus

# 方式1: 使用脚本 (推荐)
./start_dev.sh

# 方式2: 手动编译运行
cp .env.example .env   # 首次需要, 修改 JWT_SECRET
cargo run

# 方式3: Release 模式
./start_dev.sh --release

# 方式4: 热重载开发 (需要 cargo-watch)
./start_dev.sh --watch
```

服务默认监听 `http://127.0.0.1:3721`

### Docker 部署

```bash
docker compose up -d
```

### 健康检查

```bash
curl http://127.0.0.1:3721/api/v1/health
# {"status":"ok","service":"nexus","version":"0.1.0"}
```

## API 文档

### 公共接口 (无需认证)

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/health` | 健康检查 |
| `POST` | `/api/v1/auth/register` | 用户注册 `{"email":"...","password":"..."}` |
| `POST` | `/api/v1/auth/login` | 用户登录，返回 JWT Token |

### 同步接口 (需要 Bearer Token)

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/sync/vaults` | 列出用户所有仓库 |
| `POST` | `/api/v1/sync/vaults` | 创建仓库 `{"name":"..."}` |
| `GET` | `/api/v1/sync/vaults/:id/manifest` | 获取文件清单 (hash + size + 时间) |
| `POST` | `/api/v1/sync/vaults/:id/upload?file_path=...` | 上传文件 (multipart/form-data) |
| `GET` | `/api/v1/sync/vaults/:id/files?file_path=...` | 下载文件 |
| `DELETE` | `/api/v1/sync/vaults/:id/files?file_path=...` | 逻辑删除文件 (tombstone) |

### AI 网关接口 (需要 Bearer Token, OpenAI 兼容)

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/chat/completions` | 聊天补全 (支持 `stream: true`) |
| `POST` | `/v1/embeddings` | 文本嵌入 |
| `GET` | `/v1/models` | 列出可用模型 |

## 配置说明

所有配置通过环境变量管理，详见 `.env.example`。

### 关键环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NEXUS_HOST` | `127.0.0.1` | 监听地址 |
| `NEXUS_PORT` | `3721` | 监听端口 |
| `NEXUS_DB_PATH` | `data/nexus.db` | SQLite 数据库路径 |
| `NEXUS_JWT_SECRET` | **生产必须修改** | JWT 签名密钥 |
| `NEXUS_TOKEN_EXPIRY_HOURS` | `720` | JWT 过期时间 (30天) |
| `NEXUS_STORAGE_TYPE` | `local` | 存储类型: `local` / `s3` |
| `NEXUS_GATEWAY_ENABLED` | `true` | 是否启用 AI 网关 |
| `NEXUS_GATEWAY_RATE_LIMIT` | `30` | 每用户每分钟请求限制 |
| `NEXUS_UPSTREAM_MODELS` | JSON数组 | 上游模型配置 |

### AI 网关模型配置示例

```bash
# 方式1: 通过 JSON 配置
export NEXUS_UPSTREAM_MODELS='[
  {"name":"gpt-4o","base_url":"https://api.openai.com","api_key_env":"NEXUS_API_KEY_OPENAI","provider":"openai"}
]'

# 方式2: 通过 NEXUS_API_KEY_ 前缀注入 API Key
export NEXUS_API_KEY_OPENAI=sk-xxxxx
export OPENAI_API_KEY=sk-xxxxx  # 也可以直接用上游环境变量名
```

## 项目结构

```
nexus/
├── src/
│   ├── main.rs          # 入口: 初始化日志/配置/DB/服务器
│   ├── lib.rs           # 核心库: AppState, 模块注册
│   ├── config.rs        # 配置管理: 环境变量解析
│   ├── error.rs         # 统一错误处理: AppError + IntoResponse
│   ├── auth/
│   │   └── mod.rs       # 认证: JWT/Argon2/中间件
│   ├── db/
│   │   ├── mod.rs       # DB 连接管理 (WAL 模式)
│   │   ├── user.rs      # 用户表 CRUD
│   │   ├── vault.rs     # 仓库 + 文件表 CRUD
│   │   └── device.rs    # 设备表 CRUD
│   ├── sync/
│   │   ├── mod.rs       # 同步 Handler: manifest/upload/download/delete
│   │   ├── storage.rs   # 存储层: 本地/S3
│   │   └── manifest.rs  # 路径安全校验
│   ├── gateway/
│   │   └── mod.rs       # AI 网关: 路由/限流/流式代理
│   └── routes/
│       └── mod.rs       # 路由组装: public/sync/gateway
├── tests/
│   ├── common/mod.rs    # 测试工具函数
│   └── integration_test.rs  # 集成测试 (11个用例)
├── .env.example         # 环境变量模板
├── Dockerfile           # 多阶段构建
├── docker-compose.yml   # 一键部署
├── start_dev.sh         # 本地开发启动脚本
└── Cargo.toml
```

## 设计原则

- **本地优先 (Local First)**: 用户本地 Markdown 文件为真理源，云端仅做同步中转
- **安全性**: 所有同步/网关接口需要 JWT 认证，API Key 仅存服务端
- **可扩展**: 分阶段演进 (文件同步 → 块级CRDT → 实时推送 → 协作)

## 测试

```bash
cargo test
# 11 个集成测试覆盖: 用户注册、密码哈希、JWT签发验证、仓库CRUD、
# 文件清单、设备注册、存储哈希、路径校验、限流器、配置加载
```