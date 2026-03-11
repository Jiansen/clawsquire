use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::active_target::{ActiveTargetState, Target};
use crate::protocol_runner::ProtocolRunner;

#[derive(Debug, serde::Deserialize)]
struct ReadyInfo {
    ready: bool,
    port: u16,
    #[allow(dead_code)]
    protocol_version: String,
}

/// Holds a child process handle (either Tauri sidecar or direct process).
enum ManagedChild {
    Sidecar(tauri_plugin_shell::process::CommandChild),
    Direct(Child),
}

pub struct SidecarChild(Mutex<Option<ManagedChild>>);

/// Spawn the bundled clawsquire-serve sidecar.
/// Tries Tauri sidecar mechanism first, falls back to direct spawn.
pub fn spawn_sidecar(app: &tauri::App) {
    let token = generate_token();

    // Try Tauri sidecar mechanism (works in production builds)
    match try_tauri_sidecar(app, &token) {
        Ok(()) => return,
        Err(e) => {
            eprintln!("[sidecar] Tauri sidecar unavailable: {}. Trying direct spawn...", e);
        }
    }

    // Fallback: direct spawn from workspace target/ or system PATH
    match try_direct_spawn(app, &token) {
        Ok(()) => {}
        Err(e) => {
            eprintln!("[sidecar] direct spawn also failed: {}. Staying in local mode.", e);
        }
    }
}

fn try_tauri_sidecar(app: &tauri::App, token: &str) -> Result<(), String> {
    let sidecar_cmd = app
        .shell()
        .sidecar("binaries/clawsquire-serve")
        .map_err(|e| format!("{}", e))?
        .args(["--port", "0", "--token", token]);

    let (mut rx, child) = sidecar_cmd.spawn().map_err(|e| format!("{}", e))?;

    app.manage(SidecarChild(Mutex::new(Some(ManagedChild::Sidecar(child)))));

    let app_handle = app.handle().clone();
    let token = token.to_string();

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    handle_ready_line(&line, &token, &app_handle);
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    eprintln!("[sidecar:log] {}", line.trim());
                }
                CommandEvent::Error(err) => {
                    eprintln!("[sidecar] error: {}", err);
                    break;
                }
                CommandEvent::Terminated(status) => {
                    eprintln!("[sidecar] terminated: {:?}", status);
                    break;
                }
                _ => {}
            }
        }
    });
    Ok(())
}

fn try_direct_spawn(app: &tauri::App, token: &str) -> Result<(), String> {
    let bin_path = find_serve_binary().ok_or("clawsquire-serve not found")?;
    eprintln!("[sidecar] direct spawn: {}", bin_path);

    let child = Command::new(&bin_path)
        .args(["--port", "0", "--token", token])
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("{}", e))?;

    app.manage(SidecarChild(Mutex::new(Some(ManagedChild::Direct(child)))));

    let app_handle = app.handle().clone();
    let token = token.to_string();

    // Read stdout in a background thread
    let stdout = {
        let state = app.state::<SidecarChild>();
        let mut guard = state.0.lock().unwrap();
        match guard.as_mut() {
            Some(ManagedChild::Direct(c)) => c.stdout.take(),
            _ => None,
        }
    };

    if let Some(stdout) = stdout {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                handle_ready_line_sync(&line, &token, &app_handle);
            }
        });
    }

    Ok(())
}

fn find_serve_binary() -> Option<String> {
    // 1. Next to the app binary
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join("clawsquire-serve");
            if candidate.exists() {
                return Some(candidate.to_string_lossy().into());
            }
        }
    }

    // 2. System PATH
    if let Ok(output) = Command::new("which").arg("clawsquire-serve").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }

    None
}

fn handle_ready_line(line: &str, token: &str, app_handle: &tauri::AppHandle) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }
    if let Ok(info) = serde_json::from_str::<ReadyInfo>(trimmed) {
        if info.ready {
            connect_to_serve(info.port, token, app_handle);
        }
    }
}

fn handle_ready_line_sync(line: &str, token: &str, app_handle: &tauri::AppHandle) {
    handle_ready_line(line, token, app_handle);
}

fn connect_to_serve(port: u16, token: &str, app_handle: &tauri::AppHandle) {
    let url = format!("ws://127.0.0.1:{}", port);
    eprintln!("[sidecar] ready at {}", url);

    let token = token.to_string();
    let app = app_handle.clone();

    std::thread::spawn(move || {
        match ProtocolRunner::connect(&url, Some(&token)) {
            Ok(runner) => {
                let state = app.state::<ActiveTargetState>();
                state.set(Target::Protocol {
                    runner: Arc::new(runner),
                    instance_id: "local-sidecar".into(),
                    host: "127.0.0.1".into(),
                });
                eprintln!("[sidecar] connected — all IPC routes through protocol");
            }
            Err(e) => {
                eprintln!("[sidecar] connect failed: {}", e);
            }
        }
    });
}

/// Kill the sidecar process if running.
pub fn kill_sidecar(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<SidecarChild>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.take() {
                match child {
                    ManagedChild::Sidecar(c) => { let _ = c.kill(); }
                    ManagedChild::Direct(mut c) => { let _ = c.kill(); }
                }
                eprintln!("[sidecar] killed");
            }
        }
    }
}

fn generate_token() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::time::SystemTime;

    let mut hasher = DefaultHasher::new();
    SystemTime::now().hash(&mut hasher);
    std::process::id().hash(&mut hasher);
    format!("cs-sidecar-{:016x}", hasher.finish())
}
