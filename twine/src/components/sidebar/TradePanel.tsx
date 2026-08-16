import { useState, useCallback } from "react";
import { getJson, setJson } from "@/services/storageService";
import { StockSearchInput } from "../astock/StockSearchInput";
import type { TradeEntry, TradeAction, TradeEmotion, StockSuggestItem } from "@/types";

const TRADE_STORAGE_KEY = "memoa_trade_entries";

function loadTrades(): TradeEntry[] {
  return getJson<TradeEntry[]>(TRADE_STORAGE_KEY, []);
}

function saveTrades(trades: TradeEntry[]) {
  setJson(TRADE_STORAGE_KEY, trades);
}

const ACTION_LABELS: Record<TradeAction, { label: string; color: string; bgColor: string; borderColor: string }> = {
  buy: { label: "买入", color: "text-red-500", bgColor: "bg-red-500/8", borderColor: "border-red-500/15" },
  sell: { label: "卖出", color: "text-green-500", bgColor: "bg-green-500/8", borderColor: "border-green-500/15" },
  add: { label: "加仓", color: "text-red-400", bgColor: "bg-red-400/8", borderColor: "border-red-400/15" },
  reduce: { label: "减仓", color: "text-green-400", bgColor: "bg-green-400/8", borderColor: "border-green-400/15" },
  clear: { label: "清仓", color: "text-green-600", bgColor: "bg-green-600/8", borderColor: "border-green-600/15" },
};

const EMOTION_LABELS: Record<TradeEmotion, string> = {
  greed: "贪婪",
  fear: "恐惧",
  rational: "理性",
  fomo: "FOMO",
  panic: "恐慌",
};

export function TradePanel() {
  const [trades, setTrades] = useState<TradeEntry[]>(() => loadTrades());
  const [showForm, setShowForm] = useState(false);
  const [filterStock, setFilterStock] = useState("");

  const [formStock, setFormStock] = useState<StockSuggestItem | null>(null);
  const [formAction, setFormAction] = useState<TradeAction>("buy");
  const [formPrice, setFormPrice] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formFee, setFormFee] = useState("0");
  const [formReason, setFormReason] = useState("");
  const [formEmotion, setFormEmotion] = useState<TradeEmotion>("rational");
  const [formThemes, setFormThemes] = useState("");

  const addTrade = useCallback(() => {
    if (!formStock || !formPrice || !formQuantity) return;

    const price = parseFloat(formPrice);
    const quantity = parseInt(formQuantity);
    const fee = parseFloat(formFee) || 0;

    const entry: TradeEntry = {
      id: crypto.randomUUID(),
      stockCode: formStock.code,
      stockName: formStock.name,
      market: formStock.market as "sh" | "sz" | "bj",
      action: formAction,
      price,
      quantity,
      amount: price * quantity,
      fee,
      reason: formReason,
      emotion: formEmotion,
      themes: formThemes.split(",").map((t) => t.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const next = [entry, ...trades];
    setTrades(next);
    saveTrades(next);
    resetForm();
  }, [formStock, formAction, formPrice, formQuantity, formFee, formReason, formEmotion, formThemes, trades]);

  function resetForm() {
    setFormStock(null);
    setFormAction("buy");
    setFormPrice("");
    setFormQuantity("");
    setFormFee("0");
    setFormReason("");
    setFormEmotion("rational");
    setFormThemes("");
    setShowForm(false);
  }

  function deleteTrade(id: string) {
    const next = trades.filter((t) => t.id !== id);
    setTrades(next);
    saveTrades(next);
  }

  const filtered = filterStock
    ? trades.filter(
        (t) =>
          t.stockCode.includes(filterStock) ||
          t.stockName.includes(filterStock)
      )
    : trades;

  const todayTrades = filtered.filter((t) =>
    t.createdAt.startsWith(new Date().toISOString().slice(0, 10))
  );
  const todayPnl = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--color-text-primary)]">交易日志</span>
          <button
            className="text-[10px] px-2 py-0.5 bg-[var(--color-accent)] text-white rounded hover:opacity-90"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "取消" : "+ 新增"}
          </button>
        </div>

        <input
          className="w-full h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
          placeholder="按股票代码/名称筛选..."
          value={filterStock}
          onChange={(e) => setFilterStock(e.target.value)}
        />

        {todayTrades.length > 0 && (
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-[var(--color-text-muted)]">今日 {todayTrades.length} 笔</span>
            <span className={todayPnl >= 0 ? "text-red-500" : "text-green-500"}>
              盈亏 {todayPnl >= 0 ? "+" : ""}{todayPnl.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {showForm && (
        <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2 bg-[var(--color-surface-secondary)]">
          <StockSearchInput
            onSelect={setFormStock}
            placeholder="搜索股票..."
          />
          {formStock && (
            <div className="text-[10px] text-[var(--color-accent)]">
              已选: {formStock.name} ({formStock.code})
            </div>
          )}

          <div className="flex gap-1 flex-wrap">
            {(Object.keys(ACTION_LABELS) as TradeAction[]).map((action) => {
              const cfg = ACTION_LABELS[action];
              return (
                <button
                  key={action}
                  className={`px-2 py-0.5 text-[10px] rounded-full transition-all duration-150 ${
                    formAction === action
                      ? `${cfg.bgColor} ${cfg.color} border ${cfg.borderColor} font-bold`
                      : `bg-[var(--color-surface)] ${cfg.color}`
                  }`}
                  onClick={() => setFormAction(action)}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              className="h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)]"
              placeholder="成交价"
              type="number"
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
            />
            <input
              className="h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)]"
              placeholder="数量"
              type="number"
              value={formQuantity}
              onChange={(e) => setFormQuantity(e.target.value)}
            />
          </div>

          <input
            className="w-full h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)]"
            placeholder="手续费"
            type="number"
            value={formFee}
            onChange={(e) => setFormFee(e.target.value)}
          />

          <div className="flex gap-1 flex-wrap">
            {(Object.keys(EMOTION_LABELS) as TradeEmotion[]).map((emo) => (
              <button
                key={emo}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                  formEmotion === emo
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                }`}
                onClick={() => setFormEmotion(emo)}
              >
                {EMOTION_LABELS[emo]}
              </button>
            ))}
          </div>

          <textarea
            className="w-full h-14 px-2 py-1 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)] resize-none"
            placeholder="交易理由..."
            value={formReason}
            onChange={(e) => setFormReason(e.target.value)}
          />

          <input
            className="w-full h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)]"
            placeholder="关联题材 (逗号分隔)"
            value={formThemes}
            onChange={(e) => setFormThemes(e.target.value)}
          />

          <div className="flex gap-2">
            <button
              className="flex-1 text-[10px] py-1 bg-[var(--color-accent)] text-white rounded hover:opacity-90"
              onClick={addTrade}
              disabled={!formStock || !formPrice || !formQuantity}
            >
              保存
            </button>
            <button
              className="text-[10px] py-1 px-3 bg-[var(--color-surface)] text-[var(--color-text-muted)] rounded hover:text-[var(--color-text-primary)]"
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
            暂无交易记录
            <br />
            <span className="text-[11px]">点击"新增"开始记录交易</span>
          </div>
        ) : (
          <div className="py-1 space-y-1 px-2">
            {filtered.map((trade) => {
              const actionConfig = ACTION_LABELS[trade.action];
              const isBuy = ["buy", "add"].includes(trade.action);
              return (
                <div
                  key={trade.id}
                  className={`rounded-lg border px-3 py-2 transition-colors ${actionConfig.bgColor} ${actionConfig.borderColor} hover:brightness-110 group`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${actionConfig.color} ${isBuy ? "bg-red-500/10" : "bg-green-500/10"}`}>
                        {actionConfig.label}
                      </span>
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">
                        {trade.stockName}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                        {trade.stockCode}
                      </span>
                    </div>
                    <button
                      className="text-[10px] text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                      onClick={() => deleteTrade(trade.id)}
                    >
                      删除
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--color-text-muted)]">
                    <span className="font-mono">价格 <span className="text-[var(--color-text-primary)]">{trade.price.toFixed(2)}</span></span>
                    <span className="font-mono">数量 <span className="text-[var(--color-text-primary)]">{trade.quantity}</span></span>
                    <span className="font-mono">金额 <span className="text-[var(--color-text-primary)]">{(trade.amount / 10000).toFixed(2)}万</span></span>
                    {trade.fee > 0 && <span className="font-mono">手续费 {trade.fee.toFixed(2)}</span>}
                  </div>
                  {trade.reason && (
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-1 line-clamp-2">
                      {trade.reason}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[9px] px-1 py-px rounded bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]">
                      {EMOTION_LABELS[trade.emotion]}
                    </span>
                    {trade.themes.map((theme) => (
                      <span key={theme} className="text-[9px] px-1 py-px rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                        {theme}
                      </span>
                    ))}
                    <span className="text-[9px] text-[var(--color-text-muted)] ml-auto">
                      {new Date(trade.createdAt).toLocaleDateString()}
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
