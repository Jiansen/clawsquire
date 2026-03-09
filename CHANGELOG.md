# Changelog

## [0.1.0] — 2026-03-09

First official release of ClawSquire, the cross-platform companion app for [OpenClaw](https://openclaw.ai).

### Features

- **Setup Assistant** — Guided onboarding wizard with scene templates for 20+ messaging channels (Telegram, Discord, WhatsApp, Slack, Signal, iMessage, and more)
- **Health Check** — Visual diagnostics that parse `openclaw doctor` output into categorized, actionable cards with fix suggestions
- **Config Backups** — Versioned snapshots with JSON diff visualization and one-click rollback (automatic pre-restore safety backup)
- **Dashboard** — Real-time OpenClaw status, platform info, safety level, backup count, and quick actions
- **LLM Provider Setup** — Connect 22+ AI providers (OpenAI, Anthropic, DeepSeek, Google, Groq, xAI, Mistral, Ollama, etc.) with live connection testing
- **Safety Presets** — Conservative / Standard / Full security levels mapped to OpenClaw `commands.native` config
- **Node.js Auto-Detection & Installation** — Automatically detects Node.js across platform-specific paths; one-click install of LTS binaries to `~/.clawsquire/node/` (no admin required)
- **System Tray** — Close the window and the app keeps running in your tray
- **Auto-Update Detection** — Checks GitHub Releases for new versions and shows a banner
- **Error Recovery** — Global error boundary with one-click recovery and integrated bug reporting (pre-filled GitHub Issues with environment info + screenshot)
- **Quick Task** — Mini chat panel to test your OpenClaw agent directly from the dashboard
- **7-Language i18n** — English, 简体中文, 繁體中文, 日本語, Español, Deutsch, Português (BR); auto-detects system language with manual override

### Platforms

| Platform | Format |
|----------|--------|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows | `.msi` |
| Linux (Debian/Ubuntu) | `.deb` |
| Linux (universal) | `.AppImage` |

### CI & Quality

- Three-tier CI pipeline: compilation check (3 platforms) → Rust unit/integration tests (Node.js detection, PATH expansion, auto-install) → E2E desktop tests (Ubuntu + Windows via tauri-driver + WebdriverIO)
- E2E tests capture screenshots on every test for visual debugging
- Windows-specific: `CREATE_NO_WINDOW` flag on all subprocess calls to prevent cmd.exe flash

### Known Limitations

- macOS builds are not code-signed; run `xattr -rd com.apple.quarantine /Applications/ClawSquire.app` on first launch
- Auto-update shows a banner but does not perform in-app updates (redirects to GitHub Releases)

### Tech Stack

- Frontend: React 19 + Vite 7 + TypeScript + Tailwind CSS 4
- Backend: Rust (Tauri 2)
- i18n: i18next
- Testing: WebdriverIO + tauri-driver (E2E), Rust `#[cfg(test)]` (unit)
