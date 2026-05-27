import { t } from "@/i18n/locale";

export function HotKeysSettings() {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-2xl mb-3 opacity-40">⌨️</div>
        <div className="text-xs font-medium text-[var(--color-text-primary)] mb-1">
          {t("hotkeys.coming_soon")}
        </div>
        <div className="text-[10px] text-[var(--color-text-muted)] max-w-[240px]">
          {t("hotkeys.coming_soon.desc")}
        </div>
      </div>
    </div>
  );
}