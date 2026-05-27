import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAppStore } from "@/stores/appStore";
import { setVaultPath as persistVaultPath } from "@/services/storageService";
import type { IndexStats } from "@/types";

export function DataSettings() {
  const commands = useTauriCommands();
  const settings = useSettingsStore();
  const vaultPath = useAppStore((s) => s.vaultPath);
  const vaultInfo = useAppStore((s) => s.vaultInfo);
  const setVaultPath = useAppStore((s) => s.setVaultPath);
  const setVaultInfo = useAppStore((s) => s.setVaultInfo);
  const setCurrentNote = useAppStore((s) => s.setCurrentNote);
  const closeSplitNote = useAppStore((s) => s.closeSplitNote);
  const incrementGraphRefresh = useAppStore((s) => s.incrementGraphRefresh);
  const incrementTagRefresh = useAppStore((s) => s.incrementTagRefresh);
  const [indexing, setIndexing] = useState(false);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");

  async function handleReindex() {
    setIndexing(true);
    setError("");
    setStats(null);
    try {
      const embedConfig = {
        provider: settings.embeddingConfig.provider,
        modelId: settings.embeddingConfig.modelId,
        apiUrl: settings.embeddingConfig.apiUrl,
        apiKey: settings.embeddingConfig.apiKey,
      };
      const result = await commands.reindexVault(embedConfig);
      setStats(result);
      incrementTagRefresh();
      incrementGraphRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setIndexing(false);
    }
  }

  async function handleSwitchVault() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (!selected) return;
      const newPath = selected as string;
      setSwitching(true);
      setSwitchError("");

      setCurrentNote(null, "");
      closeSplitNote();

      const info = await commands.switchVault(newPath);
      setVaultPath(newPath);
      setVaultInfo(info);
      persistVaultPath(newPath);

      setIndexing(true);
      incrementGraphRefresh();
      incrementTagRefresh();

      commands.reindexVault().then((reindexStats) => {
        console.log("Vault switched, reindex done:", reindexStats);
        setIndexing(false);
        incrementGraphRefresh();
        incrementTagRefresh();
      }).catch((e) => {
        console.error("Reindex after switch failed:", e);
        setIndexing(false);
      });
    } catch (e) {
      setSwitchError(String(e));
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          本地文件空间
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-3">
          设置或切换本地 Markdown 笔记目录。切换后会自动重建索引，识别新目录中的文件结构。
        </p>

        {vaultInfo && (
          <div className="mb-3 bg-[var(--color-surface-secondary)] rounded-lg px-3 py-3 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">名称</span>
              <span className="text-[var(--color-text-primary)] font-medium">{vaultInfo.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">路径</span>
              <span className="text-[var(--color-text-primary)] font-medium text-right max-w-[240px] truncate">
                {vaultInfo.path}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">笔记数量</span>
              <span className="text-[var(--color-text-primary)] font-medium">{vaultInfo.note_count}</span>
            </div>
          </div>
        )}

        <button
          className="btn btn-primary text-xs px-4 py-2"
          disabled={switching}
          onClick={handleSwitchVault}
        >
          {switching ? "切换中..." : vaultPath ? "切换空间" : "选择文件夹"}
        </button>

        {switchError && (
          <p className="mt-2 text-[11px] text-red-400 bg-red-400/10 rounded px-3 py-2">
            {switchError}
          </p>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          知识库索引
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-3">
          重建 BM25 全文索引和向量索引。使用设置中配置的向量化模型构建向量索引。
        </p>

        <button
          className="btn btn-primary text-xs px-4 py-2"
          disabled={indexing}
          onClick={handleReindex}
        >
          {indexing ? "索引构建中..." : "重建索引"}
        </button>

        {error && (
          <p className="mt-2 text-[11px] text-red-400 bg-red-400/10 rounded px-3 py-2">
            {error}
          </p>
        )}

        {stats && (
          <div className="mt-3 bg-[var(--color-surface-secondary)] rounded-lg px-3 py-3 space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">笔记总数</span>
              <span className="text-[var(--color-text-primary)] font-medium">{stats.total_notes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">新增</span>
              <span className="text-green-400 font-medium">{stats.new_notes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">更新</span>
              <span className="text-blue-400 font-medium">{stats.updated_notes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">跳过</span>
              <span className="text-[var(--color-text-muted)]">{stats.skipped_notes}</span>
            </div>
            {stats.errors.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-[var(--color-border)]">
                <span className="text-red-400">错误: {stats.errors.length}</span>
                {stats.errors.slice(0, 3).map((e, i) => (
                  <p key={i} className="text-[10px] text-red-400/80 mt-0.5 truncate">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}