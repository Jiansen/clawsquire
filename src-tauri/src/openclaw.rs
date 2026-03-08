use crate::constants::{DEFAULT_GATEWAY_PORT, OPENCLAW_CLI, OPENCLAW_NPM_PKG, OPENCLAW_STATE_DIR_DEFAULT};
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
    let json_value =
        serde_json::to_string(value).unwrap_or_else(|_| format!("\"{}\"", value));
    let output = Command::new(OPENCLAW_CLI)
        .args(["config", "set", path, &json_value, "--json"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn config_set_raw_json(path: &str, json_value: &str) -> Result<(), String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["config", "set", path, json_value, "--json"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn provider_base_url(provider: &str) -> Option<&'static str> {
    match provider {
        "openai" => Some("https://api.openai.com/v1"),
        "anthropic" => Some("https://api.anthropic.com"),
        "google" => Some("https://generativelanguage.googleapis.com/v1beta"),
        "deepseek" => Some("https://api.deepseek.com/v1"),
        "groq" => Some("https://api.groq.com/openai/v1"),
        "xai" => Some("https://api.x.ai/v1"),
        "mistral" => Some("https://api.mistral.ai/v1"),
        "zai" => Some("https://open.bigmodel.cn/api/paas/v4"),
        "openrouter" => Some("https://openrouter.ai/api/v1"),
        "cerebras" => Some("https://api.cerebras.ai/v1"),
        _ => None,
    }
}

fn provider_default_models(provider: &str) -> Vec<serde_json::Value> {
    let pairs: &[(&str, &str)] = match provider {
        "openai" => &[("o4-mini", "O4 Mini"), ("gpt-4.1", "GPT 4.1"), ("gpt-4.1-mini", "GPT 4.1 Mini")],
        "anthropic" => &[("claude-sonnet-4-20250514", "Claude Sonnet 4"), ("claude-haiku-3.5-20241022", "Claude 3.5 Haiku")],
        "deepseek" => &[("deepseek-chat", "DeepSeek Chat"), ("deepseek-reasoner", "DeepSeek Reasoner")],
        "google" => &[("gemini-2.5-flash", "Gemini 2.5 Flash"), ("gemini-2.5-pro", "Gemini 2.5 Pro")],
        "groq" => &[("llama-3.3-70b-versatile", "Llama 3.3 70B")],
        "xai" => &[("grok-3-mini", "Grok 3 Mini")],
        "mistral" => &[("mistral-large-latest", "Mistral Large")],
        "zai" => &[("glm-4.7-flash", "GLM 4.7 Flash")],
        _ => &[],
    };
    pairs
        .iter()
        .map(|(id, name)| serde_json::json!({"id": id, "name": name}))
        .collect()
}

pub fn setup_provider(provider: &str, api_key: &str) -> Result<(), String> {
    let base_url = provider_base_url(provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;
    let models = provider_default_models(provider);
    let config = serde_json::json!({
        "baseUrl": base_url,
        "apiKey": api_key,
        "models": models,
    });
    let path = format!("models.providers.{}", provider);
    config_set_raw_json(&path, &config.to_string())
}

pub fn daemon_status() -> Result<DaemonStatus, String> {
    let output = match Command::new(OPENCLAW_CLI)
        .args(["gateway", "status"])
        .output()
    {
        Ok(o) => o,
        Err(_) => return Ok(DaemonStatus { running: false, pid: None }),
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
    let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
    let combined = format!("{}{}", stdout, stderr);
    let running = (combined.contains("running") || combined.contains("healthy") || combined.contains("listening"))
        && !combined.contains("not running")
        && !combined.contains("not loaded")
        && !combined.contains("stopped");

    Ok(DaemonStatus { running, pid: None })
}

pub fn daemon_stop() -> Result<String, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["gateway", "stop"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() && !stderr.is_empty() {
        return Err(stderr);
    }
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

pub fn daemon_start() -> Result<String, String> {
    // Ensure gateway.mode=local is set (required for gateway to listen)
    let _ = config_set_raw_json("gateway.mode", "\"local\"");

    // Try `gateway start` first; if the service isn't installed, install it then start
    let output = Command::new(OPENCLAW_CLI)
        .args(["gateway", "start"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let combined = format!("{}\n{}", stdout, stderr);

    if combined.contains("not loaded") || combined.contains("not installed") || combined.contains("gateway install") {
        let install = Command::new(OPENCLAW_CLI)
            .args(["gateway", "install"])
            .output()
            .map_err(|e| format!("Failed to install gateway: {}", e))?;

        if !install.status.success() {
            let err = String::from_utf8_lossy(&install.stderr).trim().to_string();
            return Err(format!("Gateway install failed: {}", err));
        }

        let start2 = Command::new(OPENCLAW_CLI)
            .args(["gateway", "start"])
            .output()
            .map_err(|e| format!("Failed to start gateway: {}", e))?;

        let out = String::from_utf8_lossy(&start2.stdout).trim().to_string();
        if !start2.status.success() {
            let err = String::from_utf8_lossy(&start2.stderr).trim().to_string();
            return Err(if err.is_empty() { out } else { err });
        }
        return Ok(out);
    }

    if !output.status.success() && !stderr.is_empty() {
        return Err(stderr);
    }
    Ok(if stdout.is_empty() { stderr } else { stdout })
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

fn parse_model_lines(stdout: &str, prefix: &str) -> Vec<ModelInfo> {
    stdout
        .lines()
        .skip(1)
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 && parts[0].starts_with(prefix) {
                Some(ModelInfo {
                    id: parts[0].to_string(),
                    input: parts[1].to_string(),
                    context_window: parts[2].to_string(),
                })
            } else {
                None
            }
        })
        .collect()
}

pub fn list_models(provider: &str) -> Result<Vec<ModelInfo>, String> {
    let prefix = format!("{}/", provider);

    // First try configured models (without --all)
    if let Ok(output) = Command::new(OPENCLAW_CLI)
        .args(["models", "list", "--provider", provider])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let models = parse_model_lines(&stdout, &prefix);
            if !models.is_empty() {
                return Ok(models);
            }
        }
    }

    // Fall back to full catalog
    let output = Command::new(OPENCLAW_CLI)
        .args(["models", "list", "--all"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_model_lines(&stdout, &prefix))
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
            "glm-4.7-flash",
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

pub fn test_llm_via_gateway() -> LlmTestResult {
    let url = format!(
        "http://localhost:{}/v1/chat/completions",
        DEFAULT_GATEWAY_PORT
    );
    let body = serde_json::json!({
        "model": "default",
        "messages": [{"role": "user", "content": "Hello! Introduce yourself in one sentence."}],
        "max_tokens": 100
    })
    .to_string();

    match Command::new("curl")
        .args([
            "-s",
            "--max-time",
            "20",
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
            if stdout.is_empty() || stdout.contains("Connection refused") {
                return LlmTestResult {
                    success: false,
                    response: None,
                    error: Some("Gateway not reachable. Is the daemon running?".to_string()),
                    model: None,
                };
            }
            parse_openai_response(&stdout, "gateway-default")
        }
        Err(e) => LlmTestResult {
            success: false,
            response: None,
            error: Some(format!("curl failed: {}", e)),
            model: None,
        },
    }
}

fn truncate_resp(s: &str) -> String {
    if s.len() > 300 {
        format!("{}...", &s[..300])
    } else {
        s.to_string()
    }
}

#[derive(Debug, Serialize)]
pub struct ChannelAddResult {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
}

pub fn add_channel(channel: &str, token: &str) -> Result<ChannelAddResult, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["channels", "add", "--channel", channel, "--token", token])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() {
        Ok(ChannelAddResult {
            success: true,
            message: Some(if stdout.is_empty() { stderr } else { stdout }),
            error: None,
        })
    } else {
        Ok(ChannelAddResult {
            success: false,
            message: None,
            error: Some(if stderr.is_empty() { stdout } else { stderr }),
        })
    }
}

pub fn get_full_config() -> Result<String, String> {
    let config_path = if let Ok(dir) = std::env::var("OPENCLAW_STATE_DIR") {
        std::path::PathBuf::from(dir)
    } else {
        dirs::home_dir()
            .unwrap_or_default()
            .join(OPENCLAW_STATE_DIR_DEFAULT)
    }
    .join("openclaw.json");

    if !config_path.exists() {
        return Err("Config file not found. Is OpenClaw installed?".to_string());
    }

    std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))
}

#[derive(Debug, Serialize)]
pub struct ChannelInfo {
    pub name: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct FeedbackInfo {
    pub platform: String,
    pub openclaw_version: String,
    pub clawsquire_version: String,
    pub gateway_status: String,
    pub llm_configured: bool,
    pub recent_log_lines: Vec<String>,
    pub screenshot_path: Option<String>,
}

pub fn collect_feedback_info() -> FeedbackInfo {
    let platform = std::env::consts::OS.to_string();

    let openclaw_version = Command::new(OPENCLAW_CLI)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "not installed".to_string());

    let gateway_status = Command::new(OPENCLAW_CLI)
        .args(["gateway", "status"])
        .output()
        .ok()
        .map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if stdout.len() > 500 { stdout[..500].to_string() } else { stdout }
        })
        .unwrap_or_else(|| "unknown".to_string());

    let llm_status = check_llm_config();

    let log_path = dirs::home_dir()
        .unwrap_or_default()
        .join(OPENCLAW_STATE_DIR_DEFAULT)
        .join("logs");
    let recent_log_lines = if log_path.exists() {
        std::fs::read_dir(&log_path)
            .ok()
            .and_then(|entries| {
                let mut files: Vec<_> = entries.filter_map(|e| e.ok()).collect();
                files.sort_by_key(|f| std::cmp::Reverse(f.path()));
                files.first().map(|f| f.path())
            })
            .and_then(|latest| std::fs::read_to_string(latest).ok())
            .map(|content| {
                content.lines().rev().take(30).map(|l| l.to_string()).collect::<Vec<_>>()
                    .into_iter().rev().collect()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let screenshot_path = take_screenshot().ok();

    FeedbackInfo {
        platform,
        openclaw_version,
        clawsquire_version: env!("CARGO_PKG_VERSION").to_string(),
        gateway_status,
        llm_configured: llm_status.has_provider,
        recent_log_lines,
        screenshot_path,
    }
}

pub fn copy_screenshot_to_clipboard(path: &str) -> Result<(), String> {
    if !std::path::Path::new(path).exists() {
        return Err("Screenshot file not found".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "set the clipboard to (read (POSIX file \"{}\") as \u{00AB}class PNGf\u{00BB})",
            path
        );
        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("osascript failed: {}", e))?;
        if output.status.success() {
            return Ok(());
        }
        return Err(format!(
            "clipboard copy failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Clipboard copy not supported on this platform yet".to_string())
    }
}

fn take_screenshot() -> Result<String, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let path = std::env::temp_dir().join(format!("clawsquire-feedback-{}.png", timestamp));
    let path_str = path.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("screencapture")
            .args(["-x", &path_str])
            .output()
            .map_err(|e| format!("Screenshot failed: {}", e))?;
        if output.status.success() {
            return Ok(path_str);
        }
        return Err("screencapture failed".to_string());
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Screenshot not supported on this platform yet".to_string())
    }
}

#[derive(Debug, Serialize)]
pub struct AgentChatResult {
    pub success: bool,
    pub reply: Option<String>,
    pub error: Option<String>,
}

pub fn agent_chat(message: &str) -> AgentChatResult {
    let url = format!(
        "http://localhost:{}/v1/chat/completions",
        DEFAULT_GATEWAY_PORT
    );
    let body = serde_json::json!({
        "model": "default",
        "messages": [{"role": "user", "content": message}],
        "max_tokens": 500
    })
    .to_string();

    let output = match Command::new("curl")
        .args(["-s", "--max-time", "30", "-X", "POST", &url, "-H", "Content-Type: application/json", "-d", &body])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            return AgentChatResult {
                success: false,
                reply: None,
                error: Some(format!("Request failed: {}", e)),
            }
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if stdout.is_empty() || stdout.contains("Connection refused") {
        return AgentChatResult {
            success: false,
            reply: None,
            error: Some("Gateway not reachable. Start the daemon first.".to_string()),
        };
    }
    if stdout.contains("NotFound") || stdout.contains("Not Found") || stdout.contains("404") {
        return AgentChatResult {
            success: false,
            reply: None,
            error: Some("Chat endpoint not available. Make sure OpenClaw gateway is running and a model is configured.".to_string()),
        };
    }

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
        if let Some(err) = json.get("error") {
            return AgentChatResult {
                success: false,
                reply: None,
                error: Some(err.to_string()),
            };
        }
        if let Some(content) = json
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
        {
            return AgentChatResult {
                success: true,
                reply: Some(content.to_string()),
                error: None,
            };
        }
    }

    AgentChatResult {
        success: false,
        reply: None,
        error: Some(truncate_resp(&stdout)),
    }
}

pub fn list_channels() -> Result<Vec<ChannelInfo>, String> {
    let output = Command::new(OPENCLAW_CLI)
        .args(["channels", "list"])
        .output()
        .map_err(|e| format!("Failed to execute openclaw: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut channels = Vec::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("- ") && !trimmed.contains("none") {
            let name = trimmed.trim_start_matches("- ").trim().to_string();
            channels.push(ChannelInfo {
                name: name.clone(),
                status: "configured".to_string(),
            });
        }
    }

    Ok(channels)
}

#[derive(Debug, Serialize)]
pub struct SafetyApplyResult {
    pub success: bool,
    pub applied: Vec<String>,
    pub errors: Vec<String>,
}

pub fn apply_safety_preset(level: &str) -> SafetyApplyResult {
    let settings: Vec<(&str, &str)> = match level {
        "conservative" => vec![
            ("commands.native", "false"),
            ("commands.nativeSkills", "false"),
            ("commands.restart", "false"),
        ],
        "standard" => vec![
            ("commands.native", "\"auto\""),
            ("commands.nativeSkills", "\"auto\""),
            ("commands.restart", "true"),
        ],
        "full" => vec![
            ("commands.native", "true"),
            ("commands.nativeSkills", "true"),
            ("commands.restart", "true"),
        ],
        _ => return SafetyApplyResult {
            success: true,
            applied: vec!["custom: no config changes".to_string()],
            errors: Vec::new(),
        },
    };

    let mut applied = Vec::new();
    let mut errors = Vec::new();

    for (path, value) in settings {
        match config_set_raw_json(path, value) {
            Ok(()) => applied.push(format!("{} = {}", path, value)),
            Err(e) => errors.push(format!("{}: {}", path, e)),
        }
    }

    SafetyApplyResult {
        success: errors.is_empty(),
        applied,
        errors,
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
