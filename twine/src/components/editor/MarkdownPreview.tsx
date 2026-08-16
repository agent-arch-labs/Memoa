/**
 * Markdown 预览组件
 * 使用 markdown-it 渲染，支持完整 Markdown 规范
 * 保留 Wiki Link 点击、右键菜单、搜索高亮跳转
 */
import { useEffect, useRef, useState, useMemo } from "react";
import { md, stripFrontmatter } from "@/lib/markdown-it-config";
import { useAppStore } from "@/stores/appStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { ContextMenu } from "@/components/ui/ContextMenu";
import type { MenuEntry } from "@/components/ui/ContextMenu";

interface MarkdownPreviewProps {
  content: string;
}

// ─── 组件 ─────────────────────────────────────────────────

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const setCurrentNote = useAppStore((s) => s.setCurrentNote);
  const setSplitNote = useAppStore((s) => s.setSplitNote);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const highlightText = useAppStore((s) => s.highlightText);
  const highlightOffset = useAppStore((s) => s.highlightOffset);
  const highlightLength = useAppStore((s) => s.highlightLength);
  const setHighlight = useAppStore((s) => s.setHighlight);
  const commands = useTauriCommands();

  const [wikiMenu, setWikiMenu] = useState<{ x: number; y: number; target: string } | null>(null);

  // ─── 渲染 Markdown ────────────────────────────────

  const renderedHtml = useMemo(() => {
    const body = stripFrontmatter(content);
    return md.render(body);
  }, [content]);

  // ─── Wiki Link 交互 ───────────────────────────────

  async function openWikiNote(wikiTarget: string, mode: "current" | "split") {
    let note = wikiTarget.includes("/")
      ? await commands.findNoteByPathFlexible(wikiTarget)
      : null;
    if (!note) note = await commands.findNoteByTitle(wikiTarget);
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
    setContextTarget({ type: "file", label: note.title, path: fullPath });
  }

  function handleWikiClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;

    // Wiki Link 点击
    const link = target.closest<HTMLAnchorElement>("a.wiki-link");
    if (link) {
      e.preventDefault();
      const wikiTarget = link.dataset.wikiTarget;
      if (wikiTarget) openWikiNote(wikiTarget, "current");
      return;
    }

    // Tag 点击 → 搜索
    const tag = target.closest<HTMLElement>(".tag");
    if (tag) {
      const tagText = tag.textContent?.replace(/^#/, "") || "";
      if (tagText) {
        useAppStore.getState().setSearchQuery(`#${tagText}`);
        useAppStore.getState().setSidebarVisible(true);
        useAppStore.getState().setSidebarView("search");
      }
      return;
    }

    // 任务列表 checkbox 点击
    if ((target as HTMLElement).classList.contains("task-list-item-checkbox")) {
      return;
    }

    // 外部链接在新窗口打开
    const extLink = target.closest<HTMLAnchorElement>("a:not(.wiki-link)");
    if (extLink && extLink.href) {
      e.preventDefault();
      import("@tauri-apps/plugin-shell").then(({ open }) => {
        open(extLink.href);
      }).catch(() => {
        window.open(extLink.href, "_blank");
      });
    }
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

  // ─── 搜索高亮跳转 ─────────────────────────────────

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
      if (rawChunk.trim()) sentences = extractPlainSentences(rawChunk);
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
    while ((node = walker.nextNode())) textNodes.push(node as Text);

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
          } catch { return false; }
        }
      }
      return false;
    }

    if (!tryHighlight(searchText)) {
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        let found = false;
        for (let len = 80; !found && len >= 16; len -= 8) {
          found = tryHighlight(sentence.slice(0, len));
        }
        if (found) break;
      }
    }

    setTimeout(() => setHighlight(null, 0, 0), 8000);
  }, [highlightText, highlightOffset, highlightLength, content, setHighlight]);

  // ─── Wiki Link 右键菜单 ───────────────────────────

  const wikiContextMenuItems = useMemo<MenuEntry[]>(() => {
    if (!wikiMenu) return [];
    return [
      {
        key: "open",
        label: "打开",
        icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 1a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V5l-4-4H3zm5.5 1.5L12.5 5.5H8.5V2.5zM3 14V2h4.5v4h4v8H3z" /></svg>,
        onClick: () => openWikiNote(wikiMenu.target, "current"),
      },
      {
        key: "splitOpen",
        label: "右侧分屏打开",
        icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H2a1 1 0 01-1-1V2zm7 0v12h6V2H8zM2 2v12h5V2H2z" /></svg>,
        onClick: () => openWikiNote(wikiMenu.target, "split"),
      },
      { key: "sep1", type: "separator" as const },
      {
        key: "openWith",
        label: "默认应用打开",
        icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.427 1.527a.5.5 0 01.819-.385l5.5 4.5a.5.5 0 010 .77l-5.5 4.5a.5.5 0 01-.819-.385V7.03a7.002 7.002 0 00-5.5 5.47.5.5 0 01-.986-.165A8.002 8.002 0 016.427 6.03V1.527z" /></svg>,
        onClick: async () => {
          let note = wikiMenu.target.includes("/")
            ? await commands.findNoteByPathFlexible(wikiMenu.target)
            : null;
          if (!note) note = await commands.findNoteByTitle(wikiMenu.target);
          if (!note) return;
          const fullPath = note.path.startsWith("/") || !vaultPath
            ? note.path : `${vaultPath}/${note.path}`;
          await commands.openWithDefaultApp(fullPath);
        },
      },
    ];
  }, [wikiMenu]);

  // ─── 统计 ─────────────────────────────────────────

  const wordCount = (content.match(/[\S]+/g) || []).length;
  const charCount = content.length;
  const lineCount = content.split("\n").length;

  return (
    <div className="h-full flex flex-col" onClick={() => setWikiMenu(null)}>
      <div className="flex-1 overflow-y-auto">
        <div
          ref={previewRef}
          className="markdown-preview max-w-3xl mx-auto px-8 py-6 text-[var(--color-text-primary)] leading-relaxed"
          style={{ fontSize: "0.9375rem", lineHeight: "1.7" }}
          onClick={handleWikiClick}
          onContextMenu={handleWikiContextMenu}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>

      <div className="flex items-center justify-between px-4 h-7 border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[11px] text-[var(--color-text-muted)] select-none shrink-0">
        <div className="flex items-center gap-3">
          <span>{lineCount} 行</span>
          <span>{wordCount} 词</span>
          <span>{charCount} 字符</span>
        </div>
        <div>{currentNotePath ? "预览" : ""}</div>
      </div>

      {wikiMenu && (
        <ContextMenu
          x={wikiMenu.x}
          y={wikiMenu.y}
          onClose={() => setWikiMenu(null)}
          items={wikiContextMenuItems}
        />
      )}
    </div>
  );
}
