import { useState } from "react";
import { t } from "@/i18n/locale";
import { SelectDropdown } from "./SelectDropdown";
import { useAppStore } from "@/stores/appStore";

export function EditSettings() {
  const [tabSize, setTabSize] = useState("4");
  const [spellCheck, setSpellCheck] = useState(false);
  const autoSaveEnabled = useAppStore((s) => s.autoSaveEnabled);
  const setAutoSaveEnabled = useAppStore((s) => s.setAutoSaveEnabled);
  const showLineNumbers = useAppStore((s) => s.showLineNumbers);
  const setShowLineNumbers = useAppStore((s) => s.setShowLineNumbers);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("edit.tab_size")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
          {t("edit.tab_size.desc")}
        </p>
        <SelectDropdown
          className="w-24"
          value={tabSize}
          options={["2", "4", "8"].map((n) => ({ value: n, label: n }))}
          onChange={setTabSize}
        />
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("edit.show_line_numbers")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
          {t("edit.show_line_numbers.desc")}
        </p>
        <Toggle value={showLineNumbers} onChange={setShowLineNumbers} />
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("edit.auto_save")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
          {t("edit.auto_save.desc")}
        </p>
        <Toggle value={autoSaveEnabled} onChange={setAutoSaveEnabled} />
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
          {t("edit.spell_check")}
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
          {t("edit.spell_check.desc")}
        </p>
        <Toggle value={spellCheck} onChange={setSpellCheck} />
      </section>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        value ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
      }`}
      onClick={() => onChange(!value)}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          value ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}