// 财务数据本地缓存表 + 时序图数据表
//
// stock_financial 表存储从 baostock 获取的财务数据 JSON:
//   code        - 股票代码 (如 600519)
//   data_json   - 完整的 BaoStockFinancialResult JSON
//   updated_at  - 最后更新时间
//
// concept_timeline / industry_timeline 表存储时序图每日板块排行:
//   date        - 交易日期 (如 2026-06-05)
//   data_json   - ConceptDayData JSON (含 top7 板块详情)
//   updated_at  - 最后更新时间
//
// 策略: 优先从本地读取，手动刷新时更新本地缓存

use crate::error::AppResult;

pub fn create_table() -> AppResult<()> {
    super::with_conn(|conn| {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS stock_financial (
                code TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_stock_financial_code ON stock_financial(code);

            CREATE TABLE IF NOT EXISTS concept_timeline (
                date TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS industry_timeline (
                date TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )?;
        Ok(())
    })
}

// ── stock_financial ──

pub fn get(code: &str) -> AppResult<Option<String>> {
    super::with_conn(|conn| {
        let result = conn
            .query_row(
                "SELECT data_json FROM stock_financial WHERE code = ?1",
                [code],
                |row| row.get(0),
            )
            .ok();
        Ok(result)
    })
}

pub fn upsert(code: &str, data_json: &str) -> AppResult<()> {
    super::with_conn(|conn| {
        conn.execute(
            "INSERT INTO stock_financial (code, data_json, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(code) DO UPDATE SET
                data_json = excluded.data_json,
                updated_at = datetime('now')",
            rusqlite::params![code, data_json],
        )?;
        Ok(())
    })
}

// ── concept_timeline ──

pub fn concept_timeline_get(date: &str) -> AppResult<Option<String>> {
    super::with_conn(|conn| {
        let result = conn
            .query_row(
                "SELECT data_json FROM concept_timeline WHERE date = ?1",
                [date],
                |row| row.get(0),
            )
            .ok();
        Ok(result)
    })
}

pub fn concept_timeline_upsert(date: &str, data_json: &str) -> AppResult<()> {
    super::with_conn(|conn| {
        conn.execute(
            "INSERT INTO concept_timeline (date, data_json, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(date) DO UPDATE SET
                data_json = excluded.data_json,
                updated_at = datetime('now')",
            rusqlite::params![date, data_json],
        )?;
        Ok(())
    })
}

pub fn concept_timeline_list(days: i32) -> AppResult<Vec<(String, String)>> {
    super::with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT date, data_json FROM concept_timeline ORDER BY date DESC LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![days], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    })
}

pub fn concept_timeline_updated_at() -> AppResult<Option<String>> {
    super::with_conn(|conn| {
        let result = conn
            .query_row(
                "SELECT MAX(updated_at) FROM concept_timeline",
                [],
                |row| row.get(0),
            )
            .ok();
        Ok(result)
    })
}

pub fn concept_timeline_delete_all() -> AppResult<usize> {
    super::with_conn(|conn| {
        let count = conn.execute("DELETE FROM concept_timeline", [])?;
        Ok(count)
    })
}

// ── industry_timeline ──

pub fn industry_timeline_get(date: &str) -> AppResult<Option<String>> {
    super::with_conn(|conn| {
        let result = conn
            .query_row(
                "SELECT data_json FROM industry_timeline WHERE date = ?1",
                [date],
                |row| row.get(0),
            )
            .ok();
        Ok(result)
    })
}

pub fn industry_timeline_upsert(date: &str, data_json: &str) -> AppResult<()> {
    super::with_conn(|conn| {
        conn.execute(
            "INSERT INTO industry_timeline (date, data_json, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(date) DO UPDATE SET
                data_json = excluded.data_json,
                updated_at = datetime('now')",
            rusqlite::params![date, data_json],
        )?;
        Ok(())
    })
}

pub fn industry_timeline_list(days: i32) -> AppResult<Vec<(String, String)>> {
    super::with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT date, data_json FROM industry_timeline ORDER BY date DESC LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![days], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    })
}

pub fn industry_timeline_updated_at() -> AppResult<Option<String>> {
    super::with_conn(|conn| {
        let result = conn
            .query_row(
                "SELECT MAX(updated_at) FROM industry_timeline",
                [],
                |row| row.get(0),
            )
            .ok();
        Ok(result)
    })
}

pub fn industry_timeline_delete_all() -> AppResult<usize> {
    super::with_conn(|conn| {
        let count = conn.execute("DELETE FROM industry_timeline", [])?;
        Ok(count)
    })
}
