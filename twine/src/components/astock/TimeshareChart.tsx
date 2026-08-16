import { useRef } from "react";

interface TimeshareChartProps {
  fullCode: string;
}

export function TimeshareChart({ fullCode }: TimeshareChartProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const img5Ref = useRef<HTMLImageElement>(null);
  const ts = Date.now();

  function handleRefresh() {
    const now = Date.now();
    if (imgRef.current) imgRef.current.src = `https://image.sinajs.cn/newchart/min/${fullCode}.gif?t=${now}`;
    if (img5Ref.current) img5Ref.current.src = `https://image.sinajs.cn/newchart/min5/${fullCode}.gif?t=${now}`;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--color-text-muted)]">新浪分时图</span>
        <button
          className="text-[10px] px-2 py-1 bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] rounded-md hover:text-[var(--color-accent)] transition-colors"
          onClick={handleRefresh}
        >
          刷新
        </button>
      </div>
      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-white">
        <img
          ref={imgRef}
          src={`https://image.sinajs.cn/newchart/min/${fullCode}.gif?t=${ts}`}
          alt="分时图"
          className="w-full h-auto"
          style={{ minHeight: 200 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      {/* 5日分时图 */}
      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-white">
        <div className="px-2 py-1 bg-[var(--color-surface-secondary)] text-[10px] text-[var(--color-text-muted)]">
          5日分时
        </div>
        <img
          ref={img5Ref}
          src={`https://image.sinajs.cn/newchart/min5/${fullCode}.gif?t=${ts}`}
          alt="5日分时图"
          className="w-full h-auto"
          style={{ minHeight: 200 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    </div>
  );
}
