import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/types";
import { parseThinkingContent } from "./parseThinkingContent";
import { ThinkingBlock } from "./ThinkingBlock";

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  streamingMsgId: string | null;
  expandedSources: Set<string>;
  onToggleSourceExpand: (msgId: string) => void;
  onOpenNote: (notePath: string, chunkText?: string, chunkOffset?: number, chunkLength?: number) => void;
  onCopy: (msg: ChatMessage) => void;
  onRegenerate: (msgId: string) => void;
  onFeedback: (msgId: string, type: "like" | "dislike") => void;
  onShare: (msg: ChatMessage) => void;
  copiedId: string | null;
  loading: boolean;
  markdownComponents: Record<string, React.FC<Record<string, unknown>>>;
}

function MessageContent({
  msg,
  markdownComponents,
  isStreaming,
}: Pick<ChatMessageBubbleProps, "msg" | "markdownComponents"> & { isStreaming: boolean }) {
  if (!msg.content) {
    return <span className="italic text-[var(--color-text-muted)]">思考中...</span>;
  }
  if (msg.role === "user") {
    return <div className="whitespace-pre-wrap break-words">{msg.content}</div>;
  }

  const segments = parseThinkingContent(msg.content);
  const hasThinking = segments.some((s) => s.type === "thinking");

  if (!hasThinking) {
    try {
      return (
        <div className="prose prose-xs max-w-none text-xs text-[var(--color-text-primary)] break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {msg.content}
          </ReactMarkdown>
        </div>
      );
    } catch {
      return <div className="whitespace-pre-wrap break-words">{msg.content}</div>;
    }
  }

  return (
    <div className="space-y-1">
      {segments.map((seg, i) => {
        if (seg.type === "thinking") {
          return (
            <ThinkingBlock
              key={i}
              content={seg.content}
              streaming={isStreaming}
              markdownComponents={markdownComponents}
              defaultExpanded={isStreaming}
            />
          );
        }
        if (!seg.content.trim()) return null;
        try {
          return (
            <div key={i} className="prose prose-xs max-w-none text-xs text-[var(--color-text-primary)] break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {seg.content}
              </ReactMarkdown>
            </div>
          );
        } catch {
          return <div key={i} className="whitespace-pre-wrap break-words">{seg.content}</div>;
        }
      })}
    </div>
  );
}

function ActionBar({ msg, onCopy, onRegenerate, onFeedback, onShare, copiedId, loading }: Pick<ChatMessageBubbleProps, "msg" | "onCopy" | "onRegenerate" | "onFeedback" | "onShare" | "copiedId" | "loading">) {
  if (msg.role !== "assistant" || !msg.content) return null;

  return (
    <div className="flex items-center gap-0.5 mt-2 pt-1.5 border-t border-[var(--color-border)]/30">
      <button
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        onClick={() => onCopy(msg)}
        title="复制"
      >
        {copiedId === msg.id ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="5" y="5" width="9" height="9" rx="1.5" /><path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" /></svg>
        )}
        <span>{copiedId === msg.id ? "已复制" : "复制"}</span>
      </button>
      <button
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        onClick={() => onRegenerate(msg.id)}
        disabled={loading}
        title="重新生成"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 8a6.5 6.5 0 0112.1-3.3M14.5 8a6.5 6.5 0 01-12.1 3.3" /><polyline points="14 1.5 14 4.7 10.8 4.7" /><polyline points="2 11.3 2 14.5 5.2 14.5" /></svg>
        <span>刷新</span>
      </button>
      <button
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
          msg.feedback === "like"
            ? "text-green-500 bg-green-500/10"
            : "text-[var(--color-text-muted)] hover:text-green-500 hover:bg-green-500/5"
        }`}
        onClick={() => onFeedback(msg.id, "like")}
        title="点赞"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l1.85 3.75 4.15.6-3 2.93.71 4.12L8 10.87 4.29 12.9l.71-4.12-3-2.93 4.15-.6z" /></svg>
      </button>
      <button
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
          msg.feedback === "dislike"
            ? "text-orange-500 bg-orange-500/10"
            : "text-[var(--color-text-muted)] hover:text-orange-500 hover:bg-orange-500/5"
        }`}
        onClick={() => onFeedback(msg.id, "dislike")}
        title="踩"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M8 1.5l1.85 3.75 4.15.6-3 2.93.71 4.12L8 10.87 4.29 12.9l.71-4.12-3-2.93 4.15-.6z" /></svg>
      </button>
      <button
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors ml-auto"
        onClick={() => onShare(msg)}
        title="分享"
      >
        {copiedId === msg.id ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8l4-4 4 4" /><line x1="8" y1="4" x2="8" y2="12" /><path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" /></svg>
        )}
        <span>{copiedId === msg.id ? "已复制" : "分享"}</span>
      </button>
    </div>
  );
}

function SourceBar({ msg, expandedSources, onToggleSourceExpand, onOpenNote }: Pick<ChatMessageBubbleProps, "msg" | "expandedSources" | "onToggleSourceExpand" | "onOpenNote">) {
  if (msg.role !== "assistant" || msg.sources.length === 0) return null;

  const isExpanded = expandedSources.has(msg.id);
  const hasMore = msg.sources.length > 5;
  const visibleSources = isExpanded ? msg.sources : msg.sources.slice(0, 5);
  const webSourceCount = msg.sources.filter(s => s.notePath.startsWith("http://") || s.notePath.startsWith("https://")).length;
  const sourceLabel = webSourceCount > msg.sources.length / 2 ? "联网来源" : "参考来源";

  return (
    <div className="mt-1.5 pt-1.5 border-t border-[var(--color-border)]/30">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
          {sourceLabel}
        </span>
        {hasMore && (
          <button
            className="text-[10px] text-[var(--color-accent)] hover:underline"
            onClick={() => onToggleSourceExpand(msg.id)}
          >
            {isExpanded ? "收起" : `更多 (${msg.sources.length})`}
          </button>
        )}
      </div>
      <div className="space-y-1">
        {visibleSources.map((source, i) => {
          const isWebSource = source.notePath.startsWith("http://") || source.notePath.startsWith("https://");
          return (
          <button
            key={`${source.notePath}-${i}`}
            className="w-full text-left px-1.5 py-1 rounded text-[10px] hover:bg-[var(--color-surface-hover)] transition-colors group"
            onClick={() => onOpenNote(source.notePath, source.chunkText, source.chunkOffset, source.chunkLength)}
            title={`打开: ${source.noteTitle}`}
          >
            <div className="flex items-center gap-1">
              <span className="shrink-0 text-[var(--color-accent)] font-medium tabular-nums">[{i + 1}]</span>
              <span className="shrink-0">{isWebSource ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zM5.7 13.3A6.5 6.5 0 014 8c0-.5.05-1 .15-1.5h2.4A14 14 0 006.4 8c0 1.1.15 2.1.4 3.1A6.5 6.5 0 015.7 13.3zm4.6 0a6.5 6.5 0 01-1.1-2.2c.25-1 .4-2 .4-3.1 0-.55-.05-1.05-.15-1.5h2.4c.1.5.15 1 .15 1.5a6.5 6.5 0 01-1.7 5.3zM8 1.5c.6 0 1.4.9 1.9 2.4.1.35.2.7.25 1.1H5.85c.05-.4.15-.75.25-1.1C6.6 2.4 7.4 1.5 8 1.5zm-3.8 3h2.1c-.1.5-.15 1-.15 1.5 0 1 .1 1.9.3 2.8A6.5 6.5 0 014.2 4.5zm5.5 4.3c.2-.9.3-1.8.3-2.8 0-.5-.05-1-.15-1.5h2.1a6.5 6.5 0 01-2.25 4.3z" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M10 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V5l-4-4zm-.5 1.5L12.5 5.5H9.5V2.5zM3 14V2h5v4h4v8H3z" /></svg>
              )}</span>
              <span className="truncate text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors">
                {source.noteTitle}
              </span>
              {source.score > 0 && (
                <span className="shrink-0 text-[var(--color-text-muted)] ml-auto">
                  {source.score <= 1 ? `${Math.round(source.score * 100)}%` : `${Math.round(source.score)}`}
                </span>
              )}
            </div>
            {source.snippet && (
              <p className="text-[var(--color-text-muted)] truncate mt-0.5 ml-5">
                {source.snippet}
              </p>
            )}
          </button>
          );
        })}
      </div>
    </div>
  );
}

export function ChatMessageBubble({
  msg,
  streamingMsgId,
  onCopy,
  copiedId,
  markdownComponents,
  ...rest
}: ChatMessageBubbleProps) {
  return (
    <div
      className={`text-xs ${
        msg.role === "user"
          ? "flex justify-end"
          : "flex justify-start"
      }`}
    >
      <div className={`max-w-[88%] ${msg.role === "user" ? "" : "w-full"}`}>
        <div
          className={`rounded-xl px-3 py-2.5 relative group ${
            msg.role === "user"
              ? "bg-[var(--color-accent)] text-white rounded-br-md"
              : "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-bl-md"
          }`}
        >
          <MessageContent msg={msg} markdownComponents={markdownComponents} isStreaming={streamingMsgId === msg.id} />
          {streamingMsgId === msg.id && (
            <span className="inline-block w-1.5 h-3 bg-[var(--color-accent)] animate-pulse ml-0.5 align-middle rounded-sm" />
          )}
          {msg.role === "user" && msg.content && (
            <button
              className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-white/60 hover:text-white hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(msg);
              }}
              title="复制"
            >
              {copiedId === msg.id ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
              )}
            </button>
          )}
        </div>
        <SourceBar
          msg={msg}
          expandedSources={rest.expandedSources}
          onToggleSourceExpand={rest.onToggleSourceExpand}
          onOpenNote={rest.onOpenNote}
        />
        <ActionBar
          msg={msg}
          onCopy={onCopy}
          onRegenerate={rest.onRegenerate}
          onFeedback={rest.onFeedback}
          onShare={rest.onShare}
          copiedId={copiedId}
          loading={rest.loading}
        />
      </div>
    </div>
  );
}