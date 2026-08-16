/**
 * CodeMirror 6 编辑器 React 封装
 * 支持编辑/预览模式切换、自动保存、Wiki Link 点击、右键菜单
 * 主题/行号切换使用 Compartment 动态配置，不重建编辑器
 */
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { createCmExtensions, reconfigureTheme, reconfigureLineNumbers } from "./cm-config";
import { useAppStore } from "@/stores/appStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { ContextMenu } from "@/components/ui/ContextMenu";
import type { MenuEntry } from "@/components/ui/ContextMenu";
import type { RecentNote } from "@/types";

interface CmEditorProps {
  content: string;
  onContentChange?: (content: string) => void;
}

export function CmEditor({ content, onContentChange }: CmEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(content);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const setCurrentNoteContent = useAppStore((s) => s.setCurrentNoteContent);
  const incrementTagRefresh = useAppStore((s) => s.incrementTagRefresh);
  const incrementGraphRefresh = useAppStore((s) => s.incrementGraphRefresh);
  const autoSaveEnabled = useAppStore((s) => s.autoSaveEnabled);
  const markSaved = useAppStore((s) => s.markSaved);
  const showLineNumbers = useAppStore((s) => s.showLineNumbers);
  const isDark = useAppStore((s) => s.isDark);
  const commands = useTauriCommands();

  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([]);

  // 使用 ref 保存最新的回调，避免闭包陷阱
  const handleContentChangeRef = useRef<(newContent: string) => void>();
  const handleSaveRef = useRef<() => void>();
  const handleCursorChangeRef = useRef<(line: number, col: number) => void>();

  const doSave = useCallback(() => {
    if (!currentNotePath) return;
    const currentContent = viewRef.current?.state.doc.toString() ?? "";
    if (currentContent === contentRef.current) return;
    commands.writeFile(currentNotePath, currentContent).then(() => {
      incrementTagRefresh();
      incrementGraphRefresh();
      markSaved();
    }).catch((err) => console.error("自动保存失败", err));
  }, [currentNotePath, commands, incrementTagRefresh, incrementGraphRefresh, markSaved]);

  const scheduleAutoSave = useCallback(() => {
    if (!autoSaveEnabled) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(doSave, 2000);
  }, [autoSaveEnabled, doSave]);

  const handleContentChange = useCallback((newContent: string) => {
    contentRef.current = newContent;
    setCurrentNoteContent(newContent);
    onContentChange?.(newContent);
    scheduleAutoSave();
  }, [setCurrentNoteContent, onContentChange, scheduleAutoSave]);

  const handleSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    doSave();
  }, [doSave]);

  // 保持 ref 同步
  handleContentChangeRef.current = handleContentChange;
  handleSaveRef.current = handleSave;
  handleCursorChangeRef.current = (line: number, col: number) => setCursorPos({ line, col });

  // 创建编辑器（仅挂载时）
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = createCmExtensions({
      isDark,
      onChange: (c) => handleContentChangeRef.current?.(c),
      onSave: () => handleSaveRef.current?.(),
      onCursorChange: (l, c) => handleCursorChangeRef.current?.(l, c),
      showLineNumbers,
    });

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 仅在挂载时创建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部内容更新（切换文件时）
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== content) {
      contentRef.current = content;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
    }
  }, [content]);

  // 主题切换：使用 Compartment 动态配置，不重建编辑器
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    reconfigureTheme(view, isDark);
  }, [isDark]);

  // 行号切换：使用 Compartment 动态配置
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    reconfigureLineNumbers(view, showLineNumbers);
  }, [showLineNumbers]);

  // 失焦保存
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const handler = () => {
      if (autoSaveEnabled) doSave();
    };

    view.dom.addEventListener("blur", handler);
    return () => view.dom.removeEventListener("blur", handler);
  }, [autoSaveEnabled, doSave]);

  // Wiki Link 点击处理
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("cm-wiki-link") || target.closest(".cm-wiki-link")) {
        const linkEl = target.classList.contains("cm-wiki-link") ? target : target.closest(".cm-wiki-link");
        const text = linkEl?.textContent || "";
        const wikiTarget = text.includes("|") ? text.split("|")[0] : text;
        openWikiNote(wikiTarget, "current");
      }
    };

    view.dom.addEventListener("click", handler);
    return () => view.dom.removeEventListener("click", handler);
  }, []);

  // 右键菜单：仅 Wiki Link/Tag 阻止默认行为，其他区域保留 CodeMirror 原生右键菜单
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isWikiLink = target.classList.contains("cm-wiki-link") || !!target.closest(".cm-wiki-link");
      const isTag = target.classList.contains("cm-tag") || !!target.closest(".cm-tag");

      if (isWikiLink) {
        e.preventDefault();
        const linkEl = target.classList.contains("cm-wiki-link") ? target : target.closest(".cm-wiki-link");
        const text = linkEl?.textContent || "";
        const wikiTarget = text.includes("|") ? text.split("|")[0] : text;
        setWikiContextMenu({ x: e.clientX, y: e.clientY, target: wikiTarget });
        return;
      }

      if (isTag) {
        e.preventDefault();
        const tagEl = target.classList.contains("cm-tag") ? target : target.closest(".cm-tag");
        const tagText = tagEl?.textContent?.replace(/^#/, "") || "";
        setTagContextMenu({ x: e.clientX, y: e.clientY, tag: tagText });
        return;
      }

      // 非 Wiki Link / Tag 区域：不阻止默认行为，保留 CodeMirror 原生右键菜单
    };

    view.dom.addEventListener("contextmenu", handler);
    return () => view.dom.removeEventListener("contextmenu", handler);
  }, []);

  // Wiki Link 右键菜单
  const [wikiContextMenu, setWikiContextMenu] = useState<{ x: number; y: number; target: string } | null>(null);
  // Tag 右键菜单
  const [tagContextMenu, setTagContextMenu] = useState<{ x: number; y: number; tag: string } | null>(null);

  const vaultPath = useAppStore((s) => s.vaultPath);
  const setCurrentNote = useAppStore((s) => s.setCurrentNote);
  const setSplitNote = useAppStore((s) => s.setSplitNote);
  const setContextTarget = useAppStore((s) => s.setContextTarget);

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

  const editorContextMenuItems = useMemo<MenuEntry[]>(() => [
    {
      key: "link",
      label: "插入文档链接",
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.354 5.5H4a3 3 0 000 6h3a3 3 0 002.83-4H8.83A2 2 0 017 10H4a2 2 0 110-4h2.354zM9.646 10.5H12a3 3 0 000-6H9a3 3 0 00-2.83 4h1.001A2 2 0 019 6h3a2 2 0 110 4H9.646z" />
        </svg>
      ),
      onClick: () => { openLinkPicker(); },
    },
  ], []);

  const wikiContextMenuItems = useMemo<MenuEntry[]>(() => {
    if (!wikiContextMenu) return [];
    return [
      {
        key: "open",
        label: "打开",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 1a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V5l-4-4H3zm5.5 1.5L12.5 5.5H8.5V2.5zM3 14V2h4.5v4h4v8H3z" />
          </svg>
        ),
        onClick: () => { openWikiNote(wikiContextMenu.target, "current"); },
      },
      {
        key: "splitOpen",
        label: "右侧分屏打开",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H2a1 1 0 01-1-1V2zm7 0v12h6V2H8zM2 2v12h5V2H2z" />
          </svg>
        ),
        onClick: () => { openWikiNote(wikiContextMenu.target, "split"); },
      },
      { key: "sep1", type: "separator" as const },
      {
        key: "openWith",
        label: "默认应用打开",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.427 1.527a.5.5 0 01.819-.385l5.5 4.5a.5.5 0 010 .77l-5.5 4.5a.5.5 0 01-.819-.385V7.03a7.002 7.002 0 00-5.5 5.47.5.5 0 01-.986-.165A8.002 8.002 0 016.427 6.03V1.527z" />
          </svg>
        ),
        onClick: async () => {
          let note = wikiContextMenu.target.includes("/")
            ? await commands.findNoteByPathFlexible(wikiContextMenu.target)
            : null;
          if (!note) note = await commands.findNoteByTitle(wikiContextMenu.target);
          if (!note) return;
          const fullPath = note.path.startsWith("/") || !vaultPath
            ? note.path
            : `${vaultPath}/${note.path}`;
          await commands.openWithDefaultApp(fullPath);
        },
      },
    ];
  }, [wikiContextMenu]);

  const tagContextMenuItems = useMemo<MenuEntry[]>(() => {
    if (!tagContextMenu) return [];
    return [
      {
        key: "searchTag",
        label: `搜索 #${tagContextMenu.tag}`,
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" />
          </svg>
        ),
        onClick: () => {
          // 触发搜索标签
          const searchFn = useAppStore.getState().setSearchQuery;
          if (searchFn) searchFn(`#${tagContextMenu.tag}`);
          setTagContextMenu(null);
        },
      },
      {
        key: "copyTag",
        label: "复制标签",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 1.5H3a2 2 0 00-2 2V14a2 2 0 002 2h10a2 2 0 002-2V3.5a2 2 0 00-2-2h-1v1h1a1 1 0 011 1V14a1 1 0 01-1 1H3a1 1 0 01-1-1V3.5a1 1 0 011-1h1v-1z" />
            <path d="M9.5 1a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-1a.5.5 0 01.5-.5h3z" />
          </svg>
        ),
        onClick: () => {
          navigator.clipboard.writeText(`#${tagContextMenu.tag}`);
          setTagContextMenu(null);
        },
      },
    ];
  }, [tagContextMenu]);

  async function openLinkPicker() {
    setContextMenu(null);
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
    const view = viewRef.current;
    if (!view) return;
    const cleanPath = note.path.replace(/\.md$/, "");
    const link = `[[${cleanPath}]]`;
    const cursor = view.state.selection.main.head;
    view.dispatch({
      changes: { from: cursor, insert: link },
      selection: { anchor: cursor + link.length },
    });
    setPickerOpen(false);
    view.focus();
  }

  // 统计信息
  const stats = useMemo(() => {
    const doc = viewRef.current?.state.doc;
    const text = doc?.toString() ?? content;
    const wordCount = (text.match(/[\S]+/g) || []).length;
    const charCount = text.length;
    const lineCount = text.split("\n").length;
    return { wordCount, charCount, lineCount };
  }, [content]);

  return (
    <div className="h-full flex flex-col relative" onClick={() => { setContextMenu(null); setWikiContextMenu(null); setTagContextMenu(null); }}>
      <div ref={containerRef} className="flex-1 overflow-hidden cm-editor-container" />

      {/* 状态栏 */}
      <div className="flex items-center justify-between px-4 h-7 border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[11px] text-[var(--color-text-muted)] select-none shrink-0">
        <div className="flex items-center gap-3">
          <span>行 {cursorPos.line}, 列 {cursorPos.col}</span>
          <span>{stats.lineCount} 行</span>
          <span>{stats.wordCount} 词</span>
          <span>{stats.charCount} 字符</span>
        </div>
        <div>Markdown</div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={editorContextMenuItems}
        />
      )}

      {/* Wiki Link 右键菜单 */}
      {wikiContextMenu && (
        <ContextMenu
          x={wikiContextMenu.x}
          y={wikiContextMenu.y}
          onClose={() => setWikiContextMenu(null)}
          items={wikiContextMenuItems}
        />
      )}

      {/* Tag 右键菜单 */}
      {tagContextMenu && (
        <ContextMenu
          x={tagContextMenu.x}
          y={tagContextMenu.y}
          onClose={() => setTagContextMenu(null)}
          items={tagContextMenuItems}
        />
      )}

      {/* 文档链接选择器 */}
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
