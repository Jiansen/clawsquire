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
        let port = PORT_COUNTER.fetch_add(1, Ordering::Relaxed);
        let binary = env!("CARGO_BIN_EXE_clawsquire-serve");

        let child = Command::new(binary)
            .args(["--port", &port.to_string(), "--token", TEST_TOKEN])
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
        token: token.into(),
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
async fn test_auth_failure() {
    let serve = ServeProcess::start();
    let (ws, _) = tokio_tungstenite::connect_async(&serve.ws_url())
        .await
        .unwrap();
    let (mut write, mut read) = ws.split();

    let auth = AuthHandshake {
        protocol_version: PROTOCOL_VERSION.into(),
        token: "wrong-token".into(),
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

    // Send 3 requests sequentially
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
