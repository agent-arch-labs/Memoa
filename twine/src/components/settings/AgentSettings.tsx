import { useState, useEffect } from "react";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import type { AgentStatus, AgentToolInfo } from "@/types";
import { IconLightning, IconSearch } from "@/components/common/Icons";

const ULTRA_RAG_ROOT = "/home/zhen/works/Memoa/UltraRAG";
const MEMOA_ROOT = "/home/zhen/works/Memoa";

function defaultPythonCmd(): string {
  return "python3";
}

function defaultAgentArgs(): string {
  return `${MEMOA_ROOT}/scripts/ultrarag_mcp_server.py`;
}

export function AgentSettings() {
  const commands = useTauriCommands();
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [tools, setTools] = useState<AgentToolInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pythonCmd, setPythonCmd] = useState(defaultPythonCmd);
  const [agentArgs, setAgentArgs] = useState(defaultAgentArgs);
  const [testQuery, setTestQuery] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const s = await commands.agentStatus();
      setStatus(s);
    } catch (e) {
      console.error("获取 Agent 状态失败", e);
    }
  }

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const s = await commands.agentStart(pythonCmd, agentArgs.split(/\s+/).filter(Boolean));
      setStatus(s);
      await handleListTools();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setLoading(true);
    setError(null);
    try {
      const s = await commands.agentStop();
      setStatus(s);
      setTools([]);
      setTestResult(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleListTools() {
    try {
      const toolList = await commands.agentListTools();
      setTools(toolList);
    } catch (e) {
      console.error("获取工具列表失败", e);
    }
  }

  async function handleDeepResearch() {
    if (!testQuery.trim()) return;
    setLoading(true);
    setTestResult(null);
    try {
      const result = await commands.agentDeepResearch(testQuery);
      setTestResult(JSON.stringify(result, null, 2));
    } catch (e) {
      setTestResult(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunTestWorkflow() {
    setLoading(true);
    setTestResult(null);
    try {
      const wf = {
        name: "test_rag",
        nodes: [
          { id: "search", type: "retrieve", config: { top_k: 5 } },
          { id: "llm", type: "generate", config: { max_tokens: 512 } },
        ],
        edges: [{ source: "search", target: "llm" }],
        config: { timeout_secs: 30, max_retries: 0 },
      };
      const result = await commands.agentRunWorkflow(
        JSON.stringify(wf),
        { query: testQuery || "test" }
      );
      setTestResult(JSON.stringify(result, null, 2));
    } catch (e) {
      setTestResult(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  const isRunning = status?.running ?? false;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          AI Agent (MCP)
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-3">
          MCP Agent 运行时支持 Deep Research、智能检索等高级 AI 能力。
          Agent 作为独立进程运行，通过 JSON-RPC 协议通信。
        </p>

        <div className="space-y-3 bg-[var(--color-surface-secondary)] rounded-lg p-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-[var(--color-text-primary)]">
              Agent 状态
            </label>
            <span
              className={`text-[11px] font-medium ${
                isRunning
                  ? "text-green-400"
                  : "text-[var(--color-text-muted)]"
              }`}
            >
              {isRunning ? "运行中" : "未启动"}
              {isRunning && status && (
                <span className="ml-1 text-[var(--color-text-muted)]">
                  ({status.tools.length} 工具)
                </span>
              )}
            </span>
          </div>

          <div>
            <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
              Python 解释器
            </label>
            <div className="flex gap-2 items-start">
              <input
                className="input text-xs flex-1"
                value={pythonCmd}
                onChange={(e) => setPythonCmd(e.target.value)}
                placeholder="python3"
              />
              <div className="flex-[2] flex flex-col gap-1">
                <input
                  className="input text-xs w-full"
                  value={agentArgs}
                  onChange={(e) => setAgentArgs(e.target.value)}
                  placeholder="scripts/ultrarag_mcp_server.py"
                />
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  MCP Server 脚本路径（含参数）
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="btn btn-ghost text-xs px-4 py-2"
              disabled={loading || isRunning}
              onClick={handleStart}
            >
              <IconLightning size={12} /> {loading ? "启动中..." : "启动 Agent"}
            </button>
            <button
              className="btn text-xs px-4 py-2"
              disabled={loading || !isRunning}
              onClick={handleStop}
            >
              停止
            </button>
            <button
              className="btn text-xs px-3 py-2"
              disabled={!isRunning}
              onClick={handleListTools}
            >
              刷新工具
            </button>
          </div>

          {error && (
            <p className="text-[11px] text-red-400 bg-red-400/10 rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </section>

      {tools.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">
            可用工具 ({tools.length})
          </h3>
          <div className="space-y-2">
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="bg-[var(--color-surface-secondary)] rounded-lg p-3"
              >
                <div className="text-[11px] font-medium text-[var(--color-text-primary)]">
                  {tool.name}
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  {tool.description}
                </p>
                {tool.input_schema && (
                  <pre className="mt-1 text-[9px] text-[var(--color-text-muted)]/60 overflow-x-auto">
                    {JSON.stringify(tool.input_schema, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">
          测试
        </h3>
        <div className="space-y-3 bg-[var(--color-surface-secondary)] rounded-lg p-3">
          <div>
            <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
              测试查询
            </label>
            <input
              className="input text-xs w-full"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="输入问题..."
            />
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-ghost text-xs px-3 py-2"
              disabled={loading || !isRunning || !testQuery.trim()}
              onClick={handleDeepResearch}
            >
              <IconSearch size={12} /> Deep Research
            </button>
            <button
              className="btn text-xs px-3 py-2"
              disabled={loading || !isRunning}
              onClick={handleRunTestWorkflow}
            >
              Run Workflow
            </button>
          </div>

          {testResult && (
            <pre className="text-[10px] text-[var(--color-text-secondary)] bg-[var(--color-surface)] rounded p-2 overflow-x-auto max-h-48">
              {testResult}
            </pre>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-1">
          使用说明
        </h3>
        <ul className="text-[10px] text-[var(--color-text-muted)] space-y-1 list-disc list-inside">
          <li>
            Python 命令：确保 <code className="text-[var(--color-accent)]">python3</code> 已安装 fastmcp 依赖
          </li>
          <li>
            MCP Server 脚本：<code className="text-[var(--color-accent)]">scripts/ultrarag_mcp_server.py</code> 封装了 UltraRAG RAG 能力
          </li>
          <li>
            UltraRAG 位置：<code className="text-[var(--color-accent)]">{ULTRA_RAG_ROOT}</code>（可通过环境变量 ULTRARAG_ROOT 覆盖）
          </li>
          <li>
            启动后在 AI 对话中选择 <code className="text-[var(--color-accent)]">Agent</code> 模式以使用 Deep Research 能力
          </li>
          <li>
            支持的工具：echo（测试连接）、status（环境检查）、deep_research（多步检索+生成）
          </li>
        </ul>
      </section>
    </div>
  );
}