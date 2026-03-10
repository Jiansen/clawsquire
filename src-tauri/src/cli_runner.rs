use std::process::Output;

pub struct CliOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

impl CliOutput {
    pub fn from_output(output: &Output) -> Self {
        Self {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        }
    }
}

pub trait CliRunner: Send + Sync {
    fn run(&self, args: &[&str]) -> Result<CliOutput, String>;
}

pub struct RealCliRunner;

impl CliRunner for RealCliRunner {
    fn run(&self, args: &[&str]) -> Result<CliOutput, String> {
        let output = crate::detect::cmd_with_path(crate::constants::OPENCLAW_CLI)
            .args(args)
            .output()
            .map_err(|e| format!("Failed to execute openclaw: {}", e))?;
        Ok(CliOutput::from_output(&output))
    }
}

/// Global default runner for production use
pub fn default_runner() -> &'static dyn CliRunner {
    static RUNNER: RealCliRunner = RealCliRunner;
    &RUNNER
}


/// CLI runner that executes openclaw commands on a remote VPS via SSH.
/// Creates a dedicated tokio runtime per call to avoid conflicts with
/// the Tauri async runtime (safe from spawn_blocking threads).
pub struct SshCliRunner {
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    key_path: Option<String>,
}

impl SshCliRunner {
    pub fn new(conn: crate::active_target::VpsConnection) -> Self {
        Self {
            host: conn.host,
            port: conn.port,
            username: conn.username,
            password: conn.password,
            key_path: conn.key_path,
        }
    }
}

impl CliRunner for SshCliRunner {
    fn run(&self, args: &[&str]) -> Result<CliOutput, String> {
        let cmd = format!(
            "openclaw {}",
            args.iter()
                .map(|a| crate::util::shell_escape(a))
                .collect::<Vec<_>>()
                .join(" ")
        );

        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("Failed to create SSH runtime: {}", e))?;

        let result = rt.block_on(crate::ssh::ssh_exec(
            &self.host,
            self.port,
            &self.username,
            self.password.as_deref(),
            self.key_path.as_deref(),
            &cmd,
        ));

        if let Some(err) = result.error {
            Err(format!("SSH error: {}", err))
        } else {
            Ok(CliOutput {
                success: result.success,
                stdout: result.stdout.trim().to_string(),
                stderr: result.stderr.trim().to_string(),
            })
        }
    }
}

#[cfg(test)]
pub mod mock {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::Mutex;

    pub struct MockCliRunner {
        responses: Mutex<VecDeque<CliOutput>>,
    }

    impl MockCliRunner {
        pub fn new() -> Self {
            Self { responses: Mutex::new(VecDeque::new()) }
        }

        pub fn push_response(&self, success: bool, stdout: &str, stderr: &str) {
            self.responses.lock().unwrap().push_back(CliOutput {
                success,
                stdout: stdout.to_string(),
                stderr: stderr.to_string(),
            });
        }
    }

    impl CliRunner for MockCliRunner {
        fn run(&self, _args: &[&str]) -> Result<CliOutput, String> {
            self.responses
                .lock()
                .unwrap()
                .pop_front()
                .ok_or_else(|| "No mock response queued".to_string())
        }
    }

    #[test]
    fn test_mock_runner() {
        let mock = MockCliRunner::new();
        mock.push_response(true, "hello", "");
        let result = mock.run(&["test"]).unwrap();
        assert!(result.success);
        assert_eq!(result.stdout, "hello");
    }

    #[test]
    fn test_mock_multiple_responses() {
        let mock = MockCliRunner::new();
        mock.push_response(true, "first", "");
        mock.push_response(false, "", "error");

        let r1 = mock.run(&["a"]).unwrap();
        assert!(r1.success);
        assert_eq!(r1.stdout, "first");

        let r2 = mock.run(&["b"]).unwrap();
        assert!(!r2.success);
        assert_eq!(r2.stderr, "error");
    }

    #[test]
    fn test_mock_empty_returns_error() {
        let mock = MockCliRunner::new();
        assert!(mock.run(&["test"]).is_err());
    }
}
