use serde::{Deserialize, Serialize};
use std::sync::RwLock;

use crate::instances::{self, VpsInstance};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VpsConnection {
    pub instance_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
}

impl VpsConnection {
    pub fn from_instance(inst: &VpsInstance, password: Option<String>) -> Self {
        Self {
            instance_id: inst.id.clone(),
            host: inst.host.clone(),
            port: inst.port,
            username: inst.username.clone(),
            password,
            key_path: inst.key_path.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub enum Target {
    Local,
    Vps(VpsConnection),
}

impl Default for Target {
    fn default() -> Self {
        Target::Local
    }
}


impl Target {
    /// Returns a CliRunner appropriate for the current target.
    /// Local → RealCliRunner, VPS → SshCliRunner.
    pub fn runner(&self) -> Box<dyn crate::cli_runner::CliRunner> {
        match self {
            Target::Local => Box::new(crate::cli_runner::RealCliRunner),
            Target::Vps(conn) => Box::new(crate::cli_runner::SshCliRunner::new(conn.clone())),
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

    pub fn set_vps(&self, instance_id: &str, password: Option<String>) -> Result<(), String> {
        let instances = instances::list_instances();
        let inst = instances
            .iter()
            .find(|i| i.id == instance_id)
            .ok_or_else(|| format!("Instance '{}' not found", instance_id))?;

        if inst.auth_method == "password" && password.is_none() {
            return Err("Password required for password-authenticated instance".into());
        }

        let conn = VpsConnection::from_instance(inst, password);
        self.set(Target::Vps(conn));
        Ok(())
    }
}

#[derive(Debug, Serialize)]
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
            Target::Vps(conn) => ActiveTargetInfo {
                mode: "vps".into(),
                instance_id: Some(conn.instance_id.clone()),
                host: Some(conn.host.clone()),
                username: Some(conn.username.clone()),
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
            _ => panic!("Expected Local"),
        }
    }

    #[test]
    fn test_set_and_get() {
        let state = ActiveTargetState::default();
        let conn = VpsConnection {
            instance_id: "test-1".into(),
            host: "1.2.3.4".into(),
            port: 22,
            username: "ubuntu".into(),
            password: None,
            key_path: Some("/home/.ssh/id_ed25519".into()),
        };
        state.set(Target::Vps(conn));
        match state.get() {
            Target::Vps(c) => {
                assert_eq!(c.host, "1.2.3.4");
                assert_eq!(c.username, "ubuntu");
            }
            _ => panic!("Expected Vps"),
        }
    }

    #[test]
    fn test_set_local() {
        let state = ActiveTargetState::default();
        let conn = VpsConnection {
            instance_id: "test-1".into(),
            host: "1.2.3.4".into(),
            port: 22,
            username: "ubuntu".into(),
            password: None,
            key_path: None,
        };
        state.set(Target::Vps(conn));
        state.set_local();
        match state.get() {
            Target::Local => {}
            _ => panic!("Expected Local after set_local"),
        }
    }

    #[test]
    fn test_active_target_info_local() {
        let info = ActiveTargetInfo::from(&Target::Local);
        assert_eq!(info.mode, "local");
        assert!(info.instance_id.is_none());
    }

    #[test]
    fn test_active_target_info_vps() {
        let conn = VpsConnection {
            instance_id: "i-1".into(),
            host: "10.0.0.1".into(),
            port: 22,
            username: "root".into(),
            password: None,
            key_path: None,
        };
        let info = ActiveTargetInfo::from(&Target::Vps(conn));
        assert_eq!(info.mode, "vps");
        assert_eq!(info.host.unwrap(), "10.0.0.1");
    }
}
