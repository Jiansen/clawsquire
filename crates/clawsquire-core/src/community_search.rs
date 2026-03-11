use crate::constants::OPENCLAW_CLI;
use crate::detect::cmd_with_path;
use serde::{Deserialize, Serialize};

const OPENCLAW_REPO: &str = "openclaw/openclaw";

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub number: u64,
    pub title: String,
    pub html_url: String,
    pub state: String,
    pub comments: u64,
    pub created_at: String,
    pub body_excerpt: String,
    pub labels: Vec<LabelInfo>,
}

#[derive(Debug, Serialize, Clone)]
pub struct LabelInfo {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub items: Vec<SearchResult>,
    pub total_count: u64,
}

#[derive(Deserialize)]
struct GhSearchResponse {
    total_count: u64,
    items: Vec<GhIssue>,
}

#[derive(Deserialize)]
struct GhIssue {
    number: u64,
    title: String,
    html_url: String,
    state: String,
    comments: u64,
    created_at: String,
    body: Option<String>,
    labels: Vec<GhLabel>,
}

#[derive(Deserialize)]
struct GhLabel {
    name: String,
    color: String,
}

fn excerpt(body: &Option<String>, max_len: usize) -> String {
    match body {
        None => String::new(),
        Some(b) => {
            let clean: String = b
                .lines()
                .filter(|l| !l.trim().is_empty())
                .take(6)
                .collect::<Vec<_>>()
                .join(" ")
                .replace(['#', '*', '`', '>'], "");
            if clean.len() > max_len {
                format!("{}…", &clean[..max_len])
            } else {
                clean
            }
        }
    }
}

pub fn search_issues(query: &str) -> Result<SearchResponse, String> {
    let encoded_query = format!("repo:{} {}", OPENCLAW_REPO, query)
        .replace(' ', "+");

    let url = format!(
        "https://api.github.com/search/issues?q={}&sort=reactions&per_page=8",
        urlencoding(&encoded_query)
    );

    let output = cmd_with_path("curl")
        .args([
            "-sS",
            "--connect-timeout", "5",
            "--max-time", "15",
            "-H", "Accept: application/vnd.github.v3+json",
            "-H", "User-Agent: ClawSquire",
            &url,
        ])
        .output()
        .map_err(|e| format!("Failed to execute curl: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("curl failed: {}", stderr));
    }

    let body = String::from_utf8_lossy(&output.stdout);

    let gh_resp: GhSearchResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse GitHub response: {} (body: {})", e, &body[..body.len().min(200)]))?;

    Ok(SearchResponse {
        total_count: gh_resp.total_count,
        items: gh_resp
            .items
            .into_iter()
            .map(|i| SearchResult {
                number: i.number,
                title: i.title,
                html_url: i.html_url,
                state: i.state,
                comments: i.comments,
                created_at: i.created_at,
                body_excerpt: excerpt(&i.body, 200),
                labels: i
                    .labels
                    .into_iter()
                    .map(|l| LabelInfo {
                        name: l.name,
                        color: l.color,
                    })
                    .collect(),
            })
            .collect(),
    })
}

fn urlencoding(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'+' => {
                String::from(b as char)
            }
            _ => format!("%{:02X}", b),
        })
        .collect()
}

// --- Smart Search (LLM-assisted) ---

#[derive(Debug, Serialize)]
pub struct SmartSearchResponse {
    pub keywords: String,
    pub results: Vec<SearchResult>,
    pub total_count: u64,
    pub summary: Option<String>,
    pub llm_available: bool,
}

fn llm_call(prompt: &str) -> Option<String> {
    let output = cmd_with_path(OPENCLAW_CLI)
        .args([
            "agent",
            "--session-id", "clawsquire-search",
            "--message", prompt,
            "--json",
            "--timeout", "30",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&stdout).ok()?;

    json.get("result")
        .and_then(|r| r.get("payloads"))
        .and_then(|p| p.get(0))
        .and_then(|p| p.get("text"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
}

pub fn smart_search(user_query: &str, user_lang: &str) -> Result<SmartSearchResponse, String> {
    let keyword_prompt = format!(
        "You are a search keyword extractor. Given this user problem description, \
         output ONLY 2-3 short English keywords suitable for searching GitHub issues. \
         Output nothing else, just the keywords separated by spaces.\n\
         Problem: {}",
        user_query
    );

    let (keywords, llm_available) = match llm_call(&keyword_prompt) {
        Some(kw) => {
            let cleaned = kw.trim().to_string();
            if cleaned.is_empty() || cleaned.len() > 100 {
                (user_query.to_string(), true)
            } else {
                (cleaned, true)
            }
        }
        None => (user_query.to_string(), false),
    };

    let search_result = search_issues(&keywords)?;

    let summary = if llm_available && !search_result.items.is_empty() {
        let results_text: String = search_result
            .items
            .iter()
            .take(5)
            .enumerate()
            .map(|(i, r)| {
                format!(
                    "{}. #{} [{}] {} — {} ({} comments)\n",
                    i + 1,
                    r.number,
                    r.state,
                    r.title,
                    r.body_excerpt,
                    r.comments
                )
            })
            .collect();

        let lang_name = match user_lang {
            "zh-CN" => "简体中文",
            "zh-TW" => "繁體中文",
            "ja" => "日本語",
            "es" => "Español",
            "de" => "Deutsch",
            "pt-BR" => "Português",
            _ => "English",
        };

        let summary_prompt = format!(
            "You are a helpful assistant for OpenClaw users. Based on these GitHub issue search results, \
             write a brief summary (3-5 sentences) in {} that:\n\
             1. Identifies the most relevant issue(s) for the user's problem\n\
             2. Summarizes the solution or workaround if one exists\n\
             3. Recommends which issue to read first\n\n\
             User's original problem: {}\n\n\
             Search results:\n{}",
            lang_name, user_query, results_text
        );

        llm_call(&summary_prompt)
    } else {
        None
    };

    Ok(SmartSearchResponse {
        keywords,
        results: search_result.items,
        total_count: search_result.total_count,
        summary,
        llm_available,
    })
}
