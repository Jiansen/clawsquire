/// Shell-escape a string for safe use in SSH commands.
/// Wraps in single quotes and escapes internal single quotes.
pub fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_string() {
        assert_eq!(shell_escape("hello"), "'hello'");
    }

    #[test]
    fn test_string_with_spaces() {
        assert_eq!(shell_escape("hello world"), "'hello world'");
    }

    #[test]
    fn test_string_with_single_quote() {
        assert_eq!(shell_escape("it's"), "'it'\\''s'");
    }

    #[test]
    fn test_empty_string() {
        assert_eq!(shell_escape(""), "''");
    }

    #[test]
    fn test_special_chars() {
        assert_eq!(shell_escape("a;rm -rf /"), "'a;rm -rf /'");
    }

    #[test]
    fn test_json_value() {
        let json = r#"{"apiKey":"sk-123","baseUrl":"https://api.deepseek.com"}"#;
        let escaped = shell_escape(json);
        assert!(escaped.starts_with('\''));
        assert!(escaped.ends_with('\''));
    }
}
