/// Manages an SSH port-forwarding tunnel for secure VPS connections.
///
/// Instead of opening the clawsquire-serve port on the VPS firewall (security risk),
/// we create an SSH local port forward:
///   ssh -N -L <local_port>:localhost:<remote_port> user@host -p <ssh_port>
///
/// The desktop then connects to ws://localhost:<local_port>, which the SSH client
/// transparently tunnels to the remote serve process.
use clawsquire_core::detect::{cmd_with_path, expanded_path};
use std::process::Child;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

/// Global tunnel child process. Only one tunnel at a time.
static TUNNEL: Mutex<Option<Child>> = Mutex::new(None);

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

/// Start an SSH local-port-forward tunnel.
/// Returns the local port the WebSocket should connect to.
pub fn start(params: &TunnelParams) -> Result<u16, String> {
    stop_inner(); // kill any existing tunnel first

    let forward_spec = format!(
        "{}:localhost:{}",
        params.local_port, params.remote_port
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

    let child = cmd.spawn().map_err(|e| format!("ssh tunnel spawn: {e}"))?;

    // Give SSH a moment to establish the connection
    thread::sleep(Duration::from_millis(1200));

    // Check the child hasn't already exited with an error
    let mut guard = TUNNEL.lock().unwrap();
    let mut child = child;
    if let Ok(Some(status)) = child.try_wait() {
        return Err(format!(
            "SSH tunnel exited immediately (code {:?}). Check SSH credentials and that sshpass is installed for password auth.",
            status.code()
        ));
    }
    *guard = Some(child);
    drop(guard);

    Ok(params.local_port)
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
