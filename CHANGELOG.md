# Changelog

## [0.3.0] — 2026-03-11

Controller-Agent architecture: ClawSquire now communicates with remote servers via a lightweight WebSocket agent (`clawsquire-serve`) instead of raw SSH commands, enabling true cross-platform remote management.

### Features

- **Controller-Agent Architecture** — Desktop acts as controller; remote VPS runs `clawsquire-serve` agent via JSON-RPC 2.0 over WebSocket (ADR-002)
- **`clawsquire-serve`** — Standalone headless Rust binary, zero dependencies, bundled inside the Desktop app (Tauri sidecar) and publishable as standalone release asset
- **SSH Auto-Bootstrap** — 6-step wizard: check SSH → connect → probe OS/arch → install serve → `--init` → start daemon; one click from ClawSquire Desktop
- **27 JSON-RPC Methods** — Complete protocol covering system info, OpenClaw lifecycle, configuration, backups, channels, automations, sources, community search, bootstrapping (ADR-003)
- **Unified Path Architecture** — Local and remote modes use identical protocol path via `ProtocolRunner`; `ActiveTarget` simplified to connection-address selector (ADR-004)
- **Cross-Platform Serve Binaries** — GitHub Releases now include `clawsquire-serve-{linux,darwin,windows}-{x86_64,aarch64}` binaries for all major platforms
- **`VpsManager` Protocol UI** — Replaced SSH-direct deploy/terminal tabs with protocol-first Setup and Connect/Disconnect flow

### Architecture

- `clawsquire-core` workspace crate: protocol types, dispatch, bootstrap logic, SSH bootstrap
- `clawsquire-serve` binary crate: tokio WebSocket server, JSON-RPC dispatch
- `ProtocolRunner` in desktop: WebSocket client implementing `CliRunner` trait
- `SshCliRunner` replaced by `ProtocolRunner` for all remote operations
- 109 Vitest + 72 Rust + 30 protocol E2E + 7 WebdriverIO tests (218+ total)
- CI: macOS / Ubuntu / Windows 3-platform matrix, all green

### Breaking Changes

- `SshCliRunner` and SSH-direct IPC handlers removed; replaced by Protocol path
- VPS connections now require `clawsquire-serve` installed on remote (auto-installed via Bootstrap)

## [0.2.0] — 2026-03-10

Remote VPS management: ClawSquire can now manage OpenClaw installations on remote servers, not just locally.

### Features

- **Active Target Architecture** — Switch between local and remote (VPS) OpenClaw instances from the TopBar; all commands route transparently via SSH
- **SshCliRunner** — New CLI execution backend that runs OpenClaw commands on remote servers through SSH (key or password auth)
- **VPS Instance Registry** — Save and manage multiple VPS connections in `~/.clawsquire/instances.json`
- **Remote Mode UX** — Blue "Remote Mode" banner on Dashboard; local-only features (Node.js install, CLI terminal, Web Dashboard link) automatically hidden when targeting a VPS
- **Remote Backup** — Back up remote OpenClaw configuration to local per-instance subdirectories
- **Auto-refresh on Target Switch** — All data pages (Dashboard, Config, Channels, Automations, Sources, Backup, Doctor) re-fetch data when the active target changes
- **Composable Automations** — New Channels, Automations, and Sources pages with full CRUD for 5+ channel types and cron-based scheduling
- **Global Help Panel** — `?` button + `Cmd+Shift+/` shortcut opens a slide-in help panel with FAQ search and community search
- **CLI Passthrough** — Collapsible CLI terminal on Dashboard for advanced users to run `openclaw` subcommands directly

### Bug Fixes

- SSH key paths with `~` now correctly expand to the user's home directory
- Config page reads the full config file directly instead of using unsupported CLI commands
- Remote backup uses SSH file read instead of unsupported `config list --json`
- Dead code warnings eliminated (zero warnings on `cargo check`)

### Architecture

- `CliRunner` trait abstraction (`RealCliRunner` for local, `SshCliRunner` for remote)
- `ActiveTargetState` with `RwLock<Target>` for thread-safe target management
- 22+ IPC handlers routed through `ActiveTargetState`
- Frontend `ActiveTargetContext` React context + `useActiveTarget` hook

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
