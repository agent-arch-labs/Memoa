import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MarketIndex } from "@/types";
import { useStockDetailStore } from "@/stores/stockDetailStore";
import { useQuoteStore } from "@/stores/quoteStore";
import { useAppStore } from "@/stores/appStore";
import { StockSearchInput } from "@/components/astock/StockSearchInput";
import type { StockSuggestItem } from "@/types";

export function StatusBar() {
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [flashKeys, setFlashKeys] = useState<Record<string, "up" | "down" | null>>({});
  const [, setLoading] = useState(false);
  const prevPricesRef = useRef<Record<string, number>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openIndex = useStockDetailStore((s) => s.openIndex);
  const openStock = useStockDetailStore((s) => s.openStock);

  const handleSearchSelect = useCallback((item: StockSuggestItem) => {
    openStock(item);
  }, [openStock]);

  // 状态栏右侧信息
  const lastFetchAt = useQuoteStore((s) => s.lastFetchAt);
  const subscriptions = useQuoteStore((s) => s.subscriptions);
  const currentNotePath = useAppStore((s) => s.currentNotePath);

  const fetchIndices = useCallback(async () => {
    try {
      const data = await invoke<MarketIndex[]>("east_market_indices");
      const newFlashKeys: Record<string, "up" | "down" | null> = {};
      data.forEach((idx) => {
        const prev = prevPricesRef.current[idx.code];
        if (prev !== undefined && prev !== idx.price) {
          newFlashKeys[idx.code] = idx.price > prev ? "up" : "down";
        }
      });
      if (Object.keys(newFlashKeys).length > 0) {
        setFlashKeys(newFlashKeys);
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setFlashKeys({}), 600);
      }
      prevPricesRef.current = Object.fromEntries(data.map((d) => [d.code, d.price]));
      setIndices(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIndices();
    setLoading(true);
    timerRef.current = setInterval(fetchIndices, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [fetchIndices]);

  return (
    <footer className="h-6 bg-[var(--color-surface-secondary)] border-t border-[var(--color-border)] shrink-0 flex items-center px-2 text-[11px] select-none">
      {/* 左侧：三大指数面板（参考同花顺底部状态栏） */}
      <div className="flex items-center shrink-0 h-full">
        {indices.map((idx) => {
          const isUp = idx.changePercent > 0;
          const isDown = idx.changePercent < 0;
          const priceColor = isUp
            ? "text-red-500"
            : isDown
              ? "text-green-500"
              : "text-[var(--color-text-secondary)]";
          const flash = flashKeys[idx.code];
          const flashBg = flash === "up"
            ? "bg-red-500/10"
            : flash === "down"
              ? "bg-green-500/10"
              : "";
          const shortName = idx.name.replace("指数", "");
          return (
            <button
              key={idx.code}
              className={`flex items-center h-full px-2 gap-1.5 transition-colors cursor-pointer border-r border-[var(--color-border)]/40 hover:bg-[var(--color-surface-hover)] ${flashBg}`}
              onClick={() => openIndex(idx)}
              title={`${idx.name}  涨跌额:${isUp ? "+" : ""}${idx.change.toFixed(2)}  涨跌幅:${isUp ? "+" : ""}${idx.changePercent.toFixed(2)}%`}
            >
              <span className="text-[var(--color-text-muted)] shrink-0 text-[10px] font-medium">{shortName}</span>
              <span className={`font-mono font-semibold tabular-nums text-[11px] ${priceColor}`}>
                {idx.price.toFixed(2)}
              </span>
              <span className={`font-mono tabular-nums text-[10px] ${priceColor}`}>
                {isUp ? "+" : ""}{idx.change.toFixed(2)}
              </span>
              <span className={`font-mono tabular-nums text-[10px] min-w-[42px] text-right ${
                isUp
                  ? "text-red-500"
                  : isDown
                    ? "text-green-500"
                    : "text-[var(--color-text-secondary)]"
              }`}>
                {isUp ? "+" : ""}{idx.changePercent.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-w-0" />

      {/* 右侧：搜索 + 状态信息 */}
      <div className="flex items-center gap-3 shrink-0 text-[var(--color-text-muted)]">
        <div className="w-44" onMouseDown={(e) => e.stopPropagation()}>
          <StockSearchInput
            placeholder="搜索代码/名称..."
            onSelect={handleSearchSelect}
            direction="up"
            compact
          />
        </div>
        {subscriptions.size > 0 && (
          <span className="flex items-center gap-1" title="行情订阅数">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-[var(--color-accent)]">
              <path d="M5 1L9 5L5 9L1 5Z" fill="currentColor" opacity="0.6" />
            </svg>
            {subscriptions.size}
          </span>
        )}
        {lastFetchAt && (
          <span title="行情更新时间">
            {new Date(lastFetchAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
        {currentNotePath && (
          <span className="max-w-[120px] truncate" title={currentNotePath}>
            {currentNotePath.split("/").pop()?.replace(/\.md$/, "")}
          </span>
        )}
        <span className="text-[var(--color-accent)] font-medium">Memoa</span>
      </div>
    </footer>
  );
}
