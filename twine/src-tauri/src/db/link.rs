// 双向链接表 CRUD
//
// links 表存储 [[wikilink]] 双向链接关系:
//   source_id      - 包含链接的笔记 ID (外键 → notes.id)
//   target_id      - 链接目标笔记的 ID (如果目标笔记已被索引)
//   target_title   - 链接目标的 [[显示标题]]
//   target_alias   - 链接别名 ([[target|alias]])
//   context        - 链接前后的上下文文本片段
//   line           - 链接所在行号
//
// 使用场景:
//   - 知识图谱可视化 (笔记间连线)
//   - 反向链接面板 (哪些笔记引用了当前笔记)
//   - 孤儿链接检测 (链接的目标笔记不存在)
//   - 笔记重命名时自动更新链接引用

use crate::error::AppResult;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct BacklinkEntry {
    pub id: String,
    pub source_title: String,
    pub source_path: String,
    pub context: String,
    pub line: u32,
}

pub fn create_table() -> AppResult<()> {
    super::with_conn(|conn| {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS links (
                id TEXT PRIMARY KEY,
                source_id TEXT NOT NULL,
                target_id TEXT,
                target_title TEXT NOT NULL,
                target_alias TEXT,
                context TEXT,
                line INTEGER DEFAULT 0,
                FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
            CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);
            CREATE INDEX IF NOT EXISTS idx_links_target_title ON links(target_title);",
        )?;
        Ok(())
    })
}

pub fn upsert_links(note_id: &str, links: &[ParsedLink]) -> AppResult<()> {
    super::with_conn(|conn| {
        conn.execute("DELETE FROM links WHERE source_id = ?1", [note_id])?;

        for link in links {
            let link_id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO links (id, source_id, target_id, target_title, target_alias, context, line)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    link_id,
                    note_id,
                    link.target_id,
                    link.target_title,
                    link.target_alias,
                    link.context,
                    link.line,
                ],
            )?;
        }
        Ok(())
    })
}

pub fn find_backlinks(target_title: &str) -> AppResult<Vec<BacklinkEntry>> {
    super::with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT l.id, n.title, n.path, l.context, l.line
             FROM links l
             JOIN notes n ON l.source_id = n.id
             WHERE l.target_title = ?1 OR l.target_alias = ?1
             ORDER BY n.updated_at DESC",
        )?;
        let rows = stmt.query_map([target_title], |row| {
            Ok(BacklinkEntry {
                id: row.get(0)?,
                source_title: row.get(1)?,
                source_path: row.get(2)?,
                context: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                line: row.get::<_, i32>(4)? as u32,
            })
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    })
}

pub fn find_orphan_links() -> AppResult<Vec<(String, String, String)>> {
    super::with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT l.source_id, n.title, l.target_title
             FROM links l
             JOIN notes n ON l.source_id = n.id
             WHERE l.target_id IS NULL",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    })
}

#[derive(Debug, Serialize)]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    pub path: String,
    pub link_count: u32,
    pub incoming_count: u32,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Serialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

fn add_graph_edge(
    total_counts: &mut std::collections::HashMap<String, u32>,
    incoming_counts: &mut std::collections::HashMap<String, u32>,
    edges: &mut Vec<GraphEdge>,
    edge_set: &mut std::collections::HashSet<(String, String)>,
    source_id: &str,
    target_id: &str,
) {
    *total_counts.entry(source_id.to_string()).or_insert(0) += 1;
    *total_counts.entry(target_id.to_string()).or_insert(0) += 1;
    *incoming_counts.entry(target_id.to_string()).or_insert(0) += 1;
    total_counts.entry(source_id.to_string()).or_insert(0);
    incoming_counts.entry(source_id.to_string()).or_insert(0);
    let edge_key = (
        source_id.to_string().min(target_id.to_string()),
        source_id.to_string().max(target_id.to_string()),
    );
    if edge_set.insert(edge_key) {
        edges.push(GraphEdge {
            source: source_id.to_string(),
            target: target_id.to_string(),
        });
    }
}

fn get_note_tags(note_id: &str, conn: &rusqlite::Connection) -> Vec<String> {
    let mut stmt = match conn.prepare(
        "SELECT t.name FROM tags t
         INNER JOIN note_tags nt ON t.id = nt.tag_id
         WHERE nt.note_id = ?1
         ORDER BY t.name",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = stmt.query_map([note_id], |row| row.get::<_, String>(0));
    match rows {
        Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    }
}

fn get_all_note_tags_batch(conn: &rusqlite::Connection) -> std::collections::HashMap<String, Vec<String>> {
    let mut map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    let mut stmt = match conn.prepare(
        "SELECT nt.note_id, t.name FROM note_tags nt
         INNER JOIN tags t ON nt.tag_id = t.id
         ORDER BY t.name",
    ) {
        Ok(s) => s,
        Err(_) => return map,
    };
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    });
    if let Ok(iter) = rows {
        for row in iter.flatten() {
            map.entry(row.0).or_default().push(row.1);
        }
    }
    map
}

fn extract_aliases_from_frontmatter(frontmatter_json: &str) -> Vec<String> {
    let value: serde_json::Value =
        serde_yaml::from_str(frontmatter_json).ok().unwrap_or(serde_json::Value::Null);
    let mut aliases = Vec::new();
    if let Some(arr) = value.get("aliases").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(s) = item.as_str() {
                let trimmed = s.trim().to_string();
                if !trimmed.is_empty() {
                    aliases.push(trimmed);
                }
            }
        }
    }
    aliases
}

fn get_all_note_aliases_batch(conn: &rusqlite::Connection) -> std::collections::HashMap<String, Vec<String>> {
    let mut map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    let mut stmt = match conn.prepare(
        "SELECT id, frontmatter_json FROM notes WHERE frontmatter_json IS NOT NULL",
    ) {
        Ok(s) => s,
        Err(_) => return map,
    };
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    });
    if let Ok(iter) = rows {
        for row in iter.flatten() {
            let aliases = extract_aliases_from_frontmatter(&row.1);
            if !aliases.is_empty() {
                map.insert(row.0, aliases);
            }
        }
    }
    map
}

pub fn get_graph_data() -> AppResult<GraphData> {
    let all_notes = super::note::list_all()?;

    let mut node_id_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut title_to_id: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut path_to_id: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    for (id, title, path) in &all_notes {
        title_to_id.entry(title.clone()).or_insert_with(|| id.clone());
        path_to_id.entry(path.clone()).or_insert_with(|| id.clone());
        if path.ends_with(".md") {
            let path_no_ext = &path[..path.len() - 3];
            path_to_id.entry(path_no_ext.to_string()).or_insert_with(|| id.clone());
        }
    }

    let mut total_counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    let mut incoming_counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    let mut edges: Vec<GraphEdge> = Vec::new();
    let mut edge_set: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
    let mut alias_to_id: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    let (tag_map, _alias_map) = super::with_conn(|conn| {
        let aliases = get_all_note_aliases_batch(conn);
        for (note_id, note_aliases) in &aliases {
            for alias in note_aliases {
                alias_to_id.entry(alias.clone()).or_insert_with(|| note_id.clone());
            }
        }

        let mut stmt = conn.prepare(
            "SELECT l.source_id, l.target_title
             FROM links l",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
            ))
        })?;

        for row in rows {
            let (source_id, target_title) = row?;

            let resolved = title_to_id.get(&target_title)
                .or_else(|| alias_to_id.get(&target_title))
                .or_else(|| path_to_id.get(&target_title))
                .or_else(|| {
                    let file_stem = std::path::Path::new(&target_title)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("");
                    if !file_stem.is_empty() {
                        title_to_id.get(file_stem)
                    } else {
                        None
                    }
                });

            if let Some(target_id) = resolved.cloned() {
                add_graph_edge(&mut total_counts, &mut incoming_counts, &mut edges, &mut edge_set, &source_id, &target_id);
            }
        }

        let tags = get_all_note_tags_batch(conn);
        Ok::<_, crate::error::AppError>((tags, aliases))
    })?;

    let mut nodes: Vec<GraphNode> = Vec::new();
    for (id, title, path) in &all_notes {
        if !node_id_set.insert(id.clone()) {
            continue;
        }
        let tags = tag_map.get(id).cloned().unwrap_or_default();
        nodes.push(GraphNode {
            id: id.clone(),
            title: title.clone(),
            path: path.clone(),
            link_count: *total_counts.get(id).unwrap_or(&0),
            incoming_count: *incoming_counts.get(id).unwrap_or(&0),
            tags,
        });
    }

    edges.retain(|e| {
        node_id_set.contains(&e.source) && node_id_set.contains(&e.target)
    });

    Ok(GraphData { nodes, edges })
}

pub fn get_local_graph(note_id: &str, depth: u32) -> AppResult<GraphData> {
    let full_graph = get_graph_data()?;
    if depth == 0 || full_graph.nodes.is_empty() {
        return Ok(full_graph);
    }

    let node_map: std::collections::HashMap<String, &GraphNode> = full_graph
        .nodes
        .iter()
        .map(|n| (n.id.clone(), n))
        .collect();

    let mut visited: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut current_layer: std::collections::HashSet<String> = std::collections::HashSet::new();
    current_layer.insert(note_id.to_string());
    visited.insert(note_id.to_string());

    for _ in 0..depth {
        let mut next_layer: std::collections::HashSet<String> = std::collections::HashSet::new();
        for edge in &full_graph.edges {
            if current_layer.contains(&edge.source) && !visited.contains(&edge.target) {
                next_layer.insert(edge.target.clone());
                visited.insert(edge.target.clone());
            }
            if current_layer.contains(&edge.target) && !visited.contains(&edge.source) {
                next_layer.insert(edge.source.clone());
                visited.insert(edge.source.clone());
            }
        }
        current_layer = next_layer;
    }

    let nodes: Vec<GraphNode> = full_graph
        .nodes
        .into_iter()
        .filter(|n| visited.contains(&n.id))
        .collect();

    let edges: Vec<GraphEdge> = full_graph
        .edges
        .into_iter()
        .filter(|e| visited.contains(&e.source) && visited.contains(&e.target))
        .collect();

    Ok(GraphData { nodes, edges })
}

pub fn cleanup_orphan_links() -> AppResult<usize> {
    super::with_conn(|conn| {
        let deleted = conn.execute(
            "DELETE FROM links WHERE source_id NOT IN (SELECT id FROM notes)",
            [],
        )?;
        Ok(deleted)
    })
}

#[derive(Debug)]
pub struct ParsedLink {
    pub target_id: Option<String>,
    pub target_title: String,
    pub target_alias: Option<String>,
    pub context: Option<String>,
    pub line: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn setup_test_db() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        crate::db::init(&db_path).unwrap();

        crate::db::note::create_table().unwrap();
        crate::db::link::create_table().unwrap();
        crate::db::tag::create_table().unwrap();

        (dir, db_path)
    }

    fn register_note(path: &str, title: &str, content: &str) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        let checksum: String = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect();
        crate::db::note::upsert_by_path(path, content, &checksum).unwrap()
    }

    #[test]
    fn test_link_add_and_remove_sync_to_graph_data() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let note_a_id = register_note(
            "/vault/note-a.md",
            "note-a",
            "# Note A\nContent with [[note-b]] link.",
        );
        let _note_b_id = register_note(
            "/vault/note-b.md",
            "note-b",
            "# Note B\nSome content here.",
        );

        let content_with_link = "# Note A\nContent with [[note-b]] link.";
        let extract = crate::indexer::markdown::extract_frontmatter_and_links(content_with_link);
        let links: Vec<ParsedLink> = extract
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        assert_eq!(links.len(), 1, "应该提取出 1 个链接");
        assert_eq!(links[0].target_title, "note-b");

        upsert_links(&note_a_id, &links).unwrap();

        let graph = get_graph_data().unwrap();
        assert_eq!(graph.nodes.len(), 2, "图谱应有 2 个节点");
        assert_eq!(graph.edges.len(), 1, "添加链接后应有 1 条边");
        assert_eq!(graph.edges[0].source, note_a_id);
        assert_eq!(graph.edges[0].target, _note_b_id);

        // 3. 删除链接 (模拟用户从文档中删除 [[note-b]])
        let content_without_link = "# Note A\nContent without any link.";
        let extract2 = crate::indexer::markdown::extract_frontmatter_and_links(content_without_link);
        let links2: Vec<ParsedLink> = extract2
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        assert!(links2.is_empty(), "删除后不应有链接");

        upsert_links(&note_a_id, &links2).unwrap();

        let graph2 = get_graph_data().unwrap();
        assert_eq!(graph2.nodes.len(), 2, "图谱仍有 2 个节点");
        assert!(
            graph2.edges.is_empty(),
            "删除链接后边应该为空，实际有 {} 条边",
            graph2.edges.len()
        );
    }

    #[test]
    fn test_link_change_updates_graph_correctly() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let note_a_id = register_note("/vault/A.md", "", "# A");
        let note_b_id = register_note("/vault/B.md", "", "# B");
        let note_c_id = register_note("/vault/C.md", "", "# C");

        let content_ab = "# A\n[[B]] link to B.";
        let extract = crate::indexer::markdown::extract_frontmatter_and_links(content_ab);
        let links: Vec<ParsedLink> = extract
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        upsert_links(&note_a_id, &links).unwrap();

        let graph = get_graph_data().unwrap();
        assert_eq!(graph.edges.len(), 1);
        let edge_ab = &graph.edges[0];
        let has_edge_ab = (edge_ab.source == note_a_id && edge_ab.target == note_b_id)
            || (edge_ab.source == note_b_id && edge_ab.target == note_a_id);
        assert!(has_edge_ab, "应该有 A-B 边");

        let content_ac = "# A\n[[C]] link to C.";
        let extract2 = crate::indexer::markdown::extract_frontmatter_and_links(content_ac);
        let links2: Vec<ParsedLink> = extract2
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        upsert_links(&note_a_id, &links2).unwrap();

        let graph2 = get_graph_data().unwrap();
        assert_eq!(
            graph2.edges.len(),
            1,
            "修改链接后应有 1 条边（A->C），不应保留旧的 A->B"
        );
        let edge_ac = &graph2.edges[0];
        let has_edge_ac = (edge_ac.source == note_a_id && edge_ac.target == note_c_id)
            || (edge_ac.source == note_c_id && edge_ac.target == note_a_id);
        assert!(has_edge_ac, "应该有 A-C 边");
        let has_edge_ab_stale = graph2.edges.iter().any(|e| {
            (e.source == note_a_id && e.target == note_b_id)
                || (e.source == note_b_id && e.target == note_a_id)
        });
        assert!(!has_edge_ab_stale, "不应该保留旧边 A-B");
    }

    #[test]
    fn test_multiple_links_add_and_remove() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let note_a_id = register_note("/vault/A.md", "", "# A");
        let note_b_id = register_note("/vault/B.md", "", "# B");
        let note_c_id = register_note("/vault/C.md", "", "# C");

        let content = "# A\n[[B]] and [[C]] links.";
        let extract = crate::indexer::markdown::extract_frontmatter_and_links(content);
        let links: Vec<ParsedLink> = extract
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        assert_eq!(links.len(), 2);
        upsert_links(&note_a_id, &links).unwrap();

        let graph = get_graph_data().unwrap();
        assert_eq!(graph.edges.len(), 2, "应该有 2 条边（A-B 和 A-C）");

        let content_one = "# A\n[[B]] only.";
        let extract2 = crate::indexer::markdown::extract_frontmatter_and_links(content_one);
        let links2: Vec<ParsedLink> = extract2
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        assert_eq!(links2.len(), 1);
        upsert_links(&note_a_id, &links2).unwrap();

        let graph2 = get_graph_data().unwrap();
        assert_eq!(graph2.edges.len(), 1, "删除一个链接后应有 1 条边");
        let has_b = graph2.edges.iter().any(|e| {
            (e.source == note_a_id && e.target == note_b_id)
                || (e.source == note_b_id && e.target == note_a_id)
        });
        assert!(has_b, "应保留 A-B 边");
        let has_c = graph2.edges.iter().any(|e| {
            (e.source == note_a_id && e.target == note_c_id)
                || (e.source == note_c_id && e.target == note_a_id)
        });
        assert!(!has_c, "不应保留 A-C 边");

        let content_none = "# A\nNo links.";
        let extract3 = crate::indexer::markdown::extract_frontmatter_and_links(content_none);
        let links3: Vec<ParsedLink> = extract3
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        assert!(links3.is_empty());
        upsert_links(&note_a_id, &links3).unwrap();

        let graph3 = get_graph_data().unwrap();
        assert!(graph3.edges.is_empty(), "删除所有链接后边应为空");
    }

    #[test]
    fn test_no_duplicate_edges_in_graph_data() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let note_a_id = register_note("/vault/A.md", "", "# A");
        let _note_b_id = register_note("/vault/B.md", "", "# B");

        let content = "# A\n[[B]] mentioned twice\n[[B]] again.";
        let extract = crate::indexer::markdown::extract_frontmatter_and_links(content);
        let links: Vec<ParsedLink> = extract
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        assert_eq!(links.len(), 2, "同文件内两次引用同一文件应产生 2 条 raw link");
        upsert_links(&note_a_id, &links).unwrap();

        let graph = get_graph_data().unwrap();
        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.edges.len(), 1, "两个相同链接在谱图应去重为 1 条边");

        let backlinks = find_backlinks("B").unwrap();
        assert_eq!(backlinks.len(), 2, "反向链接应保留 2 条（保留上下文）");
    }

    #[test]
    fn test_cleanup_orphan_links() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let note_a_id = register_note("/vault/A.md", "", "# A\n[[B]]");
        let _note_b_id = register_note("/vault/B.md", "", "# B");

        let content = "# A\n[[B]]";
        let extract = crate::indexer::markdown::extract_frontmatter_and_links(content);
        let links: Vec<ParsedLink> = extract
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        upsert_links(&note_a_id, &links).unwrap();

        let graph_before = get_graph_data().unwrap();
        assert!(graph_before.edges.iter().any(|e| {
            e.source == note_a_id || e.target == note_a_id
        }), "删除前应有 A 的边");

        crate::db::note::delete_by_path("/vault/A.md").unwrap();

        let graph_after = get_graph_data().unwrap();
        let has_a = graph_after.edges.iter().any(|e| {
            e.source == note_a_id || e.target == note_a_id
        });
        assert!(!has_a, "CASCADE 删除笔记后图谱不应有其边");
    }

    #[test]
    fn test_empty_links_after_delete_all_references() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let note_a_id = register_note("/vault/A.md", "", "# A");
        let _note_b_id = register_note("/vault/B.md", "", "# B");
        let _note_c_id = register_note("/vault/C.md", "", "# C");

        let content = "# A\n[[B]]\n[[C]]";
        let extract = crate::indexer::markdown::extract_frontmatter_and_links(content);
        let links: Vec<ParsedLink> = extract
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        upsert_links(&note_a_id, &links).unwrap();

        let graph1 = get_graph_data().unwrap();
        assert_eq!(graph1.edges.len(), 2);

        upsert_links(&note_a_id, &[]).unwrap();

        let graph2 = get_graph_data().unwrap();
        assert!(
            graph2.edges.is_empty(),
            "传入空数组后边应为空，实际有 {} 条",
            graph2.edges.len()
        );

        let backlinks_b = find_backlinks("B").unwrap();
        assert!(backlinks_b.is_empty(), "反向链接 B 也应为空");
        let backlinks_c = find_backlinks("C").unwrap();
        assert!(backlinks_c.is_empty(), "反向链接 C 也应为空");
    }

    #[test]
    fn test_full_write_file_flow_add_then_remove_link() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let note_a_path = "/vault/A.md";
        let note_b_path = "/vault/B.md";

        let _note_b_id = register_note(note_b_path, "", "# B\nContent for B.");

        let content_v1 = "# A\nInitial content.";
        let extract1 = crate::indexer::markdown::extract_frontmatter_and_links(content_v1);
        let note_a_id =
            crate::db::note::upsert_by_path(note_a_path, content_v1, "checksum_v1").unwrap();
        let links1: Vec<ParsedLink> = extract1
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        upsert_links(&note_a_id, &links1).unwrap();

        let graph1 = get_graph_data().unwrap();
        assert!(graph1.edges.is_empty(), "保存 v1: 没有链接，不应有边");

        let content_v2 = "# A\n[[B]] added a link.";
        let extract2 = crate::indexer::markdown::extract_frontmatter_and_links(content_v2);
        crate::db::note::upsert_by_path(note_a_path, content_v2, "checksum_v2").unwrap();
        let links2: Vec<ParsedLink> = extract2
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        upsert_links(&note_a_id, &links2).unwrap();

        let graph2 = get_graph_data().unwrap();
        assert_eq!(graph2.edges.len(), 1, "保存 v2: 添加 [[B]] 后应有 1 条边");

        let content_v3 = "# A\n[[B]] added a link.\n[[B]] double mention.";
        let extract3 = crate::indexer::markdown::extract_frontmatter_and_links(content_v3);
        crate::db::note::upsert_by_path(note_a_path, content_v3, "checksum_v3").unwrap();
        let links3: Vec<ParsedLink> = extract3
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        upsert_links(&note_a_id, &links3).unwrap();

        let graph3 = get_graph_data().unwrap();
        assert_eq!(
            graph3.edges.len(),
            1,
            "保存 v3: 重复提及 [[B]] 两次，应有 1 条边"
        );

        let content_v4 = "# A\nRemoved the link back.";
        let extract4 = crate::indexer::markdown::extract_frontmatter_and_links(content_v4);
        crate::db::note::upsert_by_path(note_a_path, content_v4, "checksum_v4").unwrap();
        let links4: Vec<ParsedLink> = extract4
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        upsert_links(&note_a_id, &links4).unwrap();

        let graph4 = get_graph_data().unwrap();
        assert!(
            graph4.edges.is_empty(),
            "保存 v4: 删除引用后边应为空（模拟 write_file 完整流程），实际有 {} 条",
            graph4.edges.len()
        );
    }

    #[test]
    fn test_path_based_wiki_link_resolution() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let _subdir_a = register_note("subdir/A.md", "", "# A\nSubdir note.");
        let note_root = register_note("root.md", "", "# Root\nLink [[subdir/A]].");

        let content = "# Root\nLink [[subdir/A]].";
        let extract = crate::indexer::markdown::extract_frontmatter_and_links(content);
        let links: Vec<ParsedLink> = extract
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        assert_eq!(links.len(), 1, "应提取出路径格式的链接");
        assert_eq!(links[0].target_title, "subdir/A");

        upsert_links(&note_root, &links).unwrap();

        let graph = get_graph_data().unwrap();
        assert_eq!(graph.edges.len(), 1, "路径格式链接应在图谱中解析为 1 条边");
    }

    #[test]
    fn test_path_based_link_with_md_extension() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let _subdir_a = register_note("subdir/A.md", "", "# A");
        let note_root = register_note("root.md", "", "# Root\nLink [[subdir/A.md]].");

        let content = "# Root\nLink [[subdir/A.md]].";
        let extract = crate::indexer::markdown::extract_frontmatter_and_links(content);
        let links: Vec<ParsedLink> = extract
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        assert_eq!(links[0].target_title, "subdir/A.md");

        upsert_links(&note_root, &links).unwrap();

        let graph = get_graph_data().unwrap();
        assert_eq!(graph.edges.len(), 1, "带 .md 扩展名的路径链接也应在图谱中解析");
    }

    #[test]
    fn test_same_title_different_folders_path_resolution() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let note_a = register_note("folder1/Note.md", "Note", "# Note in folder1.");
        let note_b = register_note("folder2/Note.md", "Note", "# Note in folder2.");
        let note_root = register_note("root.md", "", "# Root\n[[folder1/Note]]\n[[folder2/Note]]");

        let content = "# Root\n[[folder1/Note]]\n[[folder2/Note]]";
        let extract = crate::indexer::markdown::extract_frontmatter_and_links(content);
        let links: Vec<ParsedLink> = extract
            .links
            .into_iter()
            .map(|l| ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        assert_eq!(links.len(), 2);
        upsert_links(&note_root, &links).unwrap();

        let graph = get_graph_data().unwrap();
        assert_eq!(graph.edges.len(), 2, "同标题不同路径的两个链接都应正确解析");
        let has_folder1 = graph.edges.iter().any(|e| {
            (e.source == note_root && e.target == note_a)
                || (e.source == note_a && e.target == note_root)
        });
        let has_folder2 = graph.edges.iter().any(|e| {
            (e.source == note_root && e.target == note_b)
                || (e.source == note_b && e.target == note_root)
        });
        assert!(has_folder1, "应链接到 folder1/Note");
        assert!(has_folder2, "应链接到 folder2/Note");
    }

    #[test]
    fn test_node_add_and_remove_sync_to_graph() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let graph0 = get_graph_data().unwrap();
        assert!(graph0.nodes.is_empty(), "初始图谱应为空");

        let note_a = register_note("A.md", "Note A", "# Note A\nContent.");
        let _note_b = register_note("B.md", "Note B", "# Note B\nContent.");

        let graph1 = get_graph_data().unwrap();
        assert_eq!(graph1.nodes.len(), 2, "添加两个笔记后应有 2 个节点");
        let node_ids: Vec<String> = graph1.nodes.iter().map(|n| n.id.clone()).collect();
        assert!(node_ids.contains(&note_a), "应有 note_a 节点");

        crate::db::note::delete_by_path("A.md").unwrap();

        let graph2 = get_graph_data().unwrap();
        assert_eq!(graph2.nodes.len(), 1, "删除一个笔记后应有 1 个节点");
        assert!(!graph2.nodes.iter().any(|n| n.id == note_a), "不应有已删除的节点");
    }

    #[test]
    fn test_node_title_update_sync_to_graph() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        register_note("X.md", "Old Title", "# Old Title\nContent.");

        let graph1 = get_graph_data().unwrap();
        assert_eq!(graph1.nodes[0].title, "X", "标题来自 file_stem");

        let new_content = "# New Title\nUpdated content.";
        let checksum = "new_checksum";
        crate::db::note::upsert_by_path("X.md", new_content, checksum).unwrap();

        let graph2 = get_graph_data().unwrap();
        assert_eq!(graph2.nodes.len(), 1, "更新后仍应有 1 个节点");
        assert_eq!(graph2.nodes[0].title, "X", "file_stem 不变，标题不变");
    }

    #[test]
    fn test_node_path_update_sync_to_graph() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_guard, _db_path) = setup_test_db();

        let note_id = register_note("old-path.md", "Old", "# Old\nContent.");

        crate::db::note::update_path("old-path.md", "new-path.md").unwrap();

        let graph = get_graph_data().unwrap();
        let node = graph.nodes.iter().find(|n| n.id == note_id).unwrap();
        assert_eq!(node.path, "new-path.md", "路径更新后图谱节点应反映新路径");
    }
}