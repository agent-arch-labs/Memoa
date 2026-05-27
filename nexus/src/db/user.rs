use crate::error::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRow {
    pub id: String,
    pub email: String,
    pub password_hash: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);",
    )?;
    Ok(())
}

pub fn create_user(conn: &Connection, email: &str, password_hash: &str) -> Result<UserRow> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO users (id, email, password_hash) VALUES (?1, ?2, ?3)",
        rusqlite::params![id, email, password_hash],
    )?;
    find_by_id(conn, &id)
}

pub fn find_by_email(conn: &Connection, email: &str) -> Result<Option<UserRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, password_hash, created_at, updated_at FROM users WHERE email = ?1",
    )?;
    let mut rows = stmt.query_map([email], |row| {
        Ok(UserRow {
            id: row.get(0)?,
            email: row.get(1)?,
            password_hash: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

pub fn find_by_id(conn: &Connection, id: &str) -> Result<UserRow> {
    let row = conn.query_row(
        "SELECT id, email, password_hash, created_at, updated_at FROM users WHERE id = ?1",
        [id],
        |row| {
            Ok(UserRow {
                id: row.get(0)?,
                email: row.get(1)?,
                password_hash: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )?;
    Ok(row)
}

pub fn count_users(conn: &Connection) -> Result<u64> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
    Ok(count as u64)
}