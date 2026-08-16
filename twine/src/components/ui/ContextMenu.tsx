import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";

// ========== 类型定义 ==========

export interface MenuItemDef {
  /** 唯一标识 */
  key: string;
  /** 显示标签 */
  label: ReactNode;
  /** 左侧图标（可选） */
  icon?: ReactNode;
  /** 右侧快捷键提示（可选） */
  shortcut?: string;
  /** 是否选中状态（显示勾选） */
  checked?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 点击回调 */
  onClick?: () => void;
  /** 二级子菜单 */
  submenu?: MenuEntry[];
}

export interface MenuSeparator {
  key: string;
  type: "separator";
}

export type MenuEntry = MenuItemDef | MenuSeparator;

export function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return "type" in entry && entry.type === "separator";
}

// ========== ContextMenu 组件 ==========

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuEntry[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [activeSubmenuKey, setActiveSubmenuKey] = useState<string | null>(null);
  const [submenuPos, setSubmenuPos] = useState<"right" | "left">("right");
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 位置修正：确保菜单不超出视口
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (nx + rect.width > vw - 4) nx = vw - rect.width - 4;
    if (ny + rect.height > vh - 4) ny = vh - rect.height - 4;
    if (nx < 4) nx = 4;
    if (ny < 4) ny = 4;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  // 点击外部关闭
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // 延迟绑定，避免触发右键的同一事件立即关闭
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [onClose]);

  // ESC 关闭
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleItemMouseEnter = useCallback((item: MenuItemDef) => {
    if (item.submenu) {
      // 清除之前的延迟关闭计时器
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setActiveSubmenuKey(item.key);
      // 计算二级菜单方向
      if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        // 如果右侧空间不足 180px，则向左展开
        setSubmenuPos(vw - rect.right < 180 ? "left" : "right");
      }
    } else {
      // 延迟关闭二级菜单，避免鼠标移动时闪烁
      hoverTimerRef.current = setTimeout(() => {
        setActiveSubmenuKey(null);
      }, 150);
    }
  }, []);

  const handleItemClick = useCallback((item: MenuItemDef) => {
    if (item.disabled) return;
    if (item.submenu) return; // 有子菜单的项不触发 onClick
    item.onClick?.();
    onClose();
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[180px] py-[3px] rounded-[5px]"
      style={{
        left: pos.x,
        top: pos.y,
        background: "var(--vscode-menu-background, var(--color-surface))",
        border: "1px solid var(--vscode-menu-border, var(--color-border))",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.08)",
      }}
    >
      {items.map((entry) => {
        if (isSeparator(entry)) {
          return (
            <div
              key={entry.key}
              className="my-[3px] mx-2 h-px"
              style={{ background: "var(--vscode-menu-separatorBackground, var(--color-border))" }}
            />
          );
        }

        const item = entry as MenuItemDef;
        const hasSubmenu = !!(item.submenu && item.submenu.length > 0);
        const isSubmenuOpen = activeSubmenuKey === item.key;

        return (
          <div
            key={item.key}
            className="relative"
            onMouseEnter={() => handleItemMouseEnter(item)}
          >
            <button
              className={`
                w-full flex items-center gap-2 px-3 py-[4px] text-[12px] leading-[18px]
                transition-none outline-none
                ${item.disabled
                  ? "opacity-40 cursor-default"
                  : "cursor-pointer"
                }
              `}
              style={{
                background: isSubmenuOpen
                  ? "var(--vscode-menu-selectionBackground, var(--color-accent))"
                  : "transparent",
                color: isSubmenuOpen
                  ? "var(--vscode-menu-selectionForeground, #fff)"
                  : item.disabled
                    ? "var(--vscode-menu-disabledForeground, var(--color-text-muted))"
                    : "var(--vscode-menu-foreground, var(--color-text-primary))",
              }}
              onClick={() => handleItemClick(item)}
              onMouseEnter={(e) => {
                if (!item.disabled && !isSubmenuOpen) {
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--vscode-menu-selectionBackground, var(--color-accent))";
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--vscode-menu-selectionForeground, #fff)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmenuOpen) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color =
                    item.disabled
                      ? "var(--vscode-menu-disabledForeground, var(--color-text-muted))"
                      : "var(--vscode-menu-foreground, var(--color-text-primary))";
                }
              }}
            >
              {/* 图标区域 */}
              <span className="w-4 h-4 flex items-center justify-center shrink-0 text-[12px]">
                {item.checked ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M14 4.5L6 12.5L2 8.5L3.5 7L6 9.5L12.5 3L14 4.5Z" />
                  </svg>
                ) : (
                  item.icon ?? null
                )}
              </span>

              {/* 标签 */}
              <span className="flex-1 text-left truncate">{item.label}</span>

              {/* 快捷键 */}
              {item.shortcut && (
                <span
                  className="ml-auto pl-4 text-[11px] opacity-60"
                  style={{ fontFamily: "inherit" }}
                >
                  {item.shortcut}
                </span>
              )}

              {/* 子菜单箭头 */}
              {hasSubmenu && (
                <svg
                  className="ml-auto shrink-0"
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M5.5 3L11.5 8L5.5 13V3Z" />
                </svg>
              )}
            </button>

            {/* 二级子菜单 */}
            {hasSubmenu && isSubmenuOpen && (
              <div
                className="absolute top-0 min-w-[160px] py-[3px] rounded-[5px]"
                style={{
                  ...(submenuPos === "right" ? { left: "100%" } : { right: "100%" }),
                  background: "var(--vscode-menu-background, var(--color-surface))",
                  border: "1px solid var(--vscode-menu-border, var(--color-border))",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.08)",
                }}
                onMouseEnter={() => {
                  if (hoverTimerRef.current) {
                    clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = null;
                  }
                }}
              >
                {item.submenu!.map((sub) => {
                  if (isSeparator(sub)) {
                    return (
                      <div
                        key={sub.key}
                        className="my-[3px] mx-2 h-px"
                        style={{ background: "var(--vscode-menu-separatorBackground, var(--color-border))" }}
                      />
                    );
                  }
                  return (
                    <button
                      key={sub.key}
                      className={`
                        w-full flex items-center gap-2 px-3 py-[4px] text-[12px] leading-[18px]
                        transition-none outline-none
                        ${sub.disabled ? "opacity-40 cursor-default" : "cursor-pointer"}
                      `}
                      style={{
                        color: sub.disabled
                          ? "var(--vscode-menu-disabledForeground, var(--color-text-muted))"
                          : "var(--vscode-menu-foreground, var(--color-text-primary))",
                      }}
                      onClick={() => {
                        if (!sub.disabled) {
                          sub.onClick?.();
                          onClose();
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (!sub.disabled) {
                          (e.currentTarget as HTMLElement).style.background =
                            "var(--vscode-menu-selectionBackground, var(--color-accent))";
                          (e.currentTarget as HTMLElement).style.color =
                            "var(--vscode-menu-selectionForeground, #fff)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                        (e.currentTarget as HTMLElement).style.color = sub.disabled
                          ? "var(--vscode-menu-disabledForeground, var(--color-text-muted))"
                          : "var(--vscode-menu-foreground, var(--color-text-primary))";
                      }}
                    >
                      <span className="w-4 h-4 flex items-center justify-center shrink-0 text-[12px]">
                        {sub.checked ? (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M14 4.5L6 12.5L2 8.5L3.5 7L6 9.5L12.5 3L14 4.5Z" />
                          </svg>
                        ) : (
                          sub.icon ?? null
                        )}
                      </span>
                      <span className="flex-1 text-left truncate">{sub.label}</span>
                      {sub.shortcut && (
                        <span className="ml-auto pl-4 text-[11px] opacity-60">{sub.shortcut}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
