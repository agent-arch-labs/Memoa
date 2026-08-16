use crate::error::AppResult;
use std::collections::HashSet;

pub fn create_table() -> AppResult<()> {
    super::with_conn(|conn| {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                color TEXT
            );

            CREATE TABLE IF NOT EXISTS note_tags (
                note_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                PRIMARY KEY (note_id, tag_id),
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );",
        )?;
        Ok(())
    })
}

pub fn cleanup_orphans() -> AppResult<()> {
    super::with_conn(|conn| {
        conn.execute(
            "DELETE FROM note_tags WHERE rowid NOT IN (
                SELECT MIN(rowid) FROM note_tags GROUP BY note_id, tag_id
            )",
            [],
        )?;
        conn.execute(
            "DELETE FROM note_tags WHERE note_id NOT IN (SELECT id FROM notes)",
            [],
        )?;
        conn.execute(
            "DELETE FROM notes WHERE rowid NOT IN (
                SELECT MIN(rowid) FROM notes GROUP BY path
            )",
            [],
        )?;
        conn.execute(
            "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)",
            [],
        )?;
        Ok(())
    })
}

pub fn upsert_note_tags(note_id: &str, tag_names: &[String]) -> AppResult<()> {
    super::with_conn(|conn| {
        conn.execute("DELETE FROM note_tags WHERE note_id = ?1", [note_id])?;

        let unique_names: HashSet<&str> = tag_names.iter().map(|s| s.as_str()).collect();

        for name in unique_names {
            let tag_id: String = match conn.query_row(
                "SELECT id FROM tags WHERE name = ?1",
                [name],
                |row| row.get(0),
            ) {
                Ok(id) => id,
                Err(_) => {
                    let new_id = uuid::Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT OR IGNORE INTO tags (id, name) VALUES (?1, ?2)",
                        rusqlite::params![new_id, name],
                    )?;
                    conn.query_row(
                        "SELECT id FROM tags WHERE name = ?1",
                        [name],
                        |row| row.get(0),
                    )?
                }
            };

            conn.execute(
                "INSERT OR REPLACE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![note_id, tag_id],
            )?;
        }
        Ok(())
    })
}

pub fn list_all_with_counts() -> AppResult<Vec<(String, String, u32)>> {
    super::with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, COUNT(DISTINCT nt.note_id) as cnt
             FROM tags t
             INNER JOIN note_tags nt ON t.id = nt.tag_id
             GROUP BY t.id
             ORDER BY cnt DESC",
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

pub fn get_notes_by_tag(tag_id: &str) -> AppResult<Vec<(String, String, String)>> {
    super::with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT n.id, n.title, n.path
             FROM notes n
             INNER JOIN note_tags nt ON n.id = nt.note_id
             WHERE nt.tag_id = ?1
             ORDER BY n.title",
        )?;
        let rows = stmt.query_map([tag_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    })
}