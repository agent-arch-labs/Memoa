import { useState } from "react";
import { getJson, setJson } from "@/services/storageService";
import type { InsightEntry, InsightCategory } from "@/types";
import { renderIcon, IconCheck } from "@/components/common/Icons";

const INSIGHT_STORAGE_KEY = "memoa_insight_entries";

function loadInsights(): InsightEntry[] {
  return getJson<InsightEntry[]>(INSIGHT_STORAGE_KEY, []);
}

function saveInsights(insights: InsightEntry[]) {
  setJson(INSIGHT_STORAGE_KEY, insights);
}

const CATEGORIES: { key: InsightCategory; label: string; icon: string }[] = [
  { key: "psychology", label: "交易心理", icon: "🧠" },
  { key: "technical", label: "技术分析", icon: "📊" },
  { key: "fundamental", label: "基本面", icon: "📋" },
  { key: "theme", label: "题材理解", icon: "🔥" },
  { key: "risk", label: "风控体系", icon: "🛡️" },
  { key: "market", label: "市场感悟", icon: "🌊" },
  { key: "reading", label: "读书笔记", icon: "📖" },
];

export function InsightsPanel() {
  const [insights, setInsights] = useState<InsightEntry[]>(() => loadInsights());
  const [showForm, setShowForm] = useState(false);
  const [filterCat, setFilterCat] = useState<InsightCategory | "all">("all");

  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<InsightCategory>("psychology");
  const [formContent, setFormContent] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formConfidence, setFormConfidence] = useState(3);

  function createInsight() {
    if (!formTitle.trim() || !formContent.trim()) return;

    const entry: InsightEntry = {
      id: crypto.randomUUID(),
      title: formTitle,
      category: formCategory,
      content: formContent,
      tags: formTags.split(",").map((t) => t.trim()).filter(Boolean),
      relatedStocks: [],
      relatedTrades: [],
      relatedReviews: [],
      confidence: formConfidence,
      verified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const next = [entry, ...insights];
    setInsights(next);
    saveInsights(next);
    resetForm();
  }

  function resetForm() {
    setShowForm(false);
    setFormTitle("");
    setFormContent("");
    setFormTags("");
    setFormConfidence(3);
  }

  function deleteInsight(id: string) {
    const next = insights.filter((i) => i.id !== id);
    setInsights(next);
    saveInsights(next);
  }

  function toggleVerified(id: string) {
    const next = insights.map((i) =>
      i.id === id ? { ...i, verified: !i.verified } : i
    );
    setInsights(next);
    saveInsights(next);
  }

  const filtered = filterCat === "all"
    ? insights
    : insights.filter((i) => i.category === filterCat);

  const catMap = new Map(CATEGORIES.map((c) => [c.key, c]));

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--color-text-primary)]">心得体会</span>
          <button
            className="text-[10px] px-2 py-0.5 bg-[var(--color-accent)] text-white rounded hover:opacity-90"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "取消" : "+ 新增"}
          </button>
        </div>

        <div className="flex gap-1 flex-wrap">
          <button
            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
              filterCat === "all"
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]"
            }`}
            onClick={() => setFilterCat("all")}
          >
            全部
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
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
            className="w-full h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)]"
            placeholder="心得标题"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />

          <div className="flex gap-1 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
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

          <textarea
            className="w-full h-28 px-2 py-1 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)] resize-none"
            placeholder="心得内容 (Markdown)..."
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
          />

          <input
            className="w-full h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)]"
            placeholder="标签 (逗号分隔)"
            value={formTags}
            onChange={(e) => setFormTags(e.target.value)}
          />

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">确信度</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`w-5 h-5 text-[10px] rounded ${
                    formConfidence >= n
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                  }`}
                  onClick={() => setFormConfidence(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="flex-1 text-[10px] py-1 bg-[var(--color-accent)] text-white rounded hover:opacity-90"
              onClick={createInsight}
              disabled={!formTitle.trim() || !formContent.trim()}
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
            暂无心得记录
            <br />
            <span className="text-[11px]">记录交易智慧，形成投资体系</span>
          </div>
        ) : (
          <div className="py-1">
            {filtered.map((insight) => {
              const cat = catMap.get(insight.category);
              return (
                <div
                  key={insight.id}
                  className="px-3 py-2 border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{renderIcon(cat?.icon ?? "")}</span>
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">
                        {insight.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className={`text-[10px] px-1 rounded ${
                          insight.verified
                            ? "bg-green-500/20 text-green-400"
                            : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]"
                        }`}
                        onClick={() => toggleVerified(insight.id)}
                        title={insight.verified ? "已验证" : "标记为已验证"}
                      >
                        {insight.verified ? <IconCheck size={8} /> : "?"}
                      </button>
                      <button
                        className="text-[10px] text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                        onClick={() => deleteInsight(insight.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 line-clamp-2">
                    {insight.content.slice(0, 100)}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                      {cat?.label}
                    </span>
                    {insight.tags.map((tag) => (
                      <span key={tag} className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]">
                        {tag}
                      </span>
                    ))}
                    <span className="text-[9px] text-[var(--color-text-muted)] ml-auto">
                      确信度 {"★".repeat(insight.confidence)}{"☆".repeat(5 - insight.confidence)}
                    </span>
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
