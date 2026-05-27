use crate::error::{AppError, AppResult};
use serde::Serialize;
use serde_json::Value;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};

pub async fn read_mcp_response(stdout: &mut BufReader<ChildStdout>) -> AppResult<Value> {
    let mut content_length: Option<usize> = None;

    loop {
        let mut line = String::new();
        let n = stdout.read_line(&mut line).await.map_err(|e| {
            AppError::Other(format!("MCP transport read header error: {}", e))
        })?;

        if n == 0 {
            return Err(AppError::Other("MCP transport EOF".to_string()));
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }

        if let Some(len) = trimmed.strip_prefix("Content-Length:") {
            content_length = Some(
                len.trim()
                    .parse::<usize>()
                    .map_err(|e| AppError::Other(format!("Invalid Content-Length: {}", e)))?,
            );
        }
    }

    let len = content_length.ok_or_else(|| {
        AppError::Other("Missing Content-Length header in MCP response".to_string())
    })?;

    let mut body = vec![0u8; len];
    stdout
        .read_exact(&mut body)
        .await
        .map_err(|e| AppError::Other(format!("MCP transport read body error: {}", e)))?;

    let value: Value =
        serde_json::from_slice(&body).map_err(|e| AppError::Other(format!("MCP JSON parse: {}", e)))?;

    Ok(value)
}

pub async fn send_mcp_message(stdin: &mut ChildStdin, message: &impl Serialize) -> AppResult<()> {
    let json = serde_json::to_string(message)
        .map_err(|e| AppError::Other(format!("MCP serialize error: {}", e)))?;

    let frame = format!("Content-Length: {}\r\n\r\n{}", json.len(), json);
    stdin
        .write_all(frame.as_bytes())
        .await
        .map_err(|e| AppError::Other(format!("MCP transport write error: {}", e)))?;

    stdin
        .flush()
        .await
        .map_err(|e| AppError::Other(format!("MCP transport flush error: {}", e)))?;

    Ok(())
}

pub struct AgentProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl AgentProcess {
    pub async fn spawn(command: &str, args: &[&str]) -> AppResult<Self> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| {
                AppError::Other(format!(
                    "Failed to spawn agent process '{}': {}",
                    command, e
                ))
            })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            AppError::Other("Failed to take stdin from agent process".to_string())
        })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            AppError::Other("Failed to take stdout from agent process".to_string())
        })?;

        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
        })
    }

    pub async fn send(&mut self, message: &impl Serialize) -> AppResult<()> {
        send_mcp_message(&mut self.stdin, message).await
    }

    pub async fn recv(&mut self) -> AppResult<Value> {
        read_mcp_response(&mut self.stdout).await
    }

    pub async fn send_recv(&mut self, message: &impl Serialize) -> AppResult<Value> {
        self.send(message).await?;
        self.recv().await
    }

    pub async fn kill(&mut self) -> AppResult<()> {
        self.child
            .kill()
            .await
            .map_err(|e| AppError::Other(format!("Failed to kill agent process: {}", e)))?;
        Ok(())
    }
}

pub fn find_python_command() -> String {
    for cmd in &["uv", "python3", "python"] {
        if std::process::Command::new(cmd)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok()
        {
            return cmd.to_string();
        }
    }
    "python3".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_find_python_command() {
        let cmd = find_python_command();
        assert!(!cmd.is_empty());
    }

    #[test]
    fn test_send_mcp_frame_format() {
        let msg = json!({"jsonrpc": "2.0", "method": "test", "id": 1});
        let json = serde_json::to_string(&msg).unwrap();
        let frame = format!("Content-Length: {}\r\n\r\n{}", json.len(), json);
        assert!(frame.starts_with("Content-Length: "));
        assert!(frame.contains("\r\n\r\n"));
        assert!(frame.contains("\"test\""));
    }
}