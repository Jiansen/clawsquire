use crate::constants::CLAWSQUIRE_DATA_DIR;
use crate::detect::hidden_cmd;
use serde::Serialize;
use std::path::PathBuf;

const NODE_LTS_MAJOR: &str = "22";

#[derive(Debug, Serialize)]
pub struct NodeInstallResult {
    pub success: bool,
    pub version: Option<String>,
    pub node_path: Option<String>,
    pub error: Option<String>,
}

/// Download and install a Node.js LTS binary into `~/.clawsquire/node/`.
/// No root/admin required — fully user-space.
pub fn install_node() -> NodeInstallResult {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => {
            return NodeInstallResult {
                success: false,
                version: None,
                node_path: None,
                error: Some("Cannot determine home directory".to_string()),
            }
        }
    };

    let install_dir = home.join(CLAWSQUIRE_DATA_DIR).join("node");

    // If already installed, detect version and return early
    let node_bin = node_binary_path(&install_dir);
    if node_bin.exists() {
        if let Some(ver) = get_node_version(&node_bin) {
            return NodeInstallResult {
                success: true,
                version: Some(ver),
                node_path: Some(node_bin.to_string_lossy().to_string()),
                error: None,
            };
        }
    }

    // Resolve latest LTS version via dist index
    let version = match resolve_latest_lts() {
        Some(v) => v,
        None => {
            return NodeInstallResult {
                success: false,
                version: None,
                node_path: None,
                error: Some("Failed to resolve latest Node.js LTS version. Check your internet connection.".to_string()),
            }
        }
    };

    let (os_name, arch_name) = platform_pair();
    if os_name.is_empty() {
        return NodeInstallResult {
            success: false,
            version: None,
            node_path: None,
            error: Some(format!(
                "Unsupported platform: {} / {}",
                std::env::consts::OS,
                std::env::consts::ARCH
            )),
        };
    }

    // Clean up any previous partial install
    let _ = std::fs::remove_dir_all(&install_dir);
    if let Err(e) = std::fs::create_dir_all(&install_dir) {
        return NodeInstallResult {
            success: false,
            version: None,
            node_path: None,
            error: Some(format!("Cannot create {}: {}", install_dir.display(), e)),
        };
    }

    if cfg!(target_os = "windows") {
        install_windows(&version, &arch_name, &install_dir)
    } else {
        install_unix(&version, &os_name, &arch_name, &install_dir)
    }
}

fn install_unix(version: &str, os_name: &str, arch: &str, install_dir: &PathBuf) -> NodeInstallResult {
    let tarball = format!("node-{}-{}-{}.tar.xz", version, os_name, arch);
    let url = format!("https://nodejs.org/dist/{}/{}", version, tarball);
    let tmp = std::env::temp_dir().join(&tarball);

    // Download
    let dl = hidden_cmd("curl")
        .args(["-fSL", "--max-time", "300", "-o"])
        .arg(&tmp)
        .arg(&url)
        .output();

    match dl {
        Ok(o) if o.status.success() => {}
        Ok(o) => {
            let err = String::from_utf8_lossy(&o.stderr).to_string();
            let _ = std::fs::remove_file(&tmp);
            return NodeInstallResult {
                success: false,
                version: None,
                node_path: None,
                error: Some(format!("Download failed: {}", err)),
            };
        }
        Err(e) => {
            return NodeInstallResult {
                success: false,
                version: None,
                node_path: None,
                error: Some(format!("curl not found: {}", e)),
            };
        }
    }

    // Extract — strip one level so contents go directly into install_dir
    let extract = hidden_cmd("tar")
        .args(["xf"])
        .arg(&tmp)
        .arg("-C")
        .arg(install_dir)
        .arg("--strip-components=1")
        .output();

    let _ = std::fs::remove_file(&tmp);

    match extract {
        Ok(o) if o.status.success() => {}
        Ok(o) => {
            let err = String::from_utf8_lossy(&o.stderr).to_string();
            return NodeInstallResult {
                success: false,
                version: None,
                node_path: None,
                error: Some(format!("Extract failed: {}", err)),
            };
        }
        Err(e) => {
            return NodeInstallResult {
                success: false,
                version: None,
                node_path: None,
                error: Some(format!("tar not found: {}", e)),
            };
        }
    }

    let node_bin = node_binary_path(install_dir);
    let ver = get_node_version(&node_bin);

    NodeInstallResult {
        success: node_bin.exists(),
        version: ver,
        node_path: Some(node_bin.to_string_lossy().to_string()),
        error: if node_bin.exists() {
            None
        } else {
            Some("Node binary not found after extraction".to_string())
        },
    }
}

fn install_windows(version: &str, arch: &str, install_dir: &PathBuf) -> NodeInstallResult {
    let zipname = format!("node-{}-win-{}.zip", version, arch);
    let url = format!("https://nodejs.org/dist/{}/{}", version, zipname);
    let tmp = std::env::temp_dir().join(&zipname);

    // Download
    let dl = hidden_cmd("curl")
        .args(["-fSL", "--max-time", "300", "-o"])
        .arg(&tmp)
        .arg(&url)
        .output();

    match dl {
        Ok(o) if o.status.success() => {}
        Ok(o) => {
            let err = String::from_utf8_lossy(&o.stderr).to_string();
            let _ = std::fs::remove_file(&tmp);
            return NodeInstallResult {
                success: false,
                version: None,
                node_path: None,
                error: Some(format!("Download failed: {}", err)),
            };
        }
        Err(e) => {
            return NodeInstallResult {
                success: false,
                version: None,
                node_path: None,
                error: Some(format!("curl not found: {}", e)),
            };
        }
    }

    // Extract using PowerShell
    let extract_dir = std::env::temp_dir().join("clawsquire-node-extract");
    let _ = std::fs::remove_dir_all(&extract_dir);
    let ps_cmd = format!(
        "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
        tmp.display(),
        extract_dir.display()
    );
    let extract = hidden_cmd("powershell")
        .args(["-NoProfile", "-Command", &ps_cmd])
        .output();

    let _ = std::fs::remove_file(&tmp);

    match extract {
        Ok(o) if o.status.success() => {}
        Ok(o) => {
            let err = String::from_utf8_lossy(&o.stderr).to_string();
            return NodeInstallResult {
                success: false,
                version: None,
                node_path: None,
                error: Some(format!("Extract failed: {}", err)),
            };
        }
        Err(e) => {
            return NodeInstallResult {
                success: false,
                version: None,
                node_path: None,
                error: Some(format!("PowerShell not available: {}", e)),
            };
        }
    }

    // The zip extracts to a subfolder like node-v22.14.0-win-x64/
    // Move its contents into install_dir
    if let Ok(entries) = std::fs::read_dir(&extract_dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let src = entry.path();
                // Copy all files from the subfolder into install_dir
                let cp = hidden_cmd("robocopy")
                    .args(["/E", "/MOVE", "/NFL", "/NDL", "/NJH", "/NJS"])
                    .arg(&src)
                    .arg(install_dir)
                    .output();
                // robocopy returns codes < 8 for success
                if let Ok(o) = cp {
                    if o.status.code().unwrap_or(99) >= 8 {
                        let err = String::from_utf8_lossy(&o.stderr).to_string();
                        let _ = std::fs::remove_dir_all(&extract_dir);
                        return NodeInstallResult {
                            success: false,
                            version: None,
                            node_path: None,
                            error: Some(format!("File copy failed: {}", err)),
                        };
                    }
                }
                break;
            }
        }
    }
    let _ = std::fs::remove_dir_all(&extract_dir);

    let node_bin = node_binary_path(install_dir);
    let ver = get_node_version(&node_bin);

    NodeInstallResult {
        success: node_bin.exists(),
        version: ver,
        node_path: Some(node_bin.to_string_lossy().to_string()),
        error: if node_bin.exists() {
            None
        } else {
            Some("Node binary not found after extraction".to_string())
        },
    }
}

fn node_binary_path(install_dir: &PathBuf) -> PathBuf {
    if cfg!(target_os = "windows") {
        install_dir.join("node.exe")
    } else {
        install_dir.join("bin").join("node")
    }
}

fn get_node_version(node_bin: &PathBuf) -> Option<String> {
    hidden_cmd(node_bin.to_str().unwrap_or("node"))
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

/// Query nodejs.org dist index for the latest LTS version in NODE_LTS_MAJOR.
fn resolve_latest_lts() -> Option<String> {
    let output = hidden_cmd("curl")
        .args([
            "-sL",
            "--max-time",
            "10",
            &format!(
                "https://nodejs.org/dist/latest-v{}.x/SHASUMS256.txt",
                NODE_LTS_MAJOR
            ),
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    // Lines look like: "abc123  node-v22.14.0-darwin-arm64.tar.xz"
    // Extract the version from any filename
    for line in text.lines() {
        if let Some(start) = line.find("node-v") {
            let rest = &line[start + 5..]; // after "node-"
            if let Some(dash) = rest.find('-') {
                let ver = &rest[..dash]; // e.g. "v22.14.0"
                return Some(ver.to_string());
            }
        }
    }
    None
}

fn platform_pair() -> (String, String) {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "linux" => "linux",
        "windows" => "win",
        _ => "",
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" | "x86" => {
            if cfg!(target_os = "windows") {
                "x64"
            } else {
                "x64"
            }
        }
        "aarch64" => "arm64",
        _ => "",
    };
    (os.to_string(), arch.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn platform_pair_returns_valid_values() {
        let (os, arch) = platform_pair();
        assert!(
            ["darwin", "linux", "win"].contains(&os.as_str()),
            "OS should be darwin/linux/win, got: {}",
            os
        );
        assert!(
            ["x64", "arm64"].contains(&arch.as_str()),
            "Arch should be x64/arm64, got: {}",
            arch
        );
    }

    #[test]
    fn resolve_latest_lts_returns_version() {
        let ver = resolve_latest_lts();
        assert!(ver.is_some(), "Should resolve latest LTS version from nodejs.org");
        let v = ver.unwrap();
        assert!(
            v.starts_with('v'),
            "Version should start with 'v', got: {}",
            v
        );
        assert!(
            v.contains(&format!("v{}.", NODE_LTS_MAJOR)),
            "Version should be v{}.x, got: {}",
            NODE_LTS_MAJOR,
            v
        );
    }

    #[test]
    #[ignore] // Downloads ~30MB; run explicitly in CI with --ignored
    fn install_node_downloads_and_works() {
        // Full integration test: download Node.js to a temp location
        let home = dirs::home_dir().expect("home dir");
        let test_dir = home.join(".clawsquire-test-node-install");
        let _ = std::fs::remove_dir_all(&test_dir);

        // Temporarily override CLAWSQUIRE_DATA_DIR behavior by using the real function
        let result = install_node();

        assert!(
            result.success,
            "install_node should succeed, error: {:?}",
            result.error
        );
        assert!(
            result.version.is_some(),
            "Should report installed version"
        );
        assert!(
            result.node_path.is_some(),
            "Should report node binary path"
        );

        let ver = result.version.unwrap();
        assert!(ver.starts_with('v'), "Version should start with 'v', got: {}", ver);

        // Verify the binary actually works
        let node_path = result.node_path.unwrap();
        let output = Command::new(&node_path)
            .arg("--version")
            .output()
            .expect("node binary should be executable");
        assert!(output.status.success(), "Installed node should run successfully");

        // Verify npm is also available
        let npm_path = if cfg!(target_os = "windows") {
            std::path::PathBuf::from(&node_path)
                .parent()
                .unwrap()
                .join("npm.cmd")
        } else {
            std::path::PathBuf::from(&node_path)
                .parent()
                .unwrap()
                .join("npm")
        };
        assert!(npm_path.exists(), "npm should also be installed at {:?}", npm_path);

        // Calling install_node again should return early (already installed)
        let result2 = install_node();
        assert!(result2.success, "Second call should also succeed (early return)");
    }
}
