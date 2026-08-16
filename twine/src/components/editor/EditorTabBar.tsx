import { useRef, useState, useCallback } from "react";
import { useAppStore } from "@/stores/appStore";
import { ContextMenu } from "@/components/ui/ContextMenu";
import type { MenuEntry } from "@/components/ui/ContextMenu";

export function EditorTabBar() {
  const openTabs = useAppStore((s) => s.openTabs);
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const closeOtherTabs = useAppStore((s) => s.closeOtherTabs);
  const closeAllTabs = useAppStore((s) => s.closeAllTabs);
  const isEditing = useAppStore((s) => s.isEditing);

  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragTab, setDragTab] = useState<string | null>(null);

  const getTabName = useCallback((path: string) => {
    const raw = path.split("/").pop() || "Untitled";
    return raw.replace(/\.md$/, "");
  }, []);

  const contextMenuItems = useCallback((): MenuEntry[] => {
    if (!contextMenu) return [];
    const path = contextMenu.path;
    return [
      {
        key: "close",
        label: "关闭",
        shortcut: "Ctrl+W",
        onClick: () => closeTab(path),
      },
      {
        key: "closeOthers",
        label: "关闭其他",
        onClick: () => closeOtherTabs(path),
      },
      {
        key: "closeAll",
        label: "关闭全部",
        onClick: closeAllTabs,
      },
      { key: "sep1", type: "separator" as const },
      {
        key: "copyPath",
        label: "复制文件路径",
        onClick: () => navigator.clipboard.writeText(path),
      },
    ];
  }, [contextMenu, closeTab, closeOtherTabs, closeAllTabs]);

  if (openTabs.length === 0) return null;

  return (
    <div className="flex items-center h-[34px] bg-[var(--color-surface-secondary)] border-b border-[var(--color-border)] shrink-0 select-none">
      <div
        ref={scrollRef}
        className="flex items-center flex-1 min-w-0 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {openTabs.map((path) => {
          const isActive = path === currentNotePath;
          const name = getTabName(path);

          return (
            <div
              key={path}
              className={`group flex items-center gap-1.5 h-full px-3 text-[12px] cursor-pointer border-r border-[var(--color-border)]/50 shrink-0 transition-colors duration-100 relative ${
                isActive
                  ? "bg-[var(--color-surface)] text-[var(--color-text-primary)]"
                  : "bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]/50"
              }`}
              draggable
              onDragStart={() => setDragTab(path)}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragTab || dragTab === path) return;
                // 重新排序标签
                const tabs = [...useAppStore.getState().openTabs];
                const fromIdx = tabs.indexOf(dragTab);
                const toIdx = tabs.indexOf(path);
                tabs.splice(fromIdx, 1);
                tabs.splice(toIdx, 0, dragTab);
                useAppStore.setState({ openTabs: tabs });
                setDragTab(null);
              }}
              onDragEnd={() => setDragTab(null)}
              onClick={() => setActiveTab(path)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ path, x: e.clientX, y: e.clientY });
              }}
            >
              {/* 活动标签底部指示线 */}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--color-accent)]" />
              )}

              {/* 修改指示点 */}
              {isActive && isEditing && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
              )}

              <span className="truncate max-w-[120px]">{name}</span>

              {/* 关闭按钮 */}
              <button
                className={`w-4 h-4 flex items-center justify-center rounded-sm shrink-0 transition-opacity ${
                  isActive
                    ? "opacity-60 hover:opacity-100 hover:bg-[var(--color-surface-hover)]"
                    : "opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-[var(--color-surface-hover)]"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(path);
                }}
                title="关闭"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="4" y1="4" x2="12" y2="12" />
                  <line x1="12" y1="4" x2="4" y2="12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
