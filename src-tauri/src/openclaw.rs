use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct DaemonStatus {
    pub running: bool,
    pub pid: Option<u32>,
}

pub fn config_get(path: &str) -> Result<String, String> {
    let output = Command::new("openclaw")
        .args(["config", "get", path, "--json"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub fn config_set(path: &str, value: &str) -> Result<(), String> {
    let output = Command::new("openclaw")
        .args(["config", "set", path, value, "--json"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub fn daemon_status() -> Result<DaemonStatus, String> {
    let output = Command::new("openclaw")
        .args(["daemon", "status"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let running = stdout.contains("running") || output.status.success();

    Ok(DaemonStatus { running, pid: None })
}
