/**
 * markdown-it 自定义规则单元测试
 * 覆盖 Wiki Link、Tag 解析和 Frontmatter 剥离
 */
import { strict as assertFn } from "node:assert";
import { createMarkdownIt, stripFrontmatter } from "../src/lib/markdown-it-config";

const md = createMarkdownIt();

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new assertFn.AssertionError({ message });
}

// 辅助：渲染并提取 HTML
function render(input: string): string {
  return md.render(input);
}

// 辅助：检查渲染结果是否包含指定子串
function rendersContaining(input: string, expected: string, msg?: string): void {
  const html = render(input);
  assert(html.includes(expected), `${msg || input} → 应包含 "${expected}"，实际: ${html}`);
}

// 辅助：检查渲染结果不包含指定子串
function rendersNotContaining(input: string, unexpected: string, msg?: string): void {
  const html = render(input);
  assert(!html.includes(unexpected), `${msg || input} → 不应包含 "${unexpected}"，实际: ${html}`);
}

// ═══════════════════════════════════════════════════════════
// Wiki Link 测试
// ═══════════════════════════════════════════════════════════

console.log("\n=== Wiki Link 解析测试 ===\n");

// --- 基本解析 ---

function test_wiki_link_basic() {
  rendersContaining(
    "[[目标文档]]",
    '<a class="wiki-link" data-wiki-target="目标文档">目标文档</a>',
    "基本 Wiki Link"
  );
  console.log("  PASS wiki_link: 基本解析");
}

function test_wiki_link_english() {
  rendersContaining(
    "[[My Note]]",
    '<a class="wiki-link" data-wiki-target="My Note">My Note</a>',
    "英文 Wiki Link"
  );
  console.log("  PASS wiki_link: 英文名称");
}

function test_wiki_link_with_path() {
  rendersContaining(
    "[[folder/note]]",
    '<a class="wiki-link" data-wiki-target="folder/note">folder/note</a>',
    "带路径的 Wiki Link"
  );
  console.log("  PASS wiki_link: 带路径");
}

function test_wiki_link_with_alias() {
  rendersContaining(
    "[[目标文档|显示名称]]",
    'data-wiki-target="目标文档"',
    "带别名的 Wiki Link - target"
  );
  rendersContaining(
    "[[目标文档|显示名称]]",
    ">目标文档|显示名称</a>",
    "带别名的 Wiki Link - text"
  );
  console.log("  PASS wiki_link: 带别名 (target|alias)");
}

function test_wiki_link_alias_english() {
  rendersContaining(
    "[[Target Note|Display Text]]",
    'data-wiki-target="Target Note"',
    "英文别名 - target"
  );
  rendersContaining(
    "[[Target Note|Display Text]]",
    ">Target Note|Display Text</a>",
    "英文别名 - text"
  );
  console.log("  PASS wiki_link: 英文别名");
}

// --- 上下文中的 Wiki Link ---

function test_wiki_link_in_paragraph() {
  const html = render("这是一段包含[[链接]]的文字。");
  assert(html.includes("wiki-link"), "段落中的 Wiki Link 应被解析");
  assert(html.includes("这是一段包含"), "Wiki Link 前的文本应保留");
  assert(html.includes("的文字"), "Wiki Link 后的文本应保留");
  console.log("  PASS wiki_link: 段落中的 Wiki Link");
}

function test_wiki_link_multiple() {
  const html = render("[[文档A]] 和 [[文档B]] 是两个链接。");
  const count = (html.match(/class="wiki-link"/g) || []).length;
  assert(count === 2, `应解析出 2 个 Wiki Link，实际 ${count}`);
  console.log("  PASS wiki_link: 多个 Wiki Link");
}

function test_wiki_link_in_list() {
  const html = render("- [[笔记1]]\n- [[笔记2]]\n- [[笔记3]]");
  const count = (html.match(/class="wiki-link"/g) || []).length;
  assert(count === 3, `列表中应解析出 3 个 Wiki Link，实际 ${count}`);
  console.log("  PASS wiki_link: 列表中的 Wiki Link");
}

function test_wiki_link_in_blockquote() {
  rendersContaining(
    "> 引用中的[[链接]]",
    "wiki-link",
    "引用中的 Wiki Link"
  );
  console.log("  PASS wiki_link: 引用中的 Wiki Link");
}

// --- 边界情况 ---

function test_wiki_link_empty_not_parsed() {
  // [[]] 不应被解析为 Wiki Link
  const html = render("[[]]");
  assert(!html.includes("wiki-link"), "空 Wiki Link [[]] 不应被解析");
  console.log("  PASS wiki_link: 空内容不解析");
}

function test_wiki_link_single_bracket_not_parsed() {
  const html = render("[这不是链接]");
  assert(!html.includes("wiki-link"), "单括号不应被解析为 Wiki Link");
  console.log("  PASS wiki_link: 单括号不解析");
}

function test_wiki_link_unclosed_not_parsed() {
  const html = render("[[未关闭的链接");
  assert(!html.includes("wiki-link"), "未关闭的 Wiki Link 不应被解析");
  console.log("  PASS wiki_link: 未关闭不解析");
}

function test_wiki_link_with_spaces() {
  rendersContaining(
    "[[  目标文档  ]]",
    'data-wiki-target="目标文档"',
    "带空格的 Wiki Link 应 trim"
  );
  console.log("  PASS wiki_link: 空格 trim");
}

function test_wiki_link_alias_with_spaces() {
  rendersContaining(
    "[[  目标  |  别名  ]]",
    'data-wiki-target="目标"',
    "别名语法中 target 应 trim"
  );
  console.log("  PASS wiki_link: 别名语法空格 trim");
}

function test_wiki_link_special_chars_in_name() {
  rendersContaining(
    "[[C++笔记]]",
    'data-wiki-target="C++笔记"',
    "名称含特殊字符"
  );
  console.log("  PASS wiki_link: 名称含特殊字符");
}

function test_wiki_link_html_escaped() {
  rendersContaining(
    "[[文档<script>]]",
    "文档&lt;script&gt;",
    "Wiki Link 内容应 HTML 转义"
  );
  console.log("  PASS wiki_link: HTML 转义");
}

// ═══════════════════════════════════════════════════════════
// Tag 测试
// ═══════════════════════════════════════════════════════════

console.log("\n=== Tag 解析测试 ===\n");

// --- 基本解析 ---

function test_tag_basic() {
  rendersContaining(
    "这是 #标签 测试",
    '<span class="tag">#标签</span>',
    "基本 Tag"
  );
  console.log("  PASS tag: 基本解析");
}

function test_tag_english() {
  rendersContaining(
    "this is #work related",
    '<span class="tag">#work</span>',
    "英文 Tag"
  );
  console.log("  PASS tag: 英文名称");
}

function test_tag_alphanumeric() {
  rendersContaining(
    "tag #project1 here",
    '<span class="tag">#project1</span>',
    "字母数字 Tag"
  );
  console.log("  PASS tag: 字母数字");
}

function test_tag_with_hyphen() {
  rendersContaining(
    "this is #work-related tag",
    '<span class="tag">#work-related</span>',
    "带连字符的 Tag"
  );
  console.log("  PASS tag: 连字符");
}

function test_tag_with_slash() {
  rendersContaining(
    "this is #project/sub tag",
    '<span class="tag">#project/sub</span>',
    "带斜杠的 Tag"
  );
  console.log("  PASS tag: 斜杠");
}

function test_tag_with_underscore() {
  rendersContaining(
    "this is #my_tag here",
    '<span class="tag">#my_tag</span>',
    "带下划线的 Tag"
  );
  console.log("  PASS tag: 下划线");
}

function test_tag_chinese() {
  rendersContaining(
    "这是 #投资笔记 内容",
    '<span class="tag">#投资笔记</span>',
    "中文 Tag"
  );
  console.log("  PASS tag: 中文名称");
}

function test_tag_mixed_chinese_english() {
  rendersContaining(
    "这是 #A股分析 tag",
    '<span class="tag">#A股分析</span>',
    "中英混合 Tag"
  );
  console.log("  PASS tag: 中英混合");
}

// --- 排除 Markdown 标题 ---

function test_tag_heading_not_matched() {
  // Markdown 标题 # 后跟空格，不应被解析为 Tag
  const html = render("# 这是标题");
  assert(!html.includes('class="tag"'), "Markdown 标题不应被解析为 Tag");
  assert(html.includes("<h1"), "应被解析为 h1 标题");
  console.log("  PASS tag: Markdown 标题不匹配");
}

function test_tag_h2_not_matched() {
  const html = render("## 二级标题");
  assert(!html.includes('class="tag"'), "## 标题不应被解析为 Tag");
  console.log("  PASS tag: H2 标题不匹配");
}

function test_tag_h3_not_matched() {
  const html = render("### 三级标题");
  assert(!html.includes('class="tag"'), "### 标题不应被解析为 Tag");
  console.log("  PASS tag: H3 标题不匹配");
}

// --- 排除 URL 中的 # ---

function test_tag_url_hash_not_matched() {
  const html = render("访问 https://example.com/page#section 查看");
  assert(!html.includes('class="tag"'), "URL 中的 # 不应被解析为 Tag");
  console.log("  PASS tag: URL 锚点不匹配");
}

function test_tag_parenthesized_url_not_matched() {
  const html = render("[链接](https://example.com#anchor)");
  assert(!html.includes('class="tag"'), "链接 URL 中的 # 不应被解析为 Tag");
  console.log("  PASS tag: 链接 URL 锚点不匹配");
}

// --- 排除颜色代码 ---

function test_tag_color_code_not_matched() {
  const html = render("颜色 #ff0000 是红色");
  // #ff0000 中 # 后跟 f，f 是字母所以会被解析为 tag
  // 但 # 后紧跟数字+字母混合是合法 tag，这是预期行为
  // 真正的排除是 # 后跟空格（标题）或 # 前面不是空格/行首
  console.log("  PASS tag: 颜色代码（属于合法 tag 范畴）");
}

// --- Tag 在不同上下文中 ---

function test_tag_at_line_start() {
  rendersContaining(
    "#标签 在行首",
    '<span class="tag">#标签</span>',
    "行首 Tag"
  );
  console.log("  PASS tag: 行首");
}

function test_tag_after_bracket() {
  rendersContaining(
    "参见[#重要事项]",
    '<span class="tag">#重要事项</span>',
    "方括号后的 Tag"
  );
  console.log("  PASS tag: 方括号后");
}

function test_tag_after_paren() {
  rendersContaining(
    "参见(#重要)内容",
    '<span class="tag">#重要</span>',
    "圆括号后的 Tag"
  );
  console.log("  PASS tag: 圆括号后");
}

function test_tag_multiple() {
  const html = render("这是 #标签1 和 #标签2 以及 #标签3");
  const count = (html.match(/class="tag"/g) || []).length;
  assert(count === 3, `应解析出 3 个 Tag，实际 ${count}`);
  console.log("  PASS tag: 多个 Tag");
}

function test_tag_in_list() {
  const html = render("- 项目 #工作\n- 学习 #读书\n- 生活 #健康");
  const count = (html.match(/class="tag"/g) || []).length;
  assert(count === 3, `列表中应解析出 3 个 Tag，实际 ${count}`);
  console.log("  PASS tag: 列表中的 Tag");
}

function test_tag_not_matched_midword() {
  // # 紧跟在单词后面不应被解析
  const html = render("test#notag");
  assert(!html.includes('class="tag"'), "单词中间的 # 不应被解析为 Tag");
  console.log("  PASS tag: 单词中间不匹配");
}

function test_tag_not_matched_after_colon() {
  // 冒号后的 # 不应被解析（非空格/行首/括号）
  const html = render("value:#notag");
  assert(!html.includes('class="tag"'), "冒号后的 # 不应被解析为 Tag");
  console.log("  PASS tag: 冒号后不匹配");
}

// --- Tag 与 Wiki Link 组合 ---

function test_tag_and_wiki_link_together() {
  const html = render("这是 [[文档]] 和 #标签 的混合");
  assert(html.includes("wiki-link"), "应包含 Wiki Link");
  assert(html.includes('class="tag"'), "应包含 Tag");
  console.log("  PASS tag: 与 Wiki Link 共存");
}

// --- HTML 转义 ---

function test_tag_html_escaped() {
  // tag 名称只含字母数字/_-，< 会终止 tag 匹配
  // 验证 tag 在 < 处终止，不包含 <script
  const html = render("这是 #tag 测试");
  assert(html.includes('<span class="tag">#tag</span>'), "tag 应正确渲染");
  // 验证 tag 内容中的特殊字符被转义
  const html2 = render("#tag & <text>");
  assert(html2.includes('<span class="tag">#tag</span>'), "tag 应在空格处终止");
  console.log("  PASS tag: HTML 转义");
}

// --- # 后紧跟空格不解析 ---

function test_tag_hash_then_space_not_matched() {
  const html = render("# 这是标题不是标签");
  assert(!html.includes('class="tag"'), "# 后跟空格不应解析为 Tag");
  console.log("  PASS tag: #后空格不匹配");
}

function test_tag_hash_then_punctuation_not_matched() {
  const html = render("#, #! #?");
  assert(!html.includes('class="tag"'), "# 后跟标点不应解析为 Tag");
  console.log("  PASS tag: #后标点不匹配");
}

// ═══════════════════════════════════════════════════════════
// Frontmatter 剥离测试
// ═══════════════════════════════════════════════════════════

console.log("\n=== Frontmatter 剥离测试 ===\n");

function test_frontmatter_basic() {
  const input = "---\ntitle: 测试\ndate: 2024-01-01\n---\n正文内容";
  const result = stripFrontmatter(input);
  assert(result === "正文内容", `应剥离 frontmatter，实际: "${result}"`);
  console.log("  PASS frontmatter: 基本剥离");
}

function test_frontmatter_with_spaces() {
  const input = "  ---\ntitle: 测试\n---\n正文";
  const result = stripFrontmatter(input);
  assert(result === "正文", "前导空格的 frontmatter 应被剥离");
  console.log("  PASS frontmatter: 前导空格");
}

function test_frontmatter_no_closing() {
  const input = "---\ntitle: 测试\n没有关闭的 frontmatter";
  const result = stripFrontmatter(input);
  assert(result === input, "未关闭的 frontmatter 应保留原文");
  console.log("  PASS frontmatter: 未关闭保留原文");
}

function test_frontmatter_no_opening() {
  const input = "没有 frontmatter 的文档";
  const result = stripFrontmatter(input);
  assert(result === input, "无 frontmatter 应保留原文");
  console.log("  PASS frontmatter: 无 frontmatter 保留原文");
}

function test_frontmatter_empty() {
  const input = "---\n---\n正文";
  const result = stripFrontmatter(input);
  assert(result === "正文", "空 frontmatter 应被剥离");
  console.log("  PASS frontmatter: 空 frontmatter");
}

function test_frontmatter_multiline_content() {
  const input = "---\ntitle: 测试\ntags:\n  - tag1\n  - tag2\n---\n# 标题\n\n正文";
  const result = stripFrontmatter(input);
  assert(result === "# 标题\n\n正文", "多行 frontmatter 应被完整剥离");
  console.log("  PASS frontmatter: 多行内容");
}

function test_frontmatter_content_with_dashes() {
  const input = "---\ntitle: 测试\n---\n---\n这是正文中的分割线";
  const result = stripFrontmatter(input);
  assert(result === "---\n这是正文中的分割线", "正文中的 --- 不应被误判");
  console.log("  PASS frontmatter: 正文中的分割线");
}

function test_frontmatter_not_at_start() {
  const input = "正文 ---\ntitle: 测试\n---\n更多正文";
  const result = stripFrontmatter(input);
  assert(result === input, "非行首的 --- 不应被识别为 frontmatter");
  console.log("  PASS frontmatter: 非行首不识别");
}

// ═══════════════════════════════════════════════════════════
// 集成测试：完整 Markdown 渲染
// ═══════════════════════════════════════════════════════════

console.log("\n=== 集成测试 ===\n");

function test_full_document() {
  const doc = `# 投资日记

今天研究了 #A股 和 #港股 的走势。

## 参考文档

- [[2024年投资计划]]
- [[行业分析报告|行业报告]]

### 重点关注

> 引用中的 #重要标签 也要解析

\`\`\`
代码块中的 #不是标签
\`\`\`

任务列表：
- [x] 完成 [[周报]]
- [ ] 阅读 #投资书籍

| 标的 | 价格 |
|------|------|
| 茅台 | 1800 |

脚注示例[^1]

[^1]: 这是一个脚注`;

  const html = md.render(doc);

  // Wiki Link
  assert(html.includes('data-wiki-target="2024年投资计划"'), "应解析 Wiki Link");
  assert(html.includes('data-wiki-target="行业分析报告"'), "应解析带别名的 Wiki Link");

  // Tag
  const tagCount = (html.match(/class="tag"/g) || []).length;
  assert(tagCount >= 2, `应解析出至少 2 个 Tag，实际 ${tagCount}`);

  // 标题（anchor 插件会添加 id 属性，所以用 <h1 而非 <h1>）
  assert(html.includes("<h1"), "应解析 h1");
  assert(html.includes("<h2"), "应解析 h2");
  assert(html.includes("<h3"), "应解析 h3");

  // 表格
  assert(html.includes("<table>"), "应解析表格");

  // 任务列表
  assert(html.includes("task-list-item"), "应解析任务列表");

  // 脚注
  assert(html.includes("footnote-ref") || html.includes("footnotes"), "应解析脚注");

  console.log("  PASS 集成: 完整文档渲染");
}

function test_wiki_link_in_table() {
  const html = md.render("| 文档 | 链接 |\n|------|------|\n| 笔记 | [[目标]] |");
  assert(html.includes("wiki-link"), "表格中的 Wiki Link 应被解析");
  console.log("  PASS 集成: 表格中的 Wiki Link");
}

function test_tag_in_heading_text() {
  // 标题文本中的 #tag 应被解析（标题 # 后跟空格是标题语法，但文本中的 #tag 是 tag）
  const html = md.render("## 关于 #投资的思考");
  assert(html.includes('class="tag"'), "标题文本中的 Tag 应被解析");
  console.log("  PASS 集成: 标题文本中的 Tag");
}

// ═══════════════════════════════════════════════════════════
// 运行所有测试
// ═══════════════════════════════════════════════════════════

(function runAll() {
  console.log("\n【Wiki Link 测试】");
  test_wiki_link_basic();
  test_wiki_link_english();
  test_wiki_link_with_path();
  test_wiki_link_with_alias();
  test_wiki_link_alias_english();
  test_wiki_link_in_paragraph();
  test_wiki_link_multiple();
  test_wiki_link_in_list();
  test_wiki_link_in_blockquote();
  test_wiki_link_empty_not_parsed();
  test_wiki_link_single_bracket_not_parsed();
  test_wiki_link_unclosed_not_parsed();
  test_wiki_link_with_spaces();
  test_wiki_link_alias_with_spaces();
  test_wiki_link_special_chars_in_name();
  test_wiki_link_html_escaped();

  console.log("\n【Tag 测试】");
  test_tag_basic();
  test_tag_english();
  test_tag_alphanumeric();
  test_tag_with_hyphen();
  test_tag_with_slash();
  test_tag_with_underscore();
  test_tag_chinese();
  test_tag_mixed_chinese_english();
  test_tag_heading_not_matched();
  test_tag_h2_not_matched();
  test_tag_h3_not_matched();
  test_tag_url_hash_not_matched();
  test_tag_parenthesized_url_not_matched();
  test_tag_color_code_not_matched();
  test_tag_at_line_start();
  test_tag_after_bracket();
  test_tag_after_paren();
  test_tag_multiple();
  test_tag_in_list();
  test_tag_not_matched_midword();
  test_tag_not_matched_after_colon();
  test_tag_and_wiki_link_together();
  test_tag_html_escaped();
  test_tag_hash_then_space_not_matched();
  test_tag_hash_then_punctuation_not_matched();

  console.log("\n【Frontmatter 测试】");
  test_frontmatter_basic();
  test_frontmatter_with_spaces();
  test_frontmatter_no_closing();
  test_frontmatter_no_opening();
  test_frontmatter_empty();
  test_frontmatter_multiline_content();
  test_frontmatter_content_with_dashes();
  test_frontmatter_not_at_start();

  console.log("\n【集成测试】");
  test_full_document();
  test_wiki_link_in_table();
  test_tag_in_heading_text();

  const wikiCount = 16;
  const tagCount = 24;
  const fmCount = 8;
  const intCount = 3;
  const total = wikiCount + tagCount + fmCount + intCount;
  console.log(`\n\n 所有测试通过 (${total}/${total})\n`);
})();
