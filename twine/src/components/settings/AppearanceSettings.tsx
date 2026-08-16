import { useState } from "react";
import { useAppStore, MIN_FONT_SIZE, MAX_FONT_SIZE } from "@/stores/appStore";
import { t } from "@/i18n/locale";
import { SelectDropdown } from "./SelectDropdown";
import { IconMoon, IconSun } from "@/components/common/Icons";

export function AppearanceSettings() {
  const isDark = useAppStore((s) => s.isDark);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const fontSize = useAppStore((s) => s.fontSize);
  const setFontSize = useAppStore((s) => s.setFontSize);
  const increaseFontSize = useAppStore((s) => s.increaseFontSize);
  const decreaseFontSize = useAppStore((s) => s.decreaseFontSize);
  const [editorFont, setEditorFont] = useState("monospace");
  const [interfaceFont, setInterfaceFont] = useState("system");

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("appearance.theme")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
          {t("appearance.theme.desc")}
        </p>
        <div className="flex gap-2">
          <button
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isDark
                ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/30"
                : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
            onClick={() => { if (!isDark) toggleTheme(); }}
          >
            <IconMoon size={12} /> {t("appearance.theme.dark")}
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              !isDark
                ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/30"
                : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
            onClick={() => { if (isDark) toggleTheme(); }}
          >
            <IconSun size={12} /> {t("appearance.theme.light")}
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("appearance.font_size")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
          {t("appearance.font_size.desc")}
        </p>
        <div className="flex items-center gap-2">
          <button
            className="w-7 h-7 rounded-lg text-xs font-bold bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={decreaseFontSize}
            disabled={fontSize <= MIN_FONT_SIZE}
            title={t("appearance.font_size.decrease")}
          >
            −
          </button>
          <input
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1 accent-[var(--color-accent)]"
          />
          <button
            className="w-7 h-7 rounded-lg text-xs font-bold bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={increaseFontSize}
            disabled={fontSize >= MAX_FONT_SIZE}
            title={t("appearance.font_size.increase")}
          >
            +
          </button>
          <span className="text-xs text-[var(--color-text-muted)] w-8 text-right">{fontSize}px</span>
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5">
          {t("appearance.font_size.shortcut")}
        </p>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("appearance.font_family")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
          {t("appearance.font_family.desc")}
        </p>
        <SelectDropdown
          className="w-48"
          value={editorFont}
          options={[
            { value: "monospace", label: "Monospace" },
            { value: "serif", label: "Serif" },
            { value: "system-ui", label: "System UI" },
            { value: "JetBrains Mono", label: "JetBrains Mono" },
            { value: "Fira Code", label: "Fira Code" },
          ]}
          onChange={setEditorFont}
        />
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("appearance.interface_font")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
          {t("appearance.interface_font.desc")}
        </p>
        <SelectDropdown
          className="w-48"
          value={interfaceFont}
          options={[
            { value: "system", label: "System Default" },
            { value: "Inter", label: "Inter" },
            { value: "SF Pro", label: "SF Pro" },
            { value: "PingFang SC", label: "苹方" },
          ]}
          onChange={setInterfaceFont}
        />
      </section>
    </div>
  );
}