mod backup;
mod community_search;
mod compat;
mod constants;
mod detect;
mod doctor;
mod node_install;
mod openclaw;
mod remote;

use backup::{BackupEntry, DiffEntry};
use community_search::{SearchResponse, SmartSearchResponse};
use compat::VersionInfo;
use detect::{Environment, UpdateCheck};
use remote::RemoteInstallCommand;
use doctor::DoctorReport;
use node_install::NodeInstallResult;
use openclaw::{AgentChatResult, ChannelAddResult, ChannelInfo, FeedbackInfo, InstallResult, LlmConfigStatus, LlmTestResult, ModelInfo, ProviderInfo, SafetyApplyResult, UninstallResult};

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
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
