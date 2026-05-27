// 文本语义分块器
//
// 将 Markdown 笔记切分为适合向量化的文本块，用于 RAG 检索增强。
//
// 分块策略:
//   1. 去除 YAML Frontmatter (---...---)
//   2. 按双换行 (\n\n) 分割段落
//   3. 段落内合并: 同一段落中的行若未以句末标点结尾则合并 (处理 markdown 硬换行)
//   4. 段落间合并: 上一段未以句末标点结尾时合并到下一段
//   5. 控制块大小: 800-1200 字符，过大时在段落边界切分
//   6. 过滤: 最终丢弃小于 50 字符的块
//   7. 定位: 记录每个块在原文中的 offset 和 length
//
// 本地化适配:
//   - 中文句末标点: 。！？!?；;…
//   - 中文段落起始字符: 汉字/数字/字母/引号/括号等

use regex::Regex;
use std::sync::OnceLock;

const CHUNK_MIN_CHARS: usize = 800;
const CHUNK_MAX_CHARS: usize = 1200;

#[derive(Debug, Clone)]
pub struct Chunk {
    pub text: String,
    pub offset: usize,
    pub length: usize,
}

fn end_punct_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[。！？!?；;…]\s*[\)）」』】]*\s*$").unwrap())
}

fn next_start_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"^[\u4e00-\u9fff0-9a-zA-Z"'"'"'""'""《（(【\[「『<]"#).unwrap())
}

fn strip_frontmatter(content: &str) -> &str {
    if content.starts_with("---") {
        if let Some(pos) = content[3..].find("\n---\n") {
            return &content[pos + 7..];
        }
    }
    content
}

fn merge_lines_within_paragraph(para: &str) -> String {
    let lines: Vec<&str> = para.split('\n').collect();
    let end_re = end_punct_re();
    let mut segs: Vec<String> = Vec::new();

    for ln in lines {
        let ln = ln.trim();
        if ln.is_empty() {
            continue;
        }
        if segs.is_empty() {
            segs.push(ln.to_string());
            continue;
        }
        let prev = segs.last().unwrap();
        let should_join = !end_re.is_match(prev);
        if should_join {
            if prev.ends_with('-') && prev.len() > 1 {
                segs.last_mut().unwrap().pop();
                segs.last_mut().unwrap().push_str(ln);
            } else {
                let joined = format!("{} {}", prev, ln);
                *segs.last_mut().unwrap() = joined;
            }
        } else {
            segs.push(ln.to_string());
        }
    }

    let result = segs.join(" ");
    Regex::new(r"\s{2,}").unwrap().replace_all(&result, " ").trim().to_string()
}

fn chunk_text_raw(content: &str) -> Vec<String> {
    let clean = strip_frontmatter(content);

    let text = clean.replace("\r\n", "\n").replace('\r', "\n");

    let end_re = end_punct_re();
    let start_re = next_start_re();

    let raw_paras: Vec<&str> = Regex::new(r"\n{2,}")
        .unwrap()
        .split(&text)
        .collect();

    let paras: Vec<String> = raw_paras
        .iter()
        .filter(|p| !p.trim().is_empty())
        .map(|p| merge_lines_within_paragraph(p))
        .collect();

    let mut merged: Vec<String> = Vec::new();
    for p in paras {
        if merged.is_empty() {
            merged.push(p);
            continue;
        }
        let prev = merged.last().unwrap();
        if !prev.is_empty() && !end_re.is_match(prev) && start_re.is_match(&p) {
            let connector = if prev.ends_with('-') { "" } else { "" };
            let combined = format!(
                "{}{}{}",
                prev.trim_end_matches('-'),
                connector,
                p
            );
            *merged.last_mut().unwrap() = Regex::new(r"\s{2,}")
                .unwrap()
                .replace_all(&combined, " ")
                .trim()
                .to_string();
        } else {
            merged.push(p);
        }
    }

    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();

    for para in merged {
        if current.is_empty() {
            current = para;
            continue;
        }

        let combined_len = current.len() + para.len() + 2;

        if combined_len > CHUNK_MAX_CHARS && current.len() >= CHUNK_MIN_CHARS {
            chunks.push(current.trim().to_string());
            current = para;
        } else if combined_len > CHUNK_MAX_CHARS * 2 && current.len() >= CHUNK_MIN_CHARS / 2 {
            chunks.push(current.trim().to_string());
            current = para;
        } else {
            current.push_str("\n\n");
            current.push_str(&para);
        }
    }

    if !current.trim().is_empty() {
        chunks.push(current.trim().to_string());
    }

    chunks.retain(|c| c.len() >= 50);
    chunks
}

fn find_content_start(content: &str, chunk_first: &str, search_from: usize) -> Option<usize> {
    let key: Vec<char> = chunk_first
        .chars()
        .filter(|c| !c.is_whitespace())
        .take(60)
        .collect();
    if key.is_empty() {
        return None;
    }

    let chars: Vec<char> = content.chars().collect();
    let mut i = search_from;

    while i < chars.len() {
        let mut j = 0;
        let mut k = i;
        while j < key.len() && k < chars.len() {
            if chars[k].is_whitespace() {
                k += 1;
                continue;
            }
            if chars[k].eq_ignore_ascii_case(&key[j]) || chars[k] == key[j] {
                j += 1;
                k += 1;
            } else {
                break;
            }
        }
        if j >= key.len().min(1) && j == key.len() {
            return Some(i);
        }
        i += 1;
    }
    None
}

pub fn chunk_text(content: &str) -> Vec<Chunk> {
    let chunk_texts = chunk_text_raw(content);

    let clean = strip_frontmatter(content);
    let frontmatter_len = content.len() - clean.len();

    let mut offsets: Vec<usize> = Vec::new();
    let mut search_from = 0;

    for ct in &chunk_texts {
        let first_line: String = ct
            .chars()
            .take(80)
            .collect::<String>()
            .lines()
            .next()
            .unwrap_or(ct)
            .to_string();

        let offset = find_content_start(clean, &first_line, search_from)
            .or_else(|| find_content_start(clean, &first_line, 0))
            .unwrap_or(0);

        offsets.push(offset);
        search_from = offset + 1;
    }

    let mut chunks: Vec<Chunk> = Vec::new();

    for i in 0..chunk_texts.len() {
        let off = offsets[i];
        let end = if i + 1 < offsets.len() {
            offsets[i + 1]
        } else {
            clean.len()
        };
        let length = end.saturating_sub(off).max(1);

        chunks.push(Chunk {
            text: chunk_texts[i].clone(),
            offset: frontmatter_len + off,
            length,
        });
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_single_paragraph() {
        let content = "这是一段关于小浪底水库的测试文本。";
        let chunks = chunk_text(content);
        assert!(!chunks.is_empty());
        assert!(chunks[0].text.contains("小浪底"));
    }

    #[test]
    fn test_chunk_multiple_paragraphs() {
        let content = "\
# 小浪底水库\n\n\
小浪底水利枢纽位于黄河中游最后一段峡谷的出口处，是黄河干流上最大的水利枢纽工程。\n\n\
工程于1994年动工，2001年竣工，主要功能包括：\n\n\
防洪防凌：有效调控黄河洪水，保障下游安全。\n\n\
减淤：利用调水调沙减少下游河道淤积。\n\n\
供水灌溉：为华北地区提供水资源。\n\n\
发电：提供清洁能源。";
        let chunks = chunk_text(content);
        assert!(!chunks.is_empty());
        assert!(chunks.iter().any(|c| c.text.contains("小浪底")));
    }

    #[test]
    fn test_chunk_merges_small_paragraphs() {
        let content = "\
第一句话很短。\n\n\
第二句话也很短。\n\n\
第三句话同样很短。";
        let chunks = chunk_text(content);
        assert!(chunks.len() <= 2);
    }

    #[test]
    fn test_chunk_with_frontmatter() {
        let content = "\
---\ntitle: test\ntags: [demo]\n---\n\n这是正文内容。这是一段足够长的测试文本，用来验证frontmatter被正确移除。";
        let chunks = chunk_text(content);
        assert!(!chunks.is_empty());
        assert!(!chunks[0].text.contains("---"));
    }

    #[test]
    fn test_chunk_large_document() {
        let mut content = String::new();
        for i in 0..20 {
            content.push_str(&format!(
                "第{}段：这是一段比较长的测试文本，用来验证段落合并和切片逻辑是否正常工作。",
                i + 1
            ));
            content.push_str("\n\n");
        }
        let chunks = chunk_text(&content);
        assert!(!chunks.is_empty());
        for c in &chunks {
            assert!(c.text.len() <= CHUNK_MAX_CHARS + 200);
        }
    }

    #[test]
    fn test_chunk_reflow_broken_lines() {
        let content = "\
小浪底水利枢纽位于黄河中游最后一段\n\
峡谷的出口处，是黄河干流上最大的\n\
水利枢纽工程。\n\n\
防洪防凌：有效调控黄河洪水，保障下游安全。";
        let chunks = chunk_text(content);
        assert!(!chunks.is_empty());
        let first = &chunks[0];
        assert!(!first.text.contains("最后一段\n峡谷"));
    }

    #[test]
    fn test_chunk_empty() {
        assert!(chunk_text("").is_empty());
    }
}