import { useState } from "react";

export function DailyPanel() {
  const [] = useState();

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          日报
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
          AI 日报生成
          <br />
          <span className="text-[11px]">基于今日笔记自动生成工作日报</span>
        </div>
      </div>
    </div>
  );
}