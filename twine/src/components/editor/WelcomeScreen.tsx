import { useState, useEffect } from "react";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { useAppStore } from "@/stores/appStore";
import { IconBrain, IconGear, IconCode, IconEdit, IconSearch, IconGlobe, IconFolderOpen } from "@/components/common/Icons";
import { useSettingsStore } from "@/stores/settingsStore";

function getEmbedConfig() {
  const ec = useSettingsStore.getState().embeddingConfig;
  return {
    provider: ec.provider,
    modelId: ec.modelId,
    apiUrl: ec.apiUrl,
    apiKey: ec.apiKey,
  };
}

interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;
}

const RECENT_KEY = "memoa_recent_files";

function loadRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentFile(path: string) {
  const files = loadRecentFiles().filter((f) => f.path !== path);
  const name = path.split("/").pop()?.replace(/\.md$/, "") || "Untitled";
  files.unshift({ path, name, lastOpened: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(files.slice(0, 8)));
}

export { saveRecentFile };

export function WelcomeScreen() {
  const commands = useTauriCommands();
  const setVaultPath = useAppStore((s) => s.setVaultPath);
  const setVaultInfo = useAppStore((s) => s.setVaultInfo);
  const setIndexing = useAppStore((s) => s.setIndexing);
  const setCurrentNote = useAppStore((s) => s.setCurrentNote);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const [customPath, setCustomPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

  useEffect(() => {
    setRecentFiles(loadRecentFiles());
  }, []);

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
      commands.reindexVault(getEmbedConfig()).then((stats) => {
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
      commands.reindexVault(getEmbedConfig()).then((stats) => {
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

  async function openRecentFile(path: string) {
    try {
      const content = await commands.readFile(path);
      setCurrentNote(path, content);
    } catch (e) {
      console.error("打开文件失败", e);
    }
  }

  const shortcuts = [
    { keys: "Ctrl+Shift+P", desc: "命令面板" },
    { keys: "Ctrl+S", desc: "保存笔记" },
    { keys: "Ctrl+B", desc: "切换侧边栏" },
    { keys: "Ctrl+K", desc: "AI 对话" },
    { keys: "Ctrl+Shift+F", desc: "全局搜索" },
    { keys: "Ctrl+N", desc: "新建笔记" },
  ];

  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-surface)] overflow-auto">
      <div className="max-w-2xl w-full px-8 py-12">
        {/* 标题区 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-accent)]/10 mb-4">
            <IconBrain size={32} />
          </div>
          <h1 className="text-3xl font-bold mb-2">欢迎使用 Memoa</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            你的第二大脑 · 本地优先 · AI 驱动
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 左侧：开始使用 */}
          <div>
            <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">开始</h2>
            <div className="space-y-2">
              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors text-left"
                onClick={openDefaultVault}
                disabled={loading}
              >
                <IconFolderOpen size={16} />
                <div>
                  <div className="text-sm font-medium">{loading ? "打开中..." : "创建默认知识库"}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">~/Memoa</div>
                </div>
              </button>

              <div className="flex gap-2">
                <input
                  className="input text-sm flex-1"
                  placeholder="自定义路径..."
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  onKeyDown={(e) => !e.nativeEvent.isComposing && e.key === "Enter" && openCustomVault()}
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
                <p className="text-xs text-red-500">{error}</p>
              )}
            </div>

            {/* 最近文件 */}
            {recentFiles.length > 0 && vaultPath && (
              <div className="mt-6">
                <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">最近打开</h2>
                <div className="space-y-0.5">
                  {recentFiles.slice(0, 5).map((f) => (
                    <button
                      key={f.path}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors text-left"
                      onClick={() => openRecentFile(f.path)}
                    >
                      <IconEdit size={12} />
                      <span className="truncate">{f.name}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)] ml-auto shrink-0">
                        {new Date(f.lastOpened).toLocaleDateString("zh-CN")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右侧：快捷键 + 技术栈 */}
          <div>
            <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">快捷键</h2>
            <div className="space-y-1 mb-6">
              {shortcuts.map((s) => (
                <div key={s.keys} className="flex items-center justify-between px-3 py-1.5 rounded hover:bg-[var(--color-surface-hover)] transition-colors">
                  <span className="text-sm text-[var(--color-text-secondary)]">{s.desc}</span>
                  <kbd className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface-secondary)] px-2 py-0.5 rounded border border-[var(--color-border)]">{s.keys}</kbd>
                </div>
              ))}
            </div>

            <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">技术栈</h2>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1.5"><IconGear size={11} /> Rust + Tauri 2</span>
              <span className="flex items-center gap-1.5"><IconCode size={11} /> React + TypeScript</span>
              <span className="flex items-center gap-1.5"><IconEdit size={11} /> 纯 Markdown</span>
              <span className="flex items-center gap-1.5"><IconBrain size={11} /> 本地 AI (Ollama)</span>
              <span className="flex items-center gap-1.5"><IconSearch size={11} /> RAG 混合检索</span>
              <span className="flex items-center gap-1.5"><IconGlobe size={11} /> 云 AI 可选</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
