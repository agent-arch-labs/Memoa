use crate::{db, error::AppResult};
use serde::Serialize;
use std::collections::HashSet;

#[derive(Debug, Serialize)]
pub struct TagWithCount {
    pub id: String,
    pub name: String,
    pub count: u32,
}

#[tauri::command]
pub fn list_tags_with_counts() -> AppResult<Vec<TagWithCount>> {
    let rows = db::tag::list_all_with_counts()?;
    let tags = rows
        .into_iter()
        .map(|(id, name, count)| TagWithCount { id, name, count })
        .collect();
    Ok(tags)
}

#[derive(Debug, Serialize)]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub path: String,
}

#[tauri::command]
pub fn get_notes_by_tag(tag_id: String) -> AppResult<Vec<NoteSummary>> {
    let rows = db::tag::get_notes_by_tag(&tag_id)?;
    let mut seen = HashSet::new();
    let notes: Vec<NoteSummary> = rows
        .into_iter()
        .filter_map(|(id, title, path)| {
            let key = format!("{}||{}", id, path);
            if seen.insert(key) {
                Some(NoteSummary { id, title, path })
            } else {
                None
            }
        })
        .collect();
    Ok(notes)
}