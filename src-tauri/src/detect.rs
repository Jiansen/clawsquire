use crate::constants::{OPENCLAW_CLI, OPENCLAW_STATE_DIR_DEFAULT};
use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct Environment {
    pub openclaw_installed: bool,
    pub openclaw_version: Option<String>,
    pub openclaw_path: Option<String>,
    pub npm_installed: bool,
    pub npm_version: Option<String>,
    pub node_version: Option<String>,
    pub config_dir: String,
    pub platform: String,
}

pub fn detect_environment() -> Environment {
    let (installed, version, path) = detect_openclaw();
    let (npm_installed, npm_version) = detect_npm();
    let node_version = detect_node_version();
    let config_dir = detect_config_dir();
    let platform = std::env::consts::OS.to_string();

    Environment {
        openclaw_installed: installed,
        openclaw_version: version,
        openclaw_path: path,
        npm_installed,
        npm_version,
        node_version,
        config_dir,
        platform,
    }
}

fn detect_npm() -> (bool, Option<String>) {
    match Command::new("npm").arg("--version").output() {
        Ok(o) if o.status.success() => {
            let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
            (true, Some(ver))
        }
        _ => (false, None),
    }
}

fn detect_node_version() -> Option<String> {
    Command::new("node")
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
}

fn detect_openclaw() -> (bool, Option<String>, Option<String>) {
    let which_result = if cfg!(target_os = "windows") {
        Command::new("where").arg(OPENCLAW_CLI).output()
    } else {
        Command::new("which").arg(OPENCLAW_CLI).output()
    };

    let path = match which_result {
        Ok(output) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        _ => None,
    };

    if path.is_none() {
        return (false, None, None);
    }

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

    (true, version, path)
}

fn detect_config_dir() -> String {
    if let Ok(dir) = std::env::var("OPENCLAW_STATE_DIR") {
        return dir;
    }
    let home = dirs::home_dir().unwrap_or_default();
    home.join(OPENCLAW_STATE_DIR_DEFAULT).to_string_lossy().to_string()
}
