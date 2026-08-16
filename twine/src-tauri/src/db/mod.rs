// 数据库层 - SQLite 连接管理 (WAL 模式)
//
// 使用全局 Mutex<Option<Connection>> 管理单一的 SQLite 连接
// 所有数据库操作通过 with_conn 闭包执行，自动加锁/解锁
//
// 表结构:
//   notes       - 笔记索引表 (id, title, path, checksum, created_at, updated_at, word_count)
//   links       - 双向链接表 (source_note_id, target_note_id, target_title, alias, context, line)
//   tags        - 标签表 (id, name, usage_count, color)
//   note_tags   - 笔记-标签关联表 (note_id, tag_id)
//
// 性能优化:
//   - WAL 模式: 读写并发不互斥
//   - FOREIGN KEYS: 启用外键约束保证数据完整性

pub mod link;
pub mod note;
pub mod tag;
pub mod financial;

use crate::error::AppResult;
use rusqlite::Connection;
use std::sync::Mutex;

static DB: Mutex<Option<Connection>> = Mutex::new(None);

#[cfg(test)]
pub static TEST_DB_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub fn init(db_path: &std::path::Path) -> AppResult<()> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    let mut db = DB.lock().unwrap();
    *db = Some(conn);
    drop(db);

    crate::embedding::ensure_table()?;

    Ok(())
}

pub fn with_conn<F, T>(f: F) -> AppResult<T>
where
    F: FnOnce(&Connection) -> AppResult<T>,
{
    let guard = DB.lock().unwrap();
    let conn = guard
        .as_ref()
        .ok_or(crate::error::AppError::DatabaseNotInitialized)?;
    f(conn)
}