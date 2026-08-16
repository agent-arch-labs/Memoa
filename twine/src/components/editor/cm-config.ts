/**
 * CodeMirror 6 编辑器核心配置
 * - Markdown 语法高亮
 * - 自定义主题（深色/浅色自适应，Compartment 动态切换）
 * - Wiki Link [[...]] 和 #Tag 装饰器（排除 Markdown 标题）
 * - 自动保存、行号、光标位置
 * - 字号使用 rem 单位，联动全局 fontSize
 */
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, rectangularSelection, highlightSpecialChars, ViewUpdate, ViewPlugin, Decoration, MatchDecorator, WidgetType, type DecorationSet } from "@codemirror/view";
import { EditorState, Compartment, type Range } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { syntaxHighlighting, HighlightStyle, foldGutter, indentOnInput, bracketMatching, foldKeymap } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

// ─── Compartment：动态切换主题/行号，无需重建编辑器 ────

export const themeCompartment = new Compartment();
export const highlightCompartment = new Compartment();
export const lineNumbersCompartment = new Compartment();

// ─── 自定义语法高亮 ──────────────────────────────────

const memoaLightHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "700", fontSize: "1.6em", color: "#1a1a2e" },
  { tag: t.heading2, fontWeight: "700", fontSize: "1.4em", color: "#1a1a2e" },
  { tag: t.heading3, fontWeight: "600", fontSize: "1.2em", color: "#2d2d44" },
  { tag: t.heading4, fontWeight: "600", fontSize: "1.1em", color: "#2d2d44" },
  { tag: t.heading5, fontWeight: "600", fontSize: "1em", color: "#3d3d55" },
  { tag: t.heading6, fontWeight: "600", fontSize: "0.95em", color: "#3d3d55" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "#888" },
  { tag: t.link, color: "#2563eb", textDecoration: "underline" },
  { tag: t.url, color: "#2563eb" },
  { tag: t.monospace, fontFamily: "JetBrains Mono, Fira Code, monospace", color: "#c7254e", backgroundColor: "#f9f2f4" },
  { tag: t.quote, color: "#6a737d", fontStyle: "italic" },
  { tag: t.meta, color: "#6a737d" },
  { tag: t.comment, color: "#6a737d" },
  { tag: t.processingInstruction, color: "#6a737d" },
  { tag: t.list, color: "#e36209" },
  { tag: t.separator, color: "#d1d5da" },
]);

const memoaDarkHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "700", fontSize: "1.6em", color: "#e2e8f0" },
  { tag: t.heading2, fontWeight: "700", fontSize: "1.4em", color: "#e2e8f0" },
  { tag: t.heading3, fontWeight: "600", fontSize: "1.2em", color: "#cbd5e1" },
  { tag: t.heading4, fontWeight: "600", fontSize: "1.1em", color: "#cbd5e1" },
  { tag: t.heading5, fontWeight: "600", fontSize: "1em", color: "#94a3b8" },
  { tag: t.heading6, fontWeight: "600", fontSize: "0.95em", color: "#94a3b8" },
  { tag: t.strong, fontWeight: "700", color: "#f1f5f9" },
  { tag: t.emphasis, fontStyle: "italic", color: "#e2e8f0" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "#64748b" },
  { tag: t.link, color: "#60a5fa", textDecoration: "underline" },
  { tag: t.url, color: "#60a5fa" },
  { tag: t.monospace, fontFamily: "JetBrains Mono, Fira Code, monospace", color: "#f472b6", backgroundColor: "rgba(244,114,182,0.1)" },
  { tag: t.quote, color: "#94a3b8", fontStyle: "italic" },
  { tag: t.meta, color: "#64748b" },
  { tag: t.comment, color: "#64748b" },
  { tag: t.processingInstruction, color: "#64748b" },
  { tag: t.list, color: "#fb923c" },
  { tag: t.separator, color: "#334155" },
]);

// ─── 自定义主题（字号使用 rem 联动全局） ─────────────

function memoaTheme(isDark: boolean): Extension {
  return EditorView.theme({
    "&": {
      // 使用 rem，跟随 document.documentElement.style.fontSize
      fontSize: "1rem",
      height: "100%",
    },
    ".cm-content": {
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: "1.5rem 0",
      caretColor: isDark ? "#60a5fa" : "#2563eb",
      lineHeight: "1.7",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: isDark ? "#60a5fa" : "#2563eb",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: isDark ? "rgba(96,165,250,0.25)" : "rgba(37,99,235,0.15)",
    },
    // 焦点视觉反馈
    "&.cm-focused": {
      outline: "1px solid " + (isDark ? "rgba(96,165,250,0.3)" : "rgba(37,99,235,0.2)"),
      outlineOffset: "-1px",
    },
    ".cm-gutters": {
      backgroundColor: "var(--color-surface-secondary)",
      color: isDark ? "#64748b" : "#94a3b8",
      border: "none",
      borderRight: "1px solid var(--color-border)",
      paddingRight: "4px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: isDark ? "rgba(96,165,250,0.08)" : "rgba(37,99,235,0.06)",
      color: isDark ? "#94a3b8" : "#64748b",
    },
    ".cm-activeLine": {
      backgroundColor: isDark ? "rgba(148,163,184,0.06)" : "rgba(0,0,0,0.03)",
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: isDark ? "rgba(96,165,250,0.25)" : "rgba(37,99,235,0.15)",
      outline: "1px solid " + (isDark ? "#60a5fa" : "#2563eb"),
    },
    ".cm-searchMatch": {
      backgroundColor: isDark ? "rgba(250,204,21,0.25)" : "rgba(250,204,21,0.4)",
      outline: "1px solid " + (isDark ? "rgba(250,204,21,0.5)" : "rgba(250,204,21,0.7)"),
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: isDark ? "rgba(250,204,21,0.4)" : "rgba(250,204,21,0.6)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: isDark ? "#1e293b" : "#e2e8f0",
      color: isDark ? "#64748b" : "#94a3b8",
      border: "none",
      padding: "0 6px",
    },
    ".cm-tooltip": {
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
      border: "1px solid var(--color-border)",
      borderRadius: "6px",
      boxShadow: isDark ? "0 4px 12px rgba(0,0,0,0.4)" : "0 4px 12px rgba(0,0,0,0.1)",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li": {
        padding: "4px 8px",
      },
      "& > ul > li[aria-selected]": {
        backgroundColor: isDark ? "rgba(96,165,250,0.15)" : "rgba(37,99,235,0.08)",
        color: isDark ? "#60a5fa" : "#2563eb",
      },
    },
    ".cm-panels": {
      backgroundColor: isDark ? "#0f172a" : "#f8fafc",
      borderBottom: "1px solid var(--color-border)",
    },
    ".cm-panels input, .cm-panels button": {
      fontFamily: "'Inter', system-ui, sans-serif",
      fontSize: "13px",
    },
  }, { dark: isDark });
}

// ─── Wiki Link 装饰器 ────────────────────────────────

class WikiLinkWidget extends WidgetType {
  constructor(readonly text: string, readonly hasAlias: boolean) { super(); }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-wiki-link";
    span.textContent = this.text;
    return span;
  }
  ignoreEvent() { return false; }
}

const wikiLinkMatcher = new MatchDecorator({
  regexp: /\[\[([^\]|#]+)(?:[|#]([^\]]+))?\]\]/g,
  decoration: (match) => {
    const target = match[1];
    const alias = match[2];
    const display = alias ? `${target}|${alias}` : target;
    return Decoration.replace({
      widget: new WikiLinkWidget(display, !!alias),
    });
  },
});

const wikiLinkPlugin = ViewPlugin.define((view) => ({
  decorations: wikiLinkMatcher.createDeco(view),
  update(update) {
    this.decorations = wikiLinkMatcher.updateDeco(update, this.decorations);
  },
}), {
  decorations: (v) => v.decorations,
});

// ─── Tag 装饰器（排除 Markdown 标题 # 开头） ──────────
// 使用 ViewPlugin 手动匹配，排除行首 # 后跟空格的标题语法

interface TagPluginValue {
  decorations: DecorationSet;
  update(update: ViewUpdate): void;
}

const tagPlugin = ViewPlugin.define<TagPluginValue>((view) => {
  // 匹配 #tag，但排除行首的 Markdown 标题（# 后跟空格）
  // 规则：# 前面不能是行首，且前面不能是 #（避免匹配 ### 中的部分）
  const TAG_RE = /(?:^|\s|[^\w#])#([\w\u4e00-\u9fff\-/]+)/gm;

  function buildDeco(v: EditorView): DecorationSet {
    const builder: Range<Decoration>[] = [];
    for (const { from, to } of v.visibleRanges) {
      const text = v.state.doc.sliceString(from, to);
      let match: RegExpExecArray | null;
      TAG_RE.lastIndex = 0;
      while ((match = TAG_RE.exec(text))) {
        // match[0] 包含前导字符（空格等），需要跳过
        const prefixLen = match[0].length - match[1].length - 1; // -1 for #
        const tagStart = from + match.index + prefixLen;
        const tagEnd = tagStart + match[1].length + 1; // +1 for the #
        builder.push(
          Decoration.mark({ class: "cm-tag" }).range(tagStart, tagEnd),
        );
      }
    }
    return Decoration.set(builder, true);
  }

  return {
    decorations: buildDeco(view),
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDeco(update.view);
      }
    },
  };
}, {
  decorations: (v: TagPluginValue) => v.decorations,
});

// ─── Wiki Link / Tag CSS ─────────────────────────────

const wikiLinkTagStyle = EditorView.baseTheme({
  ".cm-wiki-link": {
    color: "var(--color-accent)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--color-accent) 30%, transparent)",
    cursor: "pointer",
    borderRadius: "2px",
    padding: "0 1px",
  },
  ".cm-wiki-link:hover": {
    textDecorationColor: "var(--color-accent)",
    backgroundColor: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
  },
  ".cm-tag": {
    color: "var(--color-accent)",
    backgroundColor: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
    borderRadius: "3px",
    padding: "0 3px",
    cursor: "pointer",
  },
  ".cm-tag:hover": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 20%, transparent)",
  },
});

// ─── 创建编辑器扩展 ──────────────────────────────────

export function createCmExtensions(options: {
  isDark: boolean;
  onChange?: (content: string) => void;
  onSave?: () => void;
  onCursorChange?: (line: number, col: number) => void;
  showLineNumbers?: boolean;
}): Extension[] {
  const { isDark, onChange, onSave, onCursorChange, showLineNumbers = true } = options;

  const extensions: Extension[] = [
    // 基础功能
    highlightSpecialChars(),
    history(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSelectionMatches(),
    foldGutter(),

    // Markdown 语言支持
    markdown({ base: markdownLanguage, codeLanguages: languages }),

    // 语法高亮（Compartment 包裹，支持动态切换）
    highlightCompartment.of(syntaxHighlighting(isDark ? memoaDarkHighlight : memoaLightHighlight)),

    // 自定义主题（Compartment 包裹，支持动态切换）
    themeCompartment.of(memoaTheme(isDark)),

    // Wiki Link 和 Tag 装饰器
    wikiLinkPlugin,
    tagPlugin,
    wikiLinkTagStyle,

    // 自动补全
    autocompletion(),

    // 行号（Compartment 包裹，支持动态切换）
    lineNumbersCompartment.of(showLineNumbers ? lineNumbers() : []),

    // 快捷键
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
      // Ctrl+S 保存
      { key: "Mod-s", run: () => { onSave?.(); return true; } },
      // Ctrl+B 加粗
      { key: "Mod-b", run: (view) => wrapSelection(view, "**", "**") },
      // Ctrl+I 斜体
      { key: "Mod-i", run: (view) => wrapSelection(view, "*", "*") },
      // Ctrl+K 链接
      { key: "Mod-k", run: (view) => wrapSelection(view, "[", "](url)") },
    ]),

    // 内容变更监听 + 光标位置
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        onChange?.(update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        onCursorChange?.(line.number, pos - line.from + 1);
      }
    }),

    // 禁止 CodeMirror 处理 drop（让 Tauri 处理）
    EditorView.domEventHandlers({
      drop: (e) => { e.preventDefault(); },
    }),
  ];

  return extensions;
}

// ─── 动态重新配置（不重建编辑器） ────────────────────

export function reconfigureTheme(view: EditorView, isDark: boolean) {
  view.dispatch({
    effects: [
      themeCompartment.reconfigure(memoaTheme(isDark)),
      highlightCompartment.reconfigure(syntaxHighlighting(isDark ? memoaDarkHighlight : memoaLightHighlight)),
    ],
  });
}

export function reconfigureLineNumbers(view: EditorView, show: boolean) {
  view.dispatch({
    effects: lineNumbersCompartment.reconfigure(show ? lineNumbers() : []),
  });
}

// ─── 辅助函数：包裹选区 ──────────────────────────────

function wrapSelection(view: EditorView, before: string, after: string): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = before + selected + after;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  });
  return true;
}

// ─── 导出工具 ────────────────────────────────────────

export { EditorView, EditorState, memoaTheme, memoaDarkHighlight, memoaLightHighlight };
