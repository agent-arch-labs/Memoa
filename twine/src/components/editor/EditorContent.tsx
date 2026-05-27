import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/stores/appStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import type { RecentNote } from "@/types";

interface Props {
  content: string;
}

export function EditorContent({ content }: Props) {
  const isEditing = useAppStore((s) => s.isEditing);
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const currentNoteContent = useAppStore((s) => s.currentNoteContent);
  const setCurrentNoteContent = useAppStore((s) => s.setCurrentNoteContent);
  const setEditing = useAppStore((s) => s.setEditing);
  const setCurrentNote = useAppStore((s) => s.setCurrentNote);
  const setSplitNote = useAppStore((s) => s.setSplitNote);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const highlightText = useAppStore((s) => s.highlightText);
  const highlightOffset = useAppStore((s) => s.highlightOffset);
  const highlightLength = useAppStore((s) => s.highlightLength);
  const setHighlight = useAppStore((s) => s.setHighlight);
  const incrementTagRefresh = useAppStore((s) => s.incrementTagRefresh);
  const incrementGraphRefresh = useAppStore((s) => s.incrementGraphRefresh);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const commands = useTauriCommands();
  const [editContent, setEditContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([]);
  const [wikiMenu, setWikiMenu] = useState<{ x: number; y: number; target: string } | null>(null);

  function stripMarkdownInline(text: string): string {
    let s = text;
    s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
    s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
    s = s.replace(/(\*|_)(.*?)\1/g, "$2");
    s = s.replace(/~~(.*?)~~/g, "$1");
    s = s.replace(/`{1,3}[^`]*`{1,3}/g, "");
    s = s.replace(/>\s*/gm, "");
    s = s.replace(/^#{1,6}\s*/gm, "");
    s = s.replace(/[-*+]\s/g, "");
    s = s.replace(/\n{2,}/g, "\n");
    s = s.replace(/<[^>]+>/g, "");
    return s.trim();
  }

  function extractPlainSentences(raw: string): string[] {
    return stripMarkdownInline(raw)
      .split(/[\n\r]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 6);
  }

  useEffect(() => {
    if (!highlightText || !previewRef.current) return;

    let sentences: string[] = [];

    if (highlightOffset > 0 && highlightLength > 0 && content.length > 0) {
      const end = Math.min(highlightOffset + highlightLength, content.length);
      const rawChunk = content.substring(highlightOffset, end);
      if (rawChunk.trim()) {
        sentences = extractPlainSentences(rawChunk);
      }
    }

    if (sentences.length === 0 && highlightText) {
      sentences = extractPlainSentences(highlightText);
    }

    let searchText = sentences[0]?.slice(0, 120);
    if (!searchText && highlightText) {
      searchText = stripMarkdownInline(highlightText).slice(0, 80);
    }
    if (!searchText) return;

    const el = previewRef.current;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    function tryHighlight(candidate: string): boolean {
      if (candidate.length < 4) return false;
      for (const textNode of textNodes) {
        const text = textNode.textContent || "";
        const idx = text.indexOf(candidate);
        if (idx >= 0) {
          try {
            const range = document.createRange();
            range.setStart(textNode, idx);
            range.setEnd(textNode, idx + candidate.length);
            const mark = document.createElement("mark");
            mark.className = "search-highlight";
            range.surroundContents(mark);
            mark.scrollIntoView({ behavior: "smooth", block: "center" });
            return true;
          } catch {
            return false;
          }
        }
      }
      return false;
    }

    if (tryHighlight(searchText)) {
      // found
    } else {
      let found = false;
      for (let i = 0; !found && i < sentences.length; i++) {
        const sentence = sentences[i];
        for (let len = 80; !found && len >= 16; len -= 8) {
          found = tryHighlight(sentence.slice(0, len));
        }
      }
      if (!found && sentences[0]) {
        const words = sentences[0].split(/\s+/).filter((w) => w.length > 3);
        for (const word of words) {
          if (tryHighlight(word)) {
            found = true;
            break;
          }
        }
      }
    }

    setTimeout(() => {
      setHighlight(null, 0, 0);
    }, 8000);
  }, [highlightText, highlightOffset, highlightLength, content, setHighlight]);

  useEffect(() => {
    setEditContent(content);
  }, [content]);

  useEffect(() => {
    if (!isEditing) {
      setEditContent(content);
    }
  }, [isEditing, content]);

  function handleEditChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setEditContent(e.target.value);
    setCurrentNoteContent(e.target.value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      setEditContent(content);
      setCurrentNoteContent(content);
      setEditing(false);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (currentNotePath) {
        commands.writeFile(currentNotePath, currentNoteContent).then(() => {
          incrementTagRefresh();
          incrementGraphRefresh();
          setEditing(false);
        }).catch((err) => console.error("保存失败", err));
      } else {
        setEditing(false);
      }
    }
  }

  function handleContextMenu(e: React.MouseEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  async function openLinkPicker() {
    closeContextMenu();
    const notes = await commands.listRecentNotes(50);
    const seen = new Set<string>();
    const deduped = notes.filter((note) => {
      const key = note.path;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setRecentNotes(deduped);
    setPickerOpen(true);
  }

  function insertLink(note: RecentNote) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const cleanPath = note.path.replace(/\.md$/, "");
    const link = `[[${cleanPath}]]`;
    const newContent = editContent.slice(0, start) + link + editContent.slice(end);

    setEditContent(newContent);
    setCurrentNoteContent(newContent);
    setPickerOpen(false);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + link.length, start + link.length);
    }, 0);
  }

  function stripFrontmatter(source: string): string {
    const trimmed = source.trimStart();
    if (!trimmed.startsWith("---")) return source;
    const afterFirst = trimmed.indexOf("---", 3);
    if (afterFirst === -1) return source;
    return trimmed.substring(afterFirst + 3).trimStart();
  }

  function renderTables(html: string): string {
    const lines = html.split("\n");
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
          tableLines.push(lines[i]);
          i++;
        }

        if (tableLines.length >= 2) {
          const headerCells = tableLines[0].split("|").filter((c) => c.trim() !== "");
          const sepLine = tableLines[1];
          const isSep = /^\|[\s\-:]+\|/.test(sepLine);
          const alignments: string[] = [];

          if (isSep) {
            sepLine.split("|").filter((c) => c.trim() !== "").forEach((c) => {
              const trimmed = c.trim();
              if (trimmed.startsWith(":") && trimmed.endsWith(":")) alignments.push("center");
              else if (trimmed.endsWith(":")) alignments.push("right");
              else alignments.push("left");
            });
          }

          const dataStart = isSep ? 2 : 1;
          const rows: string[] = [];

          if (isSep) {
            const hRow = headerCells
              .map((c, idx) => `<th style="text-align:${alignments[idx] || "left"}">${c.trim()}</th>`)
              .join("");
            rows.push(`<tr>${hRow}</tr>`);
          }

          for (let r = dataStart; r < tableLines.length; r++) {
            const cells = tableLines[r].split("|").filter((c) => c.trim() !== "");
            const dRow = cells
              .map((c, idx) => `<td style="text-align:${alignments[idx] || "left"}">${c.trim()}</td>`)
              .join("");
            rows.push(`<tr>${dRow}</tr>`);
          }

          result.push(`<table class="md-table"><thead>${rows[0]}</thead><tbody>${rows.slice(1).join("")}</tbody></table>`);
          continue;
        }
      }

      result.push(line);
      i++;
    }

    return result.join("\n");
  }

  function renderMarkdown(source: string): string {
    const body = stripFrontmatter(source);

    let html = body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    html = renderTables(html);

    html = html.replace(/^#{1,6}\s+(.+)$/gm, (line) => {
      const match = line.match(/^(#{1,6})/);
      const level = match ? match[1].length : 1;
      const text = line.replace(/^#{1,6}\s+/, "");
      const sizes = ["2rem", "1.5rem", "1.25rem", "1.1rem", "1rem", "0.95rem"];
      return `<h${level} style="font-size:${sizes[level - 1]};font-weight:600;margin:1em 0 0.5em;">${text}</h${level}>`;
    });

    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    html = html.replace(
      /\[\[([^\]|#]+)(?:[|#]([^\]]+))?\]\]/g,
      (_m, target, alias) => {
        const display = alias ? `${target}|${alias}` : target;
        return `<a class="wiki-link" data-wiki-target="${target}">${display}</a>`;
      },
    );

    html = html.replace(
      /\[([^\]]*)\]\(([^)]+)\)/g,
      '<a href="$2" class="md-link">$1</a>',
    );

    html = html.replace(
      /#([\w\u4e00-\u9fff\-/]+)/g,
      '<span class="tag">#$1</span>',
    );

    html = html.replace(
      /(?:^|\n)([-*]\s+.+)/g,
      '<li style="margin-left:1.5em;list-style:disc;">$1</li>',
    );

    html = html.replace(/\n\n/g, "</p><p>");
    html = `<p>${html}</p>`;

    return html;
  }

  if (isEditing) {
    return (
      <div className="h-full flex flex-col relative" onClick={closeContextMenu}>
        <textarea
          ref={textareaRef}
          className="flex-1 w-full resize-none bg-[var(--color-surface)] text-[var(--color-text-primary)] p-6 font-mono text-sm leading-relaxed outline-none"
          style={{ fontSize: "0.875rem", lineHeight: "1.7" }}
          value={editContent}
          onChange={handleEditChange}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
          placeholder="开始书写 Markdown..."
          autoFocus
          spellCheck={false}
        />

        {contextMenu && (
          <div
            className="fixed z-50 min-w-[180px] bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg shadow-xl py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
              onClick={openLinkPicker}
            >
              📎 插入文档链接
            </button>
          </div>
        )}

        {pickerOpen && (
          <div className="absolute inset-0 z-40 flex items-start justify-center pt-12 bg-black/30" onClick={() => setPickerOpen(false)}>
            <div
              className="w-[420px] max-h-[60vh] bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl shadow-2xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">选择文档</span>
                <button
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-lg leading-none px-1"
                  onClick={() => setPickerOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                {recentNotes.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">暂无文档</div>
                ) : (
                  recentNotes.map((note) => (
                    <button
                      key={note.id}
                      className="w-full text-left px-4 py-2.5 hover:bg-[var(--color-surface-hover)] border-b border-[var(--color-border)]/30 transition-colors"
                      onClick={() => insertLink(note)}
                    >
                      <div className="text-xs font-medium text-[var(--color-text-primary)] truncate">{note.title}</div>
                      <div className="text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">{note.path.replace(/\.md$/, "")}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  async function openWikiNote(wikiTarget: string, mode: "current" | "split") {
    let note = wikiTarget.includes("/")
      ? await commands.findNoteByPathFlexible(wikiTarget)
      : null;

    if (!note) {
      note = await commands.findNoteByTitle(wikiTarget);
    }

    if (!note) {
      console.error(`未找到文档: ${wikiTarget}`);
      return;
    }

    const fullPath = note.path.startsWith("/") || !vaultPath
      ? note.path
      : `${vaultPath}/${note.path}`;
    const fileContent = await commands.readFile(fullPath);

    if (mode === "split") {
      setSplitNote(fullPath, fileContent);
      return;
    }

    setCurrentNote(fullPath, fileContent);
    setContextTarget({
      type: "file",
      label: note.title,
      path: fullPath,
    });
  }

  async function handleWikiClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLAnchorElement>("a.wiki-link");
    if (!link) return;

    e.preventDefault();
    const wikiTarget = link.dataset.wikiTarget;
    if (!wikiTarget) return;

    openWikiNote(wikiTarget, "current");
  }

  function handleWikiContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLAnchorElement>("a.wiki-link");
    if (!link) return;

    e.preventDefault();
    e.stopPropagation();
    const wikiTarget = link.dataset.wikiTarget;
    if (!wikiTarget) return;

    setWikiMenu({ x: e.clientX, y: e.clientY, target: wikiTarget });
  }

  function closeWikiMenu() {
    setWikiMenu(null);
  }

  return (
    <div className="h-full overflow-y-auto" onClick={closeWikiMenu}>
      <div
        ref={previewRef}
        className="markdown-preview max-w-3xl mx-auto px-8 py-6 text-[var(--color-text-primary)] leading-relaxed"
        style={{
          fontSize: "0.9375rem",
          lineHeight: "1.7",
        }}
        onClick={handleWikiClick}
        onContextMenu={handleWikiContextMenu}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />

      {wikiMenu && (
        <div
          className="fixed z-50 min-w-[180px] bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg shadow-xl py-1"
          style={{ left: wikiMenu.x, top: wikiMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors flex items-center gap-2"
            onClick={() => {
              closeWikiMenu();
              openWikiNote(wikiMenu.target, "current");
            }}
          >
            📄 打开
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors flex items-center gap-2"
            onClick={() => {
              closeWikiMenu();
              openWikiNote(wikiMenu.target, "split");
            }}
          >
            📑 右侧分屏打开
          </button>
          <div className="border-t border-[var(--color-border)] my-1" />
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors flex items-center gap-2"
            onClick={async () => {
              closeWikiMenu();
              let note = wikiMenu.target.includes("/")
                ? await commands.findNoteByPathFlexible(wikiMenu.target)
                : null;
              if (!note) note = await commands.findNoteByTitle(wikiMenu.target);
              if (!note) return;
              const fullPath = note.path.startsWith("/") || !vaultPath
                ? note.path
                : `${vaultPath}/${note.path}`;
              await commands.openWithDefaultApp(fullPath);
            }}
          >
            🔗 默认应用打开
          </button>
        </div>
      )}
    </div>
  );
}