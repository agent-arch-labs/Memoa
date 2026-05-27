// 数据库层 - SQLite 连接管理 (WAL 模式)
//
// 使用全局 Mutex<Option<Connection>> 管理单一的 SQLite 连接
// 所有数据库操作通过 with_conn 闭包执行, 自动加锁/解锁
//
// 表结构:
//   users         - 用户表 (id, email, password_hash, created_at, updated_at)
//   devices       - 设备表 (id, user_id, device_name, public_key, ...)
//   vaults        - 知识库表 (id, owner_id, name, ...)
//   vault_members - 知识库成员表 (vault_id, user_id, role)
//   vault_files   - 文件记录表 (vault_id, file_path, file_hash, file_size, is_deleted)
//
// 性能优化:
//   - WAL 模式: 读写并发不互斥
//   - FOREIGN KEYS: 启用外键约束保证数据完整性
//   - busy_timeout: 5秒超时, 避免锁等待 hang

pub mod device;
pub mod user;
pub mod vault;

use crate::error::Result;
use rusqlite::Connection;
use std::sync::Mutex;

static DB: Mutex<Option<Connection>> = Mutex::new(None);

pub fn init(db_path: &str) -> Result<()> {
    if let Some(parent) = std::path::Path::new(db_path).parent() {
        std::fs::create_dir_all(parent)?;
    }

    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;
         PRAGMA busy_timeout=5000;",
    )?;

    user::create_tables(&conn)?;
    vault::create_tables(&conn)?;
    device::create_tables(&conn)?;

    let mut db = DB.lock().unwrap();
    *db = Some(conn);

    tracing::info!("database initialized at {}", db_path);
    Ok(())
}

pub fn with_conn<F, T>(f: F) -> Result<T>
where
    F: FnOnce(&Connection) -> Result<T>,
{
    let guard = DB.lock().unwrap();
    let conn = guard
        .as_ref()
        .ok_or(crate::error::AppError::Internal("database not initialized".into()))?;
    f(conn)
}

pub use device::DeviceRow;
pub use user::UserRow;
pub use vault::VaultMemberRow;