// AI 模型适配器模块 - 适配器模式统一多模型接口
//
// 每个适配器实现 chat / chat_stream / embed / health_check 四个核心方法
//
// base.rs             - ModelAdapter 枚举 + ModelConfig 配置 + create_adapter 工厂
// ollama_adapter.rs   - Ollama 本地模型适配 (默认 http://127.0.0.1:11434)
// openai_compatible.rs - OpenAI 兼容 API 适配 (支持 OpenAI / 百炼 / 硅基流动 等)
// zhipu.rs            - 智谱 AI (GLM) 适配

pub mod base;
pub mod ollama_adapter;
pub mod openai_compatible;
pub mod zhipu;