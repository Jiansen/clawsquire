use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};

use clawsquire_core::cli_runner::{CliOutput, CliRunner, RealCliRunner};

use crate::protocol_runner::ProtocolRunner;

pub enum Target {
    Local,
    Protocol {
        runner: Arc<ProtocolRunner>,
        instance_id: String,
        host: String,
    },
}

impl Clone for Target {
    fn clone(&self) -> Self {
        match self {
            Target::Local => Target::Local,
            Target::Protocol {
                runner,
                instance_id,
                host,
            } => Target::Protocol {
                runner: Arc::clone(runner),
                instance_id: instance_id.clone(),
                host: host.clone(),
            },
        }
    }
}

impl Default for Target {
    fn default() -> Self {
        Target::Local
    }
}

/// Thin wrapper so Arc<ProtocolRunner> can be returned as Box<dyn CliRunner>.
struct ArcRunner(Arc<ProtocolRunner>);

impl CliRunner for ArcRunner {
    fn run(&self, args: &[&str]) -> Result<CliOutput, String> {
        self.0.run(args)
    }
}

impl Target {
    pub fn runner(&self) -> Box<dyn CliRunner> {
        match self {
            Target::Local => Box::new(RealCliRunner),
            Target::Protocol { runner, .. } => Box::new(ArcRunner(Arc::clone(runner))),
        }
    }
}

pub struct ActiveTargetState {
    inner: RwLock<Target>,
}

impl Default for ActiveTargetState {
    fn default() -> Self {
        Self {
            inner: RwLock::new(Target::Local),
        }
    }
}

impl ActiveTargetState {
    pub fn get(&self) -> Target {
        self.inner
            .read()
            .expect("ActiveTarget lock poisoned")
            .clone()
    }

    pub fn set(&self, target: Target) {
        *self.inner.write().expect("ActiveTarget lock poisoned") = target;
    }

    pub fn set_local(&self) {
        self.set(Target::Local);
    }

    pub fn set_protocol(
        &self,
        url: &str,
        token: &str,
        instance_id: String,
        host: String,
    ) -> Result<(), String> {
        let runner = ProtocolRunner::connect(url, token)?;
        self.set(Target::Protocol {
            runner: Arc::new(runner),
            instance_id,
            host,
        });
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActiveTargetInfo {
    pub mode: String,
    pub instance_id: Option<String>,
    pub host: Option<String>,
    pub username: Option<String>,
}

impl From<&Target> for ActiveTargetInfo {
    fn from(target: &Target) -> Self {
        match target {
            Target::Local => ActiveTargetInfo {
                mode: "local".into(),
                instance_id: None,
                host: None,
                username: None,
            },
            Target::Protocol {
                instance_id, host, ..
            } => ActiveTargetInfo {
                mode: "protocol".into(),
                instance_id: Some(instance_id.clone()),
                host: Some(host.clone()),
                username: None,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_is_local() {
        let state = ActiveTargetState::default();
        match state.get() {
            Target::Local => {}
            _ => panic!("expected Local"),
        }
    }

    #[test]
    fn test_set_local() {
        let state = ActiveTargetState::default();
        state.set_local();
        match state.get() {
            Target::Local => {}
            _ => panic!("expected Local"),
        }
    }

    #[test]
    fn test_active_target_info_local() {
        let info = ActiveTargetInfo::from(&Target::Local);
        assert_eq!(info.mode, "local");
        assert!(info.instance_id.is_none());
    }
}
