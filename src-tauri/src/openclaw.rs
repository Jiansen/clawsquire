use crate::constants::{OPENCLAW_CLI, OPENCLAW_NPM_PKG, OPENCLAW_STATE_DIR_DEFAULT};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct DaemonStatus {
    pub running: bool,
    pub pid: Option<u32>,
}

pub fn config_get(path: &str) -> Result<String, String> {
    let output = Command::new(OPENCLAW_CLI)
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
    let output = Command::new(OPENCLAW_CLI)
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
    let output = match Command::new(OPENCLAW_CLI)
        .args(["daemon", "status"])
        .output()
    {
        Ok(o) => o,
        Err(_) => return Ok(DaemonStatus { running: false, pid: None }),
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
    let running = stdout.contains("running") && !stdout.contains("not running") && !stdout.contains("stopped");

    Ok(DaemonStatus { running, pid: None })
}

pub fn daemon_stop() -> Result<String, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["daemon", "stop"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn daemon_start() -> Result<String, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["daemon", "start"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[derive(Debug, Serialize)]
pub struct UninstallResult {
    pub daemon_stopped: bool,
    pub npm_uninstalled: bool,
    pub config_removed: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct InstallResult {
    pub success: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

pub fn install_openclaw() -> Result<InstallResult, String> {
    let pkg = format!("{}@latest", OPENCLAW_NPM_PKG);
    let output = Command::new("npm")
        .args(["install", "-g", &pkg])
        .output()
        .map_err(|e| format!("Failed to run npm: {}", e))?;

    if output.status.success() {
        let version = Command::new(OPENCLAW_CLI)
            .arg("--version")
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    None
                }
            });

        Ok(InstallResult {
            success: true,
            version,
            error: None,
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(InstallResult {
            success: false,
            version: None,
            error: Some(stderr),
        })
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct ProviderInfo {
    pub id: String,
    pub model_count: usize,
    pub sample_models: Vec<String>,
    pub priority: u8,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub input: String,
    pub context_window: String,
}

const PRIORITY_PROVIDERS: &[&str] = &[
    "openai", "anthropic", "google", "openai-codex", "opencode",
    "xai", "mistral", "groq", "cerebras",
];

pub fn list_providers() -> Result<Vec<ProviderInfo>, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["models", "list", "--all"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut providers: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    for line in stdout.lines().skip(1) {
        let model_id = line.split_whitespace().next().unwrap_or("").to_string();
        if let Some(slash) = model_id.find('/') {
            let provider = model_id[..slash].to_string();
            let model_name = model_id[slash + 1..].to_string();
            providers.entry(provider).or_default().push(model_name);
        }
    }

    let mut result: Vec<ProviderInfo> = providers
        .into_iter()
        .map(|(id, models)| {
            let priority = PRIORITY_PROVIDERS
                .iter()
                .position(|&p| p == id)
                .map(|i| i as u8)
                .unwrap_or(100);
            let sample_models: Vec<String> = models.iter().take(5).cloned().collect();
            ProviderInfo {
                id,
                model_count: models.len(),
                sample_models,
                priority,
            }
        })
        .collect();

    result.sort_by_key(|p| (p.priority, p.id.clone()));
    Ok(result)
}

pub fn list_models(provider: &str) -> Result<Vec<ModelInfo>, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["models", "list", "--all"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let prefix = format!("{}/", provider);

    let models: Vec<ModelInfo> = stdout
        .lines()
        .skip(1)
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 && parts[0].starts_with(&prefix) {
                Some(ModelInfo {
                    id: parts[0].to_string(),
                    input: parts[1].to_string(),
                    context_window: parts[2].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(models)
}

pub fn uninstall_openclaw(remove_config: bool) -> Result<UninstallResult, String> {
    let mut result = UninstallResult {
        daemon_stopped: false,
        npm_uninstalled: false,
        config_removed: false,
        errors: Vec::new(),
    };

    match Command::new(OPENCLAW_CLI).args(["daemon", "stop"]).output() {
        Ok(o) if o.status.success() => result.daemon_stopped = true,
        Ok(o) => {
            let msg = String::from_utf8_lossy(&o.stderr).trim().to_string();
            if !msg.is_empty() {
                result.errors.push(format!("daemon stop: {}", msg));
            }
            result.daemon_stopped = true;
        }
        Err(e) => result.errors.push(format!("daemon stop: {}", e)),
    }

    match Command::new("npm")
        .args(["uninstall", "-g", OPENCLAW_NPM_PKG])
        .output()
    {
        Ok(o) if o.status.success() => result.npm_uninstalled = true,
        Ok(o) => {
            let msg = String::from_utf8_lossy(&o.stderr).trim().to_string();
            result.errors.push(format!("npm uninstall: {}", msg));
        }
        Err(e) => result.errors.push(format!("npm uninstall: {}", e)),
    }

    if remove_config {
        let config_dir = if let Ok(dir) = std::env::var("OPENCLAW_STATE_DIR") {
            std::path::PathBuf::from(dir)
        } else {
            dirs::home_dir().unwrap_or_default().join(OPENCLAW_STATE_DIR_DEFAULT)
        };
        if config_dir.exists() {
            match std::fs::remove_dir_all(&config_dir) {
                Ok(()) => result.config_removed = true,
                Err(e) => result.errors.push(format!("remove config: {}", e)),
            }
        } else {
            result.config_removed = true;
        }
    }

    Ok(result)
}
