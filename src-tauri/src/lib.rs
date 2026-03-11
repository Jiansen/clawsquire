mod active_target;
mod protocol_runner;
mod secure_store;
mod sidecar;
mod ssh_tunnel;

use active_target::{ActiveTargetInfo, ActiveTargetState};
use clawsquire_core::backup::{self, BackupEntry, DiffEntry};
use clawsquire_core::bootstrap::{self, BootstrapStatus};
use clawsquire_core::community_search::{self, SearchResponse, SmartSearchResponse};
use clawsquire_core::ssh_bootstrap::{self, SshConfig, BootstrapResult};
use clawsquire_core::compat::{self, VersionInfo};
use clawsquire_core::constants;
use clawsquire_core::detect::{self, Environment, UpdateCheck};
use clawsquire_core::doctor::{self, DoctorReport};
use clawsquire_core::imap;
use clawsquire_core::instances::{self, VpsInstance};
use clawsquire_core::node_install::{self, NodeInstallResult};
use clawsquire_core::openclaw::{self, AgentChatResult, ChannelAddResult, ChannelInfo, ChannelRemoveResult, CliOutput, CronAddResult, CronJob, CronRemoveResult, EmailMonitorResult, FeedbackInfo, InstallResult, LlmConfigStatus, LlmTestResult, ModelInfo, ProviderInfo, SafetyApplyResult, UninstallResult};
use clawsquire_core::protocol::method;
use clawsquire_core::remote::{self, RemoteInstallCommand};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager, WindowEvent,
};


#[tauri::command]
async fn get_environment(state: tauri::State<'_, ActiveTargetState>) -> Result<Environment, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        if target.is_protocol() {
            // Route to remote via RPC
            let raw = target.protocol_call(
                clawsquire_core::protocol::method::ENVIRONMENT_DETECT,
                serde_json::json!({}),
            )?;
            serde_json::from_value(raw).map_err(|e| e.to_string())
        } else {
            Ok(detect::detect_environment())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn config_get(state: tauri::State<'_, ActiveTargetState>, path: String) -> Result<String, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::config_get_with(target.runner().as_ref(), &path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn config_set(state: tauri::State<'_, ActiveTargetState>, path: String, value: String) -> Result<(), String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::config_set_with(target.runner().as_ref(), &path, &value)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn run_doctor() -> Result<DoctorReport, String> {
    tauri::async_runtime::spawn_blocking(doctor::run_structured_doctor)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn daemon_status(state: tauri::State<'_, ActiveTargetState>) -> Result<openclaw::DaemonStatus, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::daemon_status_with(target.runner().as_ref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_backup(label: Option<String>) -> Result<BackupEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        backup::create_backup_with(label.as_deref(), None, None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_backups() -> Result<Vec<BackupEntry>, String> {
    tauri::async_runtime::spawn_blocking(|| backup::list_backups_for(None))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn restore_backup(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || backup::restore_backup(&id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn diff_backups(id1: String, id2: Option<String>) -> Result<Vec<DiffEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || backup::diff_backups(&id1, id2.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn daemon_stop(state: tauri::State<'_, ActiveTargetState>) -> Result<String, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::daemon_stop_with(target.runner().as_ref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn daemon_start(state: tauri::State<'_, ActiveTargetState>) -> Result<String, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::daemon_start_with(target.runner().as_ref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn setup_provider(state: tauri::State<'_, ActiveTargetState>, provider: String, api_key: String) -> Result<(), String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::setup_provider_with(target.runner().as_ref(), &provider, &api_key)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_providers(state: tauri::State<'_, ActiveTargetState>) -> Result<Vec<ProviderInfo>, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::list_providers_with(target.runner().as_ref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_models(state: tauri::State<'_, ActiveTargetState>, provider: String) -> Result<Vec<ModelInfo>, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::list_models_with(target.runner().as_ref(), &provider)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn check_llm_config(state: tauri::State<'_, ActiveTargetState>) -> Result<LlmConfigStatus, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(openclaw::check_llm_config_with(target.runner().as_ref()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn test_llm(provider: String, api_key: String) -> Result<LlmTestResult, String> {
    tauri::async_runtime::spawn_blocking(move || openclaw::test_llm(&provider, &api_key))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_llm_gateway(state: tauri::State<'_, ActiveTargetState>) -> Result<openclaw::LlmTestResult, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(openclaw::test_llm_via_gateway_with(target.runner().as_ref()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn install_node() -> Result<NodeInstallResult, String> {
    tauri::async_runtime::spawn_blocking(node_install::install_node)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn install_openclaw() -> Result<InstallResult, String> {
    tauri::async_runtime::spawn_blocking(|| openclaw::install_openclaw())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn uninstall_openclaw(remove_config: bool) -> Result<UninstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || openclaw::uninstall_openclaw(remove_config))
        .await
        .map_err(|e| e.to_string())?
}

// --- Bootstrap: target-aware environment detection and installation ---

#[tauri::command]
async fn bootstrap_detect(
    state: tauri::State<'_, ActiveTargetState>,
) -> Result<BootstrapStatus, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        let env: Environment = if target.is_protocol() {
            let val = target.protocol_call(method::ENVIRONMENT_DETECT, serde_json::json!({}))?;
            serde_json::from_value(val).map_err(|e| format!("deserialize: {}", e))?
        } else {
            detect::detect_environment()
        };
        Ok(bootstrap::assess(&env))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn bootstrap_install_node(
    state: tauri::State<'_, ActiveTargetState>,
) -> Result<NodeInstallResult, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        if target.is_protocol() {
            let val = target.protocol_call(method::NODE_INSTALL, serde_json::json!({}))?;
            serde_json::from_value(val).map_err(|e| format!("deserialize: {}", e))
        } else {
            Ok(node_install::install_node())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn bootstrap_install_openclaw(
    state: tauri::State<'_, ActiveTargetState>,
) -> Result<InstallResult, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        if target.is_protocol() {
            let val = target.protocol_call(method::OPENCLAW_INSTALL, serde_json::json!({}))?;
            serde_json::from_value(val).map_err(|e| format!("deserialize: {}", e))
        } else {
            openclaw::install_openclaw()
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn bootstrap_get_script(platform: String, arch: String) -> Result<String, String> {
    Ok(bootstrap::install_script(&platform, &arch))
}

#[tauri::command]
async fn bootstrap_get_cargo_script() -> Result<String, String> {
    Ok(bootstrap::cargo_install_script().to_string())
}

/// Start an SSH port-forward tunnel and connect to the remote serve via localhost.
/// Returns the local port to use for WebSocket connection.
#[tauri::command]
async fn ssh_start_tunnel(
    host: String,
    ssh_port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    key_path: Option<String>,
    remote_port: u16,
) -> Result<u16, String> {
    let local_port = remote_port; // forward same port number locally
    let params = ssh_tunnel::TunnelParams {
        host, ssh_port, username, auth_method, password, key_path,
        remote_port, local_port,
    };
    tauri::async_runtime::spawn_blocking(move || ssh_tunnel::start(&params))
        .await
        .map_err(|e| e.to_string())?
}

/// Stop any active SSH tunnel.
#[tauri::command]
async fn ssh_stop_tunnel() {
    ssh_tunnel::stop();
}

/// SSH into the VPS and (re)start clawsquire-serve as a background daemon.
/// Used when Connection refused is received (serve crashed / VPS rebooted).
#[tauri::command]
async fn ssh_restart_serve(
    host: String,
    ssh_port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    key_path: Option<String>,
    serve_port: u16,
    serve_token: String,
) -> Result<(), String> {
    let cfg = SshConfig { host, port: ssh_port, username, auth_method, password, key_path };
    tauri::async_runtime::spawn_blocking(move || {
        // Kill any stale serve process first
        let _ = clawsquire_core::ssh_bootstrap::ssh_exec(
            &cfg,
            "pkill -f clawsquire-serve 2>/dev/null; sleep 1",
        );
        // Start fresh; wait 3s then verify it's listening on the port
        let start_cmd = format!(
            "nohup $HOME/.clawsquire/clawsquire-serve --port {} --token {} > $HOME/.clawsquire/serve.log 2>&1 & sleep 3 && ss -tlnp 2>/dev/null | grep {} || netstat -tlnp 2>/dev/null | grep {}",
            serve_port, serve_token, serve_port, serve_port
        );
        let out = clawsquire_core::ssh_bootstrap::ssh_exec(&cfg, &start_cmd)?;
        // If neither ss nor netstat shows the port, serve may have failed to start
        if !out.contains(&serve_port.to_string()) {
            // Try reading the serve log for clues
            let log = clawsquire_core::ssh_bootstrap::ssh_exec(
                &cfg,
                "tail -5 $HOME/.clawsquire/serve.log 2>/dev/null || echo '(no log)'",
            ).unwrap_or_default();
            return Err(format!("serve did not start on port {}. Last log lines: {}", serve_port, log.trim()));
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Quick SSH connectivity test for the Add Instance form.
#[tauri::command]
async fn ssh_test_connection(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    key_path: Option<String>,
) -> Result<String, String> {
    let cfg = SshConfig {
        host,
        port,
        username,
        auth_method,
        password,
        key_path,
    };
    tauri::async_runtime::spawn_blocking(move || {
        ssh_bootstrap::test_connection(&cfg)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Run SSH bootstrap on a remote VPS. Emits "bootstrap-event" for each step.
/// Returns the final result with token/port on success.
#[tauri::command]
async fn bootstrap_ssh_start(
    app: tauri::AppHandle,
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    key_path: Option<String>,
) -> Result<BootstrapResult, String> {
    let cfg = SshConfig {
        host,
        port,
        username,
        auth_method,
        password,
        key_path,
    };

    tauri::async_runtime::spawn_blocking(move || {
        let result = ssh_bootstrap::run_bootstrap(&cfg, |event| {
            let _ = app.emit("bootstrap-event", &event);
        });
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_channel(state: tauri::State<'_, ActiveTargetState>, channel: String, token: String) -> Result<ChannelAddResult, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::add_channel_with(target.runner().as_ref(), &channel, &token)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_full_config() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let config_path = if let Ok(dir) = std::env::var("OPENCLAW_STATE_DIR") {
            std::path::PathBuf::from(dir)
        } else {
            dirs::home_dir()
                .unwrap_or_default()
                .join(constants::OPENCLAW_STATE_DIR_DEFAULT)
        }
        .join("openclaw.json");
        if !config_path.exists() {
            return Err("Config file not found. Is OpenClaw installed?".to_string());
        }
        std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_channels(state: tauri::State<'_, ActiveTargetState>) -> Result<Vec<ChannelInfo>, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::list_channels_with(target.runner().as_ref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_channel(state: tauri::State<'_, ActiveTargetState>, channel: String) -> Result<ChannelRemoveResult, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::remove_channel_with(target.runner().as_ref(), &channel)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cron_list(state: tauri::State<'_, ActiveTargetState>) -> Result<Vec<CronJob>, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::cron_list_with(target.runner().as_ref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cron_remove(state: tauri::State<'_, ActiveTargetState>, name: String) -> Result<CronRemoveResult, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::cron_remove_with(target.runner().as_ref(), &name)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cron_add(
    state: tauri::State<'_, ActiveTargetState>,
    name: String,
    every: String,
    message: String,
    channel: String,
    announce: bool,
) -> Result<CronAddResult, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::cron_add_with(target.runner().as_ref(), &name, &every, &message, &channel, announce)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn run_openclaw_cli(state: tauri::State<'_, ActiveTargetState>, args: Vec<String>) -> Result<CliOutput, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        openclaw::run_cli_with(target.runner().as_ref(), &refs)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn apply_safety_preset(state: tauri::State<'_, ActiveTargetState>, level: String) -> Result<SafetyApplyResult, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(openclaw::apply_safety_preset_with(target.runner().as_ref(), &level))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn agent_chat(state: tauri::State<'_, ActiveTargetState>, message: String) -> Result<AgentChatResult, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(openclaw::agent_chat_with(target.runner().as_ref(), &message))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn collect_feedback_info(state: tauri::State<'_, ActiveTargetState>) -> Result<FeedbackInfo, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(openclaw::collect_feedback_info_with(target.runner().as_ref()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn copy_screenshot_to_clipboard(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || openclaw::copy_screenshot_to_clipboard(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn search_community_issues(query: String) -> Result<SearchResponse, String> {
    tauri::async_runtime::spawn_blocking(move || community_search::search_issues(&query))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn smart_search(query: String, lang: String) -> Result<SmartSearchResponse, String> {
    tauri::async_runtime::spawn_blocking(move || community_search::smart_search(&query, &lang))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn setup_email_monitor(
    state: tauri::State<'_, ActiveTargetState>,
    telegram_token: String,
    email_address: String,
    check_interval: Option<String>,
) -> Result<EmailMonitorResult, String> {
    let target = state.get();
    let interval = check_interval.unwrap_or_else(|| "5m".to_string());
    Ok(tauri::async_runtime::spawn_blocking(move || {
        openclaw::setup_email_monitor_with(target.runner().as_ref(), &telegram_token, &email_address, &interval)
    })
    .await
    .unwrap_or_else(|e| EmailMonitorResult {
        channel_ok: false,
        cron_ok: false,
        cron_id: None,
        errors: vec![format!("Task failed: {}", e)],
    }))
}

#[tauri::command]
async fn generate_install_command(
    provider: Option<String>,
    channel: Option<String>,
    safety: Option<String>,
    no_start: Option<bool>,
) -> RemoteInstallCommand {
    remote::generate_install_command(
        provider.as_deref(),
        channel.as_deref(),
        safety.as_deref(),
        no_start.unwrap_or(false),
    )
}

#[tauri::command]
async fn list_instances() -> Vec<VpsInstance> {
    instances::list_instances()
}

#[tauri::command]
async fn add_instance(instance: VpsInstance) -> Result<VpsInstance, String> {
    instances::add_instance(instance)
}

#[tauri::command]
async fn update_instance(instance: VpsInstance) -> Result<VpsInstance, String> {
    instances::update_instance(instance)
}

#[tauri::command]
async fn delete_instance(id: String) -> Result<(), String> {
    instances::delete_instance(&id)
}

#[tauri::command]
async fn set_instance_serve(id: String, serve_port: u16, serve_token: Option<String>) -> Result<VpsInstance, String> {
    instances::set_instance_serve(&id, serve_port, serve_token.as_deref())
}

#[tauri::command]
async fn store_secret(key: String, value: String) -> secure_store::SecureStoreResult {
    tauri::async_runtime::spawn_blocking(move || secure_store::store_secret(&key, &value))
        .await
        .unwrap_or(secure_store::SecureStoreResult {
            success: false,
            error: Some("Task panicked".into()),
        })
}

#[tauri::command]
async fn get_secret(key: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || secure_store::get_secret(&key))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_secret(key: String) -> secure_store::SecureStoreResult {
    tauri::async_runtime::spawn_blocking(move || secure_store::delete_secret(&key))
        .await
        .unwrap_or(secure_store::SecureStoreResult {
            success: false,
            error: Some("Task panicked".into()),
        })
}


#[tauri::command]
async fn get_active_target(
    state: tauri::State<'_, ActiveTargetState>,
) -> Result<ActiveTargetInfo, String> {
    Ok(ActiveTargetInfo::from(&state.get()))
}

#[tauri::command]
async fn set_active_target(
    state: tauri::State<'_, ActiveTargetState>,
    mode: String,
    url: Option<String>,
    token: Option<String>,
    instance_id: Option<String>,
    host: Option<String>,
) -> Result<ActiveTargetInfo, String> {
    match mode.as_str() {
        "local" => {
            // Both ssh_tunnel::stop() (Mutex) and set_local() (RwLock write) are blocking.
            // Run them off the async executor to avoid starving Tauri's tokio runtime.
            let state_clone = state.inner().clone();
            tauri::async_runtime::spawn_blocking(move || {
                ssh_tunnel::stop();
                state_clone.set_local();
            })
            .await
            .map_err(|e| format!("spawn_blocking panicked: {e}"))?;
        }
        "protocol" => {
            let url = url.ok_or("url required for protocol mode")?;
            // token is optional in v0.3.1+: None = trust SSH tunnel; Some = legacy v0.3.0 compat
            let instance_id = instance_id.unwrap_or_default();
            let host = host.unwrap_or_default();
            // ProtocolRunner::connect blocks on WebSocket handshake; run it off the
            // async executor thread to avoid starving other Tauri commands.
            let state_clone = state.inner().clone();
            tauri::async_runtime::spawn_blocking(move || {
                state_clone.set_protocol(&url, token.as_deref(), instance_id, host)
            })
            .await
            .map_err(|e| format!("spawn_blocking panicked: {e}"))??;
        }
        _ => return Err(format!("Unknown mode: {}", mode)),
    }
    Ok(ActiveTargetInfo::from(&state.get()))
}

#[tauri::command]
async fn detect_imap_preset(email: String) -> Option<imap::ImapPreset> {
    imap::detect_imap_preset(&email)
}

#[tauri::command]
async fn save_imap_config(
    email: String,
    host: String,
    port: u16,
    tls: bool,
    password: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        imap::save_imap_config(&email, &host, port, tls, &password)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_version_info(state: tauri::State<'_, ActiveTargetState>) -> Result<VersionInfo, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(compat::get_version_info_with(target.runner().as_ref()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn check_for_updates() -> UpdateCheck {
    let version = env!("CARGO_PKG_VERSION").to_string();
    tauri::async_runtime::spawn_blocking(move || detect::check_for_updates(&version))
        .await
        .unwrap_or_else(|_| UpdateCheck {
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            latest_version: None,
            update_available: false,
            download_url: None,
            release_notes: None,
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ActiveTargetState::default())
        .setup(|app| {
            let show = MenuItemBuilder::with_id("show", "Show ClawSquire").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .tooltip("ClawSquire")
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            sidecar::spawn_sidecar(app);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_environment,
            config_get,
            config_set,
            run_doctor,
            daemon_status,
            create_backup,
            list_backups,
            restore_backup,
            diff_backups,
            daemon_stop,
            daemon_start,
            setup_provider,
            list_providers,
            list_models,
            check_llm_config,
            test_llm,
            test_llm_gateway,
            install_node,
            install_openclaw,
            uninstall_openclaw,
            bootstrap_detect,
            bootstrap_install_node,
            bootstrap_install_openclaw,
            bootstrap_get_script,
            bootstrap_get_cargo_script,
            ssh_test_connection,
            ssh_start_tunnel,
            ssh_stop_tunnel,
            ssh_restart_serve,
            bootstrap_ssh_start,
            add_channel,
            remove_channel,
            get_full_config,
            list_channels,
            cron_list,
            cron_remove,
            cron_add,
            collect_feedback_info,
            copy_screenshot_to_clipboard,
            agent_chat,
            run_openclaw_cli,
            apply_safety_preset,
            search_community_issues,
            smart_search,
            check_for_updates,
            get_version_info,
            generate_install_command,
            setup_email_monitor,
            list_instances,
            add_instance,
            update_instance,
            delete_instance,
            set_instance_serve,
            get_active_target,
            set_active_target,
            detect_imap_preset,
            save_imap_config,
            store_secret,
            get_secret,
            delete_secret,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            tauri::RunEvent::Exit => {
                sidecar::kill_sidecar(app_handle);
            }
            _ => {}
        });
}
