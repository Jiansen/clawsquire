use crate::constants::{CLAWSQUIRE_DATA_DIR, OPENCLAW_CLI, OPENCLAW_NPM_PKG};
use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct DoctorCheckResult {
    pub name: String,
    pub status: CheckStatus,
    pub message: String,
    pub category: String,
    pub fix_hint: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CheckStatus {
    Pass,
    Warn,
    Fail,
}

#[derive(Debug, Serialize)]
pub struct DoctorReport {
    pub checks: Vec<DoctorCheckResult>,
    pub summary: DoctorSummary,
}

#[derive(Debug, Serialize)]
pub struct DoctorSummary {
    pub total: usize,
    pub passed: usize,
    pub warnings: usize,
    pub failures: usize,
}

pub fn run_structured_doctor() -> Result<DoctorReport, String> {
    let mut checks = Vec::new();

    // Run own checks first (these work even without openclaw installed)
    checks.extend(run_own_checks());

    // Then run openclaw doctor and parse output
    match run_openclaw_doctor() {
        Ok(openclaw_checks) => checks.extend(openclaw_checks),
        Err(e) => {
            checks.push(DoctorCheckResult {
                name: "OpenClaw Doctor".to_string(),
                status: CheckStatus::Fail,
                message: format!("Could not run openclaw doctor: {}", e),
                category: "installation".to_string(),
                fix_hint: Some("Make sure OpenClaw is installed and in your PATH.".to_string()),
            });
        }
    }

    let summary = DoctorSummary {
        total: checks.len(),
        passed: checks.iter().filter(|c| c.status == CheckStatus::Pass).count(),
        warnings: checks.iter().filter(|c| c.status == CheckStatus::Warn).count(),
        failures: checks.iter().filter(|c| c.status == CheckStatus::Fail).count(),
    };

    Ok(DoctorReport { checks, summary })
}

fn run_own_checks() -> Vec<DoctorCheckResult> {
    let mut checks = Vec::new();

    // Check: OpenClaw installed?
    let openclaw_output = Command::new(OPENCLAW_CLI).arg("--version").output();
    match openclaw_output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            checks.push(DoctorCheckResult {
                name: "OpenClaw Installed".to_string(),
                status: CheckStatus::Pass,
                message: format!("OpenClaw {}", version),
                category: "installation".to_string(),
                fix_hint: None,
            });
        }
        _ => {
            checks.push(DoctorCheckResult {
                name: "OpenClaw Installed".to_string(),
                status: CheckStatus::Fail,
                message: "OpenClaw is not installed or not in PATH.".to_string(),
                category: "installation".to_string(),
                fix_hint: Some(format!("Install with: npm install -g {}", OPENCLAW_NPM_PKG)),
            });
        }
    }

    // Check: Config file exists?
    let config_dir = crate::detect::detect_environment().config_dir;
    let config_path = std::path::Path::new(&config_dir).join("openclaw.json");
    if config_path.exists() {
        checks.push(DoctorCheckResult {
            name: "Config File".to_string(),
            status: CheckStatus::Pass,
            message: format!("Found at {}", config_path.display()),
            category: "config".to_string(),
            fix_hint: None,
        });
    } else {
        checks.push(DoctorCheckResult {
            name: "Config File".to_string(),
            status: CheckStatus::Warn,
            message: "No config file found. Run Setup to create one.".to_string(),
            category: "config".to_string(),
            fix_hint: Some("Use the Setup Assistant to configure OpenClaw.".to_string()),
        });
    }

    // Check: ClawSquire backup directory
    let backup_dir = dirs::home_dir()
        .unwrap_or_default()
        .join(CLAWSQUIRE_DATA_DIR)
        .join("backups");
    if backup_dir.exists() {
        let count = std::fs::read_dir(&backup_dir)
            .map(|r| r.filter(|e| e.is_ok()).count())
            .unwrap_or(0);
        checks.push(DoctorCheckResult {
            name: "Config Backups".to_string(),
            status: if count > 0 { CheckStatus::Pass } else { CheckStatus::Warn },
            message: format!("{} backup(s) found", count),
            category: "backup".to_string(),
            fix_hint: if count == 0 {
                Some("Create your first backup from the Backups page.".to_string())
            } else {
                None
            },
        });
    } else {
        checks.push(DoctorCheckResult {
            name: "Config Backups".to_string(),
            status: CheckStatus::Warn,
            message: "No backups yet.".to_string(),
            category: "backup".to_string(),
            fix_hint: Some("Create your first backup from the Backups page.".to_string()),
        });
    }

    checks
}

fn run_openclaw_doctor() -> Result<Vec<DoctorCheckResult>, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["doctor", "--non-interactive", "--yes"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw doctor: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(parse_doctor_output(&stdout))
}

fn parse_doctor_output(output: &str) -> Vec<DoctorCheckResult> {
    let mut checks = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Parse lines like: ✅ Check name ... description
        //                    ⚠️ Check name ... description
        //                    ❌ Check name ... description
        let (status, rest) = if trimmed.starts_with('✅') || trimmed.starts_with("✓") {
            (CheckStatus::Pass, trimmed.trim_start_matches(['✅', '✓', ' ']))
        } else if trimmed.starts_with('⚠') || trimmed.starts_with("⚠️") {
            (CheckStatus::Warn, trimmed.trim_start_matches(['⚠', '️', ' ']))
        } else if trimmed.starts_with('❌') || trimmed.starts_with("✗") {
            (CheckStatus::Fail, trimmed.trim_start_matches(['❌', '✗', ' ']))
        } else {
            continue;
        };

        let rest = rest.trim();
        let (name, message) = if let Some(pos) = rest.find("  ") {
            (rest[..pos].trim().to_string(), rest[pos..].trim().to_string())
        } else {
            (rest.to_string(), String::new())
        };

        let category = categorize_check(&name);

        checks.push(DoctorCheckResult {
            name,
            status,
            message,
            category,
            fix_hint: None,
        });
    }

    checks
}

fn categorize_check(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("version") || lower.contains("install") || lower.contains("node") {
        "installation".to_string()
    } else if lower.contains("gateway") || lower.contains("daemon") || lower.contains("port") {
        "gateway".to_string()
    } else if lower.contains("security") || lower.contains("auth") || lower.contains("token")
        || lower.contains("sandbox") || lower.contains("permission")
    {
        "security".to_string()
    } else {
        "config".to_string()
    }
}
