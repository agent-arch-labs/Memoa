import { useMemo } from "react";
import matter from "gray-matter";

interface Props {
  content: string;
  filePath: string;
  onClose: () => void;
}

interface ParsedData {
  title?: string;
  created?: string;
  updated?: string;
  tags?: string[];
  [key: string]: unknown;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function countWords(text: string): number {
  const body = text.trim();
  if (!body) return 0;
  const chineseChars = (body.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = (body.match(/[a-zA-Z]+/g) || []).length;
  return chineseChars + englishWords;
}

export function NoteDetailPanel({ content, filePath, onClose }: Props) {
  const { data, bodyContent } = useMemo(() => {
    try {
      const parsed = matter(content);
      return { data: parsed.data as ParsedData, bodyContent: parsed.content };
    } catch {
      return { data: {} as ParsedData, bodyContent: content };
    }
  }, [content]);

  const wordCount = useMemo(() => countWords(bodyContent), [bodyContent]);
  const lineCount = useMemo(() => bodyContent.split("\n").length, [bodyContent]);
  const charCount = useMemo(() => bodyContent.length, [bodyContent]);

  const fileName = filePath.split("/").pop() || filePath;
  const dirPath = filePath.substring(0, filePath.lastIndexOf("/")) || "/";

  return (
    <div className="bg-[var(--color-surface)]">
      <div className="flex items-center justify-between px-3 h-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">
          📋 笔记详情
        </h3>
        <button
          className="btn btn-ghost px-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {data.title && (
            <div className="col-span-2">
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-0.5">
                标题
              </div>
              <div className="text-sm font-medium">{data.title}</div>
            </div>
          )}

          {data.created && (
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-0.5">
                创建时间
              </div>
              <div className="text-xs">{formatDate(data.created)}</div>
            </div>
          )}

          {data.updated && (
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-0.5">
                更新时间
              </div>
              <div className="text-xs">{formatDate(data.updated)}</div>
            </div>
          )}

          {data.tags && data.tags.length > 0 && (
            <div className="col-span-2">
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-0.5">
                标签
              </div>
              <div className="flex flex-wrap gap-1">
                {data.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border)]/50 pt-2">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-0.5">
                字数
              </div>
              <div className="text-xs font-mono">{wordCount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-0.5">
                行数
              </div>
              <div className="text-xs font-mono">{lineCount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-0.5">
                字符
              </div>
              <div className="text-xs font-mono">{charCount.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--color-border)]/50 pt-2">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
            文件信息
          </div>
          <div className="space-y-1">
            <div className="text-[11px] text-[var(--color-text-muted)]">
              <span className="text-[var(--color-text-primary)]">{fileName}</span>
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] truncate" title={dirPath}>
              位置: {dirPath}
            </div>
          </div>
        </div>

        {Object.keys(data).length > 0 && (
          <div className="border-t border-[var(--color-border)]/50 pt-2">
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
              Frontmatter (YAML)
            </div>
            <pre className="text-[10px] font-mono bg-[var(--color-surface-hover)] rounded p-2 overflow-x-auto max-h-32 overflow-y-auto">
              {content.split("---")[1] ? content.split("---")[1].trim() : ""}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}