mod active_target;
mod backup;
mod cli_runner;
mod community_search;
mod compat;
mod constants;
mod detect;
mod doctor;
mod imap;
mod instances;
mod node_install;
mod openclaw;
mod remote;
mod secure_store;
mod ssh;
mod util;

use active_target::{ActiveTargetInfo, ActiveTargetState};
use backup::{BackupEntry, DiffEntry};
use community_search::{SearchResponse, SmartSearchResponse};
use compat::VersionInfo;
use detect::{Environment, UpdateCheck};
use doctor::DoctorReport;
use instances::VpsInstance;
use node_install::NodeInstallResult;
use openclaw::{AgentChatResult, ChannelAddResult, ChannelInfo, ChannelRemoveResult, CliOutput, CronAddResult, CronJob, CronRemoveResult, EmailMonitorResult, FeedbackInfo, InstallResult, LlmConfigStatus, LlmTestResult, ModelInfo, ProviderInfo, SafetyApplyResult, UninstallResult};
use remote::RemoteInstallCommand;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};


#[tauri::command]
async fn get_environment(state: tauri::State<'_, ActiveTargetState>) -> Result<Environment, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        match &target {
            active_target::Target::Local => Ok(detect::detect_environment()),
            active_target::Target::Vps(_) => {
                let runner = target.runner();
                let r = runner.as_ref();
                let (installed, version) = match r.run(&["--version"]) {
                    Ok(o) if o.success => (true, Some(o.stdout.trim().to_string())),
                    _ => (false, None),
                };
                Ok(Environment {
                    openclaw_installed: installed,
                    openclaw_version: version,
                    openclaw_path: Some("(remote)".into()),
                    npm_installed: true,
                    npm_version: None,
                    node_version: None,
                    config_dir: "(remote)".into(),
                    platform: "linux".into(),
                })
            }
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
async fn create_backup(state: tauri::State<'_, ActiveTargetState>, label: Option<String>) -> Result<BackupEntry, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        let (remote_tag, prefetched) = match &target {
            active_target::Target::Vps(conn) => {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| format!("Runtime error: {}", e))?;
                let result = rt.block_on(crate::ssh::ssh_exec(
                    &conn.host,
                    conn.port,
                    &conn.username,
                    conn.password.as_deref(),
                    conn.key_path.as_deref(),
                    "cat ~/.openclaw/openclaw.json",
                ));
                if let Some(err) = result.error {
                    return Err(format!("SSH error: {}", err));
                }
                if !result.success {
                    return Err(format!("Remote config read failed: {}", result.stderr));
                }
                (Some(conn.instance_id.clone()), Some(result.stdout))
            }
            _ => (None, None),
        };
        backup::create_backup_with(label.as_deref(), remote_tag.as_deref(), prefetched)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_backups(state: tauri::State<'_, ActiveTargetState>) -> Result<Vec<BackupEntry>, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        let remote_tag = match &target {
            active_target::Target::Vps(conn) => Some(conn.instance_id.as_str()),
            _ => None,
        };
        backup::list_backups_for(remote_tag)
    })
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
async fn get_full_config(state: tauri::State<'_, ActiveTargetState>) -> Result<String, String> {
    let target = state.get();
    tauri::async_runtime::spawn_blocking(move || {
        match &target {
            active_target::Target::Local => {
                let config_path = if let Ok(dir) = std::env::var("OPENCLAW_STATE_DIR") {
                    std::path::PathBuf::from(dir)
                } else {
                    dirs::home_dir()
                        .unwrap_or_default()
                        .join(crate::constants::OPENCLAW_STATE_DIR_DEFAULT)
                }
                .join("openclaw.json");
                if !config_path.exists() {
                    return Err("Config file not found. Is OpenClaw installed?".to_string());
                }
                std::fs::read_to_string(&config_path)
                    .map_err(|e| format!("Failed to read config: {}", e))
            }
            active_target::Target::Vps(conn) => {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| format!("Runtime error: {}", e))?;
                let result = rt.block_on(crate::ssh::ssh_exec(
                    &conn.host,
                    conn.port,
                    &conn.username,
                    conn.password.as_deref(),
                    conn.key_path.as_deref(),
                    "cat ~/.openclaw/openclaw.json",
                ));
                if let Some(err) = result.error {
                    Err(format!("SSH error: {}", err))
                } else if result.success {
                    Ok(result.stdout)
                } else {
                    Err(result.stderr)
                }
            }
        }
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
async fn ssh_test_connection(
    host: String,
    port: Option<u16>,
    username: String,
    password: Option<String>,
    key_path: Option<String>,
) -> ssh::SshExecResult {
    ssh::ssh_exec(
        &host,
        port.unwrap_or(22),
        &username,
        password.as_deref(),
        key_path.as_deref(),
        "echo ok",
    )
    .await
}

#[tauri::command]
async fn ssh_run_command(
    host: String,
    port: Option<u16>,
    username: String,
    password: Option<String>,
    key_path: Option<String>,
    command: String,
) -> ssh::SshExecResult {
    ssh::ssh_exec(
        &host,
        port.unwrap_or(22),
        &username,
        password.as_deref(),
        key_path.as_deref(),
        &command,
    )
    .await
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

#[derive(serde::Serialize)]
pub struct DeployResult {
    pub test_ok: bool,
    pub install_output: Option<ssh::SshExecResult>,
    pub errors: Vec<String>,
}

#[tauri::command]
async fn deploy_to_vps(
    host: String,
    port: Option<u16>,
    username: String,
    password: Option<String>,
    key_path: Option<String>,
    provider: Option<String>,
    channel: Option<String>,
    safety: Option<String>,
) -> DeployResult {
    let p = port.unwrap_or(22);

    let test = ssh::ssh_exec(
        &host, p, &username,
        password.as_deref(), key_path.as_deref(),
        "echo ok",
    ).await;

    if !test.success {
        return DeployResult {
            test_ok: false,
            install_output: None,
            errors: vec![test.error.unwrap_or_else(|| "SSH connection failed".into())],
        };
    }

    let cmd = remote::generate_install_command(
        provider.as_deref(),
        channel.as_deref(),
        safety.as_deref(),
        false,
    );

    let install = ssh::ssh_exec(
        &host, p, &username,
        password.as_deref(), key_path.as_deref(),
        &cmd.command,
    ).await;

    let mut errors = Vec::new();
    if !install.success {
        if let Some(ref e) = install.error {
            errors.push(e.clone());
        }
    }

    DeployResult {
        test_ok: true,
        install_output: Some(install),
        errors,
    }
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
    instance_id: Option<String>,
    password: Option<String>,
) -> Result<ActiveTargetInfo, String> {
    match mode.as_str() {
        "local" => {
            state.set_local();
        }
        "vps" => {
            let id = instance_id.ok_or("instance_id required for VPS mode")?;
            state.set_vps(&id, password)?;
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
            ssh_test_connection,
            ssh_run_command,
            list_instances,
            add_instance,
            update_instance,
            delete_instance,
            deploy_to_vps,
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
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
