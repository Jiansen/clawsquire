use russh::keys::*;
use russh::*;
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;

struct SshClient;

impl client::Handler for SshClient {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept all host keys for now (user-initiated connections only).
        // TODO: implement known_hosts verification
        Ok(true)
    }
}

#[derive(Debug, Serialize)]
pub struct SshExecResult {
    pub success: bool,
    pub exit_code: Option<u32>,
    pub stdout: String,
    pub stderr: String,
    pub error: Option<String>,
}

/// Connect via SSH and execute a command, returning combined output.
pub async fn ssh_exec(
    host: &str,
    port: u16,
    username: &str,
    auth_password: Option<&str>,
    auth_key_path: Option<&str>,
    command: &str,
) -> SshExecResult {
    match ssh_exec_inner(host, port, username, auth_password, auth_key_path, command).await {
        Ok(r) => r,
        Err(e) => SshExecResult {
            success: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some(e),
        },
    }
}

async fn ssh_exec_inner(
    host: &str,
    port: u16,
    username: &str,
    auth_password: Option<&str>,
    auth_key_path: Option<&str>,
    command: &str,
) -> Result<SshExecResult, String> {
    if auth_password.is_none() && auth_key_path.is_none() {
        return Err("No authentication method provided".into());
    }

    let config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(15)),
        ..Default::default()
    });

    let mut session = client::connect(config, (host, port), SshClient {})
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    // Authenticate
    if let Some(key_path) = auth_key_path {
        let expanded = if key_path.starts_with('~') {
            dirs::home_dir()
                .map(|h| key_path.replacen('~', &h.to_string_lossy(), 1))
                .unwrap_or_else(|| key_path.to_string())
        } else {
            key_path.to_string()
        };
        let key_pair =
            load_secret_key(&expanded, None).map_err(|e| format!("Failed to load key: {}", e))?;

        let auth_res = session
            .authenticate_publickey(
                username,
                PrivateKeyWithHashAlg::new(
                    Arc::new(key_pair),
                    session
                        .best_supported_rsa_hash()
                        .await
                        .map_err(|e| format!("RSA hash negotiation: {}", e))?
                        .flatten(),
                ),
            )
            .await
            .map_err(|e| format!("Key auth failed: {}", e))?;

        if !auth_res.success() {
            return Err("Public key authentication rejected".into());
        }
    } else if let Some(password) = auth_password {
        let auth_res = session
            .authenticate_password(username, password)
            .await
            .map_err(|e| format!("Password auth failed: {}", e))?;

        if !auth_res.success() {
            return Err("Password authentication rejected".into());
        }
    }

    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| format!("Channel open failed: {}", e))?;

    channel
        .exec(true, command)
        .await
        .map_err(|e| format!("Exec failed: {}", e))?;

    let mut stdout_buf = Vec::new();
    let mut stderr_buf = Vec::new();
    let mut exit_code: Option<u32> = None;

    loop {
        let Some(msg) = channel.wait().await else {
            break;
        };
        match msg {
            ChannelMsg::Data { ref data } => {
                stdout_buf.extend_from_slice(data);
            }
            ChannelMsg::ExtendedData { ref data, ext } => {
                if ext == 1 {
                    stderr_buf.extend_from_slice(data);
                }
            }
            ChannelMsg::ExitStatus { exit_status } => {
                exit_code = Some(exit_status);
            }
            _ => {}
        }
    }

    let _ = session
        .disconnect(Disconnect::ByApplication, "", "en")
        .await;

    let code = exit_code.unwrap_or(0);
    Ok(SshExecResult {
        success: code == 0,
        exit_code: Some(code),
        stdout: String::from_utf8_lossy(&stdout_buf).to_string(),
        stderr: String::from_utf8_lossy(&stderr_buf).to_string(),
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_no_auth_returns_error() {
        let result = ssh_exec("127.0.0.1", 22, "test", None, None, "echo hi").await;
        assert!(!result.success);
        assert!(result.error.unwrap().contains("No authentication method"));
    }
}
