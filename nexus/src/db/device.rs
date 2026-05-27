use crate::error::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceRow {
    pub id: String,
    pub user_id: String,
    pub device_name: String,
    pub public_key: Option<String>,
    pub created_at: String,
    pub last_seen_at: String,
}

pub fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            device_name TEXT NOT NULL,
            public_key TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);",
    )?;
    Ok(())
}

pub fn register_device(
    conn: &Connection,
    user_id: &str,
    device_name: &str,
    public_key: Option<&str>,
) -> Result<DeviceRow> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO devices (id, user_id, device_name, public_key) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, user_id, device_name, public_key],
    )?;
    find_device_by_id(conn, &id)
}

pub fn find_device_by_id(conn: &Connection, id: &str) -> Result<DeviceRow> {
    Ok(conn.query_row(
        "SELECT id, user_id, device_name, public_key, created_at, last_seen_at
         FROM devices WHERE id = ?1",
        [id],
        |row| {
            Ok(DeviceRow {
                id: row.get(0)?,
                user_id: row.get(1)?,
                device_name: row.get(2)?,
                public_key: row.get(3)?,
                created_at: row.get(4)?,
                last_seen_at: row.get(5)?,
            })
        },
    )?)
}

pub fn list_devices_by_user(conn: &Connection, user_id: &str) -> Result<Vec<DeviceRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, device_name, public_key, created_at, last_seen_at
         FROM devices WHERE user_id = ?1
         ORDER BY last_seen_at DESC",
    )?;
    let rows = stmt.query_map([user_id], |row| {
        Ok(DeviceRow {
            id: row.get(0)?,
            user_id: row.get(1)?,
            device_name: row.get(2)?,
            public_key: row.get(3)?,
            created_at: row.get(4)?,
            last_seen_at: row.get(5)?,
        })
    })?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub fn update_last_seen(conn: &Connection, device_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE devices SET last_seen_at = datetime('now') WHERE id = ?1",
        [device_id],
    )?;
    Ok(())
}