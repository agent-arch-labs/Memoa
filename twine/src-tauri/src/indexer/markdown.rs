use regex::Regex;
use std::sync::LazyLock;

static WIKI_LINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\]|#]+)(?:[|#]([^\]]+))?\]\]").unwrap()
});

static MARKDOWN_LINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[([^\]]*)\]\(([^)]+)\)").unwrap());

static TAG_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"#([\w\u4e00-\u9fff\-/]+)").unwrap());

static FRONTMATTER_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)^---\s*\n(.*?)\n---\s*\n").unwrap());

static HEADING_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^#{1,6}\s+.+$").unwrap());

#[derive(Debug)]
pub struct LinkInfo {
    pub target: String,
    pub alias: Option<String>,
    pub context: Option<String>,
    pub line: u32,
}

#[derive(Debug)]
pub struct ExtractResult {
    pub tags: Vec<String>,
    pub keywords: Vec<String>,
    pub aliases: Vec<String>,
    pub links: Vec<LinkInfo>,
    pub frontmatter_json: Option<String>,
}

pub fn extract_frontmatter_and_links(content: &str) -> ExtractResult {
    let (fm_tags, fm_keywords, fm_aliases, after_fm, fm_json) = extract_frontmatter_data(content);
    let inline_tags = extract_tags(&after_fm);

    let mut all_tags = fm_tags;
    for t in inline_tags {
        if !all_tags.contains(&t) {
            all_tags.push(t);
        }
    }

    let links = extract_wiki_links(&after_fm)
        .into_iter()
        .chain(extract_markdown_links(&after_fm))
        .collect();

    ExtractResult {
        tags: all_tags,
        keywords: fm_keywords,
        aliases: fm_aliases,
        links,
        frontmatter_json: fm_json,
    }
}

fn extract_frontmatter_data(content: &str) -> (Vec<String>, Vec<String>, Vec<String>, String, Option<String>) {
    let result = FRONTMATTER_RE
        .captures(content)
        .and_then(|caps| {
            let yaml_str = caps.get(1).unwrap().as_str();
            let fm_json = if yaml_str.trim().is_empty() { None } else { Some(yaml_str.trim().to_string()) };
            let value: serde_json::Value = serde_yaml::from_str::<serde_yaml::Value>(yaml_str)
                .ok()
                .and_then(|v| serde_json::to_value(v).ok())
                .unwrap_or(serde_json::Value::Null);

            let tags = extract_yaml_list(&value, "tags");
            let keywords = extract_yaml_list(&value, "keywords");
            let aliases = extract_yaml_list(&value, "aliases");
            let end_pos = caps.get(0).unwrap().end();
            Some((tags, keywords, aliases, end_pos, fm_json))
        });

    match result {
        Some((tags, keywords, aliases, end_pos, fm_json)) => {
            let after_fm = content[end_pos..].to_string();
            (tags, keywords, aliases, after_fm, fm_json)
        }
        None => (Vec::new(), Vec::new(), Vec::new(), content.to_string(), None),
    }
}

fn extract_yaml_list(value: &serde_json::Value, key: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();

    match value.get(key) {
        Some(serde_json::Value::Array(arr)) => {
            for item in arr {
                if let Some(s) = item.as_str() {
                    let trimmed = s.trim().to_string();
                    if !trimmed.is_empty() && seen.insert(trimmed.clone()) {
                        result.push(trimmed);
                    }
                }
            }
        }
        Some(serde_json::Value::String(s)) => {
            let trimmed = s.trim().to_string();
            if !trimmed.is_empty() && seen.insert(trimmed.clone()) {
                result.push(trimmed);
            }
        }
        _ => {}
    }

    result
}

pub fn extract_wiki_links(content: &str) -> Vec<LinkInfo> {
    let mut links = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        for caps in WIKI_LINK_RE.captures_iter(line) {
            let target = caps
                .get(1)
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();
            let alias = caps.get(2).map(|m| m.as_str().to_string());

            links.push(LinkInfo {
                target,
                alias,
                context: Some(line.to_string()),
                line: (line_num + 1) as u32,
            });
        }
    }

    links
}

pub fn extract_markdown_links(content: &str) -> Vec<LinkInfo> {
    let mut links = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        for caps in MARKDOWN_LINK_RE.captures_iter(line) {
            let url = caps.get(2).map(|m| m.as_str()).unwrap_or_default();

            if url.starts_with("http://") || url.starts_with("https://") || url.contains("://") {
                continue;
            }

            let target = if url.ends_with(".md") {
                url.trim_end_matches(".md").to_string()
            } else {
                url.to_string()
            };
            let alias = caps.get(1).map(|m| m.as_str().to_string());

            links.push(LinkInfo {
                target,
                alias,
                context: Some(line.to_string()),
                line: (line_num + 1) as u32,
            });
        }
    }

    links
}

pub fn extract_tags(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut in_code_block = false;

    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        if in_code_block {
            continue;
        }
        for cap in TAG_RE.captures_iter(line) {
            let tag = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
            if seen.insert(tag.clone()) {
                tags.push(tag);
            }
        }
    }

    tags
}

pub fn rename_wiki_links(content: &str, old_title: &str, new_title: &str) -> String {
    WIKI_LINK_RE
        .replace_all(content, |caps: &regex::Captures| {
            let target = caps
                .get(1)
                .map(|m| m.as_str().trim())
                .unwrap_or("");
            let rest = caps.get(2).map(|m| format!("|{}", m.as_str())).unwrap_or_default();

            if target == old_title {
                format!("[[{}{}]]", new_title, rest)
            } else {
                caps[0].to_string()
            }
        })
        .to_string()
}

pub fn extract_frontmatter(content: &str) -> Option<(serde_json::Value, usize)> {
    FRONTMATTER_RE.captures(content).map(|caps| {
        let yaml_str = caps.get(1).unwrap().as_str();
        let value: serde_json::Value = serde_yaml::from_str(yaml_str)
            .map(|v: serde_yaml::Value| {
                serde_json::to_value(v).unwrap_or(serde_json::Value::Null)
            })
            .unwrap_or(serde_json::Value::Null);
        let end_pos = caps.get(0).unwrap().end();
        (value, end_pos)
    })
}

pub fn chunk_text(content: &str, max_chunk_size: usize) -> Vec<String> {
    let clean = strip_frontmatter_for_chunking(content);
    let mut chunks = Vec::new();

    let paragraphs: Vec<&str> = clean.split("\n\n").collect();
    let mut current = String::new();

    for para in paragraphs {
        let trimmed = para.trim();
        if trimmed.is_empty() {
            continue;
        }

        if !current.is_empty() && current.len() + trimmed.len() > max_chunk_size {
            chunks.push(current.trim().to_string());
            current = String::new();
        }

        if !current.is_empty() {
            current.push_str("\n\n");
        }
        current.push_str(trimmed);
    }

    if !current.trim().is_empty() {
        chunks.push(current.trim().to_string());
    }

    if chunks.is_empty() && !clean.trim().is_empty() {
        chunks.push(clean.trim().to_string());
    }

    chunks
}

fn strip_frontmatter_for_chunking(content: &str) -> String {
    if content.starts_with("---") {
        if let Some(pos) = content[3..].find("\n---\n") {
            return content[pos + 7..].to_string();
        }
    }
    content.to_string()
}

pub fn extract_plain_text(content: &str) -> String {
    let content = strip_frontmatter_for_chunking(content);

    let without_wiki = WIKI_LINK_RE.replace_all(&content, |caps: &regex::Captures| {
        caps.get(2)
            .or_else(|| caps.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default()
    });

    let without_md_link = MARKDOWN_LINK_RE.replace_all(&without_wiki, |caps: &regex::Captures| {
        caps.get(1)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default()
    });

    let without_tags = TAG_RE.replace_all(&without_md_link, |caps: &regex::Captures| {
        caps.get(1)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default()
    });

    without_tags
        .lines()
        .filter(|line| !line.trim_start().starts_with("```"))
        .filter(|line| !HEADING_RE.is_match(line))
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_wiki_links() {
        let content = "See [[other note]] and [[another note|alias]] for details.";
        let links = extract_wiki_links(content);
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].target, "other note");
        assert!(links[0].alias.is_none());
        assert_eq!(links[1].target, "another note");
        assert_eq!(links[1].alias, Some("alias".to_string()));
        assert_eq!(links[1].line, 1);
    }

    #[test]
    fn test_extract_wiki_links_with_heading() {
        let content = "# [[heading link]]\nBody [[body link]]";
        let links = extract_wiki_links(content);
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].target, "heading link");
        assert_eq!(links[1].target, "body link");
    }

    #[test]
    fn test_extract_wiki_links_empty() {
        let links = extract_wiki_links("no links here");
        assert!(links.is_empty());
    }

    #[test]
    fn test_extract_markdown_links() {
        let content = "[text](target.md) and [other](https://example.com)";
        let links = extract_markdown_links(content);
        assert_eq!(links.len(), 1, "外部 URL 应被过滤");
        assert_eq!(links[0].target, "target");
        assert_eq!(links[0].alias, Some("text".to_string()));
    }

    #[test]
    fn test_extract_tags() {
        let content = "#tag1 Some text #tag2/subtag and another #中文标签";
        let tags = extract_tags(content);
        assert!(tags.contains(&"tag1".to_string()));
        assert!(tags.contains(&"tag2/subtag".to_string()));
        assert!(tags.contains(&"中文标签".to_string()));
    }

    #[test]
    fn test_extract_tags_deduplication() {
        let content = "#tag1 #tag1 #tag2";
        let tags = extract_tags(content);
        assert_eq!(tags.len(), 2);
    }

    #[test]
    fn test_extract_tags_skip_code_fences() {
        let content = "#tag1\n```python\n#code_tag\n```\n#tag2";
        let tags = extract_tags(content);
        assert!(tags.contains(&"tag1".to_string()));
        assert!(tags.contains(&"tag2".to_string()));
        assert!(!tags.contains(&"code_tag".to_string()), "代码块内的标签不应被提取");
    }

    #[test]
    fn test_extract_frontmatter_and_links() {
        let content = "[[link1]] #tag1 [alias](link2.md)";
        let result = extract_frontmatter_and_links(content);
        assert_eq!(result.tags.len(), 1);
        assert_eq!(result.links.len(), 2);
    }

    #[test]
    fn test_rename_wiki_links() {
        let content = "See [[old name]] and [[old name|alias]]";
        let renamed = rename_wiki_links(content, "old name", "new name");
        assert_eq!(renamed, "See [[new name]] and [[new name|alias]]");
    }

    #[test]
    fn test_rename_wiki_links_no_match() {
        let content = "[[other]]";
        let renamed = rename_wiki_links(content, "old name", "new name");
        assert_eq!(renamed, "[[other]]");
    }

    #[test]
    fn test_extract_frontmatter() {
        let content = "---\ntitle: Test\ncreated: 2026-01-01\n---\n\nBody content here.";
        let (fm, end_pos) = extract_frontmatter(content).unwrap();
        assert_eq!(fm["title"], "Test");
        assert!(end_pos > 0);
    }

    #[test]
    fn test_extract_frontmatter_none() {
        let content = "Just content, no frontmatter.";
        assert!(extract_frontmatter(content).is_none());
    }

    #[test]
    fn test_chunk_text_simple() {
        let content = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
        let chunks = chunk_text(content, 100);
        assert_eq!(chunks.len(), 1);
    }

    #[test]
    fn test_chunk_text_splits_large() {
        let long = "X".repeat(600);
        let content = format!("Short.\n\n{}", long);
        let chunks = chunk_text(&content, 500);
        assert!(chunks.len() >= 2);
    }

    #[test]
    fn test_chunk_text_with_frontmatter() {
        let content = "---\ntitle: Test\n---\n\nBody text.";
        let chunks = chunk_text(content, 500);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "Body text.");
    }

    #[test]
    fn test_chunk_text_empty() {
        let chunks = chunk_text("", 500);
        assert!(chunks.is_empty());
    }

    #[test]
    fn test_extract_plain_text() {
        let content = "# Heading\n\nBody with [[wiki link]] and [md link](target.md) and #tag.";
        let text = extract_plain_text(content);
        assert!(!text.contains("[["));
        assert!(!text.contains("# Heading"));
        assert!(!text.contains("[md link]"));
        assert!(text.contains("wiki link"));
        assert!(text.contains("md link"));
        assert!(text.contains("tag"));
    }

    #[test]
    fn test_extract_plain_text_with_frontmatter() {
        let content = "---\ntitle: Test\n---\n\nReal content.";
        let text = extract_plain_text(content);
        assert_eq!(text, "Real content.");
    }

    #[test]
    fn test_chunk_text_multiple_paragraphs() {
        let content = (0..20).map(|i| format!("Paragraph {}.", i)).collect::<Vec<_>>().join("\n\n");
        let chunks = chunk_text(&content, 100);
        assert!(!chunks.is_empty());
        for chunk in &chunks {
            assert!(chunk.len() <= 105, "chunk {} is too long: {}", chunk.len(), chunk);
        }
    }
}