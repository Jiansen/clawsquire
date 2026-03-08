mod backup;
mod constants;
mod detect;
mod doctor;
mod openclaw;

use backup::{BackupEntry, DiffEntry};
use detect::Environment;
use doctor::DoctorReport;
use openclaw::{InstallResult, LlmConfigStatus, LlmTestResult, ModelInfo, ProviderInfo, UninstallResult};

#[tauri::command]
fn get_environment() -> Environment {
    detect::detect_environment()
}

#[tauri::command]
fn config_get(path: String) -> Result<String, String> {
    openclaw::config_get(&path)
}

#[tauri::command]
fn config_set(path: String, value: String) -> Result<(), String> {
    openclaw::config_set(&path, &value)
}

#[tauri::command]
fn run_doctor() -> Result<DoctorReport, String> {
    doctor::run_structured_doctor()
}

#[tauri::command]
fn daemon_status() -> Result<openclaw::DaemonStatus, String> {
    openclaw::daemon_status()
}

#[tauri::command]
fn create_backup(label: Option<String>) -> Result<BackupEntry, String> {
    backup::create_backup(label.as_deref())
}

#[tauri::command]
fn list_backups() -> Result<Vec<BackupEntry>, String> {
    backup::list_backups()
}

#[tauri::command]
fn restore_backup(id: String) -> Result<(), String> {
    backup::restore_backup(&id)
}

#[tauri::command]
fn diff_backups(id1: String, id2: Option<String>) -> Result<Vec<DiffEntry>, String> {
    backup::diff_backups(&id1, id2.as_deref())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
