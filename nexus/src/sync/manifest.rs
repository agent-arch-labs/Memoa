// 文件路径安全校验
//
// 防止路径遍历攻击 (Path Traversal):
//   - 去除开头的 '/', 统一为相对路径
//   - 禁止包含 '..' 的路径 (防止读取上级目录)
//   - 禁止空路径

use crate::error::Result;

pub fn validate_file_path(file_path: &str) -> Result<String> {
    let normalized = file_path.trim_start_matches('/').to_string();

    if normalized.contains("..") {
        return Err(crate::error::AppError::BadRequest(
            "file path cannot contain '..'".into(),
        ));
    }

    if normalized.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "file path cannot be empty".into(),
        ));
    }

    Ok(normalized)
}