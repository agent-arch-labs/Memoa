import { useState, useCallback, useRef, useEffect } from "react";
import { getJson, setJson } from "@/services/storageService";
import { t } from "@/i18n/locale";
import type { PanelView } from "@/types";

const MENU_CONFIG_KEY = "menu_config";

export interface MenuItemConfig {
  id: PanelView;
  label: string;
  icon: string;
  enabled: boolean;
  order: number;
}

const DEFAULT_MENU_ITEMS: MenuItemConfig[] = [
  { id: "files", label: "文件浏览器", icon: "📁", enabled: true, order: 0 },
  { id: "search", label: "搜索", icon: "🔍", enabled: true, order: 1 },
  { id: "tags", label: "标签", icon: "🏷", enabled: true, order: 2 },
  { id: "graph", label: "图谱", icon: "🔗", enabled: true, order: 3 },
  { id: "daily", label: "日报", icon: "📅", enabled: true, order: 4 },
  { id: "knowledge", label: "知识库", icon: "📚", enabled: true, order: 5 },
];

const PRESET_ICONS = ["📁", "🔍", "🏷", "🔗", "📅", "📚", "🏠", "⭐", "💡", "📝", "🔖", "📌", "🗂", "📋", "💬", "🧠", "⚡", "🎯", "🔔", "❤️"];

export function loadMenuConfig(): MenuItemConfig[] {
  const stored = getJson<MenuItemConfig[] | null>(MENU_CONFIG_KEY, null);
  if (stored && stored.length > 0) {
    const merged = DEFAULT_MENU_ITEMS.map((def) => {
      const found = stored.find((s) => s.id === def.id);
      return found ? { ...def, ...found } : def;
    });
    merged.sort((a, b) => {
      const aIdx = stored.findIndex((s) => s.id === a.id);
      const bIdx = stored.findIndex((s) => s.id === b.id);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return a.order - b.order;
    });
    return merged;
  }
  return [...DEFAULT_MENU_ITEMS];
}

export function saveMenuConfig(config: MenuItemConfig[]) {
  setJson(MENU_CONFIG_KEY, config);
}

export function getEnabledMenuItems(): MenuItemConfig[] {
  return loadMenuConfig().filter((m) => m.enabled).sort((a, b) => {
    const cfg = loadMenuConfig();
    const aIdx = cfg.findIndex((c) => c.id === a.id);
    const bIdx = cfg.findIndex((c) => c.id === b.id);
    return aIdx - bIdx;
  });
}

export function MenuManagementSettings() {
  const [items, setItems] = useState<MenuItemConfig[]>(() => loadMenuConfig());
  const [editingIcon, setEditingIcon] = useState<string | null>(null);
  const [customIcon, setCustomIcon] = useState("");
  const [showPresetPicker, setShowPresetPicker] = useState<string | null>(null);
  const dragItemRef = useRef<string | null>(null);
  const dragOverItemRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIcon && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingIcon]);

  const handleToggle = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item,
      );
      saveMenuConfig(next);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    dragItemRef.current = id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    (e.currentTarget as HTMLElement).style.opacity = "0.4";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dragOverItemRef.current = id;
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    const dragId = dragItemRef.current;
    const overId = dragOverItemRef.current;
    if (!dragId || !overId || dragId === overId) return;

    setItems((prev) => {
      const next = [...prev];
      const dragIdx = next.findIndex((item) => item.id === dragId);
      const overIdx = next.findIndex((item) => item.id === overId);
      if (dragIdx < 0 || overIdx < 0) return prev;
      const [removed] = next.splice(dragIdx, 1);
      next.splice(overIdx, 0, removed);
      saveMenuConfig(next);
      return next;
    });
    dragItemRef.current = null;
    dragOverItemRef.current = null;
  }, []);

  const handleDragLeave = useCallback(() => {
    dragOverItemRef.current = null;
  }, []);

  const handleReset = useCallback(() => {
    setItems([...DEFAULT_MENU_ITEMS]);
    saveMenuConfig([...DEFAULT_MENU_ITEMS]);
    setEditingIcon(null);
    setShowPresetPicker(null);
  }, []);

  const startEditIcon = useCallback((id: string, currentIcon: string) => {
    setEditingIcon(id);
    setCustomIcon(currentIcon);
    setShowPresetPicker(null);
  }, []);

  const saveCustomIcon = useCallback((id: string) => {
    if (customIcon.trim()) {
      setItems((prev) => {
        const next = prev.map((item) =>
          item.id === id ? { ...item, icon: customIcon.trim() } : item,
        );
        saveMenuConfig(next);
        return next;
      });
    }
    setEditingIcon(null);
    setCustomIcon("");
  }, [customIcon]);

  const selectPresetIcon = useCallback((id: string, icon: string) => {
    setItems((prev) => {
      const next = prev.map((item) =>
        item.id === id ? { ...item, icon } : item,
      );
      saveMenuConfig(next);
      return next;
    });
    setShowPresetPicker(null);
    setEditingIcon(null);
  }, []);

  const handleIconKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === "Enter") {
        saveCustomIcon(id);
      } else if (e.key === "Escape") {
        setEditingIcon(null);
      }
    },
    [saveCustomIcon],
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("settings.menu_management")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-3">
          {t("settings.menu_management.desc")}
        </p>

        <div className="space-y-0.5">
          {items.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => handleDragStart(e, item.id)}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDragEnd={handleDragEnd}
              onDragLeave={handleDragLeave}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-colors ${
                item.enabled
                  ? "bg-[var(--color-surface-secondary)]"
                  : "bg-[var(--color-surface-secondary)]/40 opacity-50"
              }`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-[10px] text-[var(--color-text-muted)] cursor-grab shrink-0">
                  ⋮⋮
                </span>

                <div className="relative shrink-0">
                  {editingIcon === item.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        ref={inputRef}
                        className="w-10 h-6 text-center text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded"
                        value={customIcon}
                        onChange={(e) => setCustomIcon(e.target.value)}
                        onKeyDown={(e) => handleIconKeyDown(e, item.id)}
                        onBlur={() => saveCustomIcon(item.id)}
                        maxLength={2}
                      />
                      <button
                        className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                        onClick={() => setShowPresetPicker(item.id)}
                        title="选择预设图标"
                      >
                        ☰
                      </button>
                    </div>
                  ) : (
                    <button
                      className="w-8 h-7 flex items-center justify-center text-sm rounded hover:bg-[var(--color-surface-hover)] transition-colors"
                      onClick={() => startEditIcon(item.id, item.icon)}
                      title="点击修改图标"
                    >
                      {item.icon}
                    </button>
                  )}

                  {showPresetPicker === item.id && (
                    <div className="absolute top-full left-0 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-2 shadow-lg z-50 w-[180px]">
                      <div className="flex flex-wrap gap-1">
                        {PRESET_ICONS.map((icon) => (
                          <button
                            key={icon}
                            className="w-7 h-7 flex items-center justify-center text-sm rounded hover:bg-[var(--color-accent)]/10 transition-colors"
                            onClick={() => selectPresetIcon(item.id, icon)}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                      <button
                        className="mt-2 w-full text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] py-1"
                        onClick={() => {
                          setShowPresetPicker(null);
                          startEditIcon(item.id, item.icon);
                        }}
                      >
                        自定义...
                      </button>
                    </div>
                  )}
                </div>

                <span className="text-xs text-[var(--color-text-primary)] truncate">
                  {item.label}
                </span>
              </div>

              <button
                className={`relative w-8 h-5 rounded-full transition-colors shrink-0 ${
                  item.enabled
                    ? "bg-[var(--color-accent)]"
                    : "bg-[var(--color-border)]"
                }`}
                onClick={() => handleToggle(item.id)}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    item.enabled ? "left-[14px]" : "left-[2px]"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <button
          className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] underline"
          onClick={handleReset}
        >
          {t("settings.menu_management.reset")}
        </button>
      </section>
    </div>
  );
}