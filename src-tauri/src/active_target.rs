use serde::{Deserialize, Serialize};
use std::sync::RwLock;

#[derive(Debug, Clone)]
pub enum Target {
    Local,
}

impl Default for Target {
    fn default() -> Self {
        Target::Local
    }
}

impl Target {
    pub fn runner(&self) -> Box<dyn crate::cli_runner::CliRunner> {
        match self {
            Target::Local => Box::new(crate::cli_runner::RealCliRunner),
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
        self.inner.read().expect("ActiveTarget lock poisoned").clone()
    }

    pub fn set(&self, target: Target) {
        *self.inner.write().expect("ActiveTarget lock poisoned") = target;
    }

    pub fn set_local(&self) {
        self.set(Target::Local);
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
        }
    }

    #[test]
    fn test_set_local() {
        let state = ActiveTargetState::default();
        state.set_local();
        match state.get() {
            Target::Local => {}
        }
    }

    #[test]
    fn test_active_target_info_local() {
        let info = ActiveTargetInfo::from(&Target::Local);
        assert_eq!(info.mode, "local");
        assert!(info.instance_id.is_none());
    }
}
