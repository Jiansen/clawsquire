use serde::Serialize;

const DEFAULT_INSTALL_URL: &str = "https://clawsquire.com/install.sh";

#[derive(Debug, Serialize)]
pub struct RemoteInstallCommand {
    pub command: String,
    pub post_install_steps: Vec<String>,
}

/// Generate a one-line curl command for remote VPS installation.
/// API keys are NOT included in the command for security — they are
/// configured interactively after installation completes.
pub fn generate_install_command(
    provider: Option<&str>,
    channel: Option<&str>,
    safety: Option<&str>,
    no_start: bool,
) -> RemoteInstallCommand {
    let mut parts = vec![
        format!("curl -sSL {} | bash -s --", DEFAULT_INSTALL_URL),
    ];

    if let Some(p) = provider {
        parts.push(format!("--provider {}", shell_safe(p)));
    }
    if let Some(ch) = channel {
        parts.push(format!("--channel {}", shell_safe(ch)));
    }
    if let Some(s) = safety {
        parts.push(format!("--safety {}", shell_safe(s)));
    }
    if no_start {
        parts.push("--no-start".to_string());
    }

    let mut post_steps = Vec::new();

    if provider.is_some() {
        post_steps.push(
            "Configure your LLM API key: openclaw config set models.providers.<provider>.apiKey '\"YOUR_KEY\"'"
                .to_string(),
        );
    }
    if let Some(ch) = channel {
        match ch {
            "telegram" => post_steps.push(
                "Configure Telegram: openclaw channels add --channel telegram --token YOUR_BOT_TOKEN"
                    .to_string(),
            ),
            "whatsapp" => post_steps.push(
                "Configure WhatsApp: openclaw channels add --channel whatsapp (then scan QR code)"
                    .to_string(),
            ),
            _ => post_steps.push(format!(
                "Configure {}: openclaw channels add --channel {} --token YOUR_TOKEN",
                ch, ch
            )),
        }
    }

    if post_steps.is_empty() {
        post_steps.push("Run 'openclaw' to start the interactive setup wizard".to_string());
    }

    RemoteInstallCommand {
        command: parts.join(" \\\n  "),
        post_install_steps: post_steps,
    }
}

/// Minimal shell-safe escaping: strip characters that could break command parsing.
fn shell_safe(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_command() {
        let result = generate_install_command(None, None, None, false);
        assert!(result.command.contains("curl -sSL"));
        assert!(result.command.contains("install.sh"));
        assert!(!result.command.contains("--provider"));
    }

    #[test]
    fn test_with_provider() {
        let result = generate_install_command(Some("openai"), None, None, false);
        assert!(result.command.contains("--provider openai"));
        assert!(result.post_install_steps.iter().any(|s| s.contains("API key")));
    }

    #[test]
    fn test_with_channel_telegram() {
        let result = generate_install_command(None, Some("telegram"), None, false);
        assert!(result.command.contains("--channel telegram"));
        assert!(result.post_install_steps.iter().any(|s| s.contains("Telegram")));
    }

    #[test]
    fn test_no_api_key_in_command() {
        let result = generate_install_command(Some("openai"), Some("telegram"), Some("standard"), false);
        assert!(!result.command.contains("api-key"));
        assert!(!result.command.contains("sk-"));
        assert!(!result.command.contains("token"));
    }

    #[test]
    fn test_shell_safe() {
        assert_eq!(shell_safe("openai"), "openai");
        assert_eq!(shell_safe("my-provider_v2"), "my-provider_v2");
        assert_eq!(shell_safe("evil; rm -rf /"), "evilrm-rf");
    }

    #[test]
    fn test_no_start_flag() {
        let result = generate_install_command(None, None, None, true);
        assert!(result.command.contains("--no-start"));
    }
}
