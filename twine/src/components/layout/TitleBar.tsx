import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useQuoteStore } from "@/stores/quoteStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { ContextMenu } from "@/components/ui/ContextMenu";
import type { MenuEntry } from "@/components/ui/ContextMenu";

// ─── 菜单栏定义 ──────────────────────────────────────
interface MenuBarItem {
  id: string;
  label: string;
  items: MenuEntry[];
}

function useMenuBarItems(): MenuBarItem[] {
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
  const toggleMaximizePanel = useAppStore((s) => s.toggleMaximizePanel);
  const setMaximizedPanel = useAppStore((s) => s.setMaximizedPanel);
  const closeTab = useAppStore((s) => s.closeTab);
  const closeAllTabs = useAppStore((s) => s.closeAllTabs);
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const commands = useTauriCommands();

  return [
    {
      id: "file",
      label: "文件",
      items: [
        {
          key: "newNote",
          label: "新建笔记",
          shortcut: "Ctrl+N",
          onClick: () => { setSidebarVisible(true); setSidebarView("files"); },
        },
        {
          key: "save",
          label: "保存",
          shortcut: "Ctrl+S",
          onClick: () => saveCurrentNote(),
        },
        { key: "sep1", type: "separator" as const },
        {
          key: "closeTab",
          label: "关闭标签",
          shortcut: "Ctrl+W",
          onClick: () => currentNotePath && closeTab(currentNotePath),
        },
        {
          key: "closeAll",
          label: "关闭所有标签",
          onClick: closeAllTabs,
        },
        { key: "sep2", type: "separator" as const },
        {
          key: "settings",
          label: "设置",
          shortcut: "Ctrl+,",
          onClick: toggleSettings,
        },
      ],
    },
    {
      id: "edit",
      label: "编辑",
      items: [
        {
          key: "toggleEdit",
          label: "切换编辑模式",
          onClick: () => setEditing(!useAppStore.getState().isEditing),
        },
        {
          key: "find",
          label: "搜索",
          shortcut: "Ctrl+Shift+F",
          onClick: () => { setSidebarVisible(true); setSidebarView("search"); },
        },
      ],
    },
    {
      id: "view",
      label: "视图",
      items: [
        {
          key: "commandPalette",
          label: "命令面板",
          shortcut: "Ctrl+Shift+P",
          onClick: () => {
            // 通过 dispatch 自定义事件触发命令面板
            window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, shiftKey: true, code: "KeyP" }));
          },
        },
        { key: "sep1", type: "separator" as const },
        {
          key: "sidebar",
          label: "侧边栏",
          shortcut: "Ctrl+B",
          onClick: toggleSidebar,
        },
        {
          key: "chat",
          label: "AI 对话",
          shortcut: "Ctrl+K",
          onClick: toggleChat,
        },
        { key: "sep2", type: "separator" as const },
        {
          key: "files",
          label: "文件浏览器",
          shortcut: "Ctrl+Shift+E",
          onClick: () => { setSidebarVisible(true); setSidebarView("files"); },
        },
        {
          key: "search",
          label: "搜索",
          shortcut: "Ctrl+Shift+F",
          onClick: () => { setSidebarVisible(true); setSidebarView("search"); },
        },
        {
          key: "knowledge",
          label: "知识库",
          shortcut: "Ctrl+Shift+K",
          onClick: () => { setSidebarVisible(true); setSidebarView("knowledge"); },
        },
        {
          key: "stocks",
          label: "个股档案",
          shortcut: "Ctrl+Shift+S",
          onClick: () => { setSidebarVisible(true); setSidebarView("stocks"); },
        },
        { key: "sep3", type: "separator" as const },
        {
          key: "maxEditor",
          label: "最大化编辑器",
          shortcut: "Ctrl+Shift+M",
          onClick: () => toggleMaximizePanel("editor"),
        },
        {
          key: "resetLayout",
          label: "重置布局",
          onClick: () => setMaximizedPanel(null),
        },
        { key: "sep4", type: "separator" as const },
        {
          key: "theme",
          label: "切换主题",
          onClick: toggleTheme,
        },
        {
          key: "fontUp",
          label: "增大字号",
          shortcut: "Ctrl+=",
          onClick: increaseFontSize,
        },
        {
          key: "fontDown",
          label: "减小字号",
          shortcut: "Ctrl+-",
          onClick: decreaseFontSize,
        },
      ],
    },
    {
      id: "data",
      label: "数据",
      items: [
        {
          key: "refreshQuote",
          label: "刷新行情",
          shortcut: "F5",
          onClick: () => useQuoteStore.getState().refresh(),
        },
        { key: "sep1", type: "separator" as const },
        {
          key: "reindex",
          label: "重建索引",
          onClick: async () => {
            const embedConfig = useSettingsStore.getState().embeddingConfig;
            try { await commands.reindexVault(embedConfig); } catch (e) { console.error(e); }
          },
        },
      ],
    },
    {
      id: "help",
      label: "帮助",
      items: [
        {
          key: "shortcuts",
          label: "快捷键参考",
          onClick: () => toggleSettings(),
        },
        {
          key: "about",
          label: "关于 Memoa",
          onClick: () => toggleSettings(),
        },
      ],
    },
  ];
}

export function TitleBar() {
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuBarItems = useMenuBarItems();

  const rawTitle = currentNotePath
    ? currentNotePath.split("/").pop() || "Untitled"
    : "Memoa";
  const title = rawTitle.replace(/\.md$/, "");

  async function handleMinimize() {
    try { await getCurrentWindow().minimize(); } catch (e) { console.error("Minimize failed:", e); }
  }

  async function handleToggleMaximize() {
    try {
      await getCurrentWindow().toggleMaximize();
      setIsMaximized(await getCurrentWindow().isMaximized());
    } catch (e) { console.error("Toggle maximize failed:", e); }
  }

  async function handleClose() {
    try { await getCurrentWindow().close(); } catch (e) { console.error("Close failed:", e); }
  }

  async function handleMouseDown(e: React.MouseEvent) {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.dragRegion !== undefined) {
      e.preventDefault();
      try { await getCurrentWindow().startDragging(); } catch { /* ignored */ }
    }
  }

  function handleMenuBarClick(menuId: string, e: React.MouseEvent) {
    if (activeMenu === menuId) {
      setActiveMenu(null);
      setMenuPos(null);
      return;
    }
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setActiveMenu(menuId);
    setMenuPos({ x: rect.left, y: rect.bottom });
  }

  function handleMenuBarHover(menuId: string, e: React.MouseEvent) {
    if (activeMenu && activeMenu !== menuId) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setActiveMenu(menuId);
      setMenuPos({ x: rect.left, y: rect.bottom });
    }
  }

  // ESC 关闭菜单
  useEffect(() => {
    if (!activeMenu) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setActiveMenu(null); setMenuPos(null); }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeMenu]);

  const activeMenuItems = menuBarItems.find((m) => m.id === activeMenu);

  return (
    <header
      className="flex items-center h-9 bg-[var(--color-surface)] border-b border-[var(--color-border)] shrink-0 select-none"
      onMouseDown={handleMouseDown}
    >
      {/* 左侧：Logo + 菜单栏 */}
      <div className="flex items-center shrink-0">
        <div className="flex items-center px-3 h-full" data-drag-region onDoubleClick={handleToggleMaximize}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a7 7 0 017 7c0 3-2 5.5-4 7.5L12 22l-3-5.5C7 14.5 5 12 5 9a7 7 0 017-7z" />
            <circle cx="12" cy="9" r="2" />
          </svg>
        </div>

        {/* 菜单栏 - 中国用户习惯的传统菜单 */}
        <nav className="flex items-center h-full">
          {menuBarItems.map((menu) => (
            <button
              key={menu.id}
              className={`px-2.5 h-full text-[12px] transition-colors ${
                activeMenu === menu.id
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
              }`}
              onClick={(e) => handleMenuBarClick(menu.id, e)}
              onMouseEnter={(e) => handleMenuBarHover(menu.id, e)}
            >
              {menu.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 中间标题区域 - 可拖拽 */}
      <div className="flex-1 px-4 min-w-0 flex items-center justify-center" data-drag-region>
        <span className="text-xs text-[var(--color-text-muted)] truncate" data-drag-region>
          {title}
        </span>
      </div>

      {/* 右侧窗口控制按钮 */}
      <div className="flex items-center">
        <button
          className="btn btn-ghost px-2 py-0.5 h-9 text-xs rounded-none hover:bg-[var(--color-surface-hover)]"
          onClick={handleMinimize}
          title="最小化"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1.5" y="5.5" width="9" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="btn btn-ghost px-2 py-0.5 h-9 text-xs rounded-none hover:bg-[var(--color-surface-hover)]"
          onClick={handleToggleMaximize}
          title={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2.5" y="0.5" width="8" height="8" rx="1" stroke="currentColor" fill="none" />
              <rect x="0.5" y="2.5" width="8" height="8" rx="1" stroke="currentColor" fill="var(--color-surface)" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" fill="none" />
            </svg>
          )}
        </button>
        <button
          className="btn btn-ghost px-2 py-0.5 h-9 text-xs rounded-none hover:bg-red-500/20 hover:text-red-400"
          onClick={handleClose}
          title="关闭"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>

      {/* 下拉菜单 */}
      {activeMenu && activeMenuItems && menuPos && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          items={activeMenuItems.items}
          onClose={() => { setActiveMenu(null); setMenuPos(null); }}
        />
      )}
    </header>
  );
}
