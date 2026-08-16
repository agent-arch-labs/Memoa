import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useQuoteStore } from "@/stores/quoteStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";

export interface CommandItem {
  id: string;
  label: string;
  category?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface CommandPaletteProps {
  visible: boolean;
  onClose: () => void;
}

export function CommandPalette({ visible, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const setSidebarView = useAppStore((s) => s.setSidebarView);
  const setSidebarVisible = useAppStore((s) => s.setSidebarVisible);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const increaseFontSize = useAppStore((s) => s.increaseFontSize);
  const decreaseFontSize = useAppStore((s) => s.decreaseFontSize);
  const setEditing = useAppStore((s) => s.setEditing);
  const saveCurrentNote = useAppStore((s) => s.saveCurrentNote);
  const setMaximizedPanel = useAppStore((s) => s.setMaximizedPanel);
  const toggleMaximizePanel = useAppStore((s) => s.toggleMaximizePanel);
  const showEditor = useAppStore((s) => s.showEditor);
  const showStock = useAppStore((s) => s.showStock);
  const setMiddlePanel = useAppStore((s) => s.setMiddlePanel);
  const commands = useTauriCommands();

  const allCommands = useMemo<CommandItem[]>(() => [
    // 文件操作
    { id: "file.save", label: "保存当前笔记", category: "文件", shortcut: "Ctrl+S", onClick: () => saveCurrentNote() },
    { id: "file.toggleEdit", label: "切换编辑模式", category: "文件", onClick: () => setEditing(!useAppStore.getState().isEditing) },
    { id: "file.newNote", label: "新建笔记", category: "文件", shortcut: "Ctrl+N", onClick: () => { setSidebarView("files"); setSidebarVisible(true); } },

    // 视图切换
    { id: "view.sidebar", label: "切换侧边栏", category: "视图", shortcut: "Ctrl+B", onClick: toggleSidebar },
    { id: "view.chat", label: "切换 AI 对话", category: "视图", shortcut: "Ctrl+K", onClick: toggleChat },
    { id: "view.settings", label: "打开设置", category: "视图", shortcut: "Ctrl+,", onClick: toggleSettings },
    { id: "view.theme", label: "切换深色/浅色主题", category: "视图", onClick: toggleTheme },
    { id: "view.maximizeEditor", label: "最大化编辑器", category: "视图", shortcut: "Ctrl+Shift+M", onClick: () => toggleMaximizePanel("editor") },
    { id: "view.maximizeSidebar", label: "最大化侧边栏", category: "视图", onClick: () => toggleMaximizePanel("sidebar") },
    { id: "view.maximizeChat", label: "最大化对话面板", category: "视图", onClick: () => toggleMaximizePanel("chat") },
    { id: "view.resetLayout", label: "重置面板布局", category: "视图", onClick: () => setMaximizedPanel(null) },
    { id: "view.fontSizeUp", label: "增大字号", category: "视图", shortcut: "Ctrl+=", onClick: increaseFontSize },
    { id: "view.fontSizeDown", label: "减小字号", category: "视图", shortcut: "Ctrl+-", onClick: decreaseFontSize },

    // 侧边栏面板
    { id: "panel.files", label: "文件浏览器", category: "面板", shortcut: "Ctrl+Shift+E", onClick: () => { setSidebarVisible(true); setSidebarView("files"); } },
    { id: "panel.search", label: "全局搜索", category: "面板", shortcut: "Ctrl+Shift+F", onClick: () => { setSidebarVisible(true); setSidebarView("search"); } },
    { id: "panel.tags", label: "标签管理", category: "面板", onClick: () => { setSidebarVisible(true); setSidebarView("tags"); } },
    { id: "panel.graph", label: "知识图谱", category: "面板", onClick: () => { setSidebarVisible(true); setSidebarView("graph"); } },
    { id: "panel.daily", label: "日报", category: "面板", onClick: () => { setSidebarVisible(true); setSidebarView("daily"); } },
    { id: "panel.knowledge", label: "知识库", category: "面板", shortcut: "Ctrl+Shift+K", onClick: () => { setSidebarVisible(true); setSidebarView("knowledge"); } },
    { id: "panel.trade", label: "交易日志", category: "面板", onClick: () => { setSidebarVisible(true); setSidebarView("trade"); } },
    { id: "panel.review", label: "复盘中心", category: "面板", shortcut: "Ctrl+Shift+R", onClick: () => { setSidebarVisible(true); setSidebarView("review"); } },
    { id: "panel.stocks", label: "个股档案", category: "面板", shortcut: "Ctrl+Shift+S", onClick: () => { setSidebarVisible(true); setSidebarView("stocks"); } },

    // 编辑器
    { id: "editor.showEditor", label: "切换到编辑器", category: "编辑器", onClick: showEditor },
    { id: "editor.showStock", label: "切换到股票详情", category: "编辑器", onClick: showStock },

    // 行情
    { id: "stock.refresh", label: "刷新行情数据", category: "行情", shortcut: "F5", onClick: () => useQuoteStore.getState().refresh() },

    // 索引
    { id: "index.reindex", label: "重建索引", category: "数据", onClick: async () => {
      const embedConfig = useSettingsStore.getState().embeddingConfig;
      try { await commands.reindexVault(embedConfig); } catch (e) { console.error(e); }
    }},
  ], [toggleSidebar, toggleChat, toggleSettings, setSidebarView, setSidebarVisible, toggleTheme, increaseFontSize, decreaseFontSize, setEditing, saveCurrentNote, setMaximizedPanel, toggleMaximizePanel, showEditor, showStock, setMiddlePanel, commands]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    const lower = query.toLowerCase();
    return allCommands.filter((cmd) =>
      cmd.label.toLowerCase().includes(lower) ||
      (cmd.category && cmd.category.toLowerCase().includes(lower)) ||
      (cmd.shortcut && cmd.shortcut.toLowerCase().includes(lower))
    );
  }, [allCommands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [visible]);

  const executeCommand = useCallback((cmd: CommandItem) => {
    onClose();
    cmd.onClick();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        executeCommand(filtered[selectedIndex]);
      }
      return;
    }
  }, [filtered, selectedIndex, executeCommand, onClose]);

  // 滚动到选中项
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className="w-[520px] max-h-[60vh] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl shadow-black/30 flex flex-col overflow-hidden animate-in slide-in-from-top-2 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索输入框 */}
        <div className="flex items-center px-4 h-12 border-b border-[var(--color-border)] shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)] shrink-0 mr-3">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
            placeholder="输入命令搜索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="ml-2 px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded border border-[var(--color-border)] shrink-0">ESC</kbd>
        </div>

        {/* 命令列表 */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
              未找到匹配的命令
            </div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              data-selected={i === selectedIndex}
              className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors cursor-pointer ${
                i === selectedIndex
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
              }`}
              onClick={() => executeCommand(cmd)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="flex-1 text-left truncate">{cmd.label}</span>
              {cmd.category && (
                <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] px-1.5 py-0.5 rounded shrink-0">{cmd.category}</span>
              )}
              {cmd.shortcut && (
                <kbd className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] px-1.5 py-0.5 rounded border border-[var(--color-border)] shrink-0 ml-1">{cmd.shortcut}</kbd>
              )}
            </button>
          ))}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center justify-between px-4 h-8 border-t border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)] shrink-0">
          <span>上下键选择 · Enter 执行 · Esc 关闭</span>
          <span>{filtered.length} 个命令</span>
        </div>
      </div>
    </div>
  );
}
