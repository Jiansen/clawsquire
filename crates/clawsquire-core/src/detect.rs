use crate::constants::{CLAWSQUIRE_DATA_DIR, OPENCLAW_CLI, OPENCLAW_STATE_DIR_DEFAULT};
use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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

/// Build an expanded PATH that includes common Node.js / npm install locations.
/// macOS GUI apps (Tauri/Electron) inherit a minimal PATH from launchd that
/// often excludes `/usr/local/bin`, Homebrew, nvm, volta, fnm, etc.
pub fn expanded_path() -> String {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    let mut extra: Vec<PathBuf> = Vec::new();

    // Our own managed Node.js location (highest priority)
    extra.push(home.join(CLAWSQUIRE_DATA_DIR).join("node").join("bin"));

    #[cfg(not(target_os = "windows"))]
    {
        extra.push(PathBuf::from("/usr/local/bin"));
        extra.push(PathBuf::from("/opt/homebrew/bin"));
        extra.push(PathBuf::from("/opt/homebrew/sbin"));

        // nvm: pick the latest installed version
        let nvm_dir = std::env::var("NVM_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home.join(".nvm"));
        if let Some(latest) = newest_subdir(&nvm_dir.join("versions").join("node")) {
            extra.push(latest.join("bin"));
        }

        // volta
        extra.push(home.join(".volta").join("bin"));

        // fnm
        let fnm_dir = home.join(".local").join("share").join("fnm").join("aliases").join("default").join("bin");
        extra.push(fnm_dir);

        // n (tj/n)
        if let Ok(n_prefix) = std::env::var("N_PREFIX") {
            extra.push(PathBuf::from(n_prefix).join("bin"));
        } else {
            extra.push(home.join("n").join("bin"));
        }

        #[cfg(target_os = "linux")]
        extra.push(PathBuf::from("/snap/bin"));
    }

    #[cfg(target_os = "windows")]
    {
        extra.push(PathBuf::from(r"C:\Program Files\nodejs"));
        if let Ok(appdata) = std::env::var("APPDATA") {
            if let Some(latest) = newest_subdir(&PathBuf::from(&appdata).join("nvm")) {
                extra.push(latest);
            }
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            extra.push(PathBuf::from(&local).join("Volta").join("bin"));
            extra.push(PathBuf::from(&local).join("fnm_multishells"));
        }
    }

    let current = std::env::var("PATH").unwrap_or_default();
    let sep = if cfg!(target_os = "windows") { ";" } else { ":" };

    let mut parts: Vec<String> = extra
        .into_iter()
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    for p in current.split(sep) {
        if !p.is_empty() && !parts.contains(&p.to_string()) {
            parts.push(p.to_string());
        }
    }

    parts.join(sep)
}

/// Return the lexicographically-last subdirectory (≈ newest version).
fn newest_subdir(parent: &PathBuf) -> Option<PathBuf> {
    std::fs::read_dir(parent)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .max()
}

/// Create a Command that won't flash a console window on Windows.
/// Applies CREATE_NO_WINDOW (0x08000000) on Windows; no-op elsewhere.
pub fn hidden_cmd(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        c.creation_flags(0x08000000);
    }
    c
}

/// Create a Command with the expanded PATH set.
/// On Windows, wraps through `cmd /C` so that `.cmd` scripts (npm, npx) are resolved,
/// and uses CREATE_NO_WINDOW to prevent console flash.
pub fn cmd_with_path(program: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut c = hidden_cmd("cmd");
        c.args(["/C", program]);
        c.env("PATH", expanded_path());
        c
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut c = Command::new(program);
        c.env("PATH", expanded_path());
        c
    }
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
    match cmd_with_path("npm").arg("--version").output() {
        Ok(o) if o.status.success() => {
            let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
            (true, Some(ver))
        }
        _ => (false, None),
    }
}

fn detect_node_version() -> Option<String> {
    cmd_with_path("node")
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
    let which_cmd = if cfg!(target_os = "windows") { "where" } else { "which" };
    let which_result = cmd_with_path(which_cmd).arg(OPENCLAW_CLI).output();

    let path = match which_result {
        Ok(output) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        _ => None,
    };

    if path.is_none() {
        return (false, None, None);
    }

    let version = cmd_with_path(OPENCLAW_CLI)
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

#[derive(Debug, Serialize)]
pub struct UpdateCheck {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub download_url: Option<String>,
    pub release_notes: Option<String>,
}

const GITHUB_REPO: &str = "Jiansen/clawsquire";

pub fn check_for_updates(current_version: &str) -> UpdateCheck {
    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        GITHUB_REPO
    );

    let result = hidden_cmd("curl")
        .args(["-sL", "-H", "Accept: application/vnd.github.v3+json", &url])
        .output();

    match result {
        Ok(output) if output.status.success() => {
            let body = String::from_utf8_lossy(&output.stdout);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                let tag = json["tag_name"]
                    .as_str()
                    .unwrap_or("")
                    .trim_start_matches('v');
                let html_url = json["html_url"].as_str().unwrap_or("").to_string();
                let notes = json["body"].as_str().unwrap_or("").to_string();

                let update_available = !tag.is_empty() && tag != current_version;

                return UpdateCheck {
                    current_version: current_version.to_string(),
                    latest_version: if tag.is_empty() {
                        None
                    } else {
                        Some(tag.to_string())
                    },
                    update_available,
                    download_url: if html_url.is_empty() {
                        None
                    } else {
                        Some(html_url)
                    },
                    release_notes: if notes.is_empty() {
                        None
                    } else {
                        Some(notes)
                    },
                };
            }
            UpdateCheck {
                current_version: current_version.to_string(),
                latest_version: None,
                update_available: false,
                download_url: None,
                release_notes: None,
            }
        }
        _ => UpdateCheck {
            current_version: current_version.to_string(),
            latest_version: None,
            update_available: false,
            download_url: None,
            release_notes: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expanded_path_includes_usr_local_bin() {
        if cfg!(not(target_os = "windows")) {
            let path = expanded_path();
            assert!(
                path.contains("/usr/local/bin"),
                "expanded_path should include /usr/local/bin, got: {}",
                &path[..path.len().min(200)]
            );
        }
    }

    #[test]
    fn expanded_path_includes_clawsquire_node_when_dir_exists() {
        let home = dirs::home_dir().unwrap();
        let node_bin_dir = home
            .join(crate::constants::CLAWSQUIRE_DATA_DIR)
            .join("node")
            .join("bin");
        let created = if !node_bin_dir.exists() {
            std::fs::create_dir_all(&node_bin_dir).ok();
            true
        } else {
            false
        };

        let path = expanded_path();

        if created {
            let _ = std::fs::remove_dir_all(
                home.join(crate::constants::CLAWSQUIRE_DATA_DIR).join("node"),
            );
        }

        assert!(
            path.contains(".clawsquire"),
            "expanded_path should include .clawsquire/node when dir exists, got: {}",
            &path[..path.len().min(200)]
        );
    }

    #[test]
    fn expanded_path_preserves_system_path() {
        let sys_path = std::env::var("PATH").unwrap_or_default();
        let path = expanded_path();
        let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
        for component in sys_path.split(sep).take(3) {
            if !component.is_empty() {
                assert!(
                    path.contains(component),
                    "expanded_path should preserve system PATH component '{}'",
                    component
                );
            }
        }
    }

    #[test]
    fn cmd_with_path_finds_node_on_ci() {
        // CI runners have Node.js pre-installed; verify our expanded PATH finds it
        let output = cmd_with_path("node").arg("--version").output();
        assert!(output.is_ok(), "cmd_with_path should be able to run 'node'");
        let o = output.unwrap();
        assert!(o.status.success(), "node --version should succeed");
        let ver = String::from_utf8_lossy(&o.stdout);
        assert!(
            ver.trim().starts_with('v'),
            "node version should start with 'v', got: {}",
            ver.trim()
        );
    }

    #[test]
    fn cmd_with_path_finds_npm_on_ci() {
        let output = cmd_with_path("npm").arg("--version").output();
        assert!(output.is_ok(), "cmd_with_path should be able to run 'npm'");
        let o = output.unwrap();
        assert!(o.status.success(), "npm --version should succeed");
    }

    #[test]
    fn detect_environment_finds_node_and_npm() {
        let env = detect_environment();
        assert!(env.npm_installed, "npm should be detected on CI");
        assert!(env.node_version.is_some(), "node version should be detected on CI");
        assert!(!env.platform.is_empty(), "platform should not be empty");
    }

    #[test]
    fn detect_with_minimal_path() {
        // Simulate a GUI app's minimal PATH
        let original = std::env::var("PATH").unwrap_or_default();
        let minimal = if cfg!(target_os = "windows") {
            r"C:\Windows\System32"
        } else {
            "/usr/bin:/bin"
        };
        std::env::set_var("PATH", minimal);

        let path = expanded_path();

        // Restore immediately
        std::env::set_var("PATH", &original);

        // The expanded path should still include common Node.js locations
        if cfg!(not(target_os = "windows")) {
            assert!(
                path.contains("/usr/local/bin"),
                "Even with minimal PATH, expanded_path should include /usr/local/bin"
            );
        }
    }
}
