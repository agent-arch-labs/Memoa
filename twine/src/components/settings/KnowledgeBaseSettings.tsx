import { useState } from "react";
import { t } from "@/i18n/locale";
import { getJson, setJson } from "@/services/storageService";

export interface KnowledgeBaseConfig {
  endpoint: string;
  apiKey: string;
  topK: number;
  threshold: number;
}

export function loadConfig(): KnowledgeBaseConfig {
  return getJson<KnowledgeBaseConfig>("knowledge_base", { endpoint: "", apiKey: "", topK: 10, threshold: 0.5 });
}

export function saveConfig(config: KnowledgeBaseConfig) {
  setJson("knowledge_base", config);
}

export function KnowledgeBaseSettings() {
  const [config, setConfig] = useState<KnowledgeBaseConfig>(loadConfig);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  function persist(updated: KnowledgeBaseConfig) {
    setConfig(updated);
    saveConfig(updated);
  }

  async function testConnection() {
    if (!config.endpoint.trim()) {
      setTestResult("请先填写服务位置");
      return;
    }

    setTesting(true);
    setTestResult("...");

    try {
      const raw = config.endpoint.trim().replace(/\/+$/, "");
      const url = raw.startsWith("http") ? `${raw}/health` : `http://${raw}/health/`;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.apiKey.trim()) {
        headers["Authorization"] = `Bearer ${config.apiKey.trim()}`;
      }

      const resp = await fetch(url, { method: "GET", headers });
      const text = await resp.text().catch(() => "");

      if (resp.ok) {
        setTestResult(`✓ 连接成功 (${resp.status})\n${text.substring(0, 200)}`);
      } else {
        setTestResult(`✗ 连接失败 (${resp.status})\n${text.substring(0, 200)}`);
      }
    } catch (e) {
      setTestResult(`✗ 连接失败\n${String(e).substring(0, 200)}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-1">
          {t("settings.knowledge_base")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-3">
          {t("settings.knowledge_base.desc")}
        </p>

        <div className="space-y-3 bg-[var(--color-surface-secondary)] rounded-lg p-3">
          <div>
            <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
              {t("settings.knowledge_base.endpoint")}
            </label>
            <input
              className="input text-xs w-full"
              value={config.endpoint}
              onChange={(e) => persist({ ...config, endpoint: e.target.value })}
              placeholder="127.0.0.1:8080"
            />
            <p className="text-[9px] text-[var(--color-text-muted)]/60 mt-0.5">
              {t("settings.knowledge_base.endpoint.hint")}
            </p>
          </div>

          <div>
            <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
              {t("settings.knowledge_base.api_key")}
            </label>
            <input
              className="input text-xs w-full"
              type="password"
              value={config.apiKey}
              onChange={(e) => persist({ ...config, apiKey: e.target.value })}
              placeholder="sk-xxxx"
            />
            <p className="text-[9px] text-[var(--color-text-muted)]/60 mt-0.5">
              {t("settings.knowledge_base.api_key.hint")}
            </p>
          </div>

          <div>
            <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
              {t("settings.knowledge_base.top_k")}
            </label>
            <input
              className="input text-xs w-full"
              type="number"
              min={1}
              max={100}
              value={config.topK}
              onChange={(e) => persist({ ...config, topK: Math.max(1, Math.min(100, Number(e.target.value) || 10)) })}
            />
            <p className="text-[9px] text-[var(--color-text-muted)]/60 mt-0.5">
              {t("settings.knowledge_base.top_k.hint")}
            </p>
          </div>

          <div>
            <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
              {t("settings.knowledge_base.threshold")}
            </label>
            <input
              className="input text-xs w-full"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={config.threshold}
              onChange={(e) => persist({ ...config, threshold: Math.max(0, Math.min(1, Number(e.target.value) || 0.5)) })}
            />
            <p className="text-[9px] text-[var(--color-text-muted)]/60 mt-0.5">
              {t("settings.knowledge_base.threshold.hint")}
            </p>
          </div>

          <button
            className="btn btn-primary text-xs px-3 py-1"
            onClick={testConnection}
            disabled={testing}
          >
            {testing ? "测试中..." : t("settings.knowledge_base.test")}
          </button>
        </div>
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