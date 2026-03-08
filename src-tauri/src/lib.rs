mod backup;
mod detect;
mod doctor;
mod openclaw;

use backup::{BackupEntry, DiffEntry};
use detect::Environment;
use doctor::DoctorReport;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
