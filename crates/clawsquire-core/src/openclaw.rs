use crate::cli_runner::{self, CliRunner};
use crate::constants::{OPENCLAW_NPM_PKG, OPENCLAW_STATE_DIR_DEFAULT};
use crate::detect::{cmd_with_path, hidden_cmd};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct DaemonStatus {
    pub running: bool,
    pub pid: Option<u32>,
}

// --- CLI-abstracted core functions ---

pub fn config_get_with(runner: &dyn CliRunner, path: &str) -> Result<String, String> {
    let out = runner.run(&["config", "get", path, "--json"])?;
    if out.success { Ok(out.stdout) } else { Err(out.stderr) }
}

pub fn config_set_with(runner: &dyn CliRunner, path: &str, value: &str) -> Result<(), String> {
    let json_value = serde_json::to_string(value).unwrap_or_else(|_| format!("\"{}\"", value));
    let out = runner.run(&["config", "set", path, &json_value, "--json"])?;
    if out.success { Ok(()) } else { Err(out.stderr) }
}

fn config_set_raw_json_with(runner: &dyn CliRunner, path: &str, json_value: &str) -> Result<(), String> {
    let out = runner.run(&["config", "set", path, json_value, "--json"])?;
    if out.success { Ok(()) } else { Err(out.stderr) }
}

// --- Backward-compatible wrappers (use default runner) ---


pub fn config_set(path: &str, value: &str) -> Result<(), String> {
    config_set_with(cli_runner::default_runner(), path, value)
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

pub fn setup_provider_with(runner: &dyn CliRunner, provider: &str, api_key: &str) -> Result<(), String> {
    let base_url = provider_base_url(provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;
    let models = provider_default_models(provider);
    let config = serde_json::json!({
        "baseUrl": base_url,
        "apiKey": api_key,
        "models": models,
    });
    let path = format!("models.providers.{}", provider);
    config_set_raw_json_with(runner, &path, &config.to_string())
}


pub fn daemon_status_with(runner: &dyn CliRunner) -> Result<DaemonStatus, String> {
    let out = match runner.run(&["gateway", "status"]) {
        Ok(o) => o,
        Err(_) => return Ok(DaemonStatus { running: false, pid: None }),
    };
    let combined = format!("{}{}", out.stdout.to_lowercase(), out.stderr.to_lowercase());
    let running = (combined.contains("running") || combined.contains("healthy") || combined.contains("listening"))
        && !combined.contains("not running")
        && !combined.contains("not loaded")
        && !combined.contains("stopped");
    Ok(DaemonStatus { running, pid: None })
}

pub fn daemon_stop_with(runner: &dyn CliRunner) -> Result<String, String> {
    let out = runner.run(&["gateway", "stop"])?;
    if !out.success && !out.stderr.is_empty() {
        return Err(out.stderr);
    }
    Ok(if out.stdout.is_empty() { out.stderr } else { out.stdout })
}

pub fn daemon_start_with(runner: &dyn CliRunner) -> Result<String, String> {
    let _ = config_set_raw_json_with(runner, "gateway.mode", "\"local\"");

    let out = runner.run(&["gateway", "start"])?;
    let combined = format!("{}\n{}", out.stdout, out.stderr);

    if combined.contains("not loaded") || combined.contains("not installed") || combined.contains("gateway install") {
        let install = runner.run(&["gateway", "install"])?;
        if !install.success {
            return Err(format!("Gateway install failed: {}", install.stderr));
        }
        let start2 = runner.run(&["gateway", "start"])?;
        if !start2.success {
            return Err(if start2.stderr.is_empty() { start2.stdout } else { start2.stderr });
        }
        return Ok(start2.stdout);
    }

    if !out.success && !out.stderr.is_empty() {
        return Err(out.stderr);
    }
    Ok(if out.stdout.is_empty() { out.stderr } else { out.stdout })
}


#[derive(Debug, Serialize, Deserialize)]
pub struct UninstallResult {
    pub daemon_stopped: bool,
    pub npm_uninstalled: bool,
    pub config_removed: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallResult {
    pub success: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

/// Collect diagnostic info useful for debugging failed installs.
fn collect_install_diagnostics() -> String {
    let mut diags = Vec::new();

    // which openclaw
    if let Ok(o) = std::process::Command::new("which").arg("openclaw").output() {
        let loc = String::from_utf8_lossy(&o.stdout).trim().to_string();
        diags.push(format!("which openclaw: {}", if loc.is_empty() { "(not found)" } else { &loc }));
    }

    // openclaw --version
    if let Ok(o) = cmd_with_path("openclaw").arg("--version").output() {
        let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if !ver.is_empty() {
            diags.push(format!("openclaw --version: {}", ver));
        }
    }

    // npm prefix
    if let Ok(o) = std::process::Command::new("npm").arg("config").arg("get").arg("prefix").output() {
        let prefix = String::from_utf8_lossy(&o.stdout).trim().to_string();
        diags.push(format!("npm prefix: {}", prefix));
    }

    // node version
    if let Ok(o) = cmd_with_path("node").arg("--version").output() {
        let node_ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if !node_ver.is_empty() {
            diags.push(format!("node: {}", node_ver));
        }
    }

    diags.join(" | ")
}

pub fn install_openclaw_with(runner: &dyn CliRunner) -> Result<InstallResult, String> {
    // Use the official OpenClaw installer with --no-onboard (skips interactive wizard).
    // The installer automatically handles npm prefix: if the system prefix (/usr/lib) is
    // not user-writable, it switches to ~/.npm-global and updates .bashrc/.zshrc.
    let install_cmd = "curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install.sh | bash -s -- --no-onboard 2>&1";
    let output = std::process::Command::new("bash")
        .arg("-c")
        .arg(install_cmd)
        .output()
        .map_err(|e| format!("Failed to run installer: {}", e))?;

    if output.status.success() {
        let version = runner.run(&["--version"]).ok()
            .filter(|o| o.success)
            .map(|o| o.stdout.trim().to_string());
        Ok(InstallResult { success: true, version, error: None })
    } else {
        let installer_output = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stderr).trim(),
            String::from_utf8_lossy(&output.stdout).trim(),
        );
        // Collect diagnostics to help debug / pass to local openclaw assistant
        let diagnostics = collect_install_diagnostics();
        let error_msg = if diagnostics.is_empty() {
            installer_output
        } else {
            format!("{}\n\nDiagnostics: {}", installer_output, diagnostics)
        };
        Ok(InstallResult { success: false, version: None, error: Some(error_msg) })
    }
}

pub fn install_openclaw() -> Result<InstallResult, String> {
    install_openclaw_with(cli_runner::default_runner())
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

pub fn list_providers_with(runner: &dyn CliRunner) -> Result<Vec<ProviderInfo>, String> {
    let out = runner.run(&["models", "list", "--all"])?;
    if !out.success { return Err(out.stderr); }

    let mut providers: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for line in out.stdout.lines().skip(1) {
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
            ProviderInfo { id, model_count: models.len(), sample_models, priority }
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

pub fn list_models_with(runner: &dyn CliRunner, provider: &str) -> Result<Vec<ModelInfo>, String> {
    let prefix = format!("{}/", provider);

    if let Ok(out) = runner.run(&["models", "list", "--provider", provider]) {
        if out.success {
            let models = parse_model_lines(&out.stdout, &prefix);
            if !models.is_empty() {
                return Ok(models);
            }
        }
    }

    let out = runner.run(&["models", "list", "--all"])?;
    if !out.success { return Err(out.stderr); }
    Ok(parse_model_lines(&out.stdout, &prefix))
}


#[derive(Debug, Serialize)]
pub struct LlmConfigStatus {
    pub has_provider: bool,
    pub provider_name: Option<String>,
}

pub fn check_llm_config_with(runner: &dyn CliRunner) -> LlmConfigStatus {
    let env_checks = [
        ("OPENAI_API_KEY", "openai"),
        ("ANTHROPIC_API_KEY", "anthropic"),
        ("GOOGLE_API_KEY", "google"),
        ("DEEPSEEK_API_KEY", "deepseek"),
        ("XAI_API_KEY", "xai"),
    ];

    for (env_key, provider) in env_checks {
        if std::env::var(env_key).map(|v| !v.is_empty()).unwrap_or(false) {
            return LlmConfigStatus { has_provider: true, provider_name: Some(provider.to_string()) };
        }
    }

    if let Ok(out) = runner.run(&["config", "get", "models.providers", "--json"]) {
        if out.success {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(out.stdout.trim()) {
                if let Some(obj) = val.as_object() {
                    for (provider, config) in obj {
                        if let Some(key) = config.get("apiKey").and_then(|v| v.as_str()) {
                            if !key.is_empty() {
                                return LlmConfigStatus { has_provider: true, provider_name: Some(provider.clone()) };
                            }
                        }
                    }
                }
            }
        }
    }

    LlmConfigStatus { has_provider: false, provider_name: None }
}

pub fn check_llm_config() -> LlmConfigStatus {
    check_llm_config_with(cli_runner::default_runner())
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

    let mut cmd = hidden_cmd("curl");
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

    match hidden_cmd("curl")
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

    match hidden_cmd("curl")
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

pub fn test_llm_via_gateway_with(runner: &dyn CliRunner) -> LlmTestResult {
    let out = match runner.run(&[
        "agent", "--session-id", "clawsquire-llm-test",
        "--message", "Say OK in one word.", "--json", "--timeout", "30",
    ]) {
        Ok(o) => o,
        Err(e) => return LlmTestResult { success: false, response: None, error: Some(format!("Failed to run openclaw: {}", e)), model: None },
    };

    if !out.success || out.stdout.is_empty() {
        return LlmTestResult {
            success: false, response: None, model: None,
            error: Some(if !out.stderr.is_empty() { truncate_resp(&out.stderr) } else { "Gateway agent returned no output.".to_string() }),
        };
    }

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&out.stdout) {
        let model = json.get("result").and_then(|r| r.get("meta")).and_then(|m| m.get("agentMeta"))
            .and_then(|a| a.get("model")).and_then(|m| m.as_str()).map(|s| s.to_string());
        let text = json.get("result").and_then(|r| r.get("payloads")).and_then(|p| p.get(0))
            .and_then(|p| p.get("text")).and_then(|t| t.as_str()).map(|s| s.to_string());
        if json.get("status").and_then(|s| s.as_str()) == Some("ok") && text.is_some() {
            return LlmTestResult { success: true, response: text, error: None, model };
        }
    }

    LlmTestResult { success: false, response: None, error: Some(truncate_resp(&out.stdout)), model: None }
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

pub fn add_channel_with(runner: &dyn CliRunner, channel: &str, token: &str) -> Result<ChannelAddResult, String> {
    let out = runner.run(&["channels", "add", "--channel", channel, "--token", token])?;
    if out.success {
        Ok(ChannelAddResult {
            success: true,
            message: Some(if out.stdout.is_empty() { out.stderr } else { out.stdout }),
            error: None,
        })
    } else {
        Ok(ChannelAddResult {
            success: false,
            message: None,
            error: Some(if out.stderr.is_empty() { out.stdout } else { out.stderr }),
        })
    }
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

pub fn collect_feedback_info_with(runner: &dyn CliRunner) -> FeedbackInfo {
    let platform = std::env::consts::OS.to_string();

    let openclaw_version = runner.run(&["--version"]).ok()
        .filter(|o| o.success)
        .map(|o| o.stdout)
        .unwrap_or_else(|| "not installed".to_string());

    let gateway_status = runner.run(&["gateway", "status"]).ok()
        .map(|o| if o.stdout.len() > 500 { o.stdout[..500].to_string() } else { o.stdout })
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

pub fn agent_chat_with(runner: &dyn CliRunner, message: &str) -> AgentChatResult {
    let out = match runner.run(&[
        "agent", "--session-id", "clawsquire", "--message", message, "--json", "--timeout", "60",
    ]) {
        Ok(o) => o,
        Err(e) => return AgentChatResult { success: false, reply: None, error: Some(format!("Failed to run openclaw agent: {}", e)) },
    };

    if !out.success {
        let err_msg = if !out.stderr.is_empty() { &out.stderr } else { &out.stdout };
        return AgentChatResult { success: false, reply: None, error: Some(truncate_resp(err_msg)) };
    }

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&out.stdout) {
        if json.get("status").and_then(|s| s.as_str()) == Some("ok") {
            if let Some(text) = json.get("result").and_then(|r| r.get("payloads"))
                .and_then(|p| p.get(0)).and_then(|p| p.get("text")).and_then(|t| t.as_str())
            {
                return AgentChatResult { success: true, reply: Some(text.to_string()), error: None };
            }
        }
        if let Some(err) = json.get("error").and_then(|e| e.as_str()) {
            return AgentChatResult { success: false, reply: None, error: Some(err.to_string()) };
        }
    }

    if out.stdout.is_empty() {
        return AgentChatResult { success: false, reply: None, error: Some("No response from OpenClaw agent. Check that the gateway is running.".to_string()) };
    }

    AgentChatResult { success: false, reply: None, error: Some(truncate_resp(&out.stdout)) }
}


pub fn list_channels_with(runner: &dyn CliRunner) -> Result<Vec<ChannelInfo>, String> {
    let out = runner.run(&["channels", "list"])?;
    let mut channels = Vec::new();
    for line in out.stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("- ") && !trimmed.contains("none") {
            let name = trimmed.trim_start_matches("- ").trim().to_string();
            channels.push(ChannelInfo { name, status: "configured".to_string() });
        }
    }
    Ok(channels)
}


#[derive(Debug, Serialize)]
pub struct ChannelRemoveResult {
    pub success: bool,
    pub error: Option<String>,
}

pub fn remove_channel_with(runner: &dyn CliRunner, channel: &str) -> Result<ChannelRemoveResult, String> {
    let out = runner.run(&["channels", "remove", "--channel", channel])?;
    if out.success {
        Ok(ChannelRemoveResult { success: true, error: None })
    } else {
        let msg = if out.stderr.is_empty() { out.stdout } else { out.stderr };
        Ok(ChannelRemoveResult { success: false, error: Some(msg) })
    }
}


#[derive(Debug, Serialize)]
pub struct CronJob {
    pub name: String,
    pub every: String,
    pub channel: Option<String>,
    pub message: Option<String>,
}

pub fn cron_list_with(runner: &dyn CliRunner) -> Result<Vec<CronJob>, String> {
    let out = runner.run(&["cron", "list"])?;
    let mut jobs = Vec::new();
    if !out.success {
        return Ok(jobs);
    }
    let mut current_name = String::new();
    let mut current_every = String::new();
    let mut current_channel: Option<String> = None;
    let mut current_message: Option<String> = None;

    for line in out.stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("- ") || trimmed.starts_with("• ") {
            if !current_name.is_empty() {
                jobs.push(CronJob {
                    name: current_name.clone(),
                    every: current_every.clone(),
                    channel: current_channel.take(),
                    message: current_message.take(),
                });
            }
            current_name = trimmed.trim_start_matches("- ").trim_start_matches("• ").trim().to_string();
            current_every.clear();
            current_channel = None;
            current_message = None;
        } else if let Some(val) = trimmed.strip_prefix("every:") {
            current_every = val.trim().to_string();
        } else if let Some(val) = trimmed.strip_prefix("Every:") {
            current_every = val.trim().to_string();
        } else if let Some(val) = trimmed.strip_prefix("channel:") {
            current_channel = Some(val.trim().to_string());
        } else if let Some(val) = trimmed.strip_prefix("Channel:") {
            current_channel = Some(val.trim().to_string());
        } else if let Some(val) = trimmed.strip_prefix("message:") {
            current_message = Some(val.trim().to_string());
        } else if let Some(val) = trimmed.strip_prefix("Message:") {
            current_message = Some(val.trim().to_string());
        }
    }

    if !current_name.is_empty() {
        jobs.push(CronJob {
            name: current_name,
            every: current_every,
            channel: current_channel,
            message: current_message,
        });
    }

    if jobs.is_empty() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&out.stdout) {
            if let Some(arr) = json.as_array() {
                for item in arr {
                    jobs.push(CronJob {
                        name: item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        every: item.get("every").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        channel: item.get("channel").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        message: item.get("message").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    });
                }
            }
        }
    }

    Ok(jobs)
}


#[derive(Debug, Serialize)]
pub struct CronRemoveResult {
    pub success: bool,
    pub error: Option<String>,
}

pub fn cron_remove_with(runner: &dyn CliRunner, name: &str) -> Result<CronRemoveResult, String> {
    let out = runner.run(&["cron", "remove", "--name", name])?;
    if out.success {
        Ok(CronRemoveResult { success: true, error: None })
    } else {
        let msg = if out.stderr.is_empty() { out.stdout } else { out.stderr };
        Ok(CronRemoveResult { success: false, error: Some(msg) })
    }
}


#[derive(Debug, Serialize)]
pub struct CronAddResult {
    pub success: bool,
    pub error: Option<String>,
}

pub fn cron_add_with(
    runner: &dyn CliRunner,
    name: &str,
    every: &str,
    message: &str,
    channel: &str,
    announce: bool,
) -> Result<CronAddResult, String> {
    let mut args = vec![
        "cron", "add",
        "--name", name,
        "--every", every,
        "--session", "isolated",
        "--message", message,
        "--channel", channel,
    ];
    if announce {
        args.push("--announce");
    }
    let out = runner.run(&args)?;
    if out.success {
        Ok(CronAddResult { success: true, error: None })
    } else {
        let msg = if out.stderr.is_empty() { out.stdout } else { out.stderr };
        Ok(CronAddResult { success: false, error: Some(msg) })
    }
}


#[derive(Debug, Serialize)]
pub struct SafetyApplyResult {
    pub success: bool,
    pub applied: Vec<String>,
    pub errors: Vec<String>,
}

pub fn apply_safety_preset_with(runner: &dyn CliRunner, level: &str) -> SafetyApplyResult {
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
        match config_set_raw_json_with(runner, path, value) {
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


#[derive(Debug, Serialize)]
pub struct EmailMonitorResult {
    pub channel_ok: bool,
    pub cron_ok: bool,
    pub cron_id: Option<String>,
    pub errors: Vec<String>,
}

/// Set up email-to-Telegram monitoring:
/// 1. Add Telegram channel if token provided
/// 2. Create a cron job that checks email and pushes summaries to Telegram
pub fn setup_email_monitor_with(
    runner: &dyn CliRunner,
    telegram_token: &str,
    email_address: &str,
    check_interval: &str,
) -> EmailMonitorResult {
    let mut result = EmailMonitorResult {
        channel_ok: false,
        cron_ok: false,
        cron_id: None,
        errors: Vec::new(),
    };

    let ch = add_channel_with(runner, "telegram", telegram_token);
    match ch {
        Ok(r) if r.success => result.channel_ok = true,
        Ok(r) => {
            let err_msg = r.error.unwrap_or_default();
            if err_msg.contains("already") || err_msg.contains("exists") {
                result.channel_ok = true;
            } else {
                result.errors.push(format!("Telegram channel: {}", err_msg));
            }
        }
        Err(e) => result.errors.push(format!("Telegram channel: {}", e)),
    }

    let prompt = format!(
        "Check for new unread emails at {} from the last {} . \
         Summarize any important ones briefly. If nothing new, stay silent.",
        email_address, check_interval
    );

    let cron_name = format!("Email Check ({})", email_address);
    let out = runner.run(&[
        "cron", "add", "--name", &cron_name, "--every", check_interval,
        "--session", "isolated", "--message", &prompt, "--announce", "--channel", "telegram",
    ]);

    match out {
        Ok(o) if o.success => {
            result.cron_ok = true;
            if let Some(id_line) = o.stdout.lines().find(|l| l.contains("id") || l.contains("created")) {
                result.cron_id = Some(id_line.trim().to_string());
            }
        }
        Ok(o) => {
            result.errors.push(format!("Cron job: {}", if o.stderr.is_empty() { o.stdout } else { o.stderr }));
        }
        Err(e) => result.errors.push(format!("Cron command: {}", e)),
    }

    result
}


pub fn uninstall_openclaw_with(runner: &dyn CliRunner, remove_config: bool) -> Result<UninstallResult, String> {
    let mut result = UninstallResult {
        daemon_stopped: false,
        npm_uninstalled: false,
        config_removed: false,
        errors: Vec::new(),
    };

    // Step 1: Use the official `openclaw uninstall` command.
    // This handles service teardown cleanly across platforms (launchd/systemd).
    // `--service` stops and removes the daemon service.
    // `--state` removes state/config; only done if remove_config is set.
    let mut uninstall_args = vec!["uninstall", "--non-interactive", "--yes", "--service"];
    if remove_config {
        uninstall_args.push("--state");
        uninstall_args.push("--workspace");
    }
    match runner.run(&uninstall_args) {
        Ok(o) if o.success => result.daemon_stopped = true,
        Ok(o) => {
            // `openclaw uninstall` may print warnings but still succeed; treat as ok
            if !o.stderr.is_empty() {
                result.errors.push(format!("openclaw uninstall: {}", o.stderr.trim()));
            }
            result.daemon_stopped = true;
        }
        Err(e) => {
            // Fallback: try the old `daemon stop` if uninstall subcommand is unavailable
            result.errors.push(format!("openclaw uninstall: {}", e));
            match runner.run(&["daemon", "stop"]) {
                Ok(_) => result.daemon_stopped = true,
                Err(e2) => result.errors.push(format!("daemon stop fallback: {}", e2)),
            }
        }
    }

    // Step 2: Remove the npm package.
    // Detect the npm prefix where openclaw binary actually lives.
    // If it's a system prefix (e.g. /usr/lib/node_modules) the npm uninstall
    // may fail with EACCES (requires root). In that case we skip and note it
    // — the binary removal is best-effort; the service was already stopped by
    // the `openclaw uninstall --service` call above.
    let bin_path = std::process::Command::new("which")
        .arg("openclaw")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string());

    let npm_prefix: Option<String> = bin_path.as_deref().and_then(|bin| {
        // e.g. /usr/bin/openclaw → parent /usr/bin → parent /usr
        let path = std::path::Path::new(bin);
        path.parent()?.parent().map(|p| p.to_string_lossy().to_string())
    });

    // Only attempt npm uninstall if the prefix is user-writable
    let prefix_writable = npm_prefix.as_deref().map(|p| {
        std::fs::metadata(std::path::Path::new(p).join("lib"))
            .map(|m| !m.permissions().readonly())
            .unwrap_or(false)
    }).unwrap_or(true);

    if prefix_writable {
        let mut npm_cmd = cmd_with_path("npm");
        npm_cmd.args(["uninstall", "-g", OPENCLAW_NPM_PKG]);
        if let Some(ref prefix) = npm_prefix {
            npm_cmd.arg("--prefix").arg(prefix);
        }
        match npm_cmd.output() {
            Ok(o) if o.status.success() => result.npm_uninstalled = true,
            Ok(o) => {
                let msg = String::from_utf8_lossy(&o.stderr).trim().to_string();
                // EACCES = permission denied; treat as best-effort, not a fatal error
                if msg.contains("EACCES") || msg.contains("permission denied") {
                    result.errors.push(format!("npm uninstall skipped (permission denied — binary installed as root): {}", msg));
                } else {
                    result.errors.push(format!("npm uninstall: {}", msg));
                }
            }
            Err(e) => result.errors.push(format!("npm uninstall: {}", e)),
        }
    } else {
        // System-owned prefix — openclaw uninstall --service already handled service cleanup;
        // the binary requires root to remove, which we cannot do without sudo.
        result.errors.push(
            "npm uninstall skipped: OpenClaw binary is in a system-owned prefix (e.g. /usr/lib/node_modules) and requires root to remove. The service has been uninstalled. To fully remove the binary: sudo npm uninstall -g openclaw".to_string()
        );
    }

    // Step 3: If remove_config was not handled by `openclaw uninstall --state`,
    // fall back to direct removal of the config directory.
    if remove_config && !result.errors.is_empty() {
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
    } else if remove_config {
        result.config_removed = true; // handled by `openclaw uninstall --state`
    }

    Ok(result)
}

pub fn uninstall_openclaw(remove_config: bool) -> Result<UninstallResult, String> {
    uninstall_openclaw_with(cli_runner::default_runner(), remove_config)
}

#[derive(Debug, Serialize)]
pub struct CliOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_cli_with(runner: &dyn CliRunner, args: &[&str]) -> Result<CliOutput, String> {
    let out = runner.run(args)?;
    Ok(CliOutput {
        success: out.success,
        stdout: out.stdout,
        stderr: out.stderr,
    })
}

