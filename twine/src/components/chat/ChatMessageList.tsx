import { useRef, useMemo, useEffect } from "react";
import { ChatMessageBubble } from "./ChatMessageBubble";
import type { ChatMessage, AnswerMode, DataSource } from "@/types";

interface ChatMessageListProps {
  chatMessages: ChatMessage[];
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
  onZoomImage: (src: string | null) => void;
  contextLabel: string;
  answerMode: AnswerMode;
  dataSource: DataSource;
  isKnowledgeContext: boolean;
  zoomedImage: string | null;
}

function WelcomeScreen({ contextLabel, answerMode, dataSource, isKnowledgeContext }: Pick<ChatMessageListProps, "contextLabel" | "answerMode" | "dataSource" | "isKnowledgeContext">) {
  const scope = contextLabel ? `【${contextLabel}】` : "";
  const isStockContext = contextLabel && (contextLabel.includes("SH") || contextLabel.includes("SZ") || contextLabel.includes("BJ"));

  const title = isKnowledgeContext
    ? scope ? `向知识库${scope}提问` : "向你的知识库提问"
    : isStockContext && dataSource === "online"
    ? `联网分析 ${scope}`
    : dataSource === "online"
    ? scope ? `联网检索 ${scope}` : "向你的联网检索提问"
    : scope ? `向本地文件${scope}提问` : "向你的本地文件提问";

  const subtitle = answerMode === "rag"
    ? isStockContext && dataSource === "online"
      ? "Tavily 联网搜索实时资讯，AI 综合分析"
      : dataSource === "online"
      ? "Tavily 联网检索，AI 基于网络结果回答"
      : isKnowledgeContext
      ? "基于远程知识库检索增强回答"
      : dataSource !== "local"
      ? "检索工具，AI 调用外部检索接口获取知识"
      : scope
      ? `基于 RAG 检索增强回答，聚焦 ${contextLabel}`
      : "基于 RAG 检索增强回答，从你的笔记中寻找答案"
    : answerMode === "agent_rag"
    ? "多策略 Agent RAG，智能选择检索与推理策略逐步回答"
    : answerMode === "agent"
    ? "启用 Agent Mode，AI 自主调用工具完成任务"
    : "启用 UltraRAG Deep Research，AI 深度研究分析";

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 opacity-60 flex items-center justify-center">
        {isStockContext ? (
          <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 12 4 8 7 10 10 5 15 3" /><polyline points="12 3 15 3 15 6" /></svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.1l3 1.4c.3.1.5.4.5.7v3.6c0 2.8-2 5.4-4.5 6.2C6 12.2 4 9.6 4 6.8V3.2c0-.3.2-.6.5-.7l3-1.4c.3-.1.7-.1 1 0z" /></svg>
        )}
      </div>
      <div className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {title}
      </div>
      <div className="text-[11px] text-[var(--color-text-muted)] max-w-[200px]">
        {subtitle}
      </div>
    </div>
  );
}

export function ChatMessageList({
  chatMessages,
  streamingMsgId,
  expandedSources,
  onToggleSourceExpand,
  onOpenNote,
  onCopy,
  onRegenerate,
  onFeedback,
  onShare,
  copiedId,
  loading,
  onZoomImage,
  contextLabel,
  answerMode,
  dataSource,
  isKnowledgeContext,
  zoomedImage,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const markdownComponents = useMemo(() => ({
    code({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { className?: string; children?: React.ReactNode }) {
      const match = /language-(\w+)/.exec(className || "");
      const inline = !match && (!className || !String(children).includes("\n"));
      if (inline) {
        return <code className="bg-[var(--color-surface-hover)] px-1 py-0.5 rounded text-[11px]" {...props}>{children}</code>;
      }
      return (
        <pre className="bg-[var(--color-surface-hover)] rounded p-2 overflow-x-auto my-1">
          <code className="text-[11px]" {...props}>{children}</code>
        </pre>
      );
    },
    p({ children }: { children?: React.ReactNode }) {
      return <p className="mb-1 last:mb-0">{children}</p>;
    },
    ul({ children }: { children?: React.ReactNode }) {
      return <ul className="list-disc list-inside mb-1 space-y-0.5">{children}</ul>;
    },
    ol({ children }: { children?: React.ReactNode }) {
      return <ol className="list-decimal list-inside mb-1 space-y-0.5">{children}</ol>;
    },
    li({ children }: { children?: React.ReactNode }) {
      return <li className="text-xs">{children}</li>;
    },
    blockquote({ children }: { children?: React.ReactNode }) {
      return <blockquote className="border-l-2 border-[var(--color-accent)]/50 pl-2 italic text-[var(--color-text-muted)] my-1">{children}</blockquote>;
    },
    a({ children, href }: { children?: React.ReactNode; href?: string }) {
      return <a className="text-[var(--color-accent)] underline decoration-[var(--color-accent)]/30 hover:decoration-[var(--color-accent)]" href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
    table({ children }: { children?: React.ReactNode }) {
      return <div className="overflow-x-auto my-1"><table className="text-[11px] border-collapse border border-[var(--color-border)] w-full">{children}</table></div>;
    },
    th({ children }: { children?: React.ReactNode }) {
      return <th className="border border-[var(--color-border)] px-2 py-1 bg-[var(--color-surface-hover)] text-left">{children}</th>;
    },
    td({ children }: { children?: React.ReactNode }) {
      return <td className="border border-[var(--color-border)] px-2 py-1">{children}</td>;
    },
    hr() {
      return <hr className="border-[var(--color-border)] my-2" />;
    },
    h1({ children }: { children?: React.ReactNode }) {
      return <h1 className="text-sm font-bold mt-2 mb-1">{children}</h1>;
    },
    h2({ children }: { children?: React.ReactNode }) {
      return <h2 className="text-xs font-bold mt-1.5 mb-1">{children}</h2>;
    },
    h3({ children }: { children?: React.ReactNode }) {
      return <h3 className="text-xs font-semibold mt-1 mb-0.5">{children}</h3>;
    },
    img({ src, alt }: { src?: string; alt?: string }) {
      if (!src) return null;
      return (
        <div className="flex justify-center my-2">
          <img
            src={src}
            alt={alt || ""}
            className="rounded-md cursor-zoom-in border border-[var(--color-border)] transition-transform hover:scale-[1.02] hover:shadow-md"
            style={{ maxWidth: "100%", maxHeight: "360px", objectFit: "contain" }}
            onClick={(e) => { e.stopPropagation(); onZoomImage(src); }}
            loading="lazy"
          />
        </div>
      );
    },
  } satisfies Record<string, React.FC<Record<string, unknown>>>), [onZoomImage]);

  function handleScrollContainer() {
    const el = scrollContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [chatMessages]);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={scrollContainerRef} onScroll={handleScrollContainer}>
        {chatMessages.length === 0 && (
          <WelcomeScreen
            contextLabel={contextLabel}
            answerMode={answerMode}
            dataSource={dataSource}
            isKnowledgeContext={isKnowledgeContext}
          />
        )}
        {chatMessages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            msg={msg}
            streamingMsgId={streamingMsgId}
            expandedSources={expandedSources}
            onToggleSourceExpand={onToggleSourceExpand}
            onOpenNote={onOpenNote}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onFeedback={onFeedback}
            onShare={onShare}
            copiedId={copiedId}
            loading={loading}
            markdownComponents={markdownComponents}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-zoom-out"
          onClick={() => onZoomImage(null)}
        >
          <img
            src={zoomedImage}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={() => onZoomImage(null)}
            aria-label="关闭"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
          </button>
        </div>
      )}
    </>
  );
}