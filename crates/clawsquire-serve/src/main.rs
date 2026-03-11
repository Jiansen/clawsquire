mod dispatch;
mod server;

use clawsquire_core::protocol;
use std::net::SocketAddr;

fn generate_token() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::time::SystemTime;

    let mut hasher = DefaultHasher::new();
    SystemTime::now().hash(&mut hasher);
    std::process::id().hash(&mut hasher);
    format!("cs-{:016x}", hasher.finish())
}

fn print_usage() {
    eprintln!(
        "clawsquire-serve v{} — headless OpenClaw management agent",
        env!("CARGO_PKG_VERSION")
    );
    eprintln!();
    eprintln!("USAGE:");
    eprintln!("  clawsquire-serve [OPTIONS]");
    eprintln!();
    eprintln!("OPTIONS:");
    eprintln!("  --port <PORT>    Listen port (default: {})", protocol::DEFAULT_PORT);
    eprintln!("  --token <TOKEN>  Auth token (default: auto-generated)");
    eprintln!("  --init           Print generated token and exit");
    eprintln!("  --help           Show this message");
}

fn parse_args() -> Result<(u16, Option<String>, bool), String> {
    let args: Vec<String> = std::env::args().collect();
    let mut port = protocol::DEFAULT_PORT;
    let mut token: Option<String> = None;
    let mut init_only = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--port" => {
                i += 1;
                port = args
                    .get(i)
                    .ok_or("--port requires a value")?
                    .parse()
                    .map_err(|_| "invalid port number")?;
            }
            "--token" => {
                i += 1;
                token = Some(
                    args.get(i)
                        .ok_or("--token requires a value")?
                        .clone(),
                );
            }
            "--init" => {
                init_only = true;
            }
            "--help" | "-h" => {
                print_usage();
                std::process::exit(0);
            }
            other => {
                return Err(format!("unknown argument: {}", other));
            }
        }
        i += 1;
    }

    // token is None when not provided → SSH-tunnel-as-auth mode (v0.3.1+)
    Ok((port, token, init_only))
}

#[tokio::main]
async fn main() {
    let (port, token, init_only) = match parse_args() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("error: {}", e);
            print_usage();
            std::process::exit(1);
        }
    };

    if init_only {
        println!("{}", serde_json::json!({
            "token": token,
            "port": port,
            "protocol_version": protocol::PROTOCOL_VERSION,
            "ready": true,
        }));
        return;
    }

    match &token {
        Some(t) => eprintln!("[clawsquire-serve] token: {} (v0.3.0 compat mode)", t),
        None => eprintln!("[clawsquire-serve] token: none (SSH-tunnel-as-auth mode)"),
    }

    // Bind to localhost-only: SSH tunnel is the only entry point (SSH-as-auth model).
    // This prevents direct internet access to the serve port even if the VPS firewall is open.
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    let config = server::ServerConfig {
        addr,
        token,
    };

    // server::run prints the ready JSON (with actual port) to stdout
    if let Err(e) = server::run(config).await {
        eprintln!("fatal: {}", e);
        std::process::exit(1);
    }
}
