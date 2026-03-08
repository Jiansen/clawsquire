mod detect;
mod openclaw;

use detect::Environment;

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
fn run_doctor() -> Result<String, String> {
    openclaw::run_doctor()
}

#[tauri::command]
fn daemon_status() -> Result<openclaw::DaemonStatus, String> {
    openclaw::daemon_status()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
