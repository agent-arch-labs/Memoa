use crate::error::AppResult;

pub fn create_table() -> AppResult<()> {
    super::with_conn(|conn| {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                checksum TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                word_count INTEGER DEFAULT 0,
                frontmatter_json TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
            CREATE INDEX IF NOT EXISTS idx_notes_path ON notes(path);
            CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);

            DELETE FROM notes WHERE rowid NOT IN (
                SELECT MIN(rowid) FROM notes GROUP BY path
            );",
        )?;
        Ok(())
    })
}

pub fn upsert_by_path(path: &str, content: &str, checksum: &str) -> AppResult<String> {
    super::with_conn(|conn| {
        let title = std::path::Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled");

        let word_count = content.split_whitespace().count() as u32;

        let extract_result = crate::indexer::markdown::extract_frontmatter_and_links(content);

        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM notes WHERE path = ?1",
                [path],
                |row| row.get(0),
            )
            .ok();

        let id = existing.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        conn.execute(
            "INSERT INTO notes (id, title, path, checksum, word_count, frontmatter_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
             ON CONFLICT(path) DO UPDATE SET
                title = excluded.title,
                checksum = excluded.checksum,
                word_count = excluded.word_count,
                frontmatter_json = excluded.frontmatter_json,
                updated_at = datetime('now')",
            rusqlite::params![id, title, path, checksum, word_count, extract_result.frontmatter_json],
        )?;

        Ok(id)
    })
}

pub fn delete_by_path(path: &str) -> AppResult<()> {
    super::with_conn(|conn| {
        conn.execute("DELETE FROM notes WHERE path = ?1", [path])?;
        Ok(())
    })
}

pub fn update_path(old_path: &str, new_path: &str) -> AppResult<()> {
    super::with_conn(|conn| {
        let title = std::path::Path::new(new_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled");

        conn.execute(
            "UPDATE notes SET path = ?1, title = ?2 WHERE path = ?3",
            rusqlite::params![new_path, title, old_path],
        )?;
        Ok(())
    })
}

pub fn search_by_title(query: &str) -> AppResult<Vec<(String, String, String, String)>> {
    super::with_conn(|conn| {
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT id, title, path, updated_at FROM notes
             WHERE title LIKE ?1
             ORDER BY updated_at DESC
             LIMIT 20",
        )?;
        let rows = stmt.query_map([pattern], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn setup_db() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        crate::db::init(&db_path).unwrap();
        let _ = create_table();
        (dir, db_path)
    }

    fn insert_note(path: &str, content: &str) -> String {
        upsert_by_path(path, content, "test_checksum").unwrap()
    }

    #[test]
    fn test_find_by_path_flexible_with_md() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_dir, _db) = setup_db();
        insert_note("notes/mynote.md", "# Hello");
        let result = find_by_path_flexible("notes/mynote.md").unwrap();
        assert!(result.is_some(), "精确路径应查找到笔记");
    }

    #[test]
    fn test_find_by_path_flexible_without_md() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_dir, _db) = setup_db();
        insert_note("notes/mynote.md", "# Hello");
        let result = find_by_path_flexible("notes/mynote").unwrap();
        assert!(result.is_some(), "无 .md 后缀的路径应查找到笔记");
        assert_eq!(result.unwrap().2, "notes/mynote.md");
    }

    #[test]
    fn test_find_by_path_flexible_not_found() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_dir, _db) = setup_db();
        insert_note("notes/mynote.md", "# Hello");
        let result = find_by_path_flexible("notes/nonexistent").unwrap();
        assert!(result.is_none(), "不存在的路径应返回 None");
    }

    #[test]
    fn test_find_by_path_flexible_non_md_file() {
        let _lock = crate::db::TEST_DB_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (_dir, _db) = setup_db();
        insert_note("config.toml", "# config");
        let result = find_by_path_flexible("config.toml").unwrap();
        assert!(result.is_some(), "非 .md 文件的精确路径应查找到笔记");
        let result2 = find_by_path_flexible("config").unwrap();
        assert!(result2.is_none(), "非 .md 文件不自动追加扩展名");
    }
}

pub fn list_all() -> AppResult<Vec<(String, String, String)>> {
    super::with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, title, path FROM notes ORDER BY title",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    })
}

pub fn count_all() -> AppResult<u64> {
    super::with_conn(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM notes",
            [],
            |row| row.get(0),
        )?;
        Ok(count as u64)
    })
}

pub fn find_by_title(title: &str) -> AppResult<Option<(String, String, String, String)>> {
    super::with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, title, path, updated_at FROM notes WHERE title = ?1 LIMIT 1",
        )?;
        let mut rows = stmt.query_map([title], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        match rows.next() {
            Some(Ok(row)) => Ok(Some(row)),
            Some(Err(e)) => Err(e.into()),
            None => Ok(None),
        }
    })
}

pub fn find_by_path_prefix(prefix: &str) -> AppResult<Option<(String, String, String, String)>> {
    super::with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, title, path, updated_at FROM notes WHERE path = ?1 LIMIT 1",
        )?;
        let mut rows = stmt.query_map(rusqlite::params![prefix], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        match rows.next() {
            Some(Ok(row)) => Ok(Some(row)),
            Some(Err(e)) => Err(e.into()),
            None => Ok(None),
        }
    })
}

pub fn find_by_path_flexible(query: &str) -> AppResult<Option<(String, String, String, String)>> {
    if let Some(note) = find_by_path_prefix(query)? {
        return Ok(Some(note));
    }
    if !query.ends_with(".md") {
        return find_by_path_prefix(&format!("{}.md", query));
    }
    Ok(None)
}

pub fn list_recent(limit: u32) -> AppResult<Vec<(String, String, String, String)>> {
    super::with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, title, path, updated_at FROM notes ORDER BY updated_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    })
}