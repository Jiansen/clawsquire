use clawsquire_core::cli_runner::{CliRunner, RealCliRunner};
use clawsquire_core::protocol::{self, error_code, method, RpcRequest, RpcResponse};
use clawsquire_core::{compat, detect, doctor, node_install, openclaw};

fn runner() -> &'static dyn CliRunner {
    static RUNNER: RealCliRunner = RealCliRunner;
    &RUNNER
}

pub fn handle(req: &RpcRequest) -> RpcResponse {
    let id = req.id.clone();

    if !method::is_valid(&req.method) {
        return RpcResponse::error(
            id,
            error_code::METHOD_NOT_FOUND,
            format!("unknown method: {}", req.method),
        );
    }

    match dispatch(req) {
        Ok(value) => RpcResponse::success(id, value),
        Err(e) => RpcResponse::error(id, error_code::OPENCLAW_ERROR, e),
    }
}

fn dispatch(req: &RpcRequest) -> Result<serde_json::Value, String> {
    let p = &req.params;
    let r = runner();

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
    use clawsquire_core::protocol::RpcId;

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
}
