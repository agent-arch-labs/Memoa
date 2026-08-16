import type { SinaQuoteField } from "@/types";

interface QuoteGridProps {
  quote: SinaQuoteField;
  isUp: boolean | null;
  priceColor: string;
}

export function QuoteGrid({ quote, isUp, priceColor }: QuoteGridProps) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div className="grid grid-cols-4 text-[11px]">
        {/* 今开 */}
        <div className="px-3 py-2 border-b border-r border-[var(--color-border)]/50">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">今开</div>
          <div className={`font-mono ${quote.open >= quote.yesterdayClose ? "text-red-500" : "text-green-500"}`}>{quote.open.toFixed(2)}</div>
        </div>
        {/* 昨收 */}
        <div className="px-3 py-2 border-b border-r border-[var(--color-border)]/50">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">昨收</div>
          <div className="font-mono">{quote.yesterdayClose.toFixed(2)}</div>
        </div>
        {/* 最高 */}
        <div className="px-3 py-2 border-b border-r border-[var(--color-border)]/50">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">最高</div>
          <div className="font-mono text-red-500">{quote.high.toFixed(2)}</div>
        </div>
        {/* 最低 */}
        <div className="px-3 py-2 border-b border-[var(--color-border)]/50">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">最低</div>
          <div className="font-mono text-green-500">{quote.low.toFixed(2)}</div>
        </div>
        {/* 涨停价 */}
        <div className="px-3 py-2 border-b border-r border-[var(--color-border)]/50">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">涨停价</div>
          <div className="font-mono text-red-500 font-medium">
            {(quote.yesterdayClose * 1.1).toFixed(2)}
          </div>
        </div>
        {/* 跌停价 */}
        <div className="px-3 py-2 border-b border-r border-[var(--color-border)]/50">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">跌停价</div>
          <div className="font-mono text-green-500 font-medium">
            {(quote.yesterdayClose * 0.9).toFixed(2)}
          </div>
        </div>
        {/* 成交量 */}
        <div className="px-3 py-2 border-b border-r border-[var(--color-border)]/50">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">成交量</div>
          <div className="font-mono">{(quote.volume / 10000).toFixed(0)}万手</div>
        </div>
        {/* 成交额 */}
        <div className="px-3 py-2 border-b border-[var(--color-border)]/50">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">成交额</div>
          <div className="font-mono">{(quote.amount / 100000000).toFixed(2)}亿</div>
        </div>
        {/* 振幅 */}
        <div className="px-3 py-2 border-r border-[var(--color-border)]/50">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">振幅</div>
          <div className="font-mono">{quote.yesterdayClose > 0 ? ((quote.high - quote.low) / quote.yesterdayClose * 100).toFixed(2) + "%" : "-"}</div>
        </div>
        {/* 涨跌额 */}
        <div className="px-3 py-2 border-r border-[var(--color-border)]/50">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">涨跌额</div>
          <div className={`font-mono ${priceColor}`}>{isUp ? "+" : ""}{quote.change.toFixed(2)}</div>
        </div>
        {/* 涨跌幅 */}
        <div className="px-3 py-2 border-r border-[var(--color-border)]/50">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">涨跌幅</div>
          <div className={`font-mono font-medium ${priceColor}`}>{isUp ? "+" : ""}{quote.changePercent.toFixed(2)}%</div>
        </div>
        {/* 量比 */}
        <div className="px-3 py-2">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">量比</div>
          <div className="font-mono">-</div>
        </div>
      </div>
    </div>
  );
}
