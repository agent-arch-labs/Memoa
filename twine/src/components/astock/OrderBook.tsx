import type { SinaQuoteField } from "@/types";

interface OrderBookProps {
  quote: SinaQuoteField;
  isUp: boolean | null;
  priceColor: string;
}

export function OrderBook({ quote, isUp, priceColor }: OrderBookProps) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div className="px-2 py-1 bg-[var(--color-surface-secondary)] text-[10px] text-[var(--color-text-muted)] font-medium">
        五档盘口
      </div>
      <div className="text-[11px]">
        {/* 卖5 → 卖1 (从上到下，卖5最远) */}
        {[5, 4, 3, 2, 1].map((level) => {
          const priceKey = `sell${level}` as keyof SinaQuoteField;
          const volKey = `sell${level}Vol` as keyof SinaQuoteField;
          const price = quote[priceKey] as number;
          const vol = quote[volKey] as number;
          const priceUp = price >= quote.yesterdayClose;
          return (
            <div key={`sell${level}`} className="flex items-center px-2 py-0.5 border-b border-[var(--color-border)]/30 hover:bg-green-500/5">
              <span className="w-8 text-[var(--color-text-muted)] text-[10px]">卖{level}</span>
              <span className={`flex-1 font-mono font-medium ${priceUp ? "text-red-500" : "text-green-500"}`}>
                {price.toFixed(2)}
              </span>
              <span className="w-20 text-right font-mono text-[var(--color-text-muted)]">
                {(vol / 100).toFixed(0)}手
              </span>
            </div>
          );
        })}
        {/* 分隔：当前价 */}
        <div className={`flex items-center px-2 py-1.5 border-y-2 ${isUp ? "border-red-500/30 bg-red-500/5" : "border-green-500/30 bg-green-500/5"}`}>
          <span className="w-8 text-[10px] text-[var(--color-text-muted)]">现价</span>
          <span className={`flex-1 font-mono font-bold text-sm ${priceColor}`}>
            {quote.current.toFixed(2)}
          </span>
          <span className={`text-[10px] font-mono font-medium ${priceColor}`}>
            {isUp ? "+" : ""}{quote.changePercent.toFixed(2)}%
          </span>
        </div>
        {/* 买1 → 买5 (从上到下，买1最近) */}
        {[1, 2, 3, 4, 5].map((level) => {
          const priceKey = `buy${level}` as keyof SinaQuoteField;
          const volKey = `buy${level}Vol` as keyof SinaQuoteField;
          const price = quote[priceKey] as number;
          const vol = quote[volKey] as number;
          const priceUp = price >= quote.yesterdayClose;
          return (
            <div key={`buy${level}`} className="flex items-center px-2 py-0.5 border-b border-[var(--color-border)]/30 hover:bg-red-500/5">
              <span className="w-8 text-[var(--color-text-muted)] text-[10px]">买{level}</span>
              <span className={`flex-1 font-mono font-medium ${priceUp ? "text-red-500" : "text-green-500"}`}>
                {price.toFixed(2)}
              </span>
              <span className="w-20 text-right font-mono text-[var(--color-text-muted)]">
                {(vol / 100).toFixed(0)}手
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
