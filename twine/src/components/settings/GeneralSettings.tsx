import { useState } from "react";
import { t, useLocaleStore, type Locale } from "@/i18n/locale";
import { IconSaveBtn } from "@/components/common/Icons";

export function GeneralSettings() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [licenseKey, setLicenseKey] = useState("");

  function handleLanguageChange(l: Locale) {
    setLocale(l);
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("general.account")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
          {t("general.account.desc")}
        </p>
        <div className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface-secondary)] rounded-lg px-3 py-4 text-center">
          {t("settings.coming_soon")}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("general.license")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
          {t("general.license.placeholder")}
        </p>
        <div className="flex gap-2">
          <input
            className="input text-xs flex-1"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            placeholder={t("general.license.placeholder")}
          />
          <button className="btn btn-ghost text-xs px-3 py-1"><IconSaveBtn size={11} /> {t("save")}</button>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("general.language")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
          {t("general.language.desc")}
        </p>
        <div className="flex gap-2">
          {(["zh-CN", "en-US"] as Locale[]).map((l) => (
            <button
              key={l}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                locale === l
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/30"
                  : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
              onClick={() => handleLanguageChange(l)}
            >
              {l === "zh-CN" ? "🇨🇳 中文" : "🇺🇸 English"}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}