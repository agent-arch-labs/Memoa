import { useState } from "react";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { useAppStore } from "@/stores/appStore";

export function WelcomeScreen() {
  const commands = useTauriCommands();
  const setVaultPath = useAppStore((s) => s.setVaultPath);
  const setVaultInfo = useAppStore((s) => s.setVaultInfo);
  const setIndexing = useAppStore((s) => s.setIndexing);
  const [customPath, setCustomPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openDefaultVault() {
    setLoading(true);
    setError("");
    try {
      const home = await commands.getHomeDir();
      const defaultPath = `${home}/Memoa`;
      const info = await commands.openVault(defaultPath);
      setVaultPath(defaultPath);
      setVaultInfo(info);

      setIndexing(true);
      commands.reindexVault().then((stats) => {
        console.log("Reindex done:", stats);
        setIndexing(false);
      }).catch((e) => {
        console.error("Reindex failed:", e);
        setIndexing(false);
      });
    } catch (e) {
      setError(`打开失败: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function openCustomVault() {
    if (!customPath.trim()) return;
    setLoading(true);
    setError("");
    try {
      const info = await commands.openVault(customPath);
      setVaultPath(customPath);
      setVaultInfo(info);

      setIndexing(true);
      commands.reindexVault().then((stats) => {
        console.log("Reindex done:", stats);
        setIndexing(false);
      }).catch((e) => {
        console.error("Reindex failed:", e);
        setIndexing(false);
      });
    } catch (e) {
      setError(`打开失败: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-surface)]">
      <div className="text-center max-w-md px-8">
        <div className="text-5xl mb-6">🧠</div>
        <h1 className="text-2xl font-bold mb-2">欢迎使用 Memoa</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mb-8">
          你的第二大脑 · 本地优先 · AI 驱动
        </p>

        <div className="flex flex-col gap-3">
          <button
            className="btn btn-primary py-2.5 text-sm"
            onClick={openDefaultVault}
            disabled={loading}
          >
            {loading ? "打开中..." : "创建默认知识库"}
          </button>

          <div className="relative flex items-center gap-2">
            <div className="flex-1 border-t border-[var(--color-border)]" />
            <span className="text-xs text-[var(--color-text-muted)]">或</span>
            <div className="flex-1 border-t border-[var(--color-border)]" />
          </div>

          <div className="flex gap-2">
            <input
              className="input text-sm flex-1"
              placeholder="自定义路径..."
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && openCustomVault()}
            />
            <button
              className="btn btn-ghost text-sm"
              onClick={openCustomVault}
              disabled={loading || !customPath.trim()}
            >
              打开
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-500 mt-2">{error}</p>
          )}
        </div>

        <div className="mt-8 p-4 rounded-lg bg-[var(--color-surface-secondary)] text-left">
          <h3 className="text-xs font-medium mb-2 text-[var(--color-text-secondary)]">
            技术栈
          </h3>
          <div className="grid grid-cols-2 gap-1 text-[11px] text-[var(--color-text-muted)]">
            <span>🦀 Rust + Tauri 2</span>
            <span>⚛️ React + TypeScript</span>
            <span>📝 纯 Markdown</span>
            <span>🧠 本地 AI (Ollama)</span>
            <span>🔍 RAG 混合检索</span>
            <span>☁️ 云 AI 可选</span>
          </div>
        </div>
      </div>
    </div>
  );
}