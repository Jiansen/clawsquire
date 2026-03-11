use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

use clawsquire_core::cli_runner::{CliOutput, CliRunner};
use clawsquire_core::protocol::{
    method, is_protocol_compatible, AuthHandshake, AuthResponse, RpcId,
    RpcRequest, RpcResponse, PROTOCOL_VERSION,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_tungstenite::tungstenite::Message;

static NEXT_ID: AtomicI64 = AtomicI64::new(1);

fn next_id() -> i64 {
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}

type PendingMap = Arc<Mutex<HashMap<i64, oneshot::Sender<Result<serde_json::Value, String>>>>>;

/// WebSocket-based CliRunner that tunnels commands via JSON-RPC `cli.run`.
///
/// Maintains a persistent connection with a background I/O task.
/// The sync `CliRunner::run()` interface bridges to async via channels.
pub struct ProtocolRunner {
    _runtime: tokio::runtime::Runtime,
    tx: mpsc::UnboundedSender<RpcRequest>,
    pending: PendingMap,
    pub agent_info: Option<clawsquire_core::protocol::AgentInfo>,
}

impl ProtocolRunner {
    /// Connect to a clawsquire-serve instance.
    /// `token` is optional: None = SSH-tunnel-as-auth (v0.3.1+); Some = legacy token auth (v0.3.0).
    pub fn connect(url: &str, token: Option<&str>) -> Result<Self, String> {
        let rt = tokio::runtime::Runtime::new().map_err(|e| format!("runtime: {}", e))?;

        let url = url.to_string();
        let token = token.map(|t| t.to_string());
        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));

        let (agent_info, tx) = rt.block_on(async {
            tokio::time::timeout(
                std::time::Duration::from_secs(10),
                Self::connect_async(&url, token.as_deref(), Arc::clone(&pending)),
            )
            .await
            .map_err(|_| "Connection timed out (10 s). Is clawsquire-serve running on that host/port?".to_string())?
        })?;

        Ok(Self {
            _runtime: rt,
            tx,
            pending,
            agent_info: Some(agent_info),
        })
    }

    async fn connect_async(
        url: &str,
        token: Option<&str>,
        pending: PendingMap,
    ) -> Result<
        (
            clawsquire_core::protocol::AgentInfo,
            mpsc::UnboundedSender<RpcRequest>,
        ),
        String,
    > {
        let (ws_stream, _) = tokio_tungstenite::connect_async(url)
            .await
            .map_err(|e| format!("ws connect: {}", e))?;

        let (mut write, mut read) = ws_stream.split();

        // Auth handshake — token is None for SSH-tunnel-as-auth (v0.3.1+)
        let auth = AuthHandshake {
            protocol_version: PROTOCOL_VERSION.into(),
            token: token.map(|t| t.to_string()),
        };
        write
            .send(Message::Text(serde_json::to_string(&auth).unwrap()))
            .await
            .map_err(|e| format!("auth send: {}", e))?;

        let auth_msg = read
            .next()
            .await
            .ok_or("no auth response")?
            .map_err(|e| format!("auth read: {}", e))?;

        let auth_resp: AuthResponse = serde_json::from_str(
            &auth_msg
                .into_text()
                .map_err(|_| "auth response not text")?,
        )
        .map_err(|e| format!("auth parse: {}", e))?;

        if !auth_resp.ok {
            return Err(auth_resp.error.unwrap_or("auth failed".into()));
        }

        let agent_info = auth_resp.agent_info.ok_or("no agent info")?;

        // Warn if minor/patch version differs (major mismatch was rejected by server).
        if !is_protocol_compatible(PROTOCOL_VERSION, &agent_info.serve_version) {
            // Log a warning but don't abort — minor diffs are allowed.
            eprintln!(
                "[protocol_runner] version warning: desktop={} serve={}",
                PROTOCOL_VERSION, agent_info.serve_version
            );
        }

        // Request channel: sync callers send requests here
        let (req_tx, mut req_rx) = mpsc::unbounded_channel::<RpcRequest>();

        // Background I/O task
        let pending_clone = Arc::clone(&pending);
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(req) = req_rx.recv() => {
                        let text = serde_json::to_string(&req).unwrap();
                        if write.send(Message::Text(text)).await.is_err() {
                            break;
                        }
                    }
                    msg = read.next() => {
                        match msg {
                            Some(Ok(Message::Text(text))) => {
                                if let Ok(resp) = serde_json::from_str::<RpcResponse>(&text) {
                                    if let Some(RpcId::Num(id)) = &resp.id {
                                        let mut map = pending_clone.lock().await;
                                        if let Some(tx) = map.remove(id) {
                                            let result = if resp.is_success() {
                                                Ok(resp.result.unwrap_or(serde_json::Value::Null))
                                            } else {
                                                Err(resp.error.map(|e| e.message).unwrap_or("unknown error".into()))
                                            };
                                            let _ = tx.send(result);
                                        }
                                    }
                                }
                            }
                            Some(Ok(Message::Ping(data))) => {
                                let _ = write.send(Message::Pong(data)).await;
                            }
                            Some(Ok(Message::Close(_))) | None => break,
                            _ => {}
                        }
                    }
                }
            }
        });

        Ok((agent_info, req_tx))
    }

    /// Send a typed JSON-RPC request (blocking).
    pub fn call_blocking(
        &self,
        method_name: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let id = next_id();
        let req = RpcRequest::new(method_name, params, id);

        let (tx, rx) = oneshot::channel();
        {
            // Insert into pending map — need to block on the async lock
            // Since we have our own runtime, use block_on
            let pending = Arc::clone(&self.pending);
            self._runtime.block_on(async {
                pending.lock().await.insert(id, tx);
            });
        }

        self.tx
            .send(req)
            .map_err(|_| "connection closed".to_string())?;

        rx.blocking_recv()
            .map_err(|_| "response channel closed".to_string())?
    }
}

impl CliRunner for ProtocolRunner {
    fn run(&self, args: &[&str]) -> Result<CliOutput, String> {
        let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
        let params = serde_json::json!({ "args": args_owned });

        let value = self.call_blocking(method::CLI_RUN, params)?;

        serde_json::from_value(value).map_err(|e| format!("deserialize CliOutput: {}", e))
    }
}

// Send + Sync required by CliRunner trait bounds and Tauri state
unsafe impl Send for ProtocolRunner {}
unsafe impl Sync for ProtocolRunner {}
