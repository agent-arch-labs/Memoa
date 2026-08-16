import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ThinkingBlockProps {
  content: string;
  streaming: boolean;
  markdownComponents: Record<string, React.FC<Record<string, unknown>>>;
  defaultExpanded?: boolean;
}

export function ThinkingBlock({
  content,
  streaming,
  markdownComponents,
  defaultExpanded = false,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const displayContent = content.trim();

  return (
    <div className="mb-1.5 rounded-lg border border-[var(--color-border)]/50 overflow-hidden">
      <button
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]/50 transition-colors select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="font-medium">
          {streaming ? "思考中..." : "思考过程"}
        </span>
        {!expanded && displayContent && (
          <span className="truncate text-[10px] opacity-50 flex-1 text-left">
            {displayContent.slice(0, 60)}{displayContent.length > 60 ? "..." : ""}
          </span>
        )}
        {streaming && (
          <span className="inline-block w-1 h-3 bg-[var(--color-accent)]/60 animate-pulse rounded-sm ml-auto" />
        )}
        {!streaming && expanded && (
          <span className="text-[10px] opacity-40 ml-auto">收起</span>
        )}
      </button>
      {expanded && (
        <div className="px-2.5 pb-2 pt-0.5 border-t border-[var(--color-border)]/30 bg-[var(--color-surface-hover)]/30">
          {displayContent ? (
            <div className="prose prose-xs max-w-none text-[11px] text-[var(--color-text-muted)] break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {displayContent}
              </ReactMarkdown>
            </div>
          ) : (
            <span className="text-[11px] text-[var(--color-text-muted)] italic">
              思考内容生成中...
            </span>
          )}
        </div>
      )}
    </div>
  );
}