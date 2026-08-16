import { useState } from "react";
import { KLINE_PERIODS } from "@/types";
import type { KLinePeriod } from "@/types";

interface KLinePreviewProps {
  code: string;
}

export function KLinePreview({ code }: KLinePreviewProps) {
  const [period, setPeriod] = useState<KLinePeriod>(KLINE_PERIODS[1]);

  if (!code) return null;

  const imageUrl = `https://image.sinajs.cn/newchart/${period.key}/n/${code}.gif`;

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {KLINE_PERIODS.map((p) => (
          <button
            key={p.key}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
              period.key === p.key
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
            onClick={() => setPeriod(p)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="bg-[var(--color-surface-secondary)] rounded p-1">
        <img
          src={imageUrl}
          alt={`${code} ${period.label}`}
          className="w-full"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    </div>
  );
}
