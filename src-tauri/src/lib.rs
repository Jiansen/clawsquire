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

use backup::{BackupEntry, DiffEntry};
use community_search::{SearchResponse, SmartSearchResponse};
use compat::VersionInfo;
use detect::{Environment, UpdateCheck};
use doctor::DoctorReport;
use instances::VpsInstance;
use node_install::NodeInstallResult;
use openclaw::{AgentChatResult, ChannelAddResult, ChannelInfo, EmailMonitorResult, FeedbackInfo, InstallResult, LlmConfigStatus, LlmTestResult, ModelInfo, ProviderInfo, SafetyApplyResult, UninstallResult};
use remote::RemoteInstallCommand;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

#[tauri::command]
async fn get_environment() -> Environment {
    tauri::async_runtime::spawn_blocking(detect::detect_environment)
        .await
        .unwrap_or_else(|_| detect::detect_environment())
}

#[tauri::command]
async fn config_get(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || openclaw::config_get(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn config_set(path: String, value: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || openclaw::config_set(&path, &value))
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
async fn daemon_status() -> Result<openclaw::DaemonStatus, String> {
    tauri::async_runtime::spawn_blocking(openclaw::daemon_status)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_backup(label: Option<String>) -> Result<BackupEntry, String> {
    tauri::async_runtime::spawn_blocking(move || backup::create_backup(label.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_backups() -> Result<Vec<BackupEntry>, String> {
    tauri::async_runtime::spawn_blocking(backup::list_backups)
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
async fn daemon_stop() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(openclaw::daemon_stop)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn daemon_start() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(openclaw::daemon_start)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn setup_provider(provider: String, api_key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || openclaw::setup_provider(&provider, &api_key))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_providers() -> Result<Vec<ProviderInfo>, String> {
    tauri::async_runtime::spawn_blocking(openclaw::list_providers)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_models(provider: String) -> Result<Vec<ModelInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || openclaw::list_models(&provider))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn check_llm_config() -> Result<LlmConfigStatus, String> {
    tauri::async_runtime::spawn_blocking(openclaw::check_llm_config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_llm(provider: String, api_key: String) -> Result<LlmTestResult, String> {
    tauri::async_runtime::spawn_blocking(move || openclaw::test_llm(&provider, &api_key))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_llm_gateway() -> Result<openclaw::LlmTestResult, String> {
    tauri::async_runtime::spawn_blocking(openclaw::test_llm_via_gateway)
        .await
        .map_err(|e| e.to_string())
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
async fn add_channel(channel: String, token: String) -> Result<ChannelAddResult, String> {
    tauri::async_runtime::spawn_blocking(move || openclaw::add_channel(&channel, &token))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_full_config() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(openclaw::get_full_config)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_channels() -> Result<Vec<ChannelInfo>, String> {
    tauri::async_runtime::spawn_blocking(openclaw::list_channels)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn apply_safety_preset(level: String) -> Result<SafetyApplyResult, String> {
    tauri::async_runtime::spawn_blocking(move || openclaw::apply_safety_preset(&level))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn agent_chat(message: String) -> Result<AgentChatResult, String> {
    tauri::async_runtime::spawn_blocking(move || openclaw::agent_chat(&message))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn collect_feedback_info() -> Result<FeedbackInfo, String> {
    tauri::async_runtime::spawn_blocking(openclaw::collect_feedback_info)
        .await
        .map_err(|e| e.to_string())
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
    telegram_token: String,
    email_address: String,
    check_interval: Option<String>,
) -> EmailMonitorResult {
    let interval = check_interval.unwrap_or_else(|| "5m".to_string());
    tauri::async_runtime::spawn_blocking(move || {
        openclaw::setup_email_monitor(&telegram_token, &email_address, &interval)
    })
    .await
    .unwrap_or_else(|e| EmailMonitorResult {
        channel_ok: false,
        cron_ok: false,
        cron_id: None,
        errors: vec![format!("Task failed: {}", e)],
    })
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
async fn get_version_info() -> VersionInfo {
    tauri::async_runtime::spawn_blocking(compat::get_version_info)
        .await
        .unwrap_or_else(|_| compat::get_version_info())
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
            get_full_config,
            list_channels,
            collect_feedback_info,
            copy_screenshot_to_clipboard,
            agent_chat,
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
