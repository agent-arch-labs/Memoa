import { useMemo, useState, type FC } from "react";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { PanelView } from "@/types";
import { loadMenuConfig } from "@/components/settings/MenuManagementSettings";

const REVIEW_SUB_ITEMS: { id: PanelView; label: string }[] = [
  { id: "timeline", label: "时序图" },
  { id: "review", label: "选股筛选" },
  { id: "insights", label: "心得体会" },
  { id: "themes", label: "热点题材" },
  { id: "strategy", label: "策略管理" },
];

const REVIEW_CHILD_IDS = new Set(REVIEW_SUB_ITEMS.map((s) => s.id));

const SHORTCUT_HINTS: Partial<Record<PanelView, string>> = {
  files: "Ctrl+Shift+E",
  search: "Ctrl+Shift+F",
  knowledge: "Ctrl+Shift+K",
  review_hub: "Ctrl+Shift+R",
  stocks: "Ctrl+Shift+S",
};

// ── VSCode 风格 SVG 线条图标 ──────────────────────────────

const FilesIcon: FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const SearchIcon: FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const TagsIcon: FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

const GraphIcon: FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="6" r="2.5" />
    <circle cx="19" cy="6" r="2.5" />
    <circle cx="12" cy="18" r="2.5" />
    <line x1="6.8" y1="7.5" x2="10.2" y2="16.5" />
    <line x1="17.2" y1="7.5" x2="13.8" y2="16.5" />
    <line x1="7.5" y1="6" x2="16.5" y2="6" />
  </svg>
);

const DailyIcon: FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <rect x="7" y="13" width="3" height="3" rx="0.5" />
  </svg>
);

const KnowledgeIcon: FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <line x1="8" y1="7" x2="16" y2="7" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const TradeIcon: FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

const ReviewIcon: FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const StocksIcon: FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const SettingsIcon: FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const ICON_MAP: Record<string, FC> = {
  files: FilesIcon,
  search: SearchIcon,
  tags: TagsIcon,
  graph: GraphIcon,
  daily: DailyIcon,
  knowledge: KnowledgeIcon,
  trade: TradeIcon,
  review_hub: ReviewIcon,
  stocks: StocksIcon,
};

const DEFAULT_NAV_ITEMS: { id: PanelView; label: string }[] = [
  { id: "files", label: "文件浏览器" },
  { id: "search", label: "搜索" },
  { id: "tags", label: "标签" },
  { id: "graph", label: "图谱" },
  { id: "daily", label: "日报" },
  { id: "knowledge", label: "知识库" },
  { id: "trade", label: "交易日志" },
  { id: "review_hub", label: "复盘" },
  { id: "stocks", label: "个股档案" },
];

export function ActivityBar() {
  const sidebarView = useAppStore((s) => s.sidebarView);
  const setSidebarView = useAppStore((s) => s.setSidebarView);
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const setSidebarVisible = useAppStore((s) => s.setSidebarVisible);
  const settingsVisible = useAppStore((s) => s.settingsVisible);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const setDataSource = useAppStore((s) => s.setDataSource);
  const setMaximizedPanel = useAppStore((s) => s.setMaximizedPanel);
  const settings = useSettingsStore();
  const hasSettings = settings.llmModels.length > 0;

  const navItems = useMemo(() => {
    const config = loadMenuConfig();
    const enabled = config.filter((m) => m.enabled);
    const defaultMap = new Map(DEFAULT_NAV_ITEMS.map((d) => [d.id, d]));
    return enabled.map((m) => ({
      id: m.id,
      label: m.label || defaultMap.get(m.id)?.label || m.id,
    }));
  }, []);

  const isReviewActive = REVIEW_CHILD_IDS.has(sidebarView) || sidebarView === "review_hub";

  function handleNavClick(id: PanelView) {
    const state = useAppStore.getState();
    if (state.settingsVisible) {
      toggleSettings();
    }
    if (state.maximizedPanel && state.maximizedPanel !== "sidebar") {
      setMaximizedPanel(null);
    }
    const currentVisible = useAppStore.getState().sidebarVisible;
    const currentView = useAppStore.getState().sidebarView;
    if (currentVisible && currentView === id) {
      setSidebarVisible(false);
      return;
    }
    setSidebarView(id);
    if (!currentVisible) {
      setSidebarVisible(true);
    }

    if (id === "files") {
      setDataSource("local");
      setContextTarget({ type: "all", label: "全部文件" });
    } else if (id === "knowledge") {
      setDataSource("knowledge");
      setContextTarget({ type: "all", label: "全部知识库" });
    }
  }

  function handleReviewClick() {
    const state = useAppStore.getState();
    if (state.settingsVisible) {
      toggleSettings();
    }
    if (state.maximizedPanel && state.maximizedPanel !== "sidebar") {
      setMaximizedPanel(null);
    }
    const currentVisible = useAppStore.getState().sidebarVisible;
    const currentView = useAppStore.getState().sidebarView;
    const reviewActive = REVIEW_CHILD_IDS.has(currentView) || currentView === "review_hub";
    if (currentVisible && reviewActive) {
      setSidebarVisible(false);
      return;
    }
    if (!currentVisible) {
      setSidebarVisible(true);
    }
    if (!REVIEW_CHILD_IDS.has(currentView)) {
      setSidebarView("timeline");
    }
  }

  function handleSettingsClick() {
    toggleSettings();
  }

  function isItemActive(id: PanelView): boolean {
    if (settingsVisible) return false;
    if (!sidebarVisible) return false;
    if (id === "review_hub") return isReviewActive;
    return sidebarView === id;
  }

  function renderIcon(id: PanelView) {
    const Icon = ICON_MAP[id];
    if (Icon) return <Icon />;
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="15" y1="9" x2="9" y2="15" />
      </svg>
    );
  }

  const activeClass =
    "text-[var(--color-accent)] bg-[var(--color-accent)]/10 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[2px] before:h-5 before:bg-[var(--color-accent)] before:rounded-r";
  const inactiveClass =
    "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer";

  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <div className="w-12 flex flex-col items-center shrink-0 bg-[var(--color-surface-secondary)] border-r border-[var(--color-border)] py-1 gap-0.5">
      {navItems.map((item) => {
        const active = isItemActive(item.id);
        const onClick = item.id === "review_hub" ? handleReviewClick : () => handleNavClick(item.id);
        const isHovered = hoveredItem === item.id;

        return (
          <div key={item.id} className="relative">
            <button
              className={`w-11 h-11 flex items-center justify-center rounded-md transition-all duration-150 relative focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${active ? activeClass : inactiveClass}`}
              onClick={onClick}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              {renderIcon(item.id)}
            </button>
            {/* VSCode 风格悬浮提示 */}
            {isHovered && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none">
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg shadow-black/20 px-3 py-1.5 flex items-center gap-2 whitespace-nowrap">
                  <span className="text-[12px] text-[var(--color-text-primary)] font-medium">{item.label}</span>
                  {SHORTCUT_HINTS[item.id] && (
                    <kbd className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">{SHORTCUT_HINTS[item.id]}</kbd>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex-1" />

      <div className="relative">
        <button
          className={`w-11 h-11 flex items-center justify-center rounded-md transition-all duration-150 relative cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${settingsVisible ? activeClass : inactiveClass}`}
          onClick={handleSettingsClick}
          onMouseEnter={() => setHoveredItem("settings")}
          onMouseLeave={() => setHoveredItem(null)}
        >
          <SettingsIcon />
          {hasSettings && (
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
          )}
        </button>
        {hoveredItem === "settings" && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg shadow-black/20 px-3 py-1.5 flex items-center gap-2 whitespace-nowrap">
              <span className="text-[12px] text-[var(--color-text-primary)] font-medium">个人设置</span>
              <kbd className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">Ctrl+,</kbd>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
