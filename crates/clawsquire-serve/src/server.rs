use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;

use clawsquire_core::protocol::{
    self, AuthHandshake, AuthResponse, AgentInfo, HeartbeatAck,
    RpcRequest, PROTOCOL_VERSION,
};

use crate::dispatch;

pub struct ServerConfig {
    pub addr: SocketAddr,
    pub token: String,
}

/// Returns the actual bound address (important when port=0).
pub async fn run(config: ServerConfig) -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind(&config.addr).await?;
    let actual_addr = listener.local_addr()?;
    let token = Arc::new(config.token);

    eprintln!(
        "[clawsquire-serve] listening on ws://{}  (protocol {})",
        actual_addr, PROTOCOL_VERSION
    );

    // Structured ready signal — sidecar launcher reads this from stdout
    println!(
        "{}",
        serde_json::json!({
            "ready": true,
            "port": actual_addr.port(),
            "protocol_version": PROTOCOL_VERSION,
        })
    );

    loop {
        let (stream, peer) = listener.accept().await?;
        let token = Arc::clone(&token);
        tokio::spawn(async move {
            if let Err(e) = handle_connection(stream, peer, &token).await {
                eprintln!("[clawsquire-serve] connection error from {}: {}", peer, e);
            }
        });
    }
}

async fn handle_connection(
    stream: TcpStream,
    peer: SocketAddr,
    expected_token: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_stream = tokio_tungstenite::accept_async(stream).await?;
    let (mut write, mut read) = ws_stream.split();

    eprintln!("[clawsquire-serve] new connection from {}", peer);

    // --- Phase 1: Auth handshake (first message must be AuthHandshake) ---
    let auth_msg = tokio::time::timeout(std::time::Duration::from_secs(10), read.next())
        .await
        .map_err(|_| "auth handshake timeout")?
        .ok_or("connection closed before auth")??;

    let auth_text = auth_msg
        .into_text()
        .map_err(|_| "auth message must be text")?;

    let handshake: AuthHandshake =
        serde_json::from_str(&auth_text).map_err(|e| format!("invalid auth: {}", e))?;

    if handshake.token != expected_token {
        let resp = AuthResponse {
            ok: false,
            agent_info: None,
            error: Some("invalid token".into()),
        };
        write
            .send(Message::Text(serde_json::to_string(&resp)?))
            .await?;
        return Err("auth failed".into());
    }

    let agent_info = AgentInfo::from_current_machine();
    let resp = AuthResponse {
        ok: true,
        agent_info: Some(agent_info),
        error: None,
    };
    write
        .send(Message::Text(serde_json::to_string(&resp)?))
        .await?;

    eprintln!("[clawsquire-serve] {} authenticated", peer);

    // --- Phase 2: Request/response loop ---
    while let Some(msg) = read.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[clawsquire-serve] read error from {}: {}", peer, e);
                break;
            }
        };

        match msg {
            Message::Text(text) => {
                let response_text = handle_text_message(&text);
                write.send(Message::Text(response_text)).await?;
            }
            Message::Ping(data) => {
                write.send(Message::Pong(data)).await?;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    eprintln!("[clawsquire-serve] {} disconnected", peer);
    Ok(())
}

fn handle_text_message(text: &str) -> String {
    // Try as Heartbeat first (lightweight, no method field)
    if let Ok(hb) = serde_json::from_str::<protocol::Heartbeat>(text) {
        if !text.contains("\"method\"") {
            let ack = HeartbeatAck {
                timestamp_ms: hb.timestamp_ms,
                gateway_running: check_gateway_running(),
            };
            return serde_json::to_string(&ack).unwrap_or_default();
        }
    }

    // Parse as JSON-RPC request
    let req: RpcRequest = match serde_json::from_str(text) {
        Ok(r) => r,
        Err(e) => {
            let resp = protocol::RpcResponse::error(
                None,
                protocol::error_code::PARSE_ERROR,
                format!("parse error: {}", e),
            );
            return serde_json::to_string(&resp).unwrap_or_default();
        }
    };

    // Dispatch synchronously in a blocking context
    let resp = dispatch::handle(&req);
    serde_json::to_string(&resp).unwrap_or_default()
}

fn check_gateway_running() -> bool {
    clawsquire_core::openclaw::daemon_status_with(clawsquire_core::cli_runner::default_runner())
        .map(|s| s.running)
        .unwrap_or(false)
}

fn _now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
