mod backup;
mod constants;
mod detect;
mod doctor;
mod openclaw;

use backup::{BackupEntry, DiffEntry};
use detect::Environment;
use doctor::DoctorReport;
use openclaw::{AgentChatResult, ChannelAddResult, ChannelInfo, FeedbackInfo, InstallResult, LlmConfigStatus, LlmTestResult, ModelInfo, ProviderInfo, SafetyApplyResult, UninstallResult};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
            install_openclaw,
            uninstall_openclaw,
            add_channel,
            get_full_config,
            list_channels,
            collect_feedback_info,
            agent_chat,
            apply_safety_preset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
