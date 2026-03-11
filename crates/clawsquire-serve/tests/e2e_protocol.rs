//! Process-level E2E test: start serve → connect via WebSocket → exercise protocol methods.
//!
//! This test spawns a real `clawsquire-serve` binary, connects to it,
//! and validates the JSON-RPC protocol end-to-end.

use clawsquire_core::protocol::*;
use futures_util::{SinkExt, StreamExt};
use std::process::{Child, Command};
use tokio_tungstenite::tungstenite::Message;

use std::sync::atomic::{AtomicU16, Ordering};

const TEST_TOKEN: &str = "test-e2e-token-42";
static PORT_COUNTER: AtomicU16 = AtomicU16::new(19790);

struct ServeProcess {
    child: Child,
    port: u16,
}

impl ServeProcess {
    fn start() -> Self {
        Self::start_with_token(Some(TEST_TOKEN))
    }

    fn start_no_token() -> Self {
        Self::start_with_token(None)
    }

    fn start_with_token(token: Option<&str>) -> Self {
        let port = PORT_COUNTER.fetch_add(1, Ordering::Relaxed);
        let binary = env!("CARGO_BIN_EXE_clawsquire-serve");

        let mut args = vec!["--port".to_string(), port.to_string()];
        if let Some(t) = token {
            args.push("--token".to_string());
            args.push(t.to_string());
        }

        let child = Command::new(binary)
            .args(&args)
            .stderr(std::process::Stdio::piped())
            .spawn()
            .expect("failed to start clawsquire-serve");

        // Wait for port to become connectable (up to 5s)
        let addr = format!("127.0.0.1:{}", port);
        for _ in 0..50 {
            if std::net::TcpStream::connect(&addr).is_ok() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        Self { child, port }
    }

    fn ws_url(&self) -> String {
        format!("ws://127.0.0.1:{}", self.port)
    }
}

impl Drop for ServeProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

async fn connect_and_auth(
    url: &str,
    token: &str,
) -> (
    futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
    AuthResponse,
) {
    let (ws, _) = tokio_tungstenite::connect_async(url)
        .await
        .expect("ws connect failed");
    let (mut write, mut read) = ws.split();

    let auth = AuthHandshake {
        protocol_version: PROTOCOL_VERSION.into(),
        token: if token.is_empty() { None } else { Some(token.into()) },
    };
    write
        .send(Message::Text(serde_json::to_string(&auth).unwrap()))
        .await
        .unwrap();

    let msg = read.next().await.unwrap().unwrap();
    let resp: AuthResponse = serde_json::from_str(&msg.into_text().unwrap()).unwrap();

    (write, read, resp)
}

async fn call(
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    read: &mut futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
    method_name: &str,
    params: serde_json::Value,
    id: i64,
) -> RpcResponse {
    let req = RpcRequest::new(method_name, params, id);
    write
        .send(Message::Text(serde_json::to_string(&req).unwrap()))
        .await
        .unwrap();

    let msg = read.next().await.unwrap().unwrap();
    serde_json::from_str(&msg.into_text().unwrap()).unwrap()
}

/// v0.3.1 SSH-tunnel-as-auth: serve started without --token accepts connections with no token.
#[tokio::test]
async fn test_auth_no_token_ssh_tunnel_mode() {
    let serve = ServeProcess::start_no_token();
    // Connect with no token (v0.3.1+ Desktop)
    let (_write, _read, resp) = connect_and_auth(&serve.ws_url(), "").await;
    assert!(resp.ok, "no-token connection should be accepted in SSH-tunnel-as-auth mode");
    let info = resp.agent_info.unwrap();
    assert!(!info.os.is_empty());
}

#[tokio::test]
async fn test_auth_success() {
    let serve = ServeProcess::start();
    let (_write, _read, resp) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;

    assert!(resp.ok);
    let info = resp.agent_info.unwrap();
    assert!(!info.os.is_empty());
    assert!(!info.arch.is_empty());
    assert_eq!(info.serve_version, env!("CARGO_PKG_VERSION"));
}

#[tokio::test]
async fn test_auth_includes_server_capabilities() {
    let serve = ServeProcess::start();
    let (_write, _read, resp) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;

    assert!(resp.ok);
    let caps = resp.server_capabilities.expect("server_capabilities must be present");
    assert_eq!(caps.protocol_version, PROTOCOL_VERSION);
    // Must include all 27 methods
    assert_eq!(caps.methods.len(), method::ALL.len());
    assert!(caps.methods.contains(&"environment.detect".to_string()));
    assert!(caps.methods.contains(&"cli.run".to_string()));
}

#[tokio::test]
async fn test_version_mismatch_rejects_connection() {
    let serve = ServeProcess::start();
    let (ws, _) = tokio_tungstenite::connect_async(&serve.ws_url())
        .await
        .unwrap();
    let (mut write, mut read) = ws.split();

    // Send a client with an incompatible major version
    let auth = AuthHandshake {
        protocol_version: "99.0.0".into(),
        token: Some(TEST_TOKEN.into()),
    };
    write
        .send(Message::Text(serde_json::to_string(&auth).unwrap()))
        .await
        .unwrap();

    let msg = read.next().await.unwrap().unwrap();
    let resp: AuthResponse = serde_json::from_str(&msg.into_text().unwrap()).unwrap();

    assert!(!resp.ok);
    let err = resp.error.expect("error message required on version mismatch");
    assert!(err.contains("protocol version mismatch"), "error: {err}");
    // Server still returns capabilities so client knows what version to upgrade to
    assert!(resp.server_capabilities.is_some());
}

#[tokio::test]
async fn test_auth_failure() {
    let serve = ServeProcess::start();
    let (ws, _) = tokio_tungstenite::connect_async(&serve.ws_url())
        .await
        .unwrap();
    let (mut write, mut read) = ws.split();

    let auth = AuthHandshake {
        protocol_version: PROTOCOL_VERSION.into(),
        token: Some("wrong-token".into()),
    };
    write
        .send(Message::Text(serde_json::to_string(&auth).unwrap()))
        .await
        .unwrap();

    let msg = read.next().await.unwrap().unwrap();
    let resp: AuthResponse = serde_json::from_str(&msg.into_text().unwrap()).unwrap();
    assert!(!resp.ok);
    assert!(resp.error.is_some());
}

#[tokio::test]
async fn test_environment_detect() {
    let serve = ServeProcess::start();
    let (mut write, mut read, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;

    let resp = call(
        &mut write,
        &mut read,
        method::ENVIRONMENT_DETECT,
        serde_json::json!({}),
        1,
    )
    .await;

    assert!(resp.is_success());
    let result = resp.result.unwrap();
    assert!(result.get("platform").is_some());
}

#[tokio::test]
async fn test_unknown_method() {
    let serve = ServeProcess::start();
    let (mut write, mut read, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;

    let resp = call(
        &mut write,
        &mut read,
        "foo.bar",
        serde_json::json!({}),
        2,
    )
    .await;

    assert!(!resp.is_success());
    let err = resp.error.unwrap();
    assert_eq!(err.code, error_code::METHOD_NOT_FOUND);
}

#[tokio::test]
async fn test_version_info() {
    let serve = ServeProcess::start();
    let (mut write, mut read, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;

    let resp = call(
        &mut write,
        &mut read,
        method::VERSION_INFO,
        serde_json::json!({}),
        3,
    )
    .await;

    // May fail if OpenClaw not installed, which is fine — just verify protocol works
    assert!(resp.id == Some(RpcId::Num(3)));
}

#[tokio::test]
async fn test_heartbeat() {
    let serve = ServeProcess::start();
    let (mut write, mut read, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;

    let hb = Heartbeat {
        timestamp_ms: 1710000000000,
    };
    write
        .send(Message::Text(serde_json::to_string(&hb).unwrap()))
        .await
        .unwrap();

    let msg = read.next().await.unwrap().unwrap();
    let ack: HeartbeatAck = serde_json::from_str(&msg.into_text().unwrap()).unwrap();
    assert_eq!(ack.timestamp_ms, 1710000000000);
}

#[tokio::test]
async fn test_multiple_requests_sequential() {
    let serve = ServeProcess::start();
    let (mut write, mut read, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;

    for i in 10..13 {
        let resp = call(
            &mut write,
            &mut read,
            method::ENVIRONMENT_DETECT,
            serde_json::json!({}),
            i,
        )
        .await;
        assert!(resp.is_success());
        assert_eq!(resp.id, Some(RpcId::Num(i)));
    }
}

// ---------------------------------------------------------------------------
// Full method coverage — verify every method is routed and returns valid
// JSON-RPC. Methods that need OpenClaw may return OPENCLAW_ERROR, which
// is fine; we're testing the protocol transport layer, not OpenClaw.
// ---------------------------------------------------------------------------

fn is_valid_response(resp: &RpcResponse) -> bool {
    resp.jsonrpc == "2.0" && (resp.result.is_some() || resp.error.is_some())
}

#[tokio::test]
async fn test_config_get_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::CONFIG_GET, serde_json::json!({"path": "models.default"}), 100).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_config_full_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::CONFIG_FULL, serde_json::json!({}), 101).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_gateway_status_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::GATEWAY_STATUS, serde_json::json!({}), 102).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_providers_list_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::PROVIDERS_LIST, serde_json::json!({}), 103).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_models_list_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::MODELS_LIST, serde_json::json!({"provider": "openai"}), 104).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_llm_check_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::LLM_CHECK, serde_json::json!({}), 105).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_channels_list_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::CHANNELS_LIST, serde_json::json!({}), 106).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_cron_list_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::CRON_LIST, serde_json::json!({}), 107).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_config_set_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::CONFIG_SET, serde_json::json!({"path": "test.key", "value": "test_val"}), 110).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_safety_apply_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::SAFETY_APPLY, serde_json::json!({"level": "standard"}), 111).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_agent_chat_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::AGENT_CHAT, serde_json::json!({"message": "hello"}), 112).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_cli_run_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::CLI_RUN, serde_json::json!({"args": ["--version"]}), 113).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_doctor_run_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::DOCTOR_RUN, serde_json::json!({}), 114).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_channels_add_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::CHANNELS_ADD, serde_json::json!({"channel": "test", "token": "tok"}), 115).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_channels_remove_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::CHANNELS_REMOVE, serde_json::json!({"channel": "test"}), 116).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_cron_add_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::CRON_ADD, serde_json::json!({"name": "test", "every": "1h", "message": "m", "channel": "c"}), 117).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_cron_remove_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::CRON_REMOVE, serde_json::json!({"name": "test"}), 118).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_provider_setup_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::PROVIDER_SETUP, serde_json::json!({"provider": "test", "api_key": "sk-test"}), 119).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_gateway_start_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::GATEWAY_START, serde_json::json!({}), 120).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_gateway_stop_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::GATEWAY_STOP, serde_json::json!({}), 121).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_email_monitor_setup_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::EMAIL_MONITOR_SETUP, serde_json::json!({"telegram_token": "t", "email_address": "a@b.com"}), 122).await;
    assert!(is_valid_response(&resp));
}

#[tokio::test]
async fn test_invalid_params_protocol() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;
    let resp = call(&mut w, &mut r, method::CONFIG_GET, serde_json::json!({"wrong": 123}), 130).await;
    assert!(!resp.is_success());
    let err = resp.error.unwrap();
    assert_eq!(err.code, error_code::OPENCLAW_ERROR);
}

#[tokio::test]
async fn test_all_methods_routed() {
    let serve = ServeProcess::start();
    let (mut w, mut r, _) = connect_and_auth(&serve.ws_url(), TEST_TOKEN).await;

    let test_cases: Vec<(&str, serde_json::Value)> = vec![
        (method::ENVIRONMENT_DETECT, serde_json::json!({})),
        (method::CONFIG_GET, serde_json::json!({"path": "test"})),
        (method::CONFIG_FULL, serde_json::json!({})),
        (method::GATEWAY_STATUS, serde_json::json!({})),
        (method::PROVIDERS_LIST, serde_json::json!({})),
        (method::MODELS_LIST, serde_json::json!({"provider": "openai"})),
        (method::LLM_CHECK, serde_json::json!({})),
        (method::CHANNELS_LIST, serde_json::json!({})),
        (method::CRON_LIST, serde_json::json!({})),
        (method::VERSION_INFO, serde_json::json!({})),
        (method::CONFIG_SET, serde_json::json!({"path": "t", "value": "v"})),
        (method::SAFETY_APPLY, serde_json::json!({"level": "full"})),
        (method::AGENT_CHAT, serde_json::json!({"message": "test"})),
        (method::CLI_RUN, serde_json::json!({"args": ["--help"]})),
        (method::DOCTOR_RUN, serde_json::json!({})),
        (method::CHANNELS_ADD, serde_json::json!({"channel": "t", "token": "t"})),
        (method::CHANNELS_REMOVE, serde_json::json!({"channel": "t"})),
        (method::CRON_ADD, serde_json::json!({"name": "n", "every": "1h", "message": "m", "channel": "c"})),
        (method::CRON_REMOVE, serde_json::json!({"name": "n"})),
        (method::PROVIDER_SETUP, serde_json::json!({"provider": "t", "api_key": "k"})),
        (method::GATEWAY_START, serde_json::json!({})),
        (method::GATEWAY_STOP, serde_json::json!({})),
        (method::EMAIL_MONITOR_SETUP, serde_json::json!({"telegram_token": "t", "email_address": "a@b.com"})),
        (method::OPENCLAW_UNINSTALL, serde_json::json!({"remove_config": false})),
    ];

    for (i, (m, params)) in test_cases.iter().enumerate() {
        let id = (200 + i) as i64;
        let resp = call(&mut w, &mut r, m, params.clone(), id).await;
        assert!(
            is_valid_response(&resp),
            "method {} returned invalid response",
            m
        );
        assert_ne!(
            resp.error.as_ref().map(|e| e.code),
            Some(error_code::METHOD_NOT_FOUND),
            "method {} not routed in dispatch",
            m
        );
    }
}
