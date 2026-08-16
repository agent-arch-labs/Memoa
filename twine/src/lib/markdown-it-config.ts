/**
 * markdown-it 配置模块
 * 包含 Wiki Link、Tag 自定义规则和 Frontmatter 剥离
 * 独立于 React 组件，便于单元测试
 */
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import footnote from "markdown-it-footnote";
import anchor from "markdown-it-anchor";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";

// ─── 创建 markdown-it 实例 ────────────────────────────────

export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
  })
    .use(taskLists, { enabled: true, label: true, lineNumber: true })
    .use(footnote)
    .use(anchor, {
      permalink: anchor.permalink.ariaHidden({ class: "heading-anchor", symbol: "#" }),
    })
    .use(sub)
    .use(sup);

  // ─── 自定义规则：Wiki Link [[target|alias]] ──────────────

  md.inline.ruler.after("link", "wiki_link", (state, silent) => {
    const max = state.posMax;
    const start = state.pos;
    if (start + 3 > max) return false;
    if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false;
    if (state.src.charCodeAt(start + 1) !== 0x5b /* [ */) return false;

    const contentStart = start + 2;
    let depth = 0;
    let pos = contentStart;
    while (pos < max) {
      const ch = state.src.charCodeAt(pos);
      if (ch === 0x5b /* [ */) depth++;
      if (ch === 0x5d /* ] */) {
        if (depth === 0) {
          if (pos + 1 < max && state.src.charCodeAt(pos + 1) === 0x5d) {
            const content = state.src.slice(contentStart, pos);
            const pipeIdx = content.indexOf("|");
            const target = pipeIdx >= 0 ? content.slice(0, pipeIdx).trim() : content.trim();
            const alias = pipeIdx >= 0 ? content.slice(pipeIdx + 1).trim() : undefined;

            // 空 target 不解析
            if (!target) return false;

            if (!silent) {
              const token = state.push("wiki_link", "a", 0);
              token.attrSet("class", "wiki-link");
              token.attrSet("data-wiki-target", target);
              token.content = alias ? `${target}|${alias}` : target;
            }
            state.pos = pos + 2;
            return true;
          }
        } else {
          depth--;
        }
      }
      pos++;
    }
    return false;
  });

  md.renderer.rules.wiki_link = (tokens, idx) => {
    const token = tokens[idx];
    const target = token.attrGet("data-wiki-target") || "";
    const text = token.content;
    return `<a class="wiki-link" data-wiki-target="${md.utils.escapeHtml(target)}">${md.utils.escapeHtml(text)}</a>`;
  };

  // ─── 自定义规则：Tag #tagname ─────────────────────────────

  md.inline.ruler.after("wiki_link", "tag", (state, silent) => {
    const max = state.posMax;
    const start = state.pos;

    if (state.src.charCodeAt(start) !== 0x23 /* # */) return false;

    const afterHash = start + 1;
    if (afterHash >= max) return false;
    const nextCh = state.src.charCodeAt(afterHash);
    // tag 必须以字母、数字、中文、下划线开头
    if (
      !(nextCh >= 0x30 && nextCh <= 0x39) && // 0-9
      !(nextCh >= 0x41 && nextCh <= 0x5a) && // A-Z
      !(nextCh >= 0x61 && nextCh <= 0x7a) && // a-z
      !(nextCh >= 0x4e00 && nextCh <= 0x9fff) && // CJK
      nextCh !== 0x5f // _
    ) {
      return false;
    }

    // 检查 # 前面是否是空格或行首（排除 URL 中的 #）
    if (start > 0) {
      const prevCh = state.src.charCodeAt(start - 1);
      if (
        prevCh !== 0x20 && // space
        prevCh !== 0x09 && // tab
        prevCh !== 0x0a && // newline
        prevCh !== 0x28 && // (
        prevCh !== 0x5b // [
      ) {
        return false;
      }
    }

    // 匹配完整的 tag 名称
    let pos = afterHash;
    while (pos < max) {
      const ch = state.src.charCodeAt(pos);
      if (
        (ch >= 0x30 && ch <= 0x39) || // 0-9
        (ch >= 0x41 && ch <= 0x5a) || // A-Z
        (ch >= 0x61 && ch <= 0x7a) || // a-z
        (ch >= 0x4e00 && ch <= 0x9fff) || // CJK
        ch === 0x5f || // _
        ch === 0x2d || // -
        ch === 0x2f // /
      ) {
        pos++;
      } else {
        break;
      }
    }

    const tagName = state.src.slice(afterHash, pos);
    if (tagName.length === 0) return false;

    if (!silent) {
      const token = state.push("tag", "span", 0);
      token.attrSet("class", "tag");
      token.content = tagName;
    }
    state.pos = pos;
    return true;
  });

  md.renderer.rules.tag = (tokens, idx) => {
    const token = tokens[idx];
    const tagName = token.content;
    return `<span class="tag">#${md.utils.escapeHtml(tagName)}</span>`;
  };

  return md;
}

// ─── 单例实例（供组件使用） ─────────────────────────────────

export const md = createMarkdownIt();

// ─── Frontmatter 剥离 ─────────────────────────────────────

export function stripFrontmatter(source: string): string {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("---")) return source;
  const afterFirst = trimmed.indexOf("---", 3);
  if (afterFirst === -1) return source;
  return trimmed.substring(afterFirst + 3).trimStart();
}
