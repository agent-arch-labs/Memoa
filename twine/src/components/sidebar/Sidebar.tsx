import { useMemo } from "react";
import { useAppStore } from "@/stores/appStore";
import type { PanelView } from "@/types";
import { FilesPanel } from "./FilesPanel";
import { SearchPanel } from "./SearchPanel";
import { TagsPanel } from "./TagsPanel";
import { GraphPanel } from "./GraphPanel";
import { DailyPanel } from "./DailyPanel";
import { KnowledgePanel } from "./KnowledgePanel";
import { TradePanel } from "./TradePanel";
import { ReviewPanel } from "./ReviewPanel";
import { InsightsPanel } from "./InsightsPanel";
import { SimilarKPanel } from "./SimilarKPanel";
import { ThemesPanel } from "./ThemesPanel";
import { StocksPanel } from "./StocksPanel";
import { StrategyPanel } from "./StrategyPanel";
import { TimelinePanel } from "./TimelinePanel";
import { loadMenuConfig } from "@/components/settings/MenuManagementSettings";
import { IconWindowMaximize, IconWindowRestore } from "@/components/common/Icons";

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

const REVIEW_SUB_ITEMS: { id: PanelView; label: string }[] = [
  { id: "timeline", label: "时序图" },
  { id: "review", label: "选股筛选" },
  { id: "insights", label: "心得体会" },
  { id: "themes", label: "热点题材" },
  { id: "strategy", label: "策略管理" },
];

const REVIEW_CHILD_IDS = new Set(REVIEW_SUB_ITEMS.map((s) => s.id));

interface SidebarProps {
  width: number;
}

export function Sidebar({ width }: SidebarProps) {
  const sidebarView = useAppStore((s) => s.sidebarView);
  const maximizedPanel = useAppStore((s) => s.maximizedPanel);
  const setSidebarVisible = useAppStore((s) => s.setSidebarVisible);
  const toggleMaximizePanel = useAppStore((s) => s.toggleMaximizePanel);

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
  const activeSubItem = REVIEW_SUB_ITEMS.find((s) => s.id === sidebarView);
  const activeNavItem = navItems.find((n) => n.id === sidebarView) || (isReviewActive ? navItems.find((n) => n.id === "review_hub") : null);

  function renderContentPanel() {
    switch (sidebarView) {
      case "files": return <FilesPanel />;
      case "search": return <SearchPanel />;
      case "tags": return <TagsPanel />;
      case "graph": return <GraphPanel />;
      case "daily": return <DailyPanel />;
      case "knowledge": return <KnowledgePanel />;
      case "trade": return <TradePanel />;
      case "review": return <ReviewPanel />;
      case "insights": return <InsightsPanel />;
      case "similar_k": return <SimilarKPanel />;
      case "themes": return <ThemesPanel />;
      case "stocks": return <StocksPanel />;
      case "strategy": return <StrategyPanel />;
      case "timeline": return <TimelinePanel />;
      default: return <TimelinePanel />;
    }
  }

  return (
    <aside
      className="flex shrink-0 bg-[var(--color-surface-secondary)] border-r border-[var(--color-border)] h-full overflow-hidden"
      style={{ width }}
    >
      {width > 0 && (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* 标题栏 */}
        <div className="flex items-center px-3 h-10 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-surface)]">
          {isReviewActive ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-xs font-medium text-[var(--color-text-primary)]">复盘</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">/</span>
              <span className="text-xs text-[var(--color-accent)] truncate">
                {activeSubItem?.label || "选股筛选"}
              </span>
            </div>
          ) : (
            <span className="text-xs font-medium text-[var(--color-text-primary)] flex-1 min-w-0">
              {activeNavItem?.label || ""}
            </span>
          )}
          <button
            className="icon-btn icon-btn-sm"
            onClick={() => toggleMaximizePanel("sidebar")}
            title={maximizedPanel === "sidebar" ? "还原 (Ctrl+Shift+M)" : "最大化 (Ctrl+Shift+M)"}
          >
            {maximizedPanel === "sidebar" ? <IconWindowRestore size={10} /> : <IconWindowMaximize size={10} />}
          </button>
          <button
            className="icon-btn icon-btn-sm"
            onClick={() => {
              if (maximizedPanel === "sidebar") toggleMaximizePanel("sidebar");
              setSidebarVisible(false);
            }}
            title="关闭侧边栏 (Ctrl+B)"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* 复盘二级标签栏 */}
        {isReviewActive && (
          <div className="flex items-center px-1 border-b border-[var(--color-border)]/50 bg-[var(--color-surface)] shrink-0 overflow-x-auto">
            {REVIEW_SUB_ITEMS.map((sub) => (
              <button
                key={sub.id}
                className={`px-3 py-2 text-[11px] transition-colors relative whitespace-nowrap shrink-0 ${
                  sidebarView === sub.id
                    ? "text-[var(--color-accent)] font-medium"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                }`}
                onClick={() => useAppStore.getState().setSidebarView(sub.id)}
              >
                {sub.label}
                {sidebarView === sub.id && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--color-accent)] rounded-full" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* 面板内容 */}
        <div className="flex-1 overflow-hidden">
          {renderContentPanel()}
        </div>
      </div>
      )}
    </aside>
  );
}
