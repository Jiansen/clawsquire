use crate::constants::{OPENCLAW_CLI, OPENCLAW_NPM_PKG, OPENCLAW_STATE_DIR_DEFAULT};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct DaemonStatus {
    pub running: bool,
    pub pid: Option<u32>,
}

pub fn config_get(path: &str) -> Result<String, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["config", "get", path, "--json"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub fn config_set(path: &str, value: &str) -> Result<(), String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["config", "set", path, value, "--json"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub fn daemon_status() -> Result<DaemonStatus, String> {
    let output = match Command::new(OPENCLAW_CLI)
        .args(["daemon", "status"])
        .output()
    {
        Ok(o) => o,
        Err(_) => return Ok(DaemonStatus { running: false, pid: None }),
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
    let running = stdout.contains("running") && !stdout.contains("not running") && !stdout.contains("stopped");

    Ok(DaemonStatus { running, pid: None })
}

pub fn daemon_stop() -> Result<String, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["daemon", "stop"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn daemon_start() -> Result<String, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["daemon", "start"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[derive(Debug, Serialize)]
pub struct UninstallResult {
    pub daemon_stopped: bool,
    pub npm_uninstalled: bool,
    pub config_removed: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct InstallResult {
    pub success: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

pub fn install_openclaw() -> Result<InstallResult, String> {
    let pkg = format!("{}@latest", OPENCLAW_NPM_PKG);
    let output = Command::new("npm")
        .args(["install", "-g", &pkg])
        .output()
        .map_err(|e| format!("Failed to run npm: {}", e))?;

    if output.status.success() {
        let version = Command::new(OPENCLAW_CLI)
            .arg("--version")
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    None
                }
            });

        Ok(InstallResult {
            success: true,
            version,
            error: None,
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(InstallResult {
            success: false,
            version: None,
            error: Some(stderr),
        })
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct ProviderInfo {
    pub id: String,
    pub model_count: usize,
    pub sample_models: Vec<String>,
    pub priority: u8,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub input: String,
    pub context_window: String,
}

const PRIORITY_PROVIDERS: &[&str] = &[
    "openai", "anthropic", "google", "openai-codex", "opencode",
    "xai", "mistral", "groq", "cerebras",
];

pub fn list_providers() -> Result<Vec<ProviderInfo>, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["models", "list", "--all"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut providers: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    for line in stdout.lines().skip(1) {
        let model_id = line.split_whitespace().next().unwrap_or("").to_string();
        if let Some(slash) = model_id.find('/') {
            let provider = model_id[..slash].to_string();
            let model_name = model_id[slash + 1..].to_string();
            providers.entry(provider).or_default().push(model_name);
        }
    }

    let mut result: Vec<ProviderInfo> = providers
        .into_iter()
        .map(|(id, models)| {
            let priority = PRIORITY_PROVIDERS
                .iter()
                .position(|&p| p == id)
                .map(|i| i as u8)
                .unwrap_or(100);
            let sample_models: Vec<String> = models.iter().take(5).cloned().collect();
            ProviderInfo {
                id,
                model_count: models.len(),
                sample_models,
                priority,
            }
        })
        .collect();

    result.sort_by_key(|p| (p.priority, p.id.clone()));
    Ok(result)
}

pub fn list_models(provider: &str) -> Result<Vec<ModelInfo>, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["models", "list", "--all"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let prefix = format!("{}/", provider);

    let models: Vec<ModelInfo> = stdout
        .lines()
        .skip(1)
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 && parts[0].starts_with(&prefix) {
                Some(ModelInfo {
                    id: parts[0].to_string(),
                    input: parts[1].to_string(),
                    context_window: parts[2].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(models)
}

#[derive(Debug, Serialize)]
pub struct LlmConfigStatus {
    pub has_provider: bool,
    pub provider_name: Option<String>,
}

pub fn check_llm_config() -> LlmConfigStatus {
    let env_checks = [
        ("OPENAI_API_KEY", "openai"),
        ("ANTHROPIC_API_KEY", "anthropic"),
        ("GOOGLE_API_KEY", "google"),
        ("DEEPSEEK_API_KEY", "deepseek"),
        ("XAI_API_KEY", "xai"),
    ];

    for (env_key, provider) in env_checks {
        if std::env::var(env_key)
            .map(|v| !v.is_empty())
            .unwrap_or(false)
        {
            return LlmConfigStatus {
                has_provider: true,
                provider_name: Some(provider.to_string()),
            };
        }
    }

    if let Ok(output) = Command::new(OPENCLAW_CLI)
        .args(["config", "get", "models.providers", "--json"])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(stdout.trim()) {
                if let Some(obj) = val.as_object() {
                    for (provider, config) in obj {
                        if let Some(key) =
                            config.get("apiKey").and_then(|v| v.as_str())
                        {
                            if !key.is_empty() {
                                return LlmConfigStatus {
                                    has_provider: true,
                                    provider_name: Some(provider.clone()),
                                };
                            }
                        }
                    }
                }
            }
        }
    }

    LlmConfigStatus {
        has_provider: false,
        provider_name: None,
    }
}

#[derive(Debug, Serialize)]
pub struct LlmTestResult {
    pub success: bool,
    pub response: Option<String>,
    pub error: Option<String>,
    pub model: Option<String>,
}

pub fn test_llm(provider: &str, api_key: &str) -> LlmTestResult {
    let (url, model, auth) = match provider {
        "openai" => (
            "https://api.openai.com/v1/chat/completions",
            "gpt-4o-mini",
            format!("Bearer {}", api_key),
        ),
        "anthropic" => return test_anthropic(api_key),
        "google" | "google-gemini-cli" => return test_google(api_key),
        "deepseek" => (
            "https://api.deepseek.com/chat/completions",
            "deepseek-chat",
            format!("Bearer {}", api_key),
        ),
        "groq" => (
            "https://api.groq.com/openai/v1/chat/completions",
            "llama-3.3-70b-versatile",
            format!("Bearer {}", api_key),
        ),
        "xai" => (
            "https://api.x.ai/v1/chat/completions",
            "grok-2-latest",
            format!("Bearer {}", api_key),
        ),
        "mistral" => (
            "https://api.mistral.ai/v1/chat/completions",
            "mistral-small-latest",
            format!("Bearer {}", api_key),
        ),
        "zai" => (
            "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            "glm-4-flash",
            format!("Bearer {}", api_key),
        ),
        "ollama" => (
            "http://localhost:11434/v1/chat/completions",
            "llama3.2",
            String::new(),
        ),
        _ => {
            return LlmTestResult {
                success: false,
                response: None,
                error: Some(format!("Provider '{}' not yet supported for testing", provider)),
                model: None,
            }
        }
    };

    test_openai_compat(url, model, &auth)
}

fn test_openai_compat(url: &str, model: &str, auth: &str) -> LlmTestResult {
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "Hello! Introduce yourself in one sentence."}],
        "max_tokens": 100
    })
    .to_string();

    let mut cmd = Command::new("curl");
    cmd.args([
        "-s",
        "--max-time",
        "15",
        "-X",
        "POST",
        url,
        "-H",
        "Content-Type: application/json",
    ]);
    if !auth.is_empty() {
        cmd.args(["-H", &format!("Authorization: {}", auth)]);
    }
    cmd.args(["-d", &body]);

    match cmd.output() {
        Ok(o) => parse_openai_response(&String::from_utf8_lossy(&o.stdout), model),
        Err(e) => LlmTestResult {
            success: false,
            response: None,
            error: Some(format!("curl failed: {}", e)),
            model: Some(model.to_string()),
        },
    }
}

fn test_anthropic(api_key: &str) -> LlmTestResult {
    let model = "claude-3-haiku-20240307";
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "Hello! Introduce yourself in one sentence."}],
        "max_tokens": 100
    })
    .to_string();

    match Command::new("curl")
        .args([
            "-s",
            "--max-time",
            "15",
            "-X",
            "POST",
            "https://api.anthropic.com/v1/messages",
            "-H",
            "Content-Type: application/json",
            "-H",
            &format!("x-api-key: {}", api_key),
            "-H",
            "anthropic-version: 2023-06-01",
            "-d",
            &body,
        ])
        .output()
    {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                if let Some(err) = json.get("error") {
                    return LlmTestResult {
                        success: false,
                        response: None,
                        error: Some(err.to_string()),
                        model: Some(model.to_string()),
                    };
                }
                if let Some(text) = json
                    .get("content")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("text"))
                    .and_then(|t| t.as_str())
                {
                    return LlmTestResult {
                        success: true,
                        response: Some(text.to_string()),
                        error: None,
                        model: Some(model.to_string()),
                    };
                }
            }
            LlmTestResult {
                success: false,
                response: None,
                error: Some(truncate_resp(&stdout)),
                model: Some(model.to_string()),
            }
        }
        Err(e) => LlmTestResult {
            success: false,
            response: None,
            error: Some(format!("curl failed: {}", e)),
            model: Some(model.to_string()),
        },
    }
}

fn test_google(api_key: &str) -> LlmTestResult {
    let model = "gemini-2.0-flash";
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );
    let body = serde_json::json!({
        "contents": [{"parts": [{"text": "Hello! Introduce yourself in one sentence."}]}]
    })
    .to_string();

    match Command::new("curl")
        .args([
            "-s",
            "--max-time",
            "15",
            "-X",
            "POST",
            &url,
            "-H",
            "Content-Type: application/json",
            "-d",
            &body,
        ])
        .output()
    {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                if let Some(err) = json.get("error") {
                    return LlmTestResult {
                        success: false,
                        response: None,
                        error: Some(err.to_string()),
                        model: Some(model.to_string()),
                    };
                }
                if let Some(text) = json
                    .get("candidates")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("content"))
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.get(0))
                    .and_then(|p| p.get("text"))
                    .and_then(|t| t.as_str())
                {
                    return LlmTestResult {
                        success: true,
                        response: Some(text.to_string()),
                        error: None,
                        model: Some(model.to_string()),
                    };
                }
            }
            LlmTestResult {
                success: false,
                response: None,
                error: Some(truncate_resp(&stdout)),
                model: Some(model.to_string()),
            }
        }
        Err(e) => LlmTestResult {
            success: false,
            response: None,
            error: Some(format!("curl failed: {}", e)),
            model: Some(model.to_string()),
        },
    }
}

fn parse_openai_response(stdout: &str, model: &str) -> LlmTestResult {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(stdout) {
        if let Some(err) = json.get("error") {
            return LlmTestResult {
                success: false,
                response: None,
                error: Some(err.to_string()),
                model: Some(model.to_string()),
            };
        }
        if let Some(content) = json
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
        {
            return LlmTestResult {
                success: true,
                response: Some(content.to_string()),
                error: None,
                model: Some(model.to_string()),
            };
        }
    }
    LlmTestResult {
        success: false,
        response: None,
        error: Some(truncate_resp(stdout)),
        model: Some(model.to_string()),
    }
}

fn truncate_resp(s: &str) -> String {
    if s.len() > 300 {
        format!("{}...", &s[..300])
    } else {
        s.to_string()
    }
}

pub fn uninstall_openclaw(remove_config: bool) -> Result<UninstallResult, String> {
    let mut result = UninstallResult {
        daemon_stopped: false,
        npm_uninstalled: false,
        config_removed: false,
        errors: Vec::new(),
    };

    match Command::new(OPENCLAW_CLI).args(["daemon", "stop"]).output() {
        Ok(o) if o.status.success() => result.daemon_stopped = true,
        Ok(o) => {
            let msg = String::from_utf8_lossy(&o.stderr).trim().to_string();
            if !msg.is_empty() {
                result.errors.push(format!("daemon stop: {}", msg));
            }
            result.daemon_stopped = true;
        }
        Err(e) => result.errors.push(format!("daemon stop: {}", e)),
    }

    match Command::new("npm")
        .args(["uninstall", "-g", OPENCLAW_NPM_PKG])
        .output()
    {
        Ok(o) if o.status.success() => result.npm_uninstalled = true,
        Ok(o) => {
            let msg = String::from_utf8_lossy(&o.stderr).trim().to_string();
            result.errors.push(format!("npm uninstall: {}", msg));
        }
        Err(e) => result.errors.push(format!("npm uninstall: {}", e)),
    }

    if remove_config {
        let config_dir = if let Ok(dir) = std::env::var("OPENCLAW_STATE_DIR") {
            std::path::PathBuf::from(dir)
        } else {
            dirs::home_dir().unwrap_or_default().join(OPENCLAW_STATE_DIR_DEFAULT)
        };
        if config_dir.exists() {
            match std::fs::remove_dir_all(&config_dir) {
                Ok(()) => result.config_removed = true,
                Err(e) => result.errors.push(format!("remove config: {}", e)),
            }
        } else {
            result.config_removed = true;
        }
    }

    Ok(result)
}
