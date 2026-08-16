import { useState } from "react";
import { t } from "@/i18n/locale";
import { GeneralSettings } from "./GeneralSettings";
import { renderIcon } from "@/components/common/Icons";
import { EditSettings } from "./EditSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { HotKeysSettings } from "./HotKeysSettings";
import { ModelsSettings } from "./ModelsSettings";
import { DataSettings } from "./DataSettings";
import { SearchExtensionsSettings } from "./SearchExtensionsSettings";
import { KnowledgeBaseSettings } from "./KnowledgeBaseSettings";
import { AgentSettings } from "./AgentSettings";
import { PluginSettings } from "./PluginSettings";
import { MenuManagementSettings } from "./MenuManagementSettings";

type SettingsPageId = "general" | "edit" | "appearance" | "hotkeys" | "models" | "data" | "knowledge_base" | "search_extensions" | "agent" | "menu_management" | "sync" | "pagepreview" | "templates" | "dailynotes" | "backlinks";

interface NavItem {
  id: SettingsPageId;
  labelKey: string;
  descKey: string;
  icon: string;
}

const OPTION_ITEMS: NavItem[] = [
  { id: "general", labelKey: "settings.general", descKey: "settings.general.desc", icon: "⚙" },
  { id: "edit", labelKey: "settings.edit", descKey: "settings.edit.desc", icon: "✎" },
  { id: "appearance", labelKey: "settings.appearance", descKey: "settings.appearance.desc", icon: "🎨" },
  { id: "hotkeys", labelKey: "settings.hotkeys", descKey: "settings.hotkeys.desc", icon: "⌨" },
  { id: "models", labelKey: "settings.models", descKey: "settings.models.desc", icon: "🤖" },
  { id: "data", labelKey: "settings.data", descKey: "settings.data.desc", icon: "📊" },
  { id: "knowledge_base", labelKey: "settings.knowledge_base", descKey: "settings.knowledge_base.desc", icon: "📚" },
  { id: "search_extensions", labelKey: "settings.search_extensions", descKey: "settings.search_extensions.desc", icon: "🔍" },
  { id: "agent", labelKey: "settings.agent", descKey: "settings.agent.desc", icon: "🧠" },
  { id: "menu_management", labelKey: "settings.menu_management", descKey: "settings.menu_management.desc", icon: "📋" },
];

const PLUGIN_ITEMS: NavItem[] = [
  { id: "sync", labelKey: "settings.plugin.sync", descKey: "settings.plugin.sync.desc", icon: "🔄" },
  { id: "pagepreview", labelKey: "settings.plugin.pagepreview", descKey: "settings.plugin.pagepreview.desc", icon: "👁" },
  { id: "templates", labelKey: "settings.plugin.templates", descKey: "settings.plugin.templates.desc", icon: "📋" },
  { id: "dailynotes", labelKey: "settings.plugin.dailynotes", descKey: "settings.plugin.dailynotes.desc", icon: "📅" },
  { id: "backlinks", labelKey: "settings.plugin.backlinks", descKey: "settings.plugin.backlinks.desc", icon: "🔗" },
];

function renderPage(pageId: SettingsPageId) {
  switch (pageId) {
    case "general":
      return <GeneralSettings />;
    case "edit":
      return <EditSettings />;
    case "appearance":
      return <AppearanceSettings />;
    case "hotkeys":
      return <HotKeysSettings />;
    case "models":
      return <ModelsSettings />;
    case "data":
      return <DataSettings />;
    case "search_extensions":
      return <SearchExtensionsSettings />;
    case "knowledge_base":
      return <KnowledgeBaseSettings />;
    case "agent":
      return <AgentSettings />;
    case "menu_management":
      return <MenuManagementSettings />;
    case "sync":
    case "pagepreview":
    case "templates":
    case "dailynotes":
    case "backlinks":
      return <PluginSettings pluginId={pageId} />;
    default:
      return <GeneralSettings />;
  }
}

export function SettingsLayout() {
  const [activePage, setActivePage] = useState<SettingsPageId>("general");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["options", "plugins"])
  );

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  function renderNavGroup(
    groupId: string,
    groupLabel: string,
    items: NavItem[]
  ) {
    const isExpanded = expandedGroups.has(groupId);

    return (
      <div className="mb-1">
        <button
          className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          onClick={() => toggleGroup(groupId)}
        >
          <svg
            className={`w-2.5 h-2.5 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>{groupLabel}</span>
        </button>

        {isExpanded && (
          <div className="ml-1">
            {items.map((item) => (
              <button
                key={item.id}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-[11px] transition-colors text-left ${
                  activePage === item.id
                    ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-l-2 border-[var(--color-accent)] font-medium"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] border-l-2 border-transparent"
                }`}
                onClick={() => setActivePage(item.id)}
              >
                <span className="text-xs w-4 text-center shrink-0">{renderIcon(item.icon)}</span>
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{t(item.labelKey)}</span>
                  <span className="text-[9px] text-[var(--color-text-muted)]/60 truncate">
                    {t(item.descKey)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-surface)]">
      <div className="flex items-center justify-between px-3 h-10 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-surface)]">
        <span className="text-xs font-medium text-[var(--color-text-primary)]">
          {t("settings.title")}
        </span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[200px] border-r border-[var(--color-border)] overflow-y-auto shrink-0 py-2">
          {renderNavGroup("options", t("settings.options"), OPTION_ITEMS)}
          {renderNavGroup("plugins", t("settings.plugins"), PLUGIN_ITEMS)}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {renderPage(activePage)}
        </div>
      </div>
    </div>
  );
}