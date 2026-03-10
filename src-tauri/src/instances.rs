use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn instances_path() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("clawsquire").join("instances.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VpsInstance {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String, // "password" | "key"
    #[serde(skip)]
    #[allow(dead_code)]
    pub password: Option<String>,
    pub key_path: Option<String>,
    pub openclaw_installed: Option<bool>,
    pub openclaw_version: Option<String>,
    pub last_connected: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstancesStore {
    pub instances: Vec<VpsInstance>,
}

impl InstancesStore {
    fn load() -> Self {
        let path = instances_path();
        if let Ok(data) = fs::read_to_string(&path) {
            serde_json::from_str(&data).unwrap_or(Self { instances: vec![] })
        } else {
            Self { instances: vec![] }
        }
    }

    fn save(&self) -> Result<(), String> {
        let path = instances_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| format!("json: {}", e))?;
        fs::write(&path, json).map_err(|e| format!("write: {}", e))
    }
}

pub fn list_instances() -> Vec<VpsInstance> {
    InstancesStore::load().instances
}

pub fn add_instance(instance: VpsInstance) -> Result<VpsInstance, String> {
    let mut store = InstancesStore::load();
    if store.instances.iter().any(|i| i.id == instance.id) {
        return Err(format!("Instance '{}' already exists", instance.id));
    }
    store.instances.push(instance.clone());
    store.save()?;
    Ok(instance)
}

pub fn update_instance(instance: VpsInstance) -> Result<VpsInstance, String> {
    let mut store = InstancesStore::load();
    if let Some(existing) = store.instances.iter_mut().find(|i| i.id == instance.id) {
        existing.name = instance.name.clone();
        existing.host = instance.host.clone();
        existing.port = instance.port;
        existing.username = instance.username.clone();
        existing.auth_method = instance.auth_method.clone();
        existing.key_path = instance.key_path.clone();
        existing.openclaw_installed = instance.openclaw_installed;
        existing.openclaw_version = instance.openclaw_version.clone();
        existing.last_connected = instance.last_connected.clone();
    } else {
        return Err(format!("Instance '{}' not found", instance.id));
    }
    store.save()?;
    Ok(instance)
}

pub fn delete_instance(id: &str) -> Result<(), String> {
    let mut store = InstancesStore::load();
    let len_before = store.instances.len();
    store.instances.retain(|i| i.id != id);
    if store.instances.len() == len_before {
        return Err(format!("Instance '{}' not found", id));
    }
    store.save()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn test_instance(id: &str) -> VpsInstance {
        VpsInstance {
            id: id.to_string(),
            name: format!("Test {}", id),
            host: "192.168.1.100".to_string(),
            port: 22,
            username: "root".to_string(),
            auth_method: "password".to_string(),
            password: None,
            key_path: None,
            openclaw_installed: None,
            openclaw_version: None,
            last_connected: None,
            created_at: "2026-03-10T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_serde_round_trip() {
        let inst = test_instance("test-1");
        let json = serde_json::to_string(&inst).unwrap();
        let parsed: VpsInstance = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "test-1");
        assert_eq!(parsed.host, "192.168.1.100");
        assert!(parsed.password.is_none()); // #[serde(skip)]
    }

    #[test]
    fn test_password_not_serialized() {
        let mut inst = test_instance("test-2");
        inst.password = Some("secret123".to_string());
        let json = serde_json::to_string(&inst).unwrap();
        assert!(!json.contains("secret123"));
    }
}
