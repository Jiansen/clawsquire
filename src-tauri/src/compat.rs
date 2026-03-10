use crate::cli_runner::{self, CliRunner};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq)]
pub enum OpenClawVersion {
    /// 2026.3.2 and earlier
    V3_2,
    /// 2026.3.7
    V3_7,
    /// 2026.3.8 and later
    V3_8Plus,
    /// Version not installed or unrecognizable
    Unknown(String),
}

/// Describes how gateway authentication is configured for a given version.
pub struct GatewayAuthConfig {
    /// Config paths to set when configuring gateway auth token.
    /// v3.2: set `gateway.token` only.
    /// v3.7+: set `gateway.auth.mode` = "token" and `gateway.auth.token`.
    pub paths: Vec<(&'static str, String)>,
}

/// Detect the installed OpenClaw version using the given runner.
pub fn detect_version_with(runner: &dyn CliRunner) -> OpenClawVersion {
    match runner.run(&["--version"]) {
        Ok(o) if o.success => parse_version(&o.stdout),
        _ => OpenClawVersion::Unknown("not installed".into()),
    }
}

/// Detect the installed OpenClaw version using the default runner.
pub fn detect_version() -> OpenClawVersion {
    detect_version_with(cli_runner::default_runner())
}

/// Parse a version string like "2026.3.7" or "v2026.3.8" into an enum variant.
fn parse_version(raw: &str) -> OpenClawVersion {
    let cleaned = raw.trim().trim_start_matches('v').trim_start_matches('V');

    let parts: Vec<&str> = cleaned.split('.').collect();
    if parts.len() < 3 {
        return OpenClawVersion::Unknown(raw.to_string());
    }

    let minor: u32 = match parts[2].parse() {
        Ok(n) => n,
        Err(_) => return OpenClawVersion::Unknown(raw.to_string()),
    };

    match minor {
        0..=6 => OpenClawVersion::V3_2,
        7 => OpenClawVersion::V3_7,
        _ => OpenClawVersion::V3_8Plus,
    }
}

/// Build gateway auth config entries for the given version.
/// `token` is the auth token value to set.
pub fn gateway_auth_config(ver: &OpenClawVersion, token: &str) -> GatewayAuthConfig {
    match ver {
        OpenClawVersion::V3_2 => GatewayAuthConfig {
            paths: vec![("gateway.token", token.to_string())],
        },
        _ => GatewayAuthConfig {
            paths: vec![
                ("gateway.auth.mode", "\"token\"".to_string()),
                ("gateway.auth.token", format!("\"{}\"", token)),
            ],
        },
    }
}

/// Whether `openclaw backup create` / `openclaw backup verify` are available.
pub fn backup_cli_available(ver: &OpenClawVersion) -> bool {
    !matches!(ver, OpenClawVersion::V3_2 | OpenClawVersion::Unknown(_))
}

/// Default value for `tools.profile` configuration.
pub fn default_tools_profile(ver: &OpenClawVersion) -> &'static str {
    match ver {
        OpenClawVersion::V3_2 => "all",
        _ => "messaging",
    }
}

/// Whether the built-in Control UI (web dashboard) is available.
/// v3.7+ ships a 12-tab web dashboard at the gateway port.
pub fn has_control_ui(ver: &OpenClawVersion) -> bool {
    !matches!(ver, OpenClawVersion::V3_2 | OpenClawVersion::Unknown(_))
}

/// Serializable version info for the frontend.
#[derive(Debug, Serialize)]
pub struct VersionInfo {
    pub raw_version: String,
    pub tier: String,
    pub has_backup_cli: bool,
    pub has_control_ui: bool,
    pub tools_profile_default: String,
}

/// Detect version and return a frontend-friendly summary.
pub fn get_version_info_with(runner: &dyn CliRunner) -> VersionInfo {
    let ver = detect_version_with(runner);
    let raw = match &ver {
        OpenClawVersion::Unknown(s) => s.clone(),
        _ => runner.run(&["--version"]).ok()
            .filter(|o| o.success)
            .map(|o| o.stdout)
            .unwrap_or_else(|| "unknown".into()),
    };
    let tier = match &ver {
        OpenClawVersion::V3_2 => "v3.2",
        OpenClawVersion::V3_7 => "v3.7",
        OpenClawVersion::V3_8Plus => "v3.8+",
        OpenClawVersion::Unknown(_) => "unknown",
    };
    VersionInfo {
        raw_version: raw,
        tier: tier.to_string(),
        has_backup_cli: backup_cli_available(&ver),
        has_control_ui: has_control_ui(&ver),
        tools_profile_default: default_tools_profile(&ver).to_string(),
    }
}

pub fn get_version_info() -> VersionInfo {
    get_version_info_with(cli_runner::default_runner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version_3_2() {
        assert_eq!(parse_version("2026.3.2"), OpenClawVersion::V3_2);
        assert_eq!(parse_version("v2026.3.1"), OpenClawVersion::V3_2);
        assert_eq!(parse_version("2026.3.5"), OpenClawVersion::V3_2);
    }

    #[test]
    fn test_parse_version_3_7() {
        assert_eq!(parse_version("2026.3.7"), OpenClawVersion::V3_7);
        assert_eq!(parse_version("v2026.3.7"), OpenClawVersion::V3_7);
    }

    #[test]
    fn test_parse_version_3_8_plus() {
        assert_eq!(parse_version("2026.3.8"), OpenClawVersion::V3_8Plus);
        assert_eq!(parse_version("2026.3.10"), OpenClawVersion::V3_8Plus);
        assert_eq!(parse_version("2026.3.99"), OpenClawVersion::V3_8Plus);
    }

    #[test]
    fn test_parse_version_unknown() {
        assert!(matches!(parse_version("unknown"), OpenClawVersion::Unknown(_)));
        assert!(matches!(parse_version(""), OpenClawVersion::Unknown(_)));
    }

    #[test]
    fn test_gateway_auth_v32() {
        let cfg = gateway_auth_config(&OpenClawVersion::V3_2, "mytoken");
        assert_eq!(cfg.paths.len(), 1);
        assert_eq!(cfg.paths[0].0, "gateway.token");
    }

    #[test]
    fn test_gateway_auth_v37() {
        let cfg = gateway_auth_config(&OpenClawVersion::V3_7, "mytoken");
        assert_eq!(cfg.paths.len(), 2);
        assert_eq!(cfg.paths[0].0, "gateway.auth.mode");
        assert_eq!(cfg.paths[1].0, "gateway.auth.token");
    }

    #[test]
    fn test_backup_cli() {
        assert!(!backup_cli_available(&OpenClawVersion::V3_2));
        assert!(backup_cli_available(&OpenClawVersion::V3_7));
        assert!(backup_cli_available(&OpenClawVersion::V3_8Plus));
    }

    #[test]
    fn test_tools_profile() {
        assert_eq!(default_tools_profile(&OpenClawVersion::V3_2), "all");
        assert_eq!(default_tools_profile(&OpenClawVersion::V3_7), "messaging");
        assert_eq!(default_tools_profile(&OpenClawVersion::V3_8Plus), "messaging");
    }

    #[test]
    fn test_control_ui() {
        assert!(!has_control_ui(&OpenClawVersion::V3_2));
        assert!(has_control_ui(&OpenClawVersion::V3_7));
        assert!(has_control_ui(&OpenClawVersion::V3_8Plus));
    }
}
