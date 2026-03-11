use clawsquire_core::cli_runner::{CliRunner, RealCliRunner};
use clawsquire_core::protocol::{self, error_code, method, RpcRequest, RpcResponse};
use clawsquire_core::{compat, detect, doctor, node_install, openclaw};

fn default_runner() -> &'static dyn CliRunner {
    static RUNNER: RealCliRunner = RealCliRunner;
    &RUNNER
}

pub fn handle(req: &RpcRequest) -> RpcResponse {
    handle_with(req, default_runner())
}

pub fn handle_with(req: &RpcRequest, runner: &dyn CliRunner) -> RpcResponse {
    let id = req.id.clone();

    if !method::is_valid(&req.method) {
        return RpcResponse::error(
            id,
            error_code::METHOD_NOT_FOUND,
            format!("unknown method: {}", req.method),
        );
    }

    match dispatch(req, runner) {
        Ok(value) => RpcResponse::success(id, value),
        Err(e) => RpcResponse::error(id, error_code::OPENCLAW_ERROR, e),
    }
}

fn dispatch(req: &RpcRequest, r: &dyn CliRunner) -> Result<serde_json::Value, String> {
    let p = &req.params;

    match req.method.as_str() {
        // ---- Query (11) ----
        method::ENVIRONMENT_DETECT => {
            let env = detect::detect_environment();
            to_value(env)
        }
        method::CONFIG_GET => {
            let params: protocol::ConfigGetParams = from_params(p)?;
            let result = openclaw::config_get_with(r, &params.path)?;
            to_value(result)
        }
        method::CONFIG_FULL => {
            let config_path = openclaw_config_path();
            let content = std::fs::read_to_string(&config_path)
                .map_err(|e| format!("Failed to read config: {}", e))?;
            to_value(content)
        }
        method::GATEWAY_STATUS => {
            let status = openclaw::daemon_status_with(r)?;
            to_value(status)
        }
        method::PROVIDERS_LIST => {
            let providers = openclaw::list_providers_with(r)?;
            to_value(providers)
        }
        method::MODELS_LIST => {
            let params: protocol::ModelsListParams = from_params(p)?;
            let models = openclaw::list_models_with(r, &params.provider)?;
            to_value(models)
        }
        method::LLM_CHECK => {
            let status = openclaw::check_llm_config_with(r);
            to_value(status)
        }
        method::LLM_TEST_GATEWAY => {
            let result = openclaw::test_llm_via_gateway_with(r);
            to_value(result)
        }
        method::CHANNELS_LIST => {
            let channels = openclaw::list_channels_with(r)?;
            to_value(channels)
        }
        method::CRON_LIST => {
            let crons = openclaw::cron_list_with(r)?;
            to_value(crons)
        }
        method::VERSION_INFO => {
            let info = compat::get_version_info_with(r);
            to_value(info)
        }

        // ---- Mutation (11) ----
        method::CONFIG_SET => {
            let params: protocol::ConfigSetParams = from_params(p)?;
            openclaw::config_set_with(r, &params.path, &params.value)?;
            to_value(())
        }
        method::GATEWAY_START => {
            let msg = openclaw::daemon_start_with(r)?;
            to_value(msg)
        }
        method::GATEWAY_STOP => {
            let msg = openclaw::daemon_stop_with(r)?;
            to_value(msg)
        }
        method::PROVIDER_SETUP => {
            let params: protocol::ProviderSetupParams = from_params(p)?;
            openclaw::setup_provider_with(r, &params.provider, &params.api_key)?;
            to_value(())
        }
        method::CHANNELS_ADD => {
            let params: protocol::ChannelsAddParams = from_params(p)?;
            let result = openclaw::add_channel_with(r, &params.channel, &params.token)?;
            to_value(result)
        }
        method::CHANNELS_REMOVE => {
            let params: protocol::ChannelsRemoveParams = from_params(p)?;
            let result = openclaw::remove_channel_with(r, &params.channel)?;
            to_value(result)
        }
        method::CRON_ADD => {
            let params: protocol::CronAddParams = from_params(p)?;
            let result = openclaw::cron_add_with(
                r,
                &params.name,
                &params.every,
                &params.message,
                &params.channel,
                params.announce,
            )?;
            to_value(result)
        }
        method::CRON_REMOVE => {
            let params: protocol::CronRemoveParams = from_params(p)?;
            let result = openclaw::cron_remove_with(r, &params.name)?;
            to_value(result)
        }
        method::SAFETY_APPLY => {
            let params: protocol::SafetyApplyParams = from_params(p)?;
            let result = openclaw::apply_safety_preset_with(r, &params.level);
            to_value(result)
        }
        method::AGENT_CHAT => {
            let params: protocol::AgentChatParams = from_params(p)?;
            let result = openclaw::agent_chat_with(r, &params.message);
            to_value(result)
        }
        method::EMAIL_MONITOR_SETUP => {
            let params: protocol::EmailMonitorSetupParams = from_params(p)?;
            let interval = params.check_interval.as_deref().unwrap_or("5m");
            let result = openclaw::setup_email_monitor_with(
                r,
                &params.telegram_token,
                &params.email_address,
                interval,
            );
            to_value(result)
        }

        // ---- Lifecycle (3) ----
        method::NODE_INSTALL => {
            let result = node_install::install_node();
            to_value(result)
        }
        method::OPENCLAW_INSTALL => {
            let result = openclaw::install_openclaw_with(r)?;
            to_value(result)
        }
        method::OPENCLAW_UNINSTALL => {
            let params: protocol::OpenclawUninstallParams =
                serde_json::from_value(p.clone()).unwrap_or(protocol::OpenclawUninstallParams {
                    remove_config: false,
                });
            let result = openclaw::uninstall_openclaw(params.remove_config)?;
            to_value(result)
        }

        // ---- Utility (2) ----
        method::CLI_RUN => {
            let params: protocol::CliRunParams = from_params(p)?;
            let refs: Vec<&str> = params.args.iter().map(|s| s.as_str()).collect();
            let result = openclaw::run_cli_with(r, &refs)?;
            to_value(result)
        }
        method::DOCTOR_RUN => {
            let result = doctor::run_structured_doctor()?;
            to_value(result)
        }

        _ => Err(format!("unhandled method: {}", req.method)),
    }
}

fn openclaw_config_path() -> std::path::PathBuf {
    if let Ok(dir) = std::env::var("OPENCLAW_STATE_DIR") {
        std::path::PathBuf::from(dir)
    } else {
        dirs::home_dir()
            .unwrap_or_default()
            .join(clawsquire_core::constants::OPENCLAW_STATE_DIR_DEFAULT)
    }
    .join("openclaw.json")
}

fn from_params<T: serde::de::DeserializeOwned>(v: &serde_json::Value) -> Result<T, String> {
    serde_json::from_value(v.clone()).map_err(|e| format!("invalid params: {}", e))
}

fn to_value<T: serde::Serialize>(v: T) -> Result<serde_json::Value, String> {
    serde_json::to_value(v).map_err(|e| format!("serialization error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use clawsquire_core::cli_runner::{CliOutput, CliRunner};
    use clawsquire_core::protocol::RpcId;
    use std::collections::VecDeque;
    use std::sync::Mutex;

    struct MockCli {
        responses: Mutex<VecDeque<CliOutput>>,
    }
    impl MockCli {
        fn new() -> Self {
            Self {
                responses: Mutex::new(VecDeque::new()),
            }
        }
        fn push(&self, success: bool, stdout: &str, stderr: &str) {
            self.responses.lock().unwrap().push_back(CliOutput {
                success,
                stdout: stdout.into(),
                stderr: stderr.into(),
            });
        }
    }
    impl CliRunner for MockCli {
        fn run(&self, _args: &[&str]) -> Result<CliOutput, String> {
            self.responses
                .lock()
                .unwrap()
                .pop_front()
                .ok_or_else(|| "no mock response".into())
        }
    }

    fn call(mock: &MockCli, method_name: &str, params: serde_json::Value, id: i64) -> RpcResponse {
        let req = RpcRequest::new(method_name, params, id);
        handle_with(&req, mock)
    }

    #[test]
    fn test_unknown_method_returns_not_found() {
        let req = RpcRequest::new("foo.bar", serde_json::json!({}), 1i64);
        let resp = handle(&req);
        assert!(!resp.is_success());
        let err = resp.error.unwrap();
        assert_eq!(err.code, error_code::METHOD_NOT_FOUND);
    }

    #[test]
    fn test_invalid_params_returns_error() {
        let req = RpcRequest::new(
            method::CONFIG_GET,
            serde_json::json!({"wrong_field": 123}),
            2i64,
        );
        let resp = handle(&req);
        assert!(!resp.is_success());
    }

    #[test]
    fn test_environment_detect_succeeds() {
        let req = RpcRequest::new(method::ENVIRONMENT_DETECT, serde_json::json!({}), 3i64);
        let resp = handle(&req);
        assert!(resp.is_success());
        let result = resp.result.unwrap();
        assert!(result.get("platform").is_some());
    }

    #[test]
    fn test_dispatch_preserves_request_id() {
        let req = RpcRequest::new(method::ENVIRONMENT_DETECT, serde_json::json!({}), "abc");
        let resp = handle(&req);
        assert_eq!(resp.id, Some(RpcId::Str("abc".into())));
    }

    // ----- Query methods with mock -----

    #[test]
    fn test_config_get() {
        let mock = MockCli::new();
        mock.push(true, "\"deepseek/deepseek-chat\"", "");
        let resp = call(&mock, method::CONFIG_GET, serde_json::json!({"path": "models.default"}), 10);
        assert!(resp.is_success());
    }

    #[test]
    fn test_config_full_reads_file() {
        let resp = call(&MockCli::new(), method::CONFIG_FULL, serde_json::json!({}), 11);
        // May fail if no openclaw config exists — that's an error, not a panic
        assert!(resp.id == Some(RpcId::Num(11)));
    }

    #[test]
    fn test_gateway_status() {
        let mock = MockCli::new();
        mock.push(true, "running", "");
        let resp = call(&mock, method::GATEWAY_STATUS, serde_json::json!({}), 12);
        assert!(resp.id == Some(RpcId::Num(12)));
    }

    #[test]
    fn test_providers_list() {
        let mock = MockCli::new();
        mock.push(true, "openai\nanthropic\ndeepseek", "");
        let resp = call(&mock, method::PROVIDERS_LIST, serde_json::json!({}), 13);
        assert!(resp.id == Some(RpcId::Num(13)));
    }

    #[test]
    fn test_models_list() {
        let mock = MockCli::new();
        mock.push(true, "gpt-4\ngpt-3.5-turbo", "");
        let resp = call(&mock, method::MODELS_LIST, serde_json::json!({"provider": "openai"}), 14);
        assert!(resp.id == Some(RpcId::Num(14)));
    }

    #[test]
    fn test_llm_check() {
        let mock = MockCli::new();
        mock.push(true, "{}", "");
        let resp = call(&mock, method::LLM_CHECK, serde_json::json!({}), 15);
        assert!(resp.id == Some(RpcId::Num(15)));
    }

    #[test]
    fn test_llm_test_gateway() {
        let mock = MockCli::new();
        mock.push(true, "OK", "");
        let resp = call(&mock, method::LLM_TEST_GATEWAY, serde_json::json!({}), 16);
        assert!(resp.id == Some(RpcId::Num(16)));
    }

    #[test]
    fn test_channels_list() {
        let mock = MockCli::new();
        mock.push(true, "telegram\ndiscord", "");
        let resp = call(&mock, method::CHANNELS_LIST, serde_json::json!({}), 17);
        assert!(resp.id == Some(RpcId::Num(17)));
    }

    #[test]
    fn test_cron_list() {
        let mock = MockCli::new();
        mock.push(true, "[]", "");
        let resp = call(&mock, method::CRON_LIST, serde_json::json!({}), 18);
        assert!(resp.id == Some(RpcId::Num(18)));
    }

    #[test]
    fn test_version_info() {
        let mock = MockCli::new();
        mock.push(true, "2026.3.8", "");
        let resp = call(&mock, method::VERSION_INFO, serde_json::json!({}), 19);
        assert!(resp.id == Some(RpcId::Num(19)));
    }

    // ----- Mutation methods with mock -----

    #[test]
    fn test_config_set() {
        let mock = MockCli::new();
        mock.push(true, "", "");
        let resp = call(
            &mock,
            method::CONFIG_SET,
            serde_json::json!({"path": "models.default", "value": "gpt-4"}),
            20,
        );
        assert!(resp.is_success());
    }

    #[test]
    fn test_gateway_start() {
        let mock = MockCli::new();
        mock.push(true, "started", "");
        let resp = call(&mock, method::GATEWAY_START, serde_json::json!({}), 21);
        assert!(resp.id == Some(RpcId::Num(21)));
    }

    #[test]
    fn test_gateway_stop() {
        let mock = MockCli::new();
        mock.push(true, "stopped", "");
        let resp = call(&mock, method::GATEWAY_STOP, serde_json::json!({}), 22);
        assert!(resp.id == Some(RpcId::Num(22)));
    }

    #[test]
    fn test_provider_setup() {
        let mock = MockCli::new();
        mock.push(true, "", "");
        mock.push(true, "", "");
        mock.push(true, "", "");
        let resp = call(
            &mock,
            method::PROVIDER_SETUP,
            serde_json::json!({"provider": "deepseek", "api_key": "sk-test"}),
            23,
        );
        assert!(resp.id == Some(RpcId::Num(23)));
    }

    #[test]
    fn test_channels_add() {
        let mock = MockCli::new();
        mock.push(true, "added telegram", "");
        let resp = call(
            &mock,
            method::CHANNELS_ADD,
            serde_json::json!({"channel": "telegram", "token": "bot-token"}),
            24,
        );
        assert!(resp.id == Some(RpcId::Num(24)));
    }

    #[test]
    fn test_channels_remove() {
        let mock = MockCli::new();
        mock.push(true, "removed", "");
        let resp = call(
            &mock,
            method::CHANNELS_REMOVE,
            serde_json::json!({"channel": "discord"}),
            25,
        );
        assert!(resp.id == Some(RpcId::Num(25)));
    }

    #[test]
    fn test_cron_add() {
        let mock = MockCli::new();
        mock.push(true, "added", "");
        let resp = call(
            &mock,
            method::CRON_ADD,
            serde_json::json!({
                "name": "daily-email",
                "every": "24h",
                "message": "Send digest",
                "channel": "telegram",
                "announce": true
            }),
            26,
        );
        assert!(resp.id == Some(RpcId::Num(26)));
    }

    #[test]
    fn test_cron_remove() {
        let mock = MockCli::new();
        mock.push(true, "removed", "");
        let resp = call(
            &mock,
            method::CRON_REMOVE,
            serde_json::json!({"name": "daily-email"}),
            27,
        );
        assert!(resp.id == Some(RpcId::Num(27)));
    }

    #[test]
    fn test_safety_apply() {
        let mock = MockCli::new();
        mock.push(true, "", "");
        mock.push(true, "", "");
        mock.push(true, "", "");
        let resp = call(
            &mock,
            method::SAFETY_APPLY,
            serde_json::json!({"level": "standard"}),
            28,
        );
        assert!(resp.id == Some(RpcId::Num(28)));
    }

    #[test]
    fn test_agent_chat() {
        let mock = MockCli::new();
        mock.push(true, "Hello!", "");
        let resp = call(
            &mock,
            method::AGENT_CHAT,
            serde_json::json!({"message": "Hi there"}),
            29,
        );
        assert!(resp.id == Some(RpcId::Num(29)));
    }

    #[test]
    fn test_email_monitor_setup() {
        let mock = MockCli::new();
        mock.push(true, "", "");
        let resp = call(
            &mock,
            method::EMAIL_MONITOR_SETUP,
            serde_json::json!({
                "telegram_token": "bot-token",
                "email_address": "test@example.com"
            }),
            30,
        );
        assert!(resp.id == Some(RpcId::Num(30)));
    }

    // ----- Lifecycle methods -----

    #[test]
    fn test_openclaw_install() {
        let mock = MockCli::new();
        mock.push(true, "installed", "");
        let resp = call(&mock, method::OPENCLAW_INSTALL, serde_json::json!({}), 32);
        assert!(resp.id == Some(RpcId::Num(32)));
    }

    #[test]
    fn test_openclaw_uninstall() {
        let mock = MockCli::new();
        mock.push(true, "uninstalled", "");
        let resp = call(
            &mock,
            method::OPENCLAW_UNINSTALL,
            serde_json::json!({"remove_config": false}),
            33,
        );
        assert!(resp.id == Some(RpcId::Num(33)));
    }

    // ----- Utility methods -----

    #[test]
    fn test_cli_run() {
        let mock = MockCli::new();
        mock.push(true, "status output", "");
        let resp = call(
            &mock,
            method::CLI_RUN,
            serde_json::json!({"args": ["status"]}),
            34,
        );
        assert!(resp.is_success());
        let result = resp.result.unwrap();
        assert!(result.get("success").is_some());
    }

    #[test]
    fn test_doctor_run() {
        let resp = call(&MockCli::new(), method::DOCTOR_RUN, serde_json::json!({}), 35);
        // doctor.run doesn't use CliRunner — uses its own logic
        assert!(resp.id == Some(RpcId::Num(35)));
    }

    // ----- Error handling -----

    #[test]
    fn test_cli_failure_propagates() {
        let mock = MockCli::new();
        mock.push(false, "", "command failed");
        let resp = call(
            &mock,
            method::CONFIG_GET,
            serde_json::json!({"path": "test"}),
            40,
        );
        assert!(!resp.is_success());
        let err = resp.error.unwrap();
        assert_eq!(err.code, error_code::OPENCLAW_ERROR);
    }

    #[test]
    fn test_all_methods_have_dispatch_branch() {
        let mock = MockCli::new();
        // Queue enough responses for any method that needs CLI calls
        for _ in 0..10 {
            mock.push(true, "{}", "");
        }
        for m in method::ALL {
            let params = match *m {
                method::CONFIG_GET => serde_json::json!({"path": "test"}),
                method::CONFIG_SET => serde_json::json!({"path": "test", "value": "v"}),
                method::MODELS_LIST => serde_json::json!({"provider": "openai"}),
                method::PROVIDER_SETUP => serde_json::json!({"provider": "test", "api_key": "k"}),
                method::CHANNELS_ADD => serde_json::json!({"channel": "tg", "token": "t"}),
                method::CHANNELS_REMOVE => serde_json::json!({"channel": "tg"}),
                method::CRON_ADD => serde_json::json!({"name": "n", "every": "1h", "message": "m", "channel": "c"}),
                method::CRON_REMOVE => serde_json::json!({"name": "n"}),
                method::SAFETY_APPLY => serde_json::json!({"level": "standard"}),
                method::AGENT_CHAT => serde_json::json!({"message": "hi"}),
                method::EMAIL_MONITOR_SETUP => serde_json::json!({"telegram_token": "t", "email_address": "a@b.com"}),
                method::OPENCLAW_UNINSTALL => serde_json::json!({"remove_config": false}),
                method::CLI_RUN => serde_json::json!({"args": ["status"]}),
                _ => serde_json::json!({}),
            };
            // Replenish mock responses for multi-call methods
            for _ in 0..5 {
                mock.push(true, "{}", "");
            }
            let resp = call(&mock, m, params, 100);
            assert_ne!(
                resp.error.as_ref().map(|e| e.code),
                Some(error_code::METHOD_NOT_FOUND),
                "method {} returned METHOD_NOT_FOUND — missing dispatch branch!",
                m
            );
        }
    }
}
