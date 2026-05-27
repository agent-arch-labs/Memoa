import { useState } from "react";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { getJson, setJson } from "@/services/storageService";

export type SearchProviderType = "tavily" | "custom";

export interface SearchToolConfig {
  id: string;
  name: string;
  description: string;
  url: string;
  apiKey: string;
  enabled: boolean;
}

export interface SearchExtensionConfig {
  tavilyApiKey: string;
  tavilyEnabled: boolean;
  customSearches: SearchToolConfig[];
}

export function loadSearchExtensions(): SearchExtensionConfig {
  return getJson<SearchExtensionConfig>("search_extensions", { tavilyApiKey: "", tavilyEnabled: false, customSearches: [] });
}

export function saveSearchExtensions(config: SearchExtensionConfig) {
  setJson("search_extensions", config);
}

function generateId(): string {
  return crypto.randomUUID();
}

export function buildSearchRequest(query: string, topK: number) {
  return {
    query,
    top_k: topK,
    min_score: 0,
    search_type: "hybrid",
    include_metadata: true,
    include_highlights: false,
  };
}

function formatSearchResult(r: Record<string, unknown>, index: number): string {
  const id = String(r.id || `result_${index}`);
  const title = String(r.title || "");
  const content = String(r.content || r.snippet || "");
  const score = Number(r.score || 0);
  const metadata = r.metadata ? ` | metadata: ${JSON.stringify(r.metadata)}` : "";
  return `[${index + 1}] ${title} (score: ${score.toFixed(2)}, id: ${id}${metadata})\n${content}`;
}

export function SearchExtensionsSettings() {
  const [config, setConfig] = useState<SearchExtensionConfig>(loadSearchExtensions);
  const [showAddTool, setShowAddTool] = useState(false);
  const [newTool, setNewTool] = useState({ name: "", description: "", url: "", apiKey: "" });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ name: "", description: "", url: "", apiKey: "" });
  const commands = useTauriCommands();

  async function testTavily() {
    if (!config.tavilyApiKey.trim()) {
      setTestResult("✕ 请先配置 API Key");
      return;
    }
    setTestResult("...");
    try {
      await commands.tavilySearch("memoa test", config.tavilyApiKey);
      setTestResult("✓ Tavily 连接正常");
    } catch (e) {
      setTestResult(`✕ Tavily 连接失败: ${e}`);
    }
  }

  async function testSearchTool(tool: SearchToolConfig) {
    setTestResult("...");
    try {
      const resp = await fetch(tool.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tool.apiKey ? { Authorization: `Bearer ${tool.apiKey}` } : {}),
        },
        body: JSON.stringify(buildSearchRequest("memoa test", 1)),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const results: Array<Record<string, unknown>> = data.results || [];
      if (results.length > 0) {
        setTestResult(`✓ ${tool.name} 连接正常，返回 ${results.length} 条结果\n${formatSearchResult(results[0], 0)}`);
      } else {
        setTestResult(`✓ ${tool.name} 连接正常，但未返回结果（query: "memoa test"）`);
      }
    } catch (e) {
      setTestResult(`✕ ${tool.name} 连接失败: ${e}`);
    }
  }

  function persist(updated: SearchExtensionConfig) {
    setConfig(updated);
    saveSearchExtensions(updated);
  }

  function toggleTavily() {
    persist({ ...config, tavilyEnabled: !config.tavilyEnabled });
  }

  function addSearchTool() {
    if (!newTool.name.trim() || !newTool.url.trim()) return;
    const tool: SearchToolConfig = {
      id: generateId(),
      name: newTool.name.trim(),
      description: newTool.description.trim(),
      url: newTool.url.trim(),
      apiKey: newTool.apiKey.trim(),
      enabled: true,
    };
    persist({
      ...config,
      customSearches: [...config.customSearches, tool],
    });
    setNewTool({ name: "", description: "", url: "", apiKey: "" });
    setShowAddTool(false);
  }

  function removeTool(id: string) {
    persist({
      ...config,
      customSearches: config.customSearches.filter((s) => s.id !== id),
    });
  }

  function toggleTool(id: string) {
    persist({
      ...config,
      customSearches: config.customSearches.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      ),
    });
  }

  function startEditTool(tool: SearchToolConfig) {
    setEditingToolId(tool.id);
    setEditValues({ name: tool.name, description: tool.description, url: tool.url, apiKey: tool.apiKey });
  }

  function cancelEditTool() {
    setEditingToolId(null);
  }

  function saveEditTool(id: string) {
    if (!editValues.name.trim() || !editValues.url.trim()) return;
    persist({
      ...config,
      customSearches: config.customSearches.map((s) =>
        s.id === id ? { ...s, name: editValues.name.trim(), description: editValues.description.trim(), url: editValues.url.trim(), apiKey: editValues.apiKey.trim() } : s,
      ),
    });
    setEditingToolId(null);
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-1">
          Tavily 网络检索
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-3">
          接入 Tavily Search API，让 AI 能够检索实时网络信息。需要在
          <a
            className="text-[var(--color-accent)]"
            href="https://tavily.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            {" "}tavily.com{" "}
          </a>
          获取 API Key。
        </p>
        <div className="space-y-3 bg-[var(--color-surface-secondary)] rounded-lg p-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-[var(--color-text-primary)]">启用 Tavily</label>
            <button
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                config.tavilyEnabled
                  ? "bg-[var(--color-accent)]"
                  : "bg-[var(--color-border)]"
              }`}
              onClick={toggleTavily}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full shadow-sm transition-transform ${
                  config.tavilyEnabled
                    ? "translate-x-[18px] bg-white"
                    : "translate-x-[3px] bg-[var(--color-text-muted)]"
                }`}
              />
            </button>
          </div>
          <div>
            <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">API Key</label>
            <input
              className="input text-xs w-full"
              type="password"
              value={config.tavilyApiKey}
              onChange={(e) => persist({ ...config, tavilyApiKey: e.target.value })}
              placeholder="tvly-xxxx"
            />
            <button
              className="btn text-xs px-3 py-1 mt-1"
              onClick={testTavily}
            >
              测试连接
            </button>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
              检索工具
            </h3>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              配置符合通用检索接口规范的检索工具，AI 可调用这些工具获取外部知识。接口需实现标准的 POST /v1/retrieval 端点。
            </p>
          </div>
          <button
            className="btn text-xs px-2 py-1 shrink-0"
            onClick={() => setShowAddTool(!showAddTool)}
          >
            {showAddTool ? "取消" : "+ 添加"}
          </button>
        </div>

        {showAddTool && (
          <div className="bg-[var(--color-surface-secondary)] rounded-lg p-3 space-y-2.5 mb-3">
            <div>
              <label className="block text-[10px] text-[var(--color-text-muted)] mb-0.5">名称 *</label>
              <input
                className="input text-xs w-full"
                value={newTool.name}
                onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                placeholder="例如: 知识库"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-text-muted)] mb-0.5">功能描述</label>
              <input
                className="input text-xs w-full"
                value={newTool.description}
                onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
                placeholder="向 AI 描述该工具的功能，帮助 AI 选择合适的检索源"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-text-muted)] mb-0.5">检索端点 URL *</label>
              <input
                className="input text-xs w-full"
                value={newTool.url}
                onChange={(e) => setNewTool({ ...newTool, url: e.target.value })}
                placeholder="https://your-api.com/v1/retrieval"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-text-muted)] mb-0.5">API Key (可选)</label>
              <input
                className="input text-xs w-full"
                type="password"
                value={newTool.apiKey}
                onChange={(e) => setNewTool({ ...newTool, apiKey: e.target.value })}
                placeholder="Bearer token 或 API Key"
              />
            </div>

            <div className="bg-[var(--color-surface)]/50 rounded p-2 text-[10px] text-[var(--color-text-muted)]">
              <span className="font-medium text-[var(--color-text-primary)]">接口规范 (通用检索接口 v1.1):</span>
              <div className="mt-1 space-y-0.5">
                <p><code className="text-[var(--color-accent)]">POST</code> 请求，Content-Type: <code className="text-[var(--color-accent)]">application/json</code></p>
                <p>请求体: <code className="text-[var(--color-accent)]">{`{"query":"...","top_k":10,"min_score":0,"search_type":"hybrid","include_metadata":true,"include_highlights":false}`}</code></p>
                <p>响应体: <code className="text-[var(--color-accent)]">{`{"results":[{"id":"...","title":"...","content":"...","score":0.9,"highlights":"...","metadata":{}}]}`}</code></p>
                <p>Header: <code className="text-[var(--color-accent)]">Authorization: Bearer {"{api_key}"}</code></p>
              </div>
              <p className="mt-1 text-[9px] text-[var(--color-text-muted)]/70">
                端点路径统一约定为 <code className="text-[var(--color-accent)]">/v1/retrieval</code>，支持 keyword / semantic / hybrid 三种检索类型
              </p>
            </div>

            <button
              className="btn btn-primary text-xs px-3 py-1 w-full"
              onClick={addSearchTool}
            >
              添加检索工具
            </button>
          </div>
        )}

        {config.customSearches.length === 0 && !showAddTool && (
          <div className="text-center py-6 text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-secondary)] rounded-lg">
            暂无检索工具，点击"+ 添加"配置
          </div>
        )}

        {config.customSearches.map((search) => (
          <div
            key={search.id}
            className="bg-[var(--color-surface-secondary)] rounded-lg p-3 mb-2"
          >
            {editingToolId === search.id ? (
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[10px] text-[var(--color-text-muted)] mb-0.5">名称 *</label>
                  <input
                    className="input text-xs w-full"
                    value={editValues.name}
                    onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--color-text-muted)] mb-0.5">功能描述</label>
                  <input
                    className="input text-xs w-full"
                    value={editValues.description}
                    onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--color-text-muted)] mb-0.5">检索端点 URL *</label>
                  <input
                    className="input text-xs w-full"
                    value={editValues.url}
                    onChange={(e) => setEditValues({ ...editValues, url: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--color-text-muted)] mb-0.5">API Key (可选)</label>
                  <input
                    className="input text-xs w-full"
                    type="password"
                    value={editValues.apiKey}
                    onChange={(e) => setEditValues({ ...editValues, apiKey: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-primary text-xs px-3 py-1"
                    onClick={() => saveEditTool(search.id)}
                  >
                    保存
                  </button>
                  <button
                    className="btn text-xs px-3 py-1"
                    onClick={cancelEditTool}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-[var(--color-text-primary)]">
                      {search.name}
                    </span>
                    <button
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        search.enabled
                          ? "bg-[var(--color-accent)]"
                          : "bg-[var(--color-border)]"
                      }`}
                      onClick={() => toggleTool(search.id)}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full shadow-sm transition-transform ${
                          search.enabled
                            ? "translate-x-[18px] bg-white"
                            : "translate-x-[3px] bg-[var(--color-text-muted)]"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      onClick={() => startEditTool(search)}
                    >
                      编辑
                    </button>
                    <button
                      className="text-[10px] text-red-400 hover:text-red-300"
                      onClick={() => removeTool(search.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
                {search.description && (
                  <p className="text-[10px] text-[var(--color-text-muted)] mb-1">{search.description}</p>
                )}
                <p className="text-[10px] text-[var(--color-text-muted)]/60 truncate mb-1.5">{search.url}</p>
                <button
                  className="btn text-xs px-2 py-0.5"
                  onClick={() => testSearchTool(search)}
                >
                  测试连接
                </button>
              </>
            )}
          </div>
        ))}
      </section>

      {testResult && (
        <div className="bg-[var(--color-surface-secondary)] rounded-lg p-3 text-[10px]">
          <div
            className={testResult.startsWith("✓") ? "text-green-400" : "text-red-400"}
            style={{ whiteSpace: "pre-wrap" }}
          >
            {testResult}
          </div>
        </div>
      )}
    </div>
  );
}