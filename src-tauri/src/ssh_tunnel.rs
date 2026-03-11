/// Manages an SSH port-forwarding tunnel for secure VPS connections.
///
/// Instead of opening the clawsquire-serve port on the VPS firewall (security risk),
/// we create an SSH local port forward:
///   ssh -N -L <local_port>:localhost:<remote_port> user@host -p <ssh_port>
///
/// The desktop then connects to ws://localhost:<local_port>, which the SSH client
/// transparently tunnels to the remote serve process.
use clawsquire_core::detect::cmd_with_path;
use std::net::TcpStream;
use std::process::Child;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

/// Global tunnel child process for clawsquire-serve. Only one at a time.
static TUNNEL: Mutex<Option<Child>> = Mutex::new(None);

/// Separate tunnel for OpenClaw dashboard (port 18789).
static DASHBOARD_TUNNEL: Mutex<Option<Child>> = Mutex::new(None);

/// SSH credentials cached from the last successful main tunnel connection.
/// Used by the dashboard tunnel so the user is not prompted for credentials again.
static CACHED_SSH_CREDS: Mutex<Option<SshCreds>> = Mutex::new(None);

#[derive(Clone)]
pub struct SshCreds {
    pub host: String,
    pub ssh_port: u16,
    pub username: String,
    pub auth_method: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
}

/// Cache SSH credentials after a successful main tunnel connection.
pub fn cache_ssh_creds(params: &TunnelParams) {
    if let Ok(mut guard) = CACHED_SSH_CREDS.lock() {
        *guard = Some(SshCreds {
            host: params.host.clone(),
            ssh_port: params.ssh_port,
            username: params.username.clone(),
            auth_method: params.auth_method.clone(),
            password: params.password.clone(),
            key_path: params.key_path.clone(),
        });
    }
}

/// Retrieve cached SSH credentials (for dashboard tunnel reuse).
pub fn get_cached_ssh_creds() -> Option<SshCreds> {
    CACHED_SSH_CREDS.lock().ok()?.clone()
}

pub struct TunnelParams {
    pub host: String,
    pub ssh_port: u16,
    pub username: String,
    pub auth_method: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
    pub remote_port: u16,
    pub local_port: u16,
}

/// Kill any process occupying a local TCP port (handles orphaned SSH tunnels).
/// Uses `lsof` on Unix and waits up to 2s for the port to be freed.
fn kill_port_occupant(port: u16) {
    #[cfg(unix)]
    {
        // Try lsof first (most reliable on macOS/Linux)
        let _ = std::process::Command::new("lsof")
            .args(["-ti", &format!(":{port}")])
            .output()
            .map(|out| {
                for pid_str in String::from_utf8_lossy(&out.stdout).split_whitespace() {
                    if let Ok(pid) = pid_str.trim().parse::<u32>() {
                        let _ = std::process::Command::new("kill").args(["-9", &pid.to_string()]).output();
                    }
                }
            });
        // Also try fuser (Linux fallback)
        let _ = std::process::Command::new("fuser")
            .args(["-k", &format!("{port}/tcp")])
            .output();
        // Wait up to 2s for port to be freed
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if TcpStream::connect(format!("127.0.0.1:{port}")).is_err() {
                break; // port is now free
            }
            thread::sleep(Duration::from_millis(200));
        }
    }
}

/// Start an SSH local-port-forward tunnel.
/// Returns the local port the WebSocket should connect to.
pub fn start(params: &TunnelParams) -> Result<u16, String> {
    stop_inner(); // kill any ClawSquire-managed tunnel first

    // Use remote_port + 10000 as the local port to avoid collisions with
    // locally-running services (e.g. clawsquire-serve in test mode).
    let local_port = params.remote_port.saturating_add(10000);
    kill_port_occupant(local_port); // kill any orphaned SSH tunnel on that port

    let forward_spec = format!(
        "{}:localhost:{}",
        local_port, params.remote_port
    );

    let mut cmd = if params.auth_method == "password" {
        if let Some(ref pw) = params.password {
            let mut c = cmd_with_path("sshpass");
            c.args(["-p", pw, "ssh"]);
            c
        } else {
            return Err("Password auth selected but no password provided".into());
        }
    } else {
        cmd_with_path("ssh")
    };

    cmd.args([
        "-N",                            // no remote command
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=15",
        "-o", "ExitOnForwardFailure=yes",
        "-L", &forward_spec,
        "-p", &params.ssh_port.to_string(),
    ]);

    if params.auth_method == "key" {
        if let Some(ref kp) = params.key_path {
            cmd.args(["-i", kp]);
        }
    }

    cmd.arg(format!("{}@{}", params.username, params.host));

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn().map_err(|e| format!("ssh tunnel spawn: {e}"))?;

    // Poll until local port is listening (up to 8s) instead of a fixed sleep.
    // This handles variable connection latency and slow SSH key exchanges.
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        // Check if SSH process died early (bad credentials, port conflicts, etc.)
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "SSH tunnel process exited (code {:?}).\nPossible causes:\n\
                 • Wrong SSH credentials or key file\n\
                 • sshpass not installed (brew install sshpass)\n\
                 • SSH key requires interactive passphrase (use ssh-add first)\n\
                 • Port {} already in use on this machine",
                status.code(), local_port
            ));
        }
        // Try to connect to the local port — success means SSH is forwarding
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{local_port}").parse().unwrap(),
            Duration::from_millis(300),
        ).is_ok() {
            break; // tunnel is ready
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            return Err(format!(
                "SSH tunnel timed out after 8s — port {} not forwarding.\n\
                 Check that clawsquire-serve is running on the remote server.",
                local_port
            ));
        }
        thread::sleep(Duration::from_millis(300));
    }

    let mut guard = TUNNEL.lock().unwrap();
    *guard = Some(child);
    drop(guard);

    // Cache credentials so the dashboard tunnel can reuse them without prompting
    cache_ssh_creds(params);

    Ok(local_port)
}

/// Stop the SSH tunnel if one is running.
pub fn stop() {
    stop_inner();
}

fn stop_inner() {
    if let Ok(mut guard) = TUNNEL.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
}

/// OpenClaw dashboard is served on port 18789 on the remote.
/// We forward it to local port 28789.
pub const DASHBOARD_REMOTE_PORT: u16 = 18789;
pub const DASHBOARD_LOCAL_PORT: u16 = 28789;

/// Start a port-forward tunnel specifically for the OpenClaw dashboard.
/// Returns the local port the dashboard is accessible on.
pub fn start_dashboard(params: &TunnelParams) -> Result<u16, String> {
    let local_port = DASHBOARD_LOCAL_PORT;

    // Stop any existing dashboard tunnel
    if let Ok(mut g) = DASHBOARD_TUNNEL.lock() {
        if let Some(mut c) = g.take() {
            let _ = c.kill();
        }
    }
    kill_port_occupant(local_port);

    let forward_spec = format!("{}:localhost:{}", local_port, DASHBOARD_REMOTE_PORT);

    let mut cmd = if params.auth_method == "password" {
        if let Some(ref pw) = params.password {
            let mut c = cmd_with_path("sshpass");
            c.args(["-p", pw, "ssh"]);
            c
        } else {
            return Err("Password auth selected but no password provided".into());
        }
    } else {
        cmd_with_path("ssh")
    };

    cmd.args([
        "-N",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=15",
        "-o", "ExitOnForwardFailure=yes",
        "-L", &forward_spec,
        "-p", &params.ssh_port.to_string(),
    ]);

    if params.auth_method == "key" {
        if let Some(ref kp) = params.key_path {
            cmd.args(["-i", kp]);
        }
    }

    cmd.arg(format!("{}@{}", params.username, params.host));

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn().map_err(|e| format!("dashboard tunnel spawn: {e}"))?;

    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("dashboard tunnel exited (code {:?})", status.code()));
        }
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{local_port}").parse().unwrap(),
            Duration::from_millis(300),
        ).is_ok() {
            break;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            return Err(format!(
                "Dashboard tunnel timed out — is OpenClaw gateway running on the VPS?",
            ));
        }
        thread::sleep(Duration::from_millis(300));
    }

    *DASHBOARD_TUNNEL.lock().unwrap() = Some(child);
    Ok(local_port)
}

/// Stop the dashboard tunnel if running.
pub fn stop_dashboard() {
    if let Ok(mut g) = DASHBOARD_TUNNEL.lock() {
        if let Some(mut c) = g.take() {
            let _ = c.kill();
        }
    }
}

/// Check if a tunnel is currently active.
pub fn is_active() -> bool {
    if let Ok(mut guard) = TUNNEL.lock() {
        if let Some(ref mut child) = *guard {
            match child.try_wait() {
                Ok(None) => return true,  // still running
                _ => { *guard = None; }   // exited or error — clear it
            }
        }
    }
    false
}
