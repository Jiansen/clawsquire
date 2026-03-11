use crate::constants::{CLAWSQUIRE_DATA_DIR, OPENCLAW_CONFIG_FILENAME};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupEntry {
    pub id: String,
    pub label: String,
    pub timestamp: String,
    pub size_bytes: u64,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct DiffEntry {
    pub op: String,
    pub path: String,
    pub old_value: Option<serde_json::Value>,
    pub new_value: Option<serde_json::Value>,
}

fn backup_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(CLAWSQUIRE_DATA_DIR)
        .join("backups")
}

fn config_path() -> PathBuf {
    let env = crate::detect::detect_environment();
    PathBuf::from(&env.config_dir).join(OPENCLAW_CONFIG_FILENAME)
}

pub fn create_backup_with(
    label: Option<&str>,
    remote_tag: Option<&str>,
    prefetched_config: Option<String>,
) -> Result<BackupEntry, String> {
    let config_content = prefetched_config;

    let dir = if let Some(tag) = remote_tag {
        backup_dir().join(format!("remote-{}", tag))
    } else {
        backup_dir()
    };
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create backup directory: {}", e))?;

    let now = chrono_utc_now();
    let filename = format!("{}.json", now.replace(':', "-"));
    let dest = dir.join(&filename);

    if let Some(content) = config_content {
        fs::write(&dest, &content).map_err(|e| format!("Failed to write backup: {}", e))?;
    } else {
        let cfg_path = config_path();
        if !cfg_path.exists() {
            return Err("No OpenClaw config file found to back up.".to_string());
        }
        fs::copy(&cfg_path, &dest).map_err(|e| format!("Failed to copy config: {}", e))?;
    }

    let meta = fs::metadata(&dest).map_err(|e| format!("Cannot read backup metadata: {}", e))?;
    let user_label = label.unwrap_or("").to_string();

    let entry = BackupEntry {
        id: filename.trim_end_matches(".json").to_string(),
        label: if user_label.is_empty() {
            format!("Backup {}", now)
        } else {
            user_label
        },
        timestamp: now,
        size_bytes: meta.len(),
        path: dest.to_string_lossy().to_string(),
    };

    // Write metadata alongside the backup
    let meta_path = dir.join(format!("{}.meta.json", entry.id));
    let meta_json = serde_json::to_string_pretty(&entry)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
    fs::write(&meta_path, meta_json)
        .map_err(|e| format!("Failed to write metadata: {}", e))?;

    Ok(entry)
}

#[allow(dead_code)]
pub fn create_backup(label: Option<&str>) -> Result<BackupEntry, String> {
    create_backup_with(label, None, None)
}

#[allow(dead_code)]
pub fn list_backups() -> Result<Vec<BackupEntry>, String> {
    list_backups_for(None)
}

pub fn list_backups_for(remote_tag: Option<&str>) -> Result<Vec<BackupEntry>, String> {
    let dir = if let Some(tag) = remote_tag {
        backup_dir().join(format!("remote-{}", tag))
    } else {
        backup_dir()
    };
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(&dir).map_err(|e| format!("Cannot read backup dir: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Cannot read entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if path.to_string_lossy().contains(".meta.") {
            continue;
        }

        let filename = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let meta_path = dir.join(format!("{}.meta.json", filename));
        if let Ok(meta_str) = fs::read_to_string(&meta_path) {
            if let Ok(meta) = serde_json::from_str::<BackupEntry>(&meta_str) {
                entries.push(meta);
                continue;
            }
        }

        // Fallback: construct from file info
        let meta = fs::metadata(&path).ok();
        entries.push(BackupEntry {
            id: filename.clone(),
            label: format!("Backup {}", filename),
            timestamp: filename.replace('-', ":").chars().take(19).collect(),
            size_bytes: meta.map(|m| m.len()).unwrap_or(0),
            path: path.to_string_lossy().to_string(),
        });
    }

    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

pub fn restore_backup(id: &str) -> Result<(), String> {
    let backup_path = backup_dir().join(format!("{}.json", id));
    if !backup_path.exists() {
        return Err(format!("Backup '{}' not found.", id));
    }

    let cfg_path = config_path();

    // Auto-backup current config before restoring
    if cfg_path.exists() {
        create_backup(Some("Auto-backup before restore"))?;
    }

    fs::copy(&backup_path, &cfg_path)
        .map_err(|e| format!("Failed to restore config: {}", e))?;

    Ok(())
}

pub fn diff_backups(id1: &str, id2: Option<&str>) -> Result<Vec<DiffEntry>, String> {
    let path1 = backup_dir().join(format!("{}.json", id1));
    if !path1.exists() {
        return Err(format!("Backup '{}' not found.", id1));
    }

    let path2 = if let Some(id) = id2 {
        backup_dir().join(format!("{}.json", id))
    } else {
        config_path()
    };

    if !path2.exists() {
        return Err("Comparison target not found.".to_string());
    }

    let json1 = read_json_file(&path1)?;
    let json2 = read_json_file(&path2)?;

    Ok(compute_diff(&json1, &json2, ""))
}

fn read_json_file(path: &Path) -> Result<serde_json::Value, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Cannot read {}: {}", path.display(), e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON in {}: {}", path.display(), e))
}

fn compute_diff(
    old: &serde_json::Value,
    new: &serde_json::Value,
    prefix: &str,
) -> Vec<DiffEntry> {
    let mut diffs = Vec::new();

    match (old, new) {
        (serde_json::Value::Object(a), serde_json::Value::Object(b)) => {
            for (key, val_a) in a {
                let path = if prefix.is_empty() {
                    key.clone()
                } else {
                    format!("{}.{}", prefix, key)
                };
                if let Some(val_b) = b.get(key) {
                    diffs.extend(compute_diff(val_a, val_b, &path));
                } else {
                    diffs.push(DiffEntry {
                        op: "remove".to_string(),
                        path,
                        old_value: Some(val_a.clone()),
                        new_value: None,
                    });
                }
            }
            for (key, val_b) in b {
                if !a.contains_key(key) {
                    let path = if prefix.is_empty() {
                        key.clone()
                    } else {
                        format!("{}.{}", prefix, key)
                    };
                    diffs.push(DiffEntry {
                        op: "add".to_string(),
                        path,
                        old_value: None,
                        new_value: Some(val_b.clone()),
                    });
                }
            }
        }
        _ => {
            if old != new {
                diffs.push(DiffEntry {
                    op: "replace".to_string(),
                    path: prefix.to_string(),
                    old_value: Some(old.clone()),
                    new_value: Some(new.clone()),
                });
            }
        }
    }

    diffs
}

fn chrono_utc_now() -> String {
    // Use system time to generate UTC ISO 8601 timestamp
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Simple date calculation (good enough for timestamps)
    let (year, month, day) = days_to_ymd(days as i64);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

fn days_to_ymd(mut days: i64) -> (i64, u32, u32) {
    days += 719468; // shift to March 1, year 0
    let era = if days >= 0 { days } else { days - 146096 } / 146097;
    let doe = (days - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}
