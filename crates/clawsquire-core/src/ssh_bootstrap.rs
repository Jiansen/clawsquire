use crate::bootstrap;
use crate::detect::cmd_with_path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootstrapEvent {
    pub step: String,
    pub status: String, // "running" | "ok" | "fail"
    pub message: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootstrapResult {
    pub success: bool,
    pub port: Option<u16>,
    pub token: Option<String>,
    pub platform: Option<String>,
    pub arch: Option<String>,
    pub error: Option<String>,
}

impl BootstrapEvent {
    fn running(step: &str, msg: &str) -> Self {
        Self {
            step: step.into(),
            status: "running".into(),
            message: msg.into(),
            detail: None,
        }
    }

    fn ok(step: &str, msg: &str) -> Self {
        Self {
            step: step.into(),
            status: "ok".into(),
            message: msg.into(),
            detail: None,
        }
    }

    fn fail(step: &str, msg: &str, detail: Option<String>) -> Self {
        Self {
            step: step.into(),
            status: "fail".into(),
            message: msg.into(),
            detail,
        }
    }
}

fn build_ssh_args(cfg: &SshConfig) -> Vec<String> {
    let mut args = vec![
        "-o".into(),
        "StrictHostKeyChecking=no".into(),
        "-o".into(),
        "ConnectTimeout=15".into(),
        "-p".into(),
        cfg.port.to_string(),
    ];

    // BatchMode=yes disables password prompts — must NOT be set for password auth
    // because sshpass injects the password via a PTY prompt that BatchMode suppresses.
    if cfg.auth_method != "password" {
        args.push("-o".into());
        args.push("BatchMode=yes".into());
    }

    if cfg.auth_method == "key" {
        if let Some(ref kp) = cfg.key_path {
            args.push("-i".into());
            args.push(kp.clone());
        }
    }

    args.push(format!("{}@{}", cfg.username, cfg.host));
    args
}

pub fn ssh_exec(cfg: &SshConfig, remote_cmd: &str) -> Result<String, String> {
    let mut args = build_ssh_args(cfg);
    args.push(remote_cmd.to_string());

    let mut cmd = if cfg.auth_method == "password" {
        if let Some(ref pw) = cfg.password {
            // cmd_with_path ensures /usr/local/bin (Homebrew) is on PATH
            // so sshpass is found even in Tauri's restricted GUI environment.
            let mut c = cmd_with_path("sshpass");
            c.args(["-p", pw, "ssh"]);
            c.args(&args);
            c
        } else {
            return Err("Password auth selected but no password provided".into());
        }
    } else {
        let mut c = cmd_with_path("ssh");
        c.args(&args);
        c
    };

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().map_err(|e| format!("ssh exec: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("ssh command failed (exit {})", output.status.code().unwrap_or(-1))
        } else {
            stderr
        })
    }
}

/// Quick SSH connectivity test. Runs `echo ok` via SSH.
pub fn test_connection(cfg: &SshConfig) -> Result<String, String> {
    if cfg.auth_method == "password" {
        let has_sshpass = cmd_with_path("which")
            .arg("sshpass")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !has_sshpass {
            return Err(
                "Password authentication requires `sshpass`, which is not installed.\n\
                Install it with:\n\
                  • macOS: brew install sshpass\n\
                  • Ubuntu/Debian: sudo apt install sshpass\n\
                Or switch to SSH key authentication (recommended)."
                    .into(),
            );
        }
    }
    ssh_exec(cfg, "echo ok")
}

/// Run the full SSH bootstrap sequence.
/// `emit` is called for each progress event.
pub fn run_bootstrap<F: FnMut(BootstrapEvent)>(
    cfg: &SshConfig,
    mut emit: F,
) -> BootstrapResult {
    let mut result = BootstrapResult {
        success: false,
        port: None,
        token: None,
        platform: None,
        arch: None,
        error: None,
    };

    // Step 1: Check local SSH client
    emit(BootstrapEvent::running("ssh_check", "Checking local SSH client..."));
    let ssh_bin = if cfg.auth_method == "password" { "sshpass" } else { "ssh" };
    // Use cmd_with_path so /usr/local/bin (Homebrew) is included — GUI apps get minimal PATH.
    let which = cmd_with_path("which").arg(ssh_bin).output();
    match which {
        Ok(o) if o.status.success() => {
            emit(BootstrapEvent::ok("ssh_check", &format!("{} available", ssh_bin)));
        }
        _ => {
            let msg = if ssh_bin == "sshpass" {
                "sshpass not found. Install it (e.g. `brew install sshpass` / `apt install sshpass`) or switch to key-based auth."
            } else {
                "SSH client not found. Please install OpenSSH."
            };
            emit(BootstrapEvent::fail("ssh_check", msg, None));
            result.error = Some(msg.into());
            return result;
        }
    }

    // Step 2: Test connection
    emit(BootstrapEvent::running(
        "connect",
        &format!("Connecting to {}@{}:{}...", cfg.username, cfg.host, cfg.port),
    ));
    match ssh_exec(cfg, "echo __clawsquire_ok__") {
        Ok(out) if out.contains("__clawsquire_ok__") => {
            emit(BootstrapEvent::ok("connect", "SSH connection successful"));
        }
        Ok(out) => {
            emit(BootstrapEvent::fail(
                "connect",
                "Unexpected response",
                Some(out),
            ));
            result.error = Some("SSH connected but unexpected response".into());
            return result;
        }
        Err(e) => {
            emit(BootstrapEvent::fail("connect", "Connection failed", Some(e.clone())));
            result.error = Some(e);
            return result;
        }
    }

    // Step 3: Detect remote OS & arch
    emit(BootstrapEvent::running("detect_os", "Detecting remote environment..."));
    let platform = match ssh_exec(cfg, "uname -s 2>/dev/null || echo windows") {
        Ok(s) => {
            let p = s.trim().to_lowercase();
            match p.as_str() {
                "linux" => "linux".to_string(),
                "darwin" => "macos".to_string(),
                _ if p.contains("mingw") || p.contains("msys") || p == "windows" => {
                    "windows".to_string()
                }
                other => other.to_string(),
            }
        }
        Err(e) => {
            emit(BootstrapEvent::fail("detect_os", "Failed to detect OS", Some(e.clone())));
            result.error = Some(e);
            return result;
        }
    };

    let arch = match ssh_exec(cfg, "uname -m 2>/dev/null || echo x86_64") {
        Ok(s) => {
            let a = s.trim().to_lowercase();
            if a.contains("aarch64") || a.contains("arm64") {
                "aarch64".to_string()
            } else {
                "x86_64".to_string()
            }
        }
        Err(_) => "x86_64".to_string(),
    };

    emit(BootstrapEvent::ok(
        "detect_os",
        &format!("Remote: {} {} ", platform, arch),
    ));
    result.platform = Some(platform.clone());
    result.arch = Some(arch.clone());

    // Step 4: Check if serve is already installed & running
    emit(BootstrapEvent::running("check_serve", "Checking clawsquire-serve..."));
    let serve_exists = ssh_exec(cfg, "test -f $HOME/.clawsquire/clawsquire-serve && echo yes || echo no")
        .unwrap_or_default()
        .contains("yes");

    if serve_exists {
        emit(BootstrapEvent::ok("check_serve", "clawsquire-serve already installed"));
    } else {
        emit(BootstrapEvent::running(
            "install_serve",
            "Installing clawsquire-serve...",
        ));

        let install_cmd = if platform == "windows" {
            bootstrap::install_script("windows", &arch)
        } else {
            let script = bootstrap::install_script(&platform, &arch);
            // Remove the --init from install script; we'll run it separately
            script.replace("\"$DEST\" --init", "echo install_done")
        };

        match ssh_exec(cfg, &install_cmd) {
            Ok(_) => {
                emit(BootstrapEvent::ok("install_serve", "clawsquire-serve installed"));
            }
            Err(e) => {
                emit(BootstrapEvent::fail(
                    "install_serve",
                    "Failed to install clawsquire-serve",
                    Some(e.clone()),
                ));
                result.error = Some(e);
                return result;
            }
        }
    }

    // Step 5: Start serve with --init to get port (no token in v0.3.1+ — SSH tunnel is the auth)
    emit(BootstrapEvent::running("start_serve", "Starting clawsquire-serve..."));
    let init_cmd = "$HOME/.clawsquire/clawsquire-serve --init";
    match ssh_exec(cfg, init_cmd) {
        Ok(output) => {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&output) {
                let port = json.get("port").and_then(|p| p.as_u64()).map(|p| p as u16);

                if let Some(p) = port {
                    result.port = Some(p);
                    result.token = None; // v0.3.1+: no token — SSH tunnel is auth
                    emit(BootstrapEvent::ok(
                        "start_serve",
                        &format!("clawsquire-serve ready (port {})", p),
                    ));
                } else {
                    emit(BootstrapEvent::fail(
                        "start_serve",
                        "Invalid init output — missing port",
                        Some(output),
                    ));
                    result.error = Some("Invalid clawsquire-serve init output".into());
                    return result;
                }
            } else {
                emit(BootstrapEvent::fail(
                    "start_serve",
                    "Failed to parse init output",
                    Some(output),
                ));
                result.error = Some("clawsquire-serve init returned non-JSON".into());
                return result;
            }
        }
        Err(e) => {
            emit(BootstrapEvent::fail(
                "start_serve",
                "Failed to start clawsquire-serve",
                Some(e.clone()),
            ));
            result.error = Some(e);
            return result;
        }
    }

    // Step 6: Start serve daemon WITHOUT --token (SSH-tunnel-as-auth mode)
    emit(BootstrapEvent::running("daemon", "Starting serve daemon..."));
    let port = result.port.unwrap();
    let daemon_cmd = format!(
        "nohup $HOME/.clawsquire/clawsquire-serve --port {} > $HOME/.clawsquire/serve.log 2>&1 &",
        port
    );
    match ssh_exec(cfg, &daemon_cmd) {
        Ok(_) => {
            emit(BootstrapEvent::ok("daemon", "Serve daemon started"));
        }
        Err(e) => {
            emit(BootstrapEvent::fail(
                "daemon",
                "Failed to start daemon (serve may still work if started manually)",
                Some(e),
            ));
            // Non-fatal: the init already gave us token/port
        }
    }

    result.success = true;
    emit(BootstrapEvent::ok(
        "complete",
        &format!(
            "Bootstrap complete! Connect to ws://{}:{}",
            cfg.host, port
        ),
    ));

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key_cfg() -> SshConfig {
        SshConfig {
            host: "example.com".into(),
            port: 22,
            username: "root".into(),
            auth_method: "key".into(),
            password: None,
            key_path: Some("/home/user/.ssh/id_rsa".into()),
        }
    }

    fn pw_cfg() -> SshConfig {
        SshConfig {
            host: "192.168.1.1".into(),
            port: 2222,
            username: "admin".into(),
            auth_method: "password".into(),
            password: Some("secret".into()),
            key_path: None,
        }
    }

    #[test]
    fn test_ssh_args_key_auth() {
        let args = build_ssh_args(&key_cfg());
        assert!(args.contains(&"-i".to_string()));
        assert!(args.contains(&"/home/user/.ssh/id_rsa".to_string()));
        assert!(args.contains(&"root@example.com".to_string()));
    }

    #[test]
    fn test_ssh_args_key_auth_includes_options() {
        let args = build_ssh_args(&key_cfg());
        assert!(args.contains(&"StrictHostKeyChecking=no".to_string()));
        assert!(args.contains(&"ConnectTimeout=15".to_string()));
        assert!(args.contains(&"BatchMode=yes".to_string()));
    }

    #[test]
    fn test_ssh_args_password_auth() {
        let args = build_ssh_args(&pw_cfg());
        assert!(args.contains(&"2222".to_string()));
        assert!(args.contains(&"admin@192.168.1.1".to_string()));
    }

    #[test]
    fn test_ssh_args_no_key_without_key_path() {
        let mut cfg = key_cfg();
        cfg.key_path = None;
        let args = build_ssh_args(&cfg);
        assert!(!args.contains(&"-i".to_string()));
    }

    #[test]
    fn test_bootstrap_event_constructors() {
        let ev = BootstrapEvent::running("test", "Testing...");
        assert_eq!(ev.status, "running");
        assert_eq!(ev.step, "test");

        let ev = BootstrapEvent::ok("test", "Done");
        assert_eq!(ev.status, "ok");

        let ev = BootstrapEvent::fail("test", "Error", Some("detail".into()));
        assert_eq!(ev.status, "fail");
        assert_eq!(ev.detail, Some("detail".into()));
    }

    #[test]
    fn test_bootstrap_event_serialization() {
        let ev = BootstrapEvent::ok("connect", "Connected");
        let json = serde_json::to_string(&ev).unwrap();
        let parsed: BootstrapEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.step, "connect");
        assert_eq!(parsed.status, "ok");
    }

    #[test]
    fn test_bootstrap_result_default() {
        let r = BootstrapResult {
            success: false,
            port: None,
            token: None,
            platform: None,
            arch: None,
            error: None,
        };
        assert!(!r.success);
        assert!(r.port.is_none());
    }

    #[test]
    fn test_bootstrap_result_serialization() {
        let r = BootstrapResult {
            success: true,
            port: Some(18790),
            token: Some("tok-123".into()),
            platform: Some("linux".into()),
            arch: Some("x86_64".into()),
            error: None,
        };
        let json = serde_json::to_string(&r).unwrap();
        let parsed: BootstrapResult = serde_json::from_str(&json).unwrap();
        assert!(parsed.success);
        assert_eq!(parsed.port, Some(18790));
        assert_eq!(parsed.token, Some("tok-123".into()));
    }

    #[test]
    fn test_ssh_config_serialization() {
        let cfg = key_cfg();
        let json = serde_json::to_string(&cfg).unwrap();
        let parsed: SshConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.host, "example.com");
        assert_eq!(parsed.port, 22);
        assert_eq!(parsed.auth_method, "key");
    }

    #[test]
    fn test_bootstrap_emits_events_on_missing_ssh() {
        let cfg = SshConfig {
            host: "nonexistent.example.com".into(),
            port: 22,
            username: "root".into(),
            auth_method: "key".into(),
            password: None,
            key_path: None,
        };

        let mut events: Vec<BootstrapEvent> = Vec::new();
        let result = run_bootstrap(&cfg, |ev| events.push(ev));

        assert!(!result.success);
        assert!(!events.is_empty());
        // First event should be ssh_check
        assert_eq!(events[0].step, "ssh_check");
        assert_eq!(events[0].status, "running");
    }

    #[test]
    fn test_bootstrap_password_no_password_fails() {
        let cfg = SshConfig {
            host: "example.com".into(),
            port: 22,
            username: "root".into(),
            auth_method: "password".into(),
            password: None,
            key_path: None,
        };

        let mut events: Vec<BootstrapEvent> = Vec::new();
        let result = run_bootstrap(&cfg, |ev| events.push(ev));

        // sshpass should either be missing or password auth should fail
        assert!(!result.success);
    }
}
