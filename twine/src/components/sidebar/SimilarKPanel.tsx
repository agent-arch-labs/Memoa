import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StockSearchInput } from "../astock/StockSearchInput";
import { KLinePreview } from "../astock/KLinePreview";
import type { StockSuggestItem, BaoStockKLine } from "@/types";

export function SimilarKPanel() {
  const [selectedStock, setSelectedStock] = useState<StockSuggestItem | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [frequency, setFrequency] = useState("d");
  const [adjustflag, setAdjustflag] = useState("3");
  const [klineData, setKlineData] = useState<BaoStockKLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchKLine() {
    if (!selectedStock) return;
    setLoading(true);
    setError("");
    try {
      const data = await invoke<BaoStockKLine[]>("baostock_query_kline", {
        code: selectedStock.code,
        startDate: startDate || "2024-01-01",
        endDate: endDate || new Date().toISOString().slice(0, 10),
        frequency,
        adjustflag,
      });
      setKlineData(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const freqLabels: Record<string, string> = {
    d: "日K",
    w: "周K",
    m: "月K",
    "5": "5分钟",
    "15": "15分钟",
    "30": "30分钟",
    "60": "60分钟",
  };

  const adjustLabels: Record<string, string> = {
    "1": "后复权",
    "2": "前复权",
    "3": "不复权",
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2">
        <span className="text-xs font-medium text-[var(--color-text-primary)]">相似K线</span>

        <StockSearchInput
          onSelect={setSelectedStock}
          placeholder="搜索股票查看K线..."
        />

        {selectedStock && (
          <div className="text-[10px] text-[var(--color-accent)]">
            已选: {selectedStock.name} ({selectedStock.code})
          </div>
        )}
      </div>

      {selectedStock && (
        <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2 bg-[var(--color-surface-secondary)]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">周期</span>
            <div className="flex gap-1">
              {Object.entries(freqLabels).slice(0, 3).map(([key, label]) => (
                <button
                  key={key}
                  className={`px-1.5 py-0.5 text-[10px] rounded ${
                    frequency === key
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                  }`}
                  onClick={() => setFrequency(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">复权</span>
            <div className="flex gap-1">
              {Object.entries(adjustLabels).map(([key, label]) => (
                <button
                  key={key}
                  className={`px-1.5 py-0.5 text-[10px] rounded ${
                    adjustflag === key
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                  }`}
                  onClick={() => setAdjustflag(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              className="h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="开始日期"
            />
            <input
              className="h-6 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="结束日期"
            />
          </div>

          <button
            className="w-full text-[10px] py-1 bg-[var(--color-accent)] text-white rounded hover:opacity-90 disabled:opacity-50"
            onClick={fetchKLine}
            disabled={loading}
          >
            {loading ? "查询中..." : "查询历史K线 (BaoStock)"}
          </button>

          {error && (
            <div className="text-[10px] text-red-400">{error}</div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {selectedStock && (
          <div className="px-3 py-2 space-y-2">
            <KLinePreview code={`${selectedStock.market}${selectedStock.code}`} />

            {klineData.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-[var(--color-text-muted)]">
                  共 {klineData.length} 条K线数据
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                        <th className="text-left py-0.5">日期</th>
                        <th className="text-right py-0.5">开盘</th>
                        <th className="text-right py-0.5">收盘</th>
                        <th className="text-right py-0.5">最高</th>
                        <th className="text-right py-0.5">最低</th>
                        <th className="text-right py-0.5">涨跌%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {klineData.slice(0, 50).map((k, idx) => (
                        <tr key={idx} className="border-b border-[var(--color-border)]/30">
                          <td className="py-0.5 text-[var(--color-text-muted)]">{k.date}</td>
                          <td className="py-0.5 text-right">{k.open.toFixed(2)}</td>
                          <td className={`py-0.5 text-right ${k.close >= k.open ? "text-red-400" : "text-green-400"}`}>
                            {k.close.toFixed(2)}
                          </td>
                          <td className="py-0.5 text-right">{k.high.toFixed(2)}</td>
                          <td className="py-0.5 text-right">{k.low.toFixed(2)}</td>
                          <td className={`py-0.5 text-right ${k.pctChg >= 0 ? "text-red-400" : "text-green-400"}`}>
                            {k.pctChg >= 0 ? "+" : ""}{k.pctChg.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!selectedStock && (
          <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
            选择股票查看K线形态
            <br />
            <span className="text-[11px]">支持新浪实时K线图 + BaoStock历史数据</span>
          </div>
        )}
      </div>
    </div>
  );
}
