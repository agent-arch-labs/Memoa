import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "@/stores/appStore";

export function TitleBar() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const [isMaximized, setIsMaximized] = useState(false);

  const rawTitle = currentNotePath
    ? currentNotePath.split("/").pop() || "Untitled"
    : "Memoa";
  const title = rawTitle.replace(/\.md$/, "");

  async function handleMinimize() {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error("Minimize failed:", e);
    }
  }

  async function handleToggleMaximize() {
    try {
      await getCurrentWindow().toggleMaximize();
      setIsMaximized(await getCurrentWindow().isMaximized());
    } catch (e) {
      console.error("Toggle maximize failed:", e);
    }
  }

  async function handleClose() {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.error("Close failed:", e);
    }
  }

  async function handleMouseDown(e: React.MouseEvent) {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.dragRegion !== undefined) {
      e.preventDefault();
      try {
        await getCurrentWindow().startDragging();
      } catch {
        // ignored
      }
    }
  }

  return (
    <header
      className="flex items-center h-9 bg-[var(--color-surface)] border-b border-[var(--color-border)] shrink-0 select-none"
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center gap-1 pl-2">
        <button
          className={`btn btn-ghost px-1 py-0.5 text-xs ${!sidebarVisible ? "text-[var(--color-accent)]" : ""}`}
          onClick={toggleSidebar}
          title={sidebarVisible ? "折叠菜单" : "展开菜单"}
        >
          <span className="text-sm">{sidebarVisible ? "◀" : "▶"}</span>
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center min-w-0 px-4" data-drag-region>
        <span className="text-xs font-medium text-[var(--color-text-secondary)] truncate">
          {title}
        </span>
      </div>

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
    </header>
  );
}