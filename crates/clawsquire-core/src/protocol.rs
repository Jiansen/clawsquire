//! ClawSquire JSON-RPC 2.0 protocol definitions.
//!
//! Defines the wire format for Desktop <-> clawsquire-serve communication.
//! This module contains only types and constants — no I/O or connection logic.
//!
//! # Design invariant: OpenClaw CLI as universal backend
//!
//! ClawSquire has no value without OpenClaw installed. Every protocol method
//! ultimately delegates to the OpenClaw CLI via `RealCliRunner`. This means:
//!
//! - **Bootstrap only needs the basics**: install Node.js + OpenClaw + serve binary.
//!   Once these three exist, the full protocol is operational.
//! - **`cli.run` is the escape hatch**: any OpenClaw subcommand can be executed
//!   remotely, even if we haven't defined a typed method for it yet. This is
//!   lower efficiency (string parsing) but a universal fallback.
//! - **No OpenClaw = no ClawSquire**: if `environment.detect` reports
//!   `openclaw_installed: false`, the Reconciliation Loop should prioritize
//!   `openclaw.install` before attempting any other method.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Protocol constants
// ---------------------------------------------------------------------------

pub const PROTOCOL_VERSION: &str = "0.3.0";
pub const DEFAULT_PORT: u16 = 18790;

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 envelope
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum RpcId {
    Num(i64),
    Str(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(default = "default_params")]
    pub params: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<RpcId>,
}

fn default_params() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
    pub id: Option<RpcId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

impl RpcRequest {
    pub fn new(method: &str, params: serde_json::Value, id: impl Into<RpcId>) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            method: method.into(),
            params,
            id: Some(id.into()),
        }
    }

    pub fn notification(method: &str, params: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            method: method.into(),
            params,
            id: None,
        }
    }
}

impl RpcResponse {
    pub fn success(id: Option<RpcId>, result: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            result: Some(result),
            error: None,
            id,
        }
    }

    pub fn error(id: Option<RpcId>, code: i32, message: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            result: None,
            error: Some(RpcError {
                code,
                message: message.into(),
                data: None,
            }),
            id,
        }
    }

    pub fn is_success(&self) -> bool {
        self.error.is_none() && self.result.is_some()
    }
}

impl From<i64> for RpcId {
    fn from(n: i64) -> Self {
        RpcId::Num(n)
    }
}

impl From<String> for RpcId {
    fn from(s: String) -> Self {
        RpcId::Str(s)
    }
}

impl From<&str> for RpcId {
    fn from(s: &str) -> Self {
        RpcId::Str(s.to_string())
    }
}

// ---------------------------------------------------------------------------
// Standard JSON-RPC 2.0 error codes + application-specific codes
// ---------------------------------------------------------------------------

pub mod error_code {
    pub const PARSE_ERROR: i32 = -32700;
    pub const INVALID_REQUEST: i32 = -32600;
    pub const METHOD_NOT_FOUND: i32 = -32601;
    pub const INVALID_PARAMS: i32 = -32602;
    pub const INTERNAL_ERROR: i32 = -32603;

    pub const AUTH_REQUIRED: i32 = -32000;
    pub const AUTH_FAILED: i32 = -32001;
    pub const OPENCLAW_ERROR: i32 = -32010;
    pub const OPENCLAW_NOT_INSTALLED: i32 = -32011;
}

// ---------------------------------------------------------------------------
// Method name constants (24 methods)
// ---------------------------------------------------------------------------

pub mod method {
    // Query (11)
    pub const ENVIRONMENT_DETECT: &str = "environment.detect";
    pub const CONFIG_GET: &str = "config.get";
    pub const CONFIG_FULL: &str = "config.full";
    pub const GATEWAY_STATUS: &str = "gateway.status";
    pub const PROVIDERS_LIST: &str = "providers.list";
    pub const MODELS_LIST: &str = "models.list";
    pub const LLM_CHECK: &str = "llm.check";
    pub const LLM_TEST_GATEWAY: &str = "llm.test_gateway";
    pub const CHANNELS_LIST: &str = "channels.list";
    pub const CRON_LIST: &str = "cron.list";
    pub const VERSION_INFO: &str = "version.info";

    // Mutation (11)
    pub const CONFIG_SET: &str = "config.set";
    pub const GATEWAY_START: &str = "gateway.start";
    pub const GATEWAY_STOP: &str = "gateway.stop";
    pub const PROVIDER_SETUP: &str = "provider.setup";
    pub const CHANNELS_ADD: &str = "channels.add";
    pub const CHANNELS_REMOVE: &str = "channels.remove";
    pub const CRON_ADD: &str = "cron.add";
    pub const CRON_REMOVE: &str = "cron.remove";
    pub const SAFETY_APPLY: &str = "safety.apply";
    pub const AGENT_CHAT: &str = "agent.chat";
    pub const EMAIL_MONITOR_SETUP: &str = "email_monitor.setup";

    // Lifecycle (3)
    pub const NODE_INSTALL: &str = "node.install";
    pub const OPENCLAW_INSTALL: &str = "openclaw.install";
    pub const OPENCLAW_UNINSTALL: &str = "openclaw.uninstall";

    // Utility (2)
    pub const CLI_RUN: &str = "cli.run";
    pub const DOCTOR_RUN: &str = "doctor.run";

    /// All 27 method names, for validation and dispatch.
    pub const ALL: &[&str] = &[
        ENVIRONMENT_DETECT,
        CONFIG_GET,
        CONFIG_FULL,
        GATEWAY_STATUS,
        PROVIDERS_LIST,
        MODELS_LIST,
        LLM_CHECK,
        LLM_TEST_GATEWAY,
        CHANNELS_LIST,
        CRON_LIST,
        VERSION_INFO,
        CONFIG_SET,
        GATEWAY_START,
        GATEWAY_STOP,
        PROVIDER_SETUP,
        CHANNELS_ADD,
        CHANNELS_REMOVE,
        CRON_ADD,
        CRON_REMOVE,
        SAFETY_APPLY,
        AGENT_CHAT,
        EMAIL_MONITOR_SETUP,
        NODE_INSTALL,
        OPENCLAW_INSTALL,
        OPENCLAW_UNINSTALL,
        CLI_RUN,
        DOCTOR_RUN,
    ];

    pub fn is_valid(name: &str) -> bool {
        ALL.contains(&name)
    }

    pub fn is_query(name: &str) -> bool {
        matches!(
            name,
            ENVIRONMENT_DETECT
                | CONFIG_GET
                | CONFIG_FULL
                | GATEWAY_STATUS
                | PROVIDERS_LIST
                | MODELS_LIST
                | LLM_CHECK
                | LLM_TEST_GATEWAY
                | CHANNELS_LIST
                | CRON_LIST
                | VERSION_INFO
        )
    }
}

// ---------------------------------------------------------------------------
// Typed request parameters for each method
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigGetParams {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigSetParams {
    pub path: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsListParams {
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSetupParams {
    pub provider: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelsAddParams {
    pub channel: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelsRemoveParams {
    pub channel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronAddParams {
    pub name: String,
    pub every: String,
    pub message: String,
    pub channel: String,
    #[serde(default)]
    pub announce: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronRemoveParams {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyApplyParams {
    pub level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatParams {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailMonitorSetupParams {
    pub telegram_token: String,
    pub email_address: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub check_interval: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenclawUninstallParams {
    #[serde(default)]
    pub remove_config: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliRunParams {
    pub args: Vec<String>,
}

// ---------------------------------------------------------------------------
// Authentication handshake (WebSocket first frame)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthHandshake {
    pub protocol_version: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub ok: bool,
    pub agent_info: Option<AgentInfo>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub hostname: String,
    pub os: String,
    pub arch: String,
    pub openclaw_version: Option<String>,
    pub serve_version: String,
}

impl AgentInfo {
    pub fn from_current_machine() -> Self {
        Self {
            hostname: hostname_or_unknown(),
            os: std::env::consts::OS.into(),
            arch: std::env::consts::ARCH.into(),
            openclaw_version: None,
            serve_version: env!("CARGO_PKG_VERSION").into(),
        }
    }
}

fn hostname_or_unknown() -> String {
    #[cfg(unix)]
    {
        use std::process::Command;
        Command::new("hostname")
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "unknown".into())
    }
    #[cfg(not(unix))]
    {
        std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "unknown".into())
    }
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Heartbeat {
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatAck {
    pub timestamp_ms: u64,
    pub gateway_running: bool,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_method_count() {
        assert_eq!(method::ALL.len(), 27);
    }

    #[test]
    fn test_method_uniqueness() {
        let mut seen = std::collections::HashSet::new();
        for m in method::ALL {
            assert!(seen.insert(m), "duplicate method: {}", m);
        }
    }

    #[test]
    fn test_method_naming_convention() {
        for m in method::ALL {
            assert!(
                m.contains('.'),
                "method '{}' must use namespace.action format",
                m
            );
            let parts: Vec<&str> = m.split('.').collect();
            assert_eq!(parts.len(), 2, "method '{}' must have exactly one dot", m);
            assert!(!parts[0].is_empty(), "method '{}' has empty namespace", m);
            assert!(!parts[1].is_empty(), "method '{}' has empty action", m);
        }
    }

    #[test]
    fn test_is_valid() {
        assert!(method::is_valid("config.get"));
        assert!(method::is_valid("cli.run"));
        assert!(!method::is_valid("foo.bar"));
        assert!(!method::is_valid("config_get"));
    }

    #[test]
    fn test_is_query() {
        assert!(method::is_query("environment.detect"));
        assert!(method::is_query("config.get"));
        assert!(method::is_query("version.info"));
        assert!(!method::is_query("config.set"));
        assert!(!method::is_query("gateway.start"));
        assert!(!method::is_query("cli.run"));
    }

    #[test]
    fn test_request_roundtrip() {
        let req = RpcRequest::new(
            method::CONFIG_GET,
            serde_json::json!({"path": "models.default"}),
            1i64,
        );
        let json = serde_json::to_string(&req).unwrap();
        let parsed: RpcRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.jsonrpc, "2.0");
        assert_eq!(parsed.method, "config.get");
        assert_eq!(parsed.id, Some(RpcId::Num(1)));
    }

    #[test]
    fn test_response_success_roundtrip() {
        let resp = RpcResponse::success(Some(RpcId::Num(1)), serde_json::json!({"running": true}));
        let json = serde_json::to_string(&resp).unwrap();
        let parsed: RpcResponse = serde_json::from_str(&json).unwrap();
        assert!(parsed.is_success());
        assert!(parsed.error.is_none());
        assert_eq!(parsed.id, Some(RpcId::Num(1)));
    }

    #[test]
    fn test_response_error_roundtrip() {
        let resp = RpcResponse::error(
            Some(RpcId::Str("abc".into())),
            error_code::METHOD_NOT_FOUND,
            "no such method",
        );
        let json = serde_json::to_string(&resp).unwrap();
        let parsed: RpcResponse = serde_json::from_str(&json).unwrap();
        assert!(!parsed.is_success());
        let err = parsed.error.unwrap();
        assert_eq!(err.code, -32601);
        assert_eq!(err.message, "no such method");
    }

    #[test]
    fn test_notification_has_no_id() {
        let req =
            RpcRequest::notification(method::GATEWAY_STATUS, serde_json::json!({}));
        assert!(req.id.is_none());
        let json = serde_json::to_string(&req).unwrap();
        assert!(!json.contains("\"id\""));
    }

    #[test]
    fn test_rpc_id_variants() {
        let num: RpcId = 42i64.into();
        assert_eq!(num, RpcId::Num(42));

        let str_id: RpcId = "req-1".into();
        assert_eq!(str_id, RpcId::Str("req-1".into()));
    }

    #[test]
    fn test_auth_handshake_roundtrip() {
        let hs = AuthHandshake {
            protocol_version: PROTOCOL_VERSION.into(),
            token: "secret-token-123".into(),
        };
        let json = serde_json::to_string(&hs).unwrap();
        let parsed: AuthHandshake = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.protocol_version, PROTOCOL_VERSION);
        assert_eq!(parsed.token, "secret-token-123");
    }

    #[test]
    fn test_agent_info_from_current() {
        let info = AgentInfo::from_current_machine();
        assert!(!info.hostname.is_empty());
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
        assert!(!info.serve_version.is_empty());
    }

    #[test]
    fn test_heartbeat_roundtrip() {
        let hb = Heartbeat {
            timestamp_ms: 1710000000000,
        };
        let json = serde_json::to_string(&hb).unwrap();
        let parsed: Heartbeat = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.timestamp_ms, 1710000000000);
    }

    #[test]
    fn test_error_codes_are_negative() {
        assert!(error_code::PARSE_ERROR < 0);
        assert!(error_code::INVALID_REQUEST < 0);
        assert!(error_code::METHOD_NOT_FOUND < 0);
        assert!(error_code::INVALID_PARAMS < 0);
        assert!(error_code::INTERNAL_ERROR < 0);
        assert!(error_code::AUTH_REQUIRED < 0);
        assert!(error_code::AUTH_FAILED < 0);
        assert!(error_code::OPENCLAW_ERROR < 0);
        assert!(error_code::OPENCLAW_NOT_INSTALLED < 0);
    }

    #[test]
    fn test_typed_params_roundtrip() {
        let params = CronAddParams {
            name: "daily-email".into(),
            every: "24h".into(),
            message: "Send digest".into(),
            channel: "telegram".into(),
            announce: true,
        };
        let json = serde_json::to_value(&params).unwrap();
        let parsed: CronAddParams = serde_json::from_value(json).unwrap();
        assert_eq!(parsed.name, "daily-email");
        assert!(parsed.announce);
    }

    #[test]
    fn test_email_monitor_params_optional_interval() {
        let json = serde_json::json!({
            "telegram_token": "tok",
            "email_address": "a@b.com"
        });
        let parsed: EmailMonitorSetupParams = serde_json::from_value(json).unwrap();
        assert!(parsed.check_interval.is_none());
    }

    #[test]
    fn test_request_missing_params_defaults_to_empty_object() {
        let json = r#"{"jsonrpc":"2.0","method":"gateway.status","id":1}"#;
        let req: RpcRequest = serde_json::from_str(json).unwrap();
        assert!(req.params.is_object());
        assert!(req.params.as_object().unwrap().is_empty());
    }
}
