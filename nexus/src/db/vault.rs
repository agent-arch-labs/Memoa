use crate::error::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultRow {
    pub id: String,
    pub owner_id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMemberRow {
    pub vault_id: String,
    pub user_id: String,
    pub role: String,
    pub joined_at: String,
}

pub fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS vaults (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (owner_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS vault_members (
            vault_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'owner',
            joined_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (vault_id, user_id),
            FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS vault_files (
            vault_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            last_modified TEXT NOT NULL,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (vault_id, file_path),
            FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_vault_files_vault ON vault_files(vault_id);
        CREATE INDEX IF NOT EXISTS idx_vault_files_hash ON vault_files(vault_id, file_hash);",
    )?;
    Ok(())
}

pub fn create_vault(conn: &Connection, owner_id: &str, name: &str) -> Result<VaultRow> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO vaults (id, owner_id, name) VALUES (?1, ?2, ?3)",
        rusqlite::params![id, owner_id, name],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO vault_members (vault_id, user_id, role) VALUES (?1, ?2, 'owner')",
        rusqlite::params![id, owner_id],
    )?;
    find_vault_by_id(conn, &id)
}

pub fn find_vault_by_id(conn: &Connection, id: &str) -> Result<VaultRow> {
    Ok(conn.query_row(
        "SELECT id, owner_id, name, created_at, updated_at FROM vaults WHERE id = ?1",
        [id],
        |row| {
            Ok(VaultRow {
                id: row.get(0)?,
                owner_id: row.get(1)?,
                name: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )?)
}

pub fn list_vaults_by_user(conn: &Connection, user_id: &str) -> Result<Vec<VaultRow>> {
    let mut stmt = conn.prepare(
        "SELECT v.id, v.owner_id, v.name, v.created_at, v.updated_at
         FROM vaults v
         INNER JOIN vault_members vm ON v.id = vm.vault_id
         WHERE vm.user_id = ?1
         ORDER BY v.updated_at DESC",
    )?;
    let rows = stmt.query_map([user_id], |row| {
        Ok(VaultRow {
            id: row.get(0)?,
            owner_id: row.get(1)?,
            name: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub fn is_vault_member(conn: &Connection, vault_id: &str, user_id: &str) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM vault_members WHERE vault_id = ?1 AND user_id = ?2",
        rusqlite::params![vault_id, user_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn upsert_file_record(
    conn: &Connection,
    vault_id: &str,
    file_path: &str,
    file_hash: &str,
    file_size: i64,
    last_modified: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO vault_files (vault_id, file_path, file_hash, file_size, last_modified)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(vault_id, file_path) DO UPDATE SET
            file_hash = excluded.file_hash,
            file_size = excluded.file_size,
            last_modified = excluded.last_modified,
            is_deleted = 0",
        rusqlite::params![vault_id, file_path, file_hash, file_size, last_modified],
    )?;
    Ok(())
}

pub fn mark_file_deleted(conn: &Connection, vault_id: &str, file_path: &str) -> Result<()> {
    conn.execute(
        "UPDATE vault_files SET is_deleted = 1, last_modified = datetime('now')
         WHERE vault_id = ?1 AND file_path = ?2",
        rusqlite::params![vault_id, file_path],
    )?;
    Ok(())
}

pub fn get_file_manifest(
    conn: &Connection,
    vault_id: &str,
) -> Result<Vec<(String, String, i64, String)>> {
    let mut stmt = conn.prepare(
        "SELECT file_path, file_hash, file_size, last_modified
         FROM vault_files
         WHERE vault_id = ?1 AND is_deleted = 0
         ORDER BY file_path",
    )?;
    let rows = stmt.query_map([vault_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub fn get_file_record(
    conn: &Connection,
    vault_id: &str,
    file_path: &str,
) -> Result<Option<(String, i64, String, bool)>> {
    let mut stmt = conn.prepare(
        "SELECT file_hash, file_size, last_modified, is_deleted
         FROM vault_files
         WHERE vault_id = ?1 AND file_path = ?2",
    )?;
    let mut rows = stmt.query_map(rusqlite::params![vault_id, file_path], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, bool>(3)?,
        ))
    })?;
    match rows.next() {
        Some(Ok(row)) => Ok(Some(row)),
        Some(Err(e)) => Err(e.into()),
        None => Ok(None),
    }
}