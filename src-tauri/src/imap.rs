use serde::{Deserialize, Serialize};
use crate::openclaw;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapPreset {
    pub host: String,
    pub port: u16,
    pub tls: bool,
}

pub fn detect_imap_preset(email: &str) -> Option<ImapPreset> {
    let domain = email.split('@').nth(1)?.to_lowercase();

    let (host, port, tls) = match domain.as_str() {
        "gmail.com" | "googlemail.com" => ("imap.gmail.com", 993, true),
        "outlook.com" | "hotmail.com" | "live.com" => ("outlook.office365.com", 993, true),
        "yahoo.com" | "ymail.com" => ("imap.mail.yahoo.com", 993, true),
        "icloud.com" | "me.com" | "mac.com" => ("imap.mail.me.com", 993, true),
        "qq.com" | "foxmail.com" => ("imap.qq.com", 993, true),
        "163.com" => ("imap.163.com", 993, true),
        "126.com" => ("imap.126.com", 993, true),
        "yeah.net" => ("imap.yeah.net", 993, true),
        "sina.com" | "sina.cn" => ("imap.sina.com", 993, true),
        "aliyun.com" => ("imap.aliyun.com", 993, true),
        "zoho.com" => ("imap.zoho.com", 993, true),
        "protonmail.com" | "proton.me" | "pm.me" => ("127.0.0.1", 1143, false),
        "yandex.ru" | "yandex.com" => ("imap.yandex.com", 993, true),
        "gmx.com" | "gmx.net" => ("imap.gmx.com", 993, true),
        "mail.ru" => ("imap.mail.ru", 993, true),
        _ => {
            return Some(ImapPreset {
                host: format!("imap.{}", domain),
                port: 993,
                tls: true,
            });
        }
    };

    Some(ImapPreset {
        host: host.to_string(),
        port,
        tls,
    })
}

#[derive(Debug, Serialize)]
pub struct ImapTestResult {
    pub success: bool,
    pub message: String,
}

/// Save IMAP credentials via openclaw config set commands.
/// This writes: email.imap.host, email.imap.port, email.imap.tls,
///              email.imap.username, email.imap.password
pub fn save_imap_config(
    email: &str,
    host: &str,
    port: u16,
    tls: bool,
    password: &str,
) -> Result<(), String> {
    openclaw::config_set("email.imap.host", host)?;
    openclaw::config_set("email.imap.port", &port.to_string())?;
    openclaw::config_set("email.imap.tls", if tls { "true" } else { "false" })?;
    openclaw::config_set("email.imap.username", email)?;
    openclaw::config_set("email.imap.password", password)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_gmail() {
        let preset = detect_imap_preset("user@gmail.com").unwrap();
        assert_eq!(preset.host, "imap.gmail.com");
        assert_eq!(preset.port, 993);
        assert!(preset.tls);
    }

    #[test]
    fn test_detect_qq() {
        let preset = detect_imap_preset("user@qq.com").unwrap();
        assert_eq!(preset.host, "imap.qq.com");
    }

    #[test]
    fn test_detect_163() {
        let preset = detect_imap_preset("user@163.com").unwrap();
        assert_eq!(preset.host, "imap.163.com");
    }

    #[test]
    fn test_detect_outlook() {
        let preset = detect_imap_preset("user@outlook.com").unwrap();
        assert_eq!(preset.host, "outlook.office365.com");
    }

    #[test]
    fn test_detect_protonmail() {
        let preset = detect_imap_preset("user@protonmail.com").unwrap();
        assert_eq!(preset.host, "127.0.0.1");
        assert_eq!(preset.port, 1143);
        assert!(!preset.tls);
    }

    #[test]
    fn test_detect_unknown_domain() {
        let preset = detect_imap_preset("user@mycompany.io").unwrap();
        assert_eq!(preset.host, "imap.mycompany.io");
        assert_eq!(preset.port, 993);
    }

    #[test]
    fn test_invalid_email() {
        assert!(detect_imap_preset("notanemail").is_none());
    }
}
