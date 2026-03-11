use crate::detect::Environment;
use serde::{Deserialize, Serialize};

const GITHUB_REPO: &str = "Jiansen/clawsquire";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BootstrapStatus {
    pub node_ready: bool,
    pub openclaw_ready: bool,
    pub serve_reachable: bool,
    pub missing: Vec<String>,
    pub steps: Vec<BootstrapStep>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BootstrapStep {
    pub id: String,
    pub label: String,
    pub status: StepStatus,
    pub action: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum StepStatus {
    Done,
    Pending,
    Running,
    Failed,
}

pub fn assess(env: &Environment) -> BootstrapStatus {
    let mut missing = Vec::new();
    let mut steps = Vec::new();

    let node_ready = env.node_version.is_some();
    let openclaw_ready = env.openclaw_installed;

    steps.push(BootstrapStep {
        id: "serve".into(),
        label: "clawsquire-serve running".into(),
        status: StepStatus::Done,
        action: None,
    });

    steps.push(BootstrapStep {
        id: "node".into(),
        label: format!(
            "Node.js {}",
            env.node_version.as_deref().unwrap_or("not found")
        ),
        status: if node_ready {
            StepStatus::Done
        } else {
            missing.push("node".into());
            StepStatus::Pending
        },
        action: if node_ready {
            None
        } else {
            Some("node.install".into())
        },
    });

    steps.push(BootstrapStep {
        id: "openclaw".into(),
        label: format!(
            "OpenClaw {}",
            env.openclaw_version.as_deref().unwrap_or("not installed")
        ),
        status: if openclaw_ready {
            StepStatus::Done
        } else {
            missing.push("openclaw".into());
            StepStatus::Pending
        },
        action: if openclaw_ready {
            None
        } else {
            Some("openclaw.install".into())
        },
    });

    BootstrapStatus {
        node_ready,
        openclaw_ready,
        serve_reachable: true,
        missing,
        steps,
    }
}

/// Asset name used in GitHub Releases (e.g. `clawsquire-serve-linux-x86_64`).
pub fn asset_name(platform: &str, arch: &str) -> String {
    let os_label = match platform {
        "windows" => "windows",
        "macos" | "darwin" => "darwin",
        _ => "linux",
    };
    let arch_label = match arch {
        "aarch64" => "aarch64",
        _ => "x86_64",
    };
    let ext = if platform == "windows" { ".exe" } else { "" };
    format!("clawsquire-serve-{}-{}{}", os_label, arch_label, ext)
}

/// Generate a shell script snippet to install clawsquire-serve on a remote machine.
/// Assumes pre-built binaries are published at GitHub Releases.
pub fn install_script(platform: &str, arch: &str) -> String {
    let name = asset_name(platform, arch);

    if platform == "windows" {
        format!(
            r#"# ClawSquire Serve — Windows install
$url = "https://github.com/{repo}/releases/latest/download/{name}"
$dest = "$env:USERPROFILE\.clawsquire\{name}"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.clawsquire" | Out-Null
Invoke-WebRequest -Uri $url -OutFile $dest
& $dest --init"#,
            repo = GITHUB_REPO,
            name = name,
        )
    } else {
        format!(
            r#"#!/bin/sh
# ClawSquire Serve — install & start
set -e
DEST="$HOME/.clawsquire/clawsquire-serve"
mkdir -p "$HOME/.clawsquire"
curl -fsSL "https://github.com/{repo}/releases/latest/download/{name}" -o "$DEST"
chmod +x "$DEST"
"$DEST" --init"#,
            repo = GITHUB_REPO,
            name = name,
        )
    }
}

/// Fallback: generate `cargo install` instructions when binaries aren't published yet.
pub fn cargo_install_script() -> &'static str {
    r#"# Requires Rust toolchain (https://rustup.rs)
cargo install --git https://github.com/Jiansen/clawsquire.git clawsquire-serve
clawsquire-serve --init"#
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_env(node: bool, openclaw: bool) -> Environment {
        Environment {
            openclaw_installed: openclaw,
            openclaw_version: if openclaw {
                Some("2026.3.8".into())
            } else {
                None
            },
            openclaw_path: None,
            npm_installed: node,
            npm_version: if node { Some("10.9.0".into()) } else { None },
            node_version: if node { Some("v22.14.0".into()) } else { None },
            config_dir: "/home/test/.openclaw".into(),
            platform: "linux".into(),
            arch: "x86_64".into(),
        }
    }

    #[test]
    fn assess_all_ready() {
        let status = assess(&mock_env(true, true));
        assert!(status.node_ready);
        assert!(status.openclaw_ready);
        assert!(status.missing.is_empty());
        assert!(status.steps.iter().all(|s| s.status == StepStatus::Done));
    }

    #[test]
    fn assess_nothing_installed() {
        let status = assess(&mock_env(false, false));
        assert!(!status.node_ready);
        assert!(!status.openclaw_ready);
        assert_eq!(status.missing.len(), 2);
        assert!(status.missing.contains(&"node".to_string()));
        assert!(status.missing.contains(&"openclaw".to_string()));
    }

    #[test]
    fn assess_node_only() {
        let status = assess(&mock_env(true, false));
        assert!(status.node_ready);
        assert!(!status.openclaw_ready);
        assert_eq!(status.missing, vec!["openclaw"]);
    }

    #[test]
    fn asset_name_variants() {
        assert_eq!(asset_name("linux", "x86_64"), "clawsquire-serve-linux-x86_64");
        assert_eq!(asset_name("linux", "aarch64"), "clawsquire-serve-linux-aarch64");
        assert_eq!(asset_name("macos", "aarch64"), "clawsquire-serve-darwin-aarch64");
        assert_eq!(asset_name("windows", "x86_64"), "clawsquire-serve-windows-x86_64.exe");
    }

    #[test]
    fn install_script_linux_x86() {
        let script = install_script("linux", "x86_64");
        assert!(script.contains("clawsquire-serve-linux-x86_64"));
        assert!(script.contains("curl"));
        assert!(script.contains("--init"));
    }

    #[test]
    fn install_script_macos_arm() {
        let script = install_script("macos", "aarch64");
        assert!(script.contains("clawsquire-serve-darwin-aarch64"));
    }

    #[test]
    fn install_script_windows() {
        let script = install_script("windows", "x86_64");
        assert!(script.contains("Invoke-WebRequest"));
        assert!(script.contains("clawsquire-serve-windows-x86_64.exe"));
    }

    #[test]
    fn cargo_fallback_contains_install() {
        let script = cargo_install_script();
        assert!(script.contains("cargo install"));
    }
}
