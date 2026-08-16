import { t } from "@/i18n/locale";
import { IconPlug } from "@/components/common/Icons";

interface PluginSettingsProps {
  pluginId: string;
}

export function PluginSettings({ pluginId }: PluginSettingsProps) {
  const key = `settings.plugin.${pluginId}`;
  const descKey = `settings.plugin.${pluginId}.desc`;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-2xl mb-3 opacity-40"><IconPlug size={20} /></div>
        <div className="text-xs font-medium text-[var(--color-text-primary)] mb-1">
          {t(key)}
        </div>
        <div className="text-[10px] text-[var(--color-text-muted)] max-w-[240px]">
          {t(descKey)}
        </div>
        <div className="mt-4 text-[10px] text-[var(--color-text-muted)]/60 bg-[var(--color-surface-secondary)] rounded-lg px-3 py-2">
          {t("settings.coming_soon.desc")}
        </div>
      </div>
    </div>
  );
}