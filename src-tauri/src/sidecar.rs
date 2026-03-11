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

/// Holds the sidecar child process handle for cleanup on exit.
pub struct SidecarChild(pub Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

/// Spawn the bundled clawsquire-serve sidecar.
/// On success, connects a ProtocolRunner and sets ActiveTarget to Protocol.
/// On failure (missing binary, etc.), the app stays in Local mode.
pub fn spawn_sidecar(app: &tauri::App) {
    let token = generate_token();

    let sidecar_cmd = match app
        .shell()
        .sidecar("binaries/clawsquire-serve")
    {
        Ok(cmd) => cmd.args(["--port", "0", "--token", &token]),
        Err(e) => {
            eprintln!("[sidecar] binary not found, staying in local mode: {}", e);
            return;
        }
    };

    let (mut rx, child) = match sidecar_cmd.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            eprintln!("[sidecar] failed to spawn, staying in local mode: {}", e);
            return;
        }
    };

    app.manage(SidecarChild(Mutex::new(Some(child))));

    let app_handle = app.handle().clone();

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Ok(info) = serde_json::from_str::<ReadyInfo>(trimmed) {
                        if !info.ready {
                            continue;
                        }
                        let url = format!("ws://127.0.0.1:{}", info.port);
                        eprintln!("[sidecar] ready at {}", url);

                        let token_for_connect = token.clone();
                        let connect_result = tauri::async_runtime::spawn_blocking(move || {
                            ProtocolRunner::connect(&url, &token_for_connect)
                        })
                        .await;

                        match connect_result {
                            Ok(Ok(runner)) => {
                                let state = app_handle.state::<ActiveTargetState>();
                                state.set(Target::Protocol {
                                    runner: Arc::new(runner),
                                    instance_id: "local-sidecar".into(),
                                    host: "127.0.0.1".into(),
                                });
                                eprintln!("[sidecar] connected — all IPC routes through protocol");
                            }
                            Ok(Err(e)) => {
                                eprintln!("[sidecar] connect failed: {}", e);
                            }
                            Err(e) => {
                                eprintln!("[sidecar] connect task panic: {}", e);
                            }
                        }
                        break;
                    }
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
}

/// Kill the sidecar process if running.
pub fn kill_sidecar(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<SidecarChild>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
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
