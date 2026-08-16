import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MarketIndex } from "@/types";
import { useStockDetailStore } from "@/stores/stockDetailStore";

export function MarketIndexBar() {
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [flashKeys, setFlashKeys] = useState<Record<string, "up" | "down" | null>>({});
  const [loading, setLoading] = useState(false);
  const prevPricesRef = useRef<Record<string, number>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openIndex = useStockDetailStore((s) => s.openIndex);

  const fetchIndices = useCallback(async () => {
    try {
      const data = await invoke<MarketIndex[]>("east_market_indices");
      // 检测价格变化，触发闪烁动画
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

  if (indices.length === 0 && !loading) return null;

  return (
    <div className="px-2 py-1 border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)] shrink-0">
      <div className="flex items-center justify-between gap-1">
        {indices.map((idx) => {
          const isUp = idx.changePercent >= 0;
          const isZero = idx.changePercent === 0;
          const priceColor = isZero
            ? "text-[var(--color-text-primary)]"
            : isUp
              ? "text-red-500"
              : "text-green-500";
          const bgColor = isZero
            ? "bg-[var(--color-surface)]"
            : isUp
              ? "bg-red-500/8"
              : "bg-green-500/8";
          const borderColor = isZero
            ? "border-[var(--color-border)]/50"
            : isUp
              ? "border-red-500/15"
              : "border-green-500/15";
          const flash = flashKeys[idx.code];
          const flashClass = flash === "up"
            ? "animate-pulse bg-red-500/15"
            : flash === "down"
              ? "animate-pulse bg-green-500/15"
              : "";
          return (
            <div
              key={idx.code}
              className={`flex-1 min-w-0 text-center cursor-pointer rounded-md px-2 py-1.5 border transition-all duration-200 ${bgColor} ${borderColor} ${flashClass} hover:scale-[1.02] active:scale-[0.98]`}
              onClick={() => openIndex(idx)}
            >
              <div className="text-[10px] text-[var(--color-text-muted)] truncate font-medium">
                {idx.name}
              </div>
              <div className={`text-[13px] font-mono font-bold ${priceColor} mt-0.5`}>
                {idx.price.toFixed(2)}
              </div>
              <div className={`text-[10px] font-mono font-medium ${priceColor} mt-0.5`}>
                {isUp ? "+" : ""}{idx.change.toFixed(2)} {isUp ? "+" : ""}{idx.changePercent.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
