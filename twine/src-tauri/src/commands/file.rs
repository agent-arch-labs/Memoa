// 文件操作命令 - 笔记的增删改查与文件树
//
// 写入流程 (write_file):
//   1. SHA256 校验新旧内容，仅变更时更新索引
//   2. upsert SQLite notes 表 (标题/路径/checksum/字数)
//   3. 提取 Frontmatter 中的 tags
//   4. 提取 [[wikilink]] 双向链接
//   5. 增量更新 BM25 索引
//
// 删除流程 (delete_note):
//   1. 非空文件夹拒绝删除
//   2. permanent=false: 移入回收站 (trash crate)
//   3. permanent=true: 直接删除
//   4. 同步清理 SQLite 记录 + BM25 索引 + 向量数据

use crate::{
    db,
    error::{AppError, AppResult},
    indexer,
};
use crate::bm25::Bm25Index;
use crate::config::AppConfig;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

fn sync_bm25_for_file(vault_path: &std::path::Path, file_path: &std::path::Path) {
    let rel = file_path.strip_prefix(vault_path).unwrap_or(file_path);
    let note_path = rel.to_string_lossy().to_string();
    let note_title = rel
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&note_path)
        .to_string();

    match fs::read_to_string(file_path) {
        Ok(content) => {
            if let Err(e) = Bm25Index::upsert_note(vault_path, &note_path, &note_title, &content) {
                tracing::warn!("BM25 增量更新失败 {}: {}", note_path, e);
            }
        }
        Err(_) => {
            let _ = Bm25Index::remove_note(vault_path, &note_path);
        }
    }
}

fn remove_bm25_for_file(vault_path: &std::path::Path, file_path: &std::path::Path) {
    let rel = file_path.strip_prefix(vault_path).unwrap_or(file_path);
    let note_path = rel.to_string_lossy().to_string();
    let _ = Bm25Index::remove_note(vault_path, &note_path);
}

fn remove_vectors_for_note(_vault_path: &std::path::Path, file_path: &std::path::Path) {
    let _ = crate::embedding::cleanup_note(file_path.to_string_lossy().as_ref());
}

#[tauri::command]
pub fn get_home_dir() -> AppResult<String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| AppError::Other("无法获取 Home 目录".to_string()))
}

#[tauri::command]
pub fn read_file(path: String) -> AppResult<String> {
    fs::read_to_string(&path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::FileNotFound(path.into())
        } else {
            AppError::Io(e)
        }
    })
}

#[tauri::command]
pub fn write_file(
    path: String,
    content: String,
    config: State<'_, AppConfig>,
) -> AppResult<()> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent)?;
    }

    let old_content = fs::read_to_string(&path).unwrap_or_default();
    let old_checksum: String = {
        let mut hasher = Sha256::new();
        hasher.update(old_content.as_bytes());
        hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect()
    };

    fs::write(&path, &content)?;

    let new_checksum: String = {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect()
    };
    if old_checksum != new_checksum {
        let note_id = db::note::upsert_by_path(&path, &content, &new_checksum)?;
        let extract_result = indexer::markdown::extract_frontmatter_and_links(&content);

        let links: Vec<db::link::ParsedLink> = extract_result
            .links
            .into_iter()
            .map(|l| db::link::ParsedLink {
                target_id: None,
                target_title: l.target,
                target_alias: l.alias,
                context: l.context,
                line: l.line,
            })
            .collect();
        if let Err(e) = db::link::upsert_links(&note_id, &links) {
            tracing::error!("write_file: 更新链接失败 {}: {}", path, e);
        }

        if let Err(e) = db::tag::upsert_note_tags(&note_id, &extract_result.tags) {
            tracing::error!("write_file: 更新标签失败 {}: {}", path, e);
        }
    }

    if let Some(vault_path) = config.vault_path.lock().unwrap().as_ref() {
        sync_bm25_for_file(vault_path, std::path::Path::new(&path));
    }

    Ok(())
}

#[tauri::command]
pub fn list_vault(vault_path: String) -> AppResult<Vec<FileEntry>> {
    let vault = std::path::Path::new(&vault_path);
    if !vault.exists() {
        return Err(AppError::FileNotFound(vault.to_path_buf()));
    }
    walk_dir(vault)
}

#[tauri::command]
pub fn create_note(
    vault_path: String,
    relative_path: String,
) -> AppResult<String> {
    let vault = std::path::Path::new(&vault_path);
    let adjusted_path = if relative_path.ends_with(".md") {
        relative_path
    } else {
        format!("{}.md", relative_path)
    };
    let full_path = vault.join(&adjusted_path);

    if full_path.exists() {
        return Err(AppError::Other(format!("文件已存在: {}", adjusted_path)));
    }

    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let title = full_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled");

    let now = chrono::Utc::now().to_rfc3339();
    let content = format!(
        "---\ntitle: {}\ncreated: {}\nupdated: {}\ntags: []\n---\n\n# {}\n\n",
        title, now, now, title
    );

    fs::write(&full_path, &content)?;

    let checksum: String = {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect()
    };
    let _ = db::note::upsert_by_path(
        full_path.to_str().unwrap_or(""),
        &content,
        &checksum,
    );

    sync_bm25_for_file(vault, &full_path);

    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_note(
    path: String,
    permanent: bool,
    config: State<'_, AppConfig>,
) -> AppResult<()> {
    let path = std::path::Path::new(&path);
    if !path.exists() {
        return Err(AppError::FileNotFound(path.to_path_buf()));
    }

    if path.is_dir() {
        if fs::read_dir(path)?.next().is_some() {
            return Err(AppError::Other("文件夹不为空，无法删除".to_string()));
        }
        fs::remove_dir(path)?;
    } else {
        if permanent {
            fs::remove_file(path)?;
        } else {
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                fs::remove_file(path)?;
            }
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                trash::delete(path).map_err(|e| AppError::Other(format!("回收站操作失败: {}", e)))?;
            }
        }
    }

    let _ = db::note::delete_by_path(path.to_str().unwrap_or(""));

    if let Some(vault_path) = config.vault_path.lock().unwrap().as_ref() {
        remove_bm25_for_file(vault_path, path);
        remove_vectors_for_note(vault_path, path);
    }

    Ok(())
}

#[tauri::command]
pub fn create_folder(vault_path: String, relative_path: String) -> AppResult<String> {
    let vault = std::path::Path::new(&vault_path);
    let full_path = vault.join(&relative_path);

    if full_path.exists() {
        return Err(AppError::Other(format!("已存在: {}", relative_path)));
    }

    fs::create_dir_all(&full_path)?;

    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn rename_note(
    old_path: String,
    new_path: String,
    config: State<'_, AppConfig>,
) -> AppResult<()> {
    let old = std::path::Path::new(&old_path);
    let adjusted_new_path = if old.extension().map(|e| e == "md").unwrap_or(false)
        && !new_path.ends_with(".md")
    {
        format!("{}.md", new_path)
    } else {
        new_path
    };
    let new = std::path::Path::new(&adjusted_new_path);

    if !old.exists() {
        return Err(AppError::FileNotFound(old.to_path_buf()));
    }
    if new.exists() {
        return Err(AppError::Other(format!("目标已存在: {}", adjusted_new_path)));
    }

    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent)?;
    }

    fs::rename(old, new)?;

    let _ = db::note::update_path(&old_path, &adjusted_new_path);

    let content = fs::read_to_string(&adjusted_new_path).unwrap_or_default();
    let old_title = old.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let new_title = new.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let updated_content = indexer::markdown::rename_wiki_links(&content, old_title, new_title);

    if updated_content != content {
        fs::write(&adjusted_new_path, &updated_content)?;
        let checksum: String = {
            let mut hasher = Sha256::new();
            hasher.update(updated_content.as_bytes());
            hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect()
        };
        let _ = db::note::upsert_by_path(&adjusted_new_path, &updated_content, &checksum);
    }

    if let Some(vault_path) = config.vault_path.lock().unwrap().as_ref() {
        let old_rel = old.strip_prefix(vault_path).unwrap_or(old);
        let new_rel = new.strip_prefix(vault_path).unwrap_or(new);
        let _ = Bm25Index::remove_note(vault_path, &old_rel.to_string_lossy());
        sync_bm25_for_file(vault_path, new);
    }

    Ok(())
}

fn walk_dir(dir: &std::path::Path) -> AppResult<Vec<FileEntry>> {
    let mut entries = Vec::new();

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let raw_name = entry.file_name().to_string_lossy().to_string();

        if raw_name.starts_with('.') {
            continue;
        }

        let is_dir = path.is_dir();
        let display_name = if !is_dir {
            raw_name.strip_suffix(".md").unwrap_or(&raw_name).to_string()
        } else {
            raw_name
        };
        let mut file_entry = FileEntry {
            name: display_name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            children: None,
        };

        if is_dir {
            file_entry.children = Some(walk_dir(&path).unwrap_or_default());
        }

        entries.push(file_entry);
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[derive(Debug, Serialize)]
pub struct RecentNoteSummary {
    pub id: String,
    pub title: String,
    pub path: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn list_recent_notes(limit: u32) -> AppResult<Vec<RecentNoteSummary>> {
    let rows = db::note::list_recent(limit)?;
    let notes = rows
        .into_iter()
        .map(|(id, title, path, updated_at)| RecentNoteSummary {
            id,
            title,
            path,
            updated_at,
        })
        .collect();
    Ok(notes)
}

#[tauri::command]
pub fn find_note_by_title(title: String) -> AppResult<Option<RecentNoteSummary>> {
    let row = db::note::find_by_title(&title)?;
    Ok(row.map(|(id, title, path, updated_at)| RecentNoteSummary {
        id,
        title,
        path,
        updated_at,
    }))
}

#[tauri::command]
pub fn open_with_default_app(path: String) -> AppResult<()> {
    open::that(&path).map_err(|e| AppError::Io(e))?;
    Ok(())
}

#[tauri::command]
pub fn find_note_by_path(prefix: String) -> AppResult<Option<RecentNoteSummary>> {
    let row = db::note::find_by_path_prefix(&prefix)?;
    Ok(row.map(|(id, title, path, updated_at)| RecentNoteSummary {
        id,
        title,
        path,
        updated_at,
    }))
}

#[tauri::command]
pub fn find_note_by_path_flexible(query: String) -> AppResult<Option<RecentNoteSummary>> {
    let row = db::note::find_by_path_flexible(&query)?;
    Ok(row.map(|(id, title, path, updated_at)| RecentNoteSummary {
        id,
        title,
        path,
        updated_at,
    }))
}