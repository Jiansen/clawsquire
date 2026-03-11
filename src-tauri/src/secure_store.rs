use keyring::Entry;
use serde::Serialize;

const SERVICE_NAME: &str = "clawsquire";

fn entry_for(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, key).map_err(|e| format!("keyring init: {}", e))
}

#[derive(Debug, Serialize)]
pub struct SecureStoreResult {
    pub success: bool,
    pub error: Option<String>,
}

pub fn store_secret(key: &str, value: &str) -> SecureStoreResult {
    match entry_for(key) {
        Ok(entry) => match entry.set_password(value) {
            Ok(()) => SecureStoreResult { success: true, error: None },
            Err(e) => SecureStoreResult { success: false, error: Some(format!("{}", e)) },
        },
        Err(e) => SecureStoreResult { success: false, error: Some(e) },
    }
}

pub fn get_secret(key: &str) -> Result<String, String> {
    let entry = entry_for(key)?;
    entry.get_password().map_err(|e| format!("{}", e))
}

pub fn delete_secret(key: &str) -> SecureStoreResult {
    match entry_for(key) {
        Ok(entry) => match entry.delete_credential() {
            Ok(()) => SecureStoreResult { success: true, error: None },
            Err(e) => SecureStoreResult { success: false, error: Some(format!("{}", e)) },
        },
        Err(e) => SecureStoreResult { success: false, error: Some(e) },
    }
}

pub fn api_key_name(provider: &str) -> String {
    format!("api_key:{}", provider)
}

pub fn ssh_password_name(instance_id: &str) -> String {
    format!("ssh_password:{}", instance_id)
}

pub fn imap_password_name(email: &str) -> String {
    format!("imap_password:{}", email)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_naming() {
        assert_eq!(api_key_name("openai"), "api_key:openai");
        assert_eq!(ssh_password_name("vps-123"), "ssh_password:vps-123");
        assert_eq!(imap_password_name("user@gmail.com"), "imap_password:user@gmail.com");
    }

    #[test]
    fn test_entry_creation() {
        let result = entry_for("test_key");
        assert!(result.is_ok());
    }
}
