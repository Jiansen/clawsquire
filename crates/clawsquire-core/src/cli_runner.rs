use serde::{Deserialize, Serialize};
use std::process::Output;

#[derive(Debug, Serialize, Deserialize)]
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
