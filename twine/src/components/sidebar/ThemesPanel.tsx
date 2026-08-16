import { useState } from "react";
import { getJson, setJson } from "@/services/storageService";
import type { ThemeEntry, ThemeCategory, ThemeLifecycle } from "@/types";
import { renderIcon } from "@/components/common/Icons";

const THEME_STORAGE_KEY = "memoa_theme_entries";

function loadThemes(): ThemeEntry[] {
  return getJson<ThemeEntry[]>(THEME_STORAGE_KEY, []);
}

function saveThemes(themes: ThemeEntry[]) {
  setJson(THEME_STORAGE_KEY, themes);
}

const THEME_CATEGORIES: { key: ThemeCategory; label: string; icon: string }[] = [
  { key: "policy", label: "政策驱动", icon: "📜" },
  { key: "industry", label: "产业趋势", icon: "🏭" },
  { key: "event", label: "事件催化", icon: "⚡" },
  { key: "cyclical", label: "周期轮动", icon: "🔄" },
];

const LIFECYCLE_LABELS: Record<ThemeLifecycle, { label: string; color: string }> = {
  sprout: { label: "萌芽期", color: "text-yellow-400" },
  explode: { label: "爆发期", color: "text-red-400" },
  differentiate: { label: "分化期", color: "text-orange-400" },
  ebb: { label: "退潮期", color: "text-gray-400" },
};

export function ThemesPanel() {
  const [themes, setThemes] = useState<ThemeEntry[]>(() => loadThemes());
  const [showForm, setShowForm] = useState(false);
  const [filterCat, setFilterCat] = useState<ThemeCategory | "all">("all");

  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<ThemeCategory>("policy");
  const [formLifecycle, setFormLifecycle] = useState<ThemeLifecycle>("sprout");
  const [formDescription, setFormDescription] = useState("");
  const [formLeadingStocks, setFormLeadingStocks] = useState("");
  const [formRelatedStocks, setFormRelatedStocks] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formNotes, setFormNotes] = useState("");

  function createTheme() {
    if (!formName.trim()) return;

    const entry: ThemeEntry = {
      id: crypto.randomUUID(),
      name: formName,
      category: formCategory,
      lifecycle: formLifecycle,
      description: formDescription,
      leadingStocks: formLeadingStocks.split(",").map((s) => {
        const parts = s.trim().split(":");
        return {
          code: parts[0] || "",
          name: parts[1] || parts[0] || "",
          role: "space_leader",
          boardHeight: 0,
        };
      }).filter((s) => s.code),
      relatedStocks: formRelatedStocks.split(",").map((s) => s.trim()).filter(Boolean),
      childThemes: [],
      competingThemes: [],
      keyCatalysts: [],
      tags: formTags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: formNotes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const next = [entry, ...themes];
    setThemes(next);
    saveThemes(next);
    resetForm();
  }

  function resetForm() {
    setShowForm(false);
    setFormName("");
    setFormDescription("");
    setFormLeadingStocks("");
    setFormRelatedStocks("");
    setFormTags("");
    setFormNotes("");
  }

  function deleteTheme(id: string) {
    const next = themes.filter((t) => t.id !== id);
    setThemes(next);
    saveThemes(next);
  }

  function updateLifecycle(id: string, lifecycle: ThemeLifecycle) {
    const next = themes.map((t) =>
      t.id === id ? { ...t, lifecycle, updatedAt: new Date().toISOString() } : t
    );
    setThemes(next);
    saveThemes(next);
  }

  const filtered = filterCat === "all"
    ? themes
    : themes.filter((t) => t.category === filterCat);

  const catMap = new Map(THEME_CATEGORIES.map((c) => [c.key, c]));

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--color-text-primary)]">热点题材</span>
          <button
            className="text-[10px] px-2 py-0.5 bg-[var(--color-accent)] text-white rounded hover:opacity-90"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "取消" : "+ 新增"}
          </button>
        </div>

        <div className="flex gap-1 flex-wrap">
          <button
            className={`px-1.5 py-0.5 text-[10px] rounded ${
              filterCat === "all"
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]"
            }`}
            onClick={() => setFilterCat("all")}
          >
            全部
          </button>
          {THEME_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              className={`px-1.5 py-0.5 text-[10px] rounded ${
                filterCat === cat.key
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]"
              }`}
              onClick={() => setFilterCat(cat.key)}
            >
              {renderIcon(cat.icon)} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2 bg-[var(--color-surface-secondary)]">
          <input
            className="w-full h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
            placeholder="题材名称 (如: 低空经济)"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />

          <div className="flex gap-2">
            <div className="flex gap-1">
              {THEME_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  className={`px-1.5 py-0.5 text-[10px] rounded ${
                    formCategory === cat.key
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                  }`}
                  onClick={() => setFormCategory(cat.key)}
                >
                  {renderIcon(cat.icon)}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(Object.keys(LIFECYCLE_LABELS) as ThemeLifecycle[]).map((lc) => (
                <button
                  key={lc}
                  className={`px-1.5 py-0.5 text-[10px] rounded ${
                    formLifecycle === lc
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                  }`}
                  onClick={() => setFormLifecycle(lc)}
                >
                  {LIFECYCLE_LABELS[lc].label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            className="w-full h-16 px-2 py-1 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] resize-none"
            placeholder="题材描述..."
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
          />

          <input
            className="w-full h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
            placeholder="龙头股 (代码:名称, 逗号分隔)"
            value={formLeadingStocks}
            onChange={(e) => setFormLeadingStocks(e.target.value)}
          />

          <input
            className="w-full h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
            placeholder="成分股 (逗号分隔代码)"
            value={formRelatedStocks}
            onChange={(e) => setFormRelatedStocks(e.target.value)}
          />

          <input
            className="w-full h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
            placeholder="标签 (逗号分隔)"
            value={formTags}
            onChange={(e) => setFormTags(e.target.value)}
          />

          <textarea
            className="w-full h-14 px-2 py-1 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] resize-none"
            placeholder="笔记..."
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
          />

          <div className="flex gap-2">
            <button
              className="flex-1 text-[10px] py-1 bg-[var(--color-accent)] text-white rounded hover:opacity-90"
              onClick={createTheme}
              disabled={!formName.trim()}
            >
              保存
            </button>
            <button
              className="text-[10px] py-1 px-3 bg-[var(--color-surface)] text-[var(--color-text-muted)] rounded"
              onClick={resetForm}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
            暂无题材记录
            <br />
            <span className="text-[11px]">追踪热点题材，把握市场脉搏</span>
          </div>
        ) : (
          <div className="py-1">
            {filtered.map((theme) => {
              const cat = catMap.get(theme.category);
              const lc = LIFECYCLE_LABELS[theme.lifecycle];
              return (
                <div
                  key={theme.id}
                  className="px-3 py-2 border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{renderIcon(cat?.icon ?? "")}</span>
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">
                        {theme.name}
                      </span>
                      <span className={`text-[10px] ${lc.color}`}>{lc.label}</span>
                    </div>
                    <button
                      className="text-[10px] text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                      onClick={() => deleteTheme(theme.id)}
                    >
                      删除
                    </button>
                  </div>

                  {theme.description && (
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 line-clamp-2">
                      {theme.description}
                    </div>
                  )}

                  {theme.leadingStocks.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] text-[var(--color-text-muted)]">龙头:</span>
                      {theme.leadingStocks.slice(0, 3).map((s) => (
                        <span key={s.code} className="text-[9px] px-1 py-0.5 rounded bg-red-400/10 text-red-400">
                          {s.name || s.code}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                      {cat?.label}
                    </span>
                    {theme.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]">
                        {tag}
                      </span>
                    ))}
                    <div className="ml-auto flex gap-0.5">
                      {(Object.keys(LIFECYCLE_LABELS) as ThemeLifecycle[]).map((lc2) => (
                        <button
                          key={lc2}
                          className={`text-[8px] px-1 rounded ${
                            theme.lifecycle === lc2
                              ? "bg-[var(--color-accent)] text-white"
                              : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                          }`}
                          onClick={() => updateLifecycle(theme.id, lc2)}
                          title={`切换为${LIFECYCLE_LABELS[lc2].label}`}
                        >
                          {LIFECYCLE_LABELS[lc2].label.slice(0, 1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
