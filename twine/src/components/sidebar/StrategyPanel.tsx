import { useState } from "react";
import { getJson, setJson } from "@/services/storageService";
import type { StrategyEntry, StrategyType } from "@/types";

const STRATEGY_STORAGE_KEY = "memoa_strategy_entries";

function loadStrategies(): StrategyEntry[] {
  return getJson<StrategyEntry[]>(STRATEGY_STORAGE_KEY, []);
}

function saveStrategies(strategies: StrategyEntry[]) {
  setJson(STRATEGY_STORAGE_KEY, strategies);
}

const STRATEGY_TYPES: { key: StrategyType; label: string }[] = [
  { key: "day_trade", label: "日内交易" },
  { key: "swing", label: "波段" },
  { key: "trend", label: "趋势" },
  { key: "value", label: "价值" },
  { key: "custom", label: "自定义" },
];

export function StrategyPanel() {
  const [strategies, setStrategies] = useState<StrategyEntry[]>(() => loadStrategies());
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<StrategyType>("swing");
  const [formEntryConditions, setFormEntryConditions] = useState("");
  const [formExitConditions, setFormExitConditions] = useState("");
  const [formMaxPosition, setFormMaxPosition] = useState("30");
  const [formStopLoss, setFormStopLoss] = useState("5");
  const [formTakeProfit, setFormTakeProfit] = useState("15");
  const [formMaxDailyLoss, setFormMaxDailyLoss] = useState("3");
  const [formApplicableThemes, setFormApplicableThemes] = useState("");
  const [formNotes, setFormNotes] = useState("");

  function createStrategy() {
    if (!formName.trim()) return;

    const entry: StrategyEntry = {
      id: crypto.randomUUID(),
      name: formName,
      type: formType,
      entryConditions: formEntryConditions,
      exitConditions: formExitConditions,
      riskManagement: {
        maxPosition: parseFloat(formMaxPosition) || 30,
        stopLoss: parseFloat(formStopLoss) || 5,
        takeProfit: parseFloat(formTakeProfit) || 15,
        maxDailyLoss: parseFloat(formMaxDailyLoss) || 3,
      },
      applicableThemes: formApplicableThemes.split(",").map((t) => t.trim()).filter(Boolean),
      applicablePatterns: [],
      executionLog: [],
      tags: [],
      notes: formNotes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const next = [entry, ...strategies];
    setStrategies(next);
    saveStrategies(next);
    resetForm();
  }

  function resetForm() {
    setShowForm(false);
    setFormName("");
    setFormEntryConditions("");
    setFormExitConditions("");
    setFormMaxPosition("30");
    setFormStopLoss("5");
    setFormTakeProfit("15");
    setFormMaxDailyLoss("3");
    setFormApplicableThemes("");
    setFormNotes("");
  }

  function deleteStrategy(id: string) {
    const next = strategies.filter((s) => s.id !== id);
    setStrategies(next);
    saveStrategies(next);
    if (expandedId === id) setExpandedId(null);
  }

  function addExecutionLog(id: string, result: "win" | "loss" | "breakeven", pnl: number, notes: string) {
    const next = strategies.map((s) => {
      if (s.id !== id) return s;
      return {
        ...s,
        executionLog: [
          ...s.executionLog,
          {
            date: new Date().toISOString().slice(0, 10),
            action: "execute",
            result,
            pnl,
            notes,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
    });
    setStrategies(next);
    saveStrategies(next);
  }

  const typeMap = new Map(STRATEGY_TYPES.map((t) => [t.key, t]));

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--color-text-primary)]">策略管理</span>
          <button
            className="text-[10px] px-2 py-0.5 bg-[var(--color-accent)] text-white rounded hover:opacity-90"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "取消" : "+ 新增"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2 bg-[var(--color-surface-secondary)]">
          <input
            className="w-full h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
            placeholder="策略名称 (如: 龙头首阴反包)"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />

          <div className="flex gap-1 flex-wrap">
            {STRATEGY_TYPES.map((st) => (
              <button
                key={st.key}
                className={`px-2 py-0.5 text-[10px] rounded ${
                  formType === st.key
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                }`}
                onClick={() => setFormType(st.key)}
              >
                {st.label}
              </button>
            ))}
          </div>

          <textarea
            className="w-full h-16 px-2 py-1 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] resize-none"
            placeholder="买入条件..."
            value={formEntryConditions}
            onChange={(e) => setFormEntryConditions(e.target.value)}
          />
          <textarea
            className="w-full h-16 px-2 py-1 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] resize-none"
            placeholder="卖出条件..."
            value={formExitConditions}
            onChange={(e) => setFormExitConditions(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">仓位%</span>
              <input
                className="flex-1 h-5 px-1 text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
                type="number"
                value={formMaxPosition}
                onChange={(e) => setFormMaxPosition(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">止损%</span>
              <input
                className="flex-1 h-5 px-1 text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
                type="number"
                value={formStopLoss}
                onChange={(e) => setFormStopLoss(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">止盈%</span>
              <input
                className="flex-1 h-5 px-1 text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
                type="number"
                value={formTakeProfit}
                onChange={(e) => setFormTakeProfit(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">日亏损%</span>
              <input
                className="flex-1 h-5 px-1 text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
                type="number"
                value={formMaxDailyLoss}
                onChange={(e) => setFormMaxDailyLoss(e.target.value)}
              />
            </div>
          </div>

          <input
            className="w-full h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
            placeholder="适用题材 (逗号分隔)"
            value={formApplicableThemes}
            onChange={(e) => setFormApplicableThemes(e.target.value)}
          />

          <textarea
            className="w-full h-14 px-2 py-1 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] resize-none"
            placeholder="策略笔记..."
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
          />

          <div className="flex gap-2">
            <button
              className="flex-1 text-[10px] py-1 bg-[var(--color-accent)] text-white rounded hover:opacity-90"
              onClick={createStrategy}
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
        {strategies.length === 0 ? (
          <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
            暂无策略
            <br />
            <span className="text-[11px]">制定交易策略，严格执行纪律</span>
          </div>
        ) : (
          <div className="py-1">
            {strategies.map((strategy) => {
              const isExpanded = expandedId === strategy.id;
              const wins = strategy.executionLog.filter((l) => l.result === "win").length;
              const total = strategy.executionLog.length;
              const winRate = total > 0 ? ((wins / total) * 100).toFixed(0) : "-";
              const totalPnl = strategy.executionLog.reduce((s, l) => s + l.pnl, 0);

              return (
                <div
                  key={strategy.id}
                  className="px-3 py-2 border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                >
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : strategy.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">
                        {strategy.name}
                      </span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                        {typeMap.get(strategy.type)?.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {total > 0 && (
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          胜率 {winRate}% | 盈亏 {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(0)}
                        </span>
                      )}
                      <button
                        className="text-[10px] text-[var(--color-text-muted)] hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteStrategy(strategy.id);
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 space-y-2 text-[10px]">
                      {strategy.entryConditions && (
                        <div>
                          <span className="text-[var(--color-text-muted)]">买入条件: </span>
                          <span className="text-[var(--color-text-primary)]">{strategy.entryConditions}</span>
                        </div>
                      )}
                      {strategy.exitConditions && (
                        <div>
                          <span className="text-[var(--color-text-muted)]">卖出条件: </span>
                          <span className="text-[var(--color-text-primary)]">{strategy.exitConditions}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-4 gap-1">
                        <div className="text-center p-1 bg-[var(--color-surface-secondary)] rounded">
                          <div className="text-[var(--color-text-muted)]">仓位</div>
                          <div>{strategy.riskManagement.maxPosition}%</div>
                        </div>
                        <div className="text-center p-1 bg-[var(--color-surface-secondary)] rounded">
                          <div className="text-[var(--color-text-muted)]">止损</div>
                          <div className="text-red-400">{strategy.riskManagement.stopLoss}%</div>
                        </div>
                        <div className="text-center p-1 bg-[var(--color-surface-secondary)] rounded">
                          <div className="text-[var(--color-text-muted)]">止盈</div>
                          <div className="text-green-400">{strategy.riskManagement.takeProfit}%</div>
                        </div>
                        <div className="text-center p-1 bg-[var(--color-surface-secondary)] rounded">
                          <div className="text-[var(--color-text-muted)]">日亏损</div>
                          <div className="text-red-400">{strategy.riskManagement.maxDailyLoss}%</div>
                        </div>
                      </div>

                      {strategy.applicableThemes.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {strategy.applicableThemes.map((t) => (
                            <span key={t} className="px-1 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-1 pt-1 border-t border-[var(--color-border)]">
                        <button
                          className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded"
                          onClick={() => addExecutionLog(strategy.id, "win", 0, "")}
                        >
                          记录盈利
                        </button>
                        <button
                          className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded"
                          onClick={() => addExecutionLog(strategy.id, "loss", 0, "")}
                        >
                          记录亏损
                        </button>
                        <button
                          className="px-2 py-0.5 bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] rounded"
                          onClick={() => addExecutionLog(strategy.id, "breakeven", 0, "")}
                        >
                          平局
                        </button>
                      </div>

                      {strategy.executionLog.length > 0 && (
                        <div className="space-y-0.5 max-h-24 overflow-y-auto">
                          {strategy.executionLog.slice(-10).reverse().map((log, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-[9px]">
                              <span className="text-[var(--color-text-muted)]">{log.date}</span>
                              <span className={log.result === "win" ? "text-green-400" : log.result === "loss" ? "text-red-400" : "text-[var(--color-text-muted)]"}>
                                {log.result === "win" ? "盈利" : log.result === "loss" ? "亏损" : "平局"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
