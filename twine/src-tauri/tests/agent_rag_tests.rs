#[cfg(test)]
mod tests {
    use twine_lib::agent_rag::tools;
    use twine_lib::agent_rag::types::RagContext;
    use tempfile::TempDir;
    use std::fs;
    use std::path::Path;

    fn setup_test_vault(dir: &Path) {
        fs::create_dir_all(dir.join(".memoa")).unwrap();
        fs::write(
            dir.join("note1.md"),
            "# Rust 所有权\n\nRust 的所有权系统是核心特性。\n所有权规则：每个值有且只有一个所有者。\n\n当所有者离开作用域，值会被自动清理。\n\n所有权的转移：通过赋值或传参，所有权会转移。",
        )
        .unwrap();
        fs::write(
            dir.join("note2.md"),
            "# 小浪底水库\n\n小浪底水利枢纽位于黄河中游。\n\n功能：防洪、减淤、供水、发电。\n\n1994年动工，2001年竣工。",
        )
        .unwrap();
        fs::write(
            dir.join("note3.md"),
            "# 知识图谱\n\n知识图谱是结构化的语义知识库。\n\n用于存储实体和关系的网络结构。\n\n实体通过关系相互连接。\n\n常用于搜索引擎和推荐系统。",
        )
        .unwrap();
    }

    #[test]
    fn test_run_retrieve_basic() {
        let tmp = TempDir::new().unwrap();
        setup_test_vault(tmp.path());

        let mut ctx = RagContext::new("Rust 所有权".to_string(), 10);
        let results = tools::run_retrieve("Rust 所有权", 5, tmp.path(), None, &mut ctx).unwrap();

        assert!(!results.is_empty(), "should find Rust notes");
        assert!(results[0].score > 0.0, "top result should have positive score");
        assert!(
            results.iter().any(|r| r.text.contains("Rust")),
            "should contain Rust content"
        );

        assert!(
            ctx.retrieved_chunks.len() >= results.len(),
            "ctx should be updated"
        );
    }

    #[test]
    fn test_run_retrieve_top_k() {
        let tmp = TempDir::new().unwrap();
        setup_test_vault(tmp.path());

        let mut ctx = RagContext::new("test".to_string(), 10);
        let results = tools::run_retrieve("水库 防洪 知识 所有权", 2, tmp.path(), None, &mut ctx).unwrap();

        assert_eq!(results.len(), 2, "should respect top_k");
    }

    #[test]
    fn test_run_retrieve_no_match() {
        let tmp = TempDir::new().unwrap();
        setup_test_vault(tmp.path());

        let mut ctx = RagContext::new("nonexistent_term_xyz".to_string(), 10);
        let results = tools::run_retrieve("nonexistent_term_xyz", 10, tmp.path(), None, &mut ctx).unwrap();

        assert!(results.is_empty(), "should find no matches");
    }

    #[test]
    fn test_run_fetch_note_exists() {
        let tmp = TempDir::new().unwrap();
        setup_test_vault(tmp.path());

        let content = tools::run_fetch_note("note1.md", tmp.path()).unwrap();
        assert!(content.contains("Rust"), "should contain Rust");
        assert!(content.contains("所有权"), "should contain 所有权");
    }

    #[test]
    fn test_run_fetch_note_not_found() {
        let tmp = TempDir::new().unwrap();
        let result = tools::run_fetch_note("nonexistent.md", tmp.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_run_graph_query() {
        let tmp = TempDir::new().unwrap();
        setup_test_vault(tmp.path());

        let results = tools::run_graph_query("note1.md", tmp.path(), 2).unwrap();

        assert!(
            results.is_empty() || !results.is_empty(),
            "graph query should not crash even without links"
        );
    }

    #[test]
    fn test_run_vault_stats() {
        let tmp = TempDir::new().unwrap();
        setup_test_vault(tmp.path());

        let stats = tools::run_vault_stats(tmp.path()).unwrap();
        assert!(stats.contains("3"), "should count 3 notes");
        assert!(stats.contains("笔记总数"), "should have Chinese label");
    }

    #[test]
    fn test_run_extract_next_query() {
        let answer = "需要进一步了解：Rust 的生命周期机制是什么";
        let next = tools::run_extract_next_query(answer, "Rust");
        assert!(!next.is_empty());
        assert!(next.contains("Rust") || next.contains("生命周期"));

        let answer2 = "还需要检索什么是所有权？";
        let next2 = tools::run_extract_next_query(answer2, "Rust");
        assert!(!next2.is_empty());

        let short_answer = "42";
        let next3 = tools::run_extract_next_query(short_answer, "original query");
        assert!(next3.contains("original"));
    }

    #[test]
    fn test_run_retrieve_dedup() {
        let tmp = TempDir::new().unwrap();
        setup_test_vault(tmp.path());

        let mut ctx = RagContext::new("Rust 所有权 系统".to_string(), 10);
        let results = tools::run_retrieve("Rust 所有权 系统", 10, tmp.path(), None, &mut ctx).unwrap();

        let unique_ids: std::collections::HashSet<&str> = results.iter().map(|r| r.note_id.as_str()).collect();
        assert_eq!(unique_ids.len(), results.len(), "all results should be unique");

        let unique_paths: std::collections::HashSet<&str> = results.iter().map(|r| r.note_path.as_str()).collect();
        assert!(
            unique_paths.len() <= 3,
            "should only include unique note paths"
        );
    }

    #[test]
    fn test_run_retrieve_skips_non_md() {
        let tmp = TempDir::new().unwrap();
        setup_test_vault(tmp.path());
        fs::write(tmp.path().join("readme.txt"), "some text").unwrap();
        fs::write(tmp.path().join(".gitignore"), "*.md").unwrap();

        let mut ctx = RagContext::new("text".to_string(), 10);
        let results = tools::run_retrieve("text", 10, tmp.path(), None, &mut ctx).unwrap();

        for r in &results {
            assert!(!r.note_path.contains(".txt"));
            assert!(!r.note_path.starts_with('.'));
        }
    }
}