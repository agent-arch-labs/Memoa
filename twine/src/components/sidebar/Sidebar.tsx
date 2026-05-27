import { useRef, useMemo } from "react";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { PanelView } from "@/types";
import { FilesPanel } from "./FilesPanel";
import { SearchPanel } from "./SearchPanel";
import { TagsPanel } from "./TagsPanel";
import { GraphPanel } from "./GraphPanel";
import { DailyPanel } from "./DailyPanel";
import { SettingsPanel } from "./SettingsPanel";
import { KnowledgePanel } from "./KnowledgePanel";
import { loadMenuConfig } from "@/components/settings/MenuManagementSettings";

const DEFAULT_NAV_ITEMS: { id: PanelView; label: string; icon: string }[] = [
  { id: "files", label: "文件浏览器", icon: "📁" },
  { id: "search", label: "搜索", icon: "🔍" },
  { id: "tags", label: "标签", icon: "🏷" },
  { id: "graph", label: "图谱", icon: "🔗" },
  { id: "daily", label: "日报", icon: "📅" },
  { id: "knowledge", label: "知识库", icon: "📚" },
];

interface SidebarProps {
  width: number;
  sidebarVisible: boolean;
}

export function Sidebar({ width, sidebarVisible }: SidebarProps) {
  const sidebarView = useAppStore((s) => s.sidebarView);
  const setSidebarView = useAppStore((s) => s.setSidebarView);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const settingsVisible = useAppStore((s) => s.settingsVisible);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const setDataSource = useAppStore((s) => s.setDataSource);
  const settings = useSettingsStore();
  const hasSettings = settings.llmModels.length > 0;

  const collapsed = !sidebarVisible;

  const navItems = useMemo(() => {
    const config = loadMenuConfig();
    const enabled = config.filter((m) => m.enabled);
    const defaultMap = new Map(DEFAULT_NAV_ITEMS.map((d) => [d.id, d]));
    return enabled.map((m) => ({
      id: m.id,
      label: m.label,
      icon: m.icon || defaultMap.get(m.id)?.icon || "📄",
    }));
  }, []);

  const activeNavItem = navItems.find((n) => n.id === sidebarView);
  const prevSidebarView = useRef<PanelView>("files");

  function handleNavClick(id: PanelView) {
    prevSidebarView.current = sidebarView;
    if (settingsVisible) {
      toggleSettings();
    }
    setSidebarView(id);
    if (collapsed) {
      toggleSidebar();
    }

    if (id === "files") {
      setDataSource("local");
      setContextTarget({ type: "all", label: "全部文件" });
    } else if (id === "knowledge") {
      console.log("[Sidebar] handleNavClick knowledge, setting dataSource='knowledge'");
      setDataSource("knowledge");
      setContextTarget({ type: "all", label: "全部知识库" });
    }
  }

  function handleSettingsClick() {
    if (collapsed) {
      toggleSidebar();
    }
    if (!settingsVisible) {
      setSidebarView("settings");
    } else {
      setSidebarView(prevSidebarView.current);
    }
    toggleSettings();
  }

  return (
    <aside
      className="flex shrink-0 bg-[var(--color-surface-secondary)] border-r border-[var(--color-border)] h-full relative"
      style={{ width: collapsed ? 40 : width, transition: "width 0.15s ease" }}
    >
      <div className="w-10 flex flex-col items-center shrink-0 border-r border-[var(--color-border)] py-1 gap-0.5">
        {navItems.map((item) => {
          const isActive = !settingsVisible && sidebarView === item.id;
          return (
            <button
              key={item.id}
              className={`w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors
                ${
                  isActive
                    ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                }`}
              onClick={() => handleNavClick(item.id)}
              title={item.label}
            >
              {item.icon}
            </button>
          );
        })}

        <div className="flex-1" />

        <button
          className={`w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors relative
            ${
              settingsVisible
                ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          onClick={handleSettingsClick}
          title="个人设置"
        >
          <span className="text-sm">⚙</span>
          {hasSettings && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <div className="flex items-center px-3 h-10 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-surface)]">
            <span className="text-xs font-medium text-[var(--color-text-primary)]">
              {settingsVisible ? "个人设置" : activeNavItem?.label || ""}
            </span>
          </div>

          <div className="flex-1 overflow-hidden">
            {settingsVisible ? (
              <SettingsPanel />
            ) : (
              <>
                {sidebarView === "files" && <FilesPanel />}
                {sidebarView === "search" && <SearchPanel />}
                {sidebarView === "tags" && <TagsPanel />}
                {sidebarView === "graph" && <GraphPanel />}
                {sidebarView === "daily" && <DailyPanel />}
                {sidebarView === "knowledge" && <KnowledgePanel />}
              </>
            )}
          </div>

          </div>
      )}
    </aside>
  );
}