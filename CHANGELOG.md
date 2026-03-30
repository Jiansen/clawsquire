# Changelog

## [1.0.2] — 2026-03-30

### Fixed
- **i18n: missing AI-Powered branding** — Traditional Chinese, Japanese, Spanish, German, and Portuguese translations were missing "AI-Powered" in welcome subtitle and website marketing copy (`pageTitle`, `hero.headline`, `hero.description`, `faq`, `footer.tagline`). All 7 languages now consistently include AI branding.

## [1.0.1] — 2026-03-30

### Fixed
- **ApiKeySetup Continue fails on fresh machines**: `setup_provider` called OpenClaw config on machines where OpenClaw isn't installed yet, blocking the entire setup flow. Now saves API key to localStorage first (always succeeds), then configures OpenClaw as best-effort.
- **Uninstall reports success but doesn't remove**: In Tauri GUI, `which openclaw` used minimal PATH and missed nvm/volta/fnm installations. Fixed by using expanded PATH for binary detection + post-uninstall verification.

### Added
- **Post-execution verification**: AgentInstaller automatically calls `get_environment` after all commands execute to confirm OpenClaw is actually installed/removed.
- **Uninstall AI fallback**: When `npm uninstall -g openclaw` fails, a "Let AI Fix This" button appears with the same AgentInstaller diagnostic flow.

## [1.0.0] — 2026-03-30

AI-first release: when things go wrong, ClawSquire's LLM agent diagnoses and fixes the problem automatically.

### Features

- **AI Fix Agent** — When installation or operations fail, an LLM agent analyzes the error, identifies the root cause, and generates cross-platform shell commands with risk levels (safe/moderate/dangerous) and explanations. Works on macOS, Windows, and Linux.
- **AI Assistants** — Context-aware AI chat integrated into Health Check (diagnostic assistant), Config (settings help), VPS Manager (server management), and Help page. Each assistant has a tailored system prompt with anti-hallucination guards.
- **Direct LLM API (`llm_chat_direct`)** — New Rust backend function for direct API calls to LLM providers. Agent features work independently of OpenClaw installation, solving the bootstrap dependency problem.
- **Mandatory API Key Setup** — New onboarding flow: Welcome → API Key Setup → Dashboard. Users configure their LLM provider before reaching the main app.
- **4 Provider Grid** — Streamlined to 4 top providers with official SVG logos: Anthropic (Claude Opus 4.6), OpenAI (GPT-5.4), Google (Gemini 3.1 Pro), DeepSeek (V3.2). Each shows strongest available model.
- **Vibeful.io Integration** — Cloud AI agent cross-promotion throughout the app. "Explore Vibeful" CTA on API key setup and "Powered by Vibeful Core Engine" branding on all AI assistant panels.
- **Feedback Banner** — Persistent "Help us improve ClawSquire" banner on Dashboard with direct links to GitHub Issues and Discussions. Installation failure screen includes a pre-filled "Report Issue" button with error context.
- **Sidebar Feedback Button** — Highlighted amber feedback button in sidebar for easy access to bug reporting with auto-collected diagnostics.

### Bug Fixes

- **Bootstrap dependency fix** — AgentInstaller and AgentChat no longer require OpenClaw to be installed. Previously, both components called `agent_chat_local` which needed a running OpenClaw instance — the exact thing they were supposed to help install.
- **API key persistence** — `ApiKeySetup` now stores credentials in `localStorage` so AgentInstaller and AgentChat can access them for direct LLM calls.

### i18n

- All 7 languages updated with new keys for API key setup, AI assistants, feedback banner, and provider taglines with specific model names.

## [0.3.6] — 2026-03-26

### CI

- Add retry logic for Apple notarization in release workflow (auto-retry after 60s on failure)
- Add 30-minute timeout to Tauri build+notarize step

## [0.3.5] — 2026-03-24

### CI

- Add macOS code signing and Apple notarization to release workflow

## [0.3.4] — 2026-03-13

Safety Presets redesign: permissions matrix stripped from 11 phantom entries to 7 real ones, each backed by actual OpenClaw config writes.

### Features

- **Safety Presets Redesign** — Permissions matrix reduced to 7 real entries (Slash Commands, Bot Restart, Access Control, File Tools, Command Execution, Browser Scripts, Advanced Config), each backed by actual `config_set` IPC calls
  - **Conservative** — messaging-only profile: exec denied, fs workspace-only, browser JS disabled, all slash/config/debug/bash off
  - **Standard** — exec via allowlist, fs unrestricted, browser JS enabled, slash commands auto-adapt, config/debug off
  - **Full** — Standard plus advanced config and debug enabled, slash commands always on
  - **Custom** — each toggle maps to a real `config_set` IPC call for granular control
  - All tiers explicitly set every key to prevent residual settings from a previous preset

### Bug Fixes

- Fixed hardcoded English remote-VPS warning → now i18n-localized across all 7 languages
- Fixed CSS typo in safety preset warning banner (`bg-red-950/300` → `bg-red-500`)
- Removed empty "expert" permission group
- Standard vs Full visually differentiated by Advanced Config toggle state

### CI

- Cross-platform tests run only on PRs; push events trigger Linux-only tests (faster CI, lower cost)
- Added `Window.__TAURI_INTERNALS__` type declaration for CI compatibility
- Guarded Tauri API calls for non-Tauri environments

## [0.3.3] — 2026-03-11

### Features

- **OpenClaw Dashboard Portal** — Dashboard button now available in both local and remote modes; remote mode opens through SSH tunnel with auto-loaded Keychain credentials

## [0.3.2] — 2026-03-11

Maintenance release (version bump only).

## [0.3.1] — 2026-03-11

SSH tunnel as sole authentication, OS keychain integration, embedded OpenClaw dashboard, and one-click serve self-update.

### Features

- **SSH Tunnel as Auth** — Replaced token-based auth; `clawsquire-serve` binds 127.0.0.1 only, `serve_token` removed entirely; SSH tunnel proves identity
- **Cross-Platform Keychain** — SSH passwords stored in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service) with save/load/delete
- **Embedded OpenClaw Dashboard** — Full OpenClaw web dashboard inside ClawSquire via Tauri WebviewWindow, loaded through SSH tunnel
- **Serve Self-Update** — One-click serve self-update via protocol RPC; auto-triggered on version mismatch
- **OpenClaw Installer Improvements** — Uses official installer script; adds `~/.npm-global` to PATH; collects diagnostics on failure; auto-invokes local openclaw when remote install fails

### Bug Fixes

- Local mode switch wrapped in `spawn_blocking` to prevent tokio starvation
- `uninstall_openclaw` routes through protocol layer in remote mode
- Portal auto-loads SSH credentials from Keychain
- Serve release no longer marked as draft (was blocking sidecar download)
- Updater rate-limited to 24h with jitter; ignores pre-releases
- Skip root-owned npm uninstall to avoid permission errors
- Use `gh release upload` for serve assets to avoid CI race condition
- Updated method count to 28 after protocol changes

### CI

- Cross.toml with edge image for aarch64-linux cross builds
- Native ubuntu-22.04-arm runner for linux aarch64 serve

## [0.3.0] — 2026-03-11

Controller-Agent architecture: ClawSquire now communicates with remote servers via a lightweight WebSocket agent (`clawsquire-serve`) instead of raw SSH commands, enabling true cross-platform remote management.

### Features

- **Controller-Agent Architecture** — Desktop acts as controller; remote VPS runs `clawsquire-serve` agent via JSON-RPC 2.0 over WebSocket (ADR-002)
- **`clawsquire-serve`** — Standalone headless Rust binary, zero dependencies, bundled inside the Desktop app (Tauri sidecar) and publishable as standalone release asset
- **SSH Auto-Bootstrap** — 6-step wizard: check SSH → connect → probe OS/arch → install serve → `--init` → start daemon; one click from ClawSquire Desktop
- **27 JSON-RPC Methods** — Complete protocol covering system info, OpenClaw lifecycle, configuration, backups, channels, automations, sources, community search, bootstrapping (ADR-003)
- **Unified Path Architecture** — Local and remote modes use identical protocol path via `ProtocolRunner`; `ActiveTarget` simplified to connection-address selector (ADR-004)
- **Cross-Platform Serve Binaries** — GitHub Releases include `clawsquire-serve-{linux,darwin,windows}-{x86_64,aarch64}` binaries for all major platforms
- **`VpsManager` Protocol UI** — Replaced SSH-direct deploy/terminal tabs with protocol-first Setup and Connect/Disconnect flow
- **Protocol Version Negotiation** — LSP-style `initialize` handshake: server returns `ServerCapabilities` including `protocol_version`; major-version mismatch rejected with `VERSION_INCOMPATIBLE` error; VpsManager shows amber upgrade banner
- **Bootstrap UX Improvements** — SSH form pre-fills from `?instanceId=` URL param (B1); completion page shows next-step guide cards — Dashboard / Configure AI / Add Channel (B3)
- **Token Persistence** — Bootstrap persists `serve_port` + `serve_token` via `set_instance_serve` IPC; VpsManager Connect uses stored token without re-bootstrapping
- **In-App Auto-Update** — Tauri native updater (`tauri-plugin-updater`): checks for updates on launch, shows download progress bar, relaunches after install; signed releases with minisign keypair
- **Onboarding Redirect** — `vps-headless` onboarding wizard replaced by `vps-bootstrap` template that redirects to VPS Manager (B2)

### Architecture

- `clawsquire-core`: `protocol.rs` adds `ServerCapabilities`, `is_protocol_compatible()`, `VERSION_INCOMPATIBLE` error code
- `clawsquire-serve`: rejects incompatible clients, returns capabilities in `AuthResponse`
- `active_target.rs`: `ActiveTargetInfo.serve_version` exposed for UI compatibility checks
- CI: signed releases via `TAURI_SIGNING_PRIVATE_KEY`; `build-desktop` depends on `build-serve` (sidecar download step)
- 109 Vitest + 33 Rust protocol + 32 E2E + 7 WebdriverIO tests (181+ total)

### Bug Fixes

- i18n: removed 7 orphaned v0.2 `vps.deploy*` keys; added missing v0.3 `vps.connect`, `vps.alreadySetup`, `vps.tab.setup` keys to all 7 locales
- Dashboard "Update" button: was silently blocked by Tauri webview (`<a target=_blank>`); now uses `openUrl()` correctly
- VpsManager TypeScript error: `onClick={handleGoToBootstrap}` type mismatch fixed
- SSH password auth: `sshpass` not found in Tauri GUI due to restricted PATH; fixed via `cmd_with_path()` + conditional `BatchMode=yes` removal for password auth
- Bootstrap events duplicated in React StrictMode dev: fixed with `cancelled` flag + consecutive event deduplication
- `ActiveTargetContext` not synced after connect/disconnect: TopBar and Dashboard stayed in "Local" mode; fixed via `refreshTarget()` propagation
- `get_environment` always returned local platform even when connected to remote VPS; fixed by routing through `ActiveTargetState` Protocol path
- SSH tunnel local port conflict (orphaned SSH processes on port 18790): fixed by using `remote_port + 10000` as local port + `kill_port_occupant` + 8s readiness polling
- WebSocket connect hung indefinitely on unreachable host: fixed via `tokio::time::timeout(10s)` + `spawn_blocking`
- Password not stored in `instances.json` (`#[serde(skip)]`): added inline password prompt when connecting with password auth but no stored credential
- `add_instance` did not save password field to instance object (frontend bug)
- Bootstrap `update_instance` now persists auth credentials alongside `serve_port/token`

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

## [0.1.2] — 2026-03-09

### Features

- **Dark Mode** — Full dark mode support across every page (Dashboard, Config, Health Check, Backup, Setup Wizard, Settings, and all modal dialogs); respects system preference with manual override

## [0.1.1] — 2026-03-09

### Features

- **Community Search in Health Check** — Search 11,000+ OpenClaw issues directly from ClawSquire's Health Check page
- **AI Smart Search** — Describe your problem in any language; the AI extracts English keywords, searches GitHub, then summarizes the best solutions in your language (requires a working OpenClaw Gateway with an LLM provider configured; falls back to basic search when unavailable)

### UI Improvements

- Health Check auto-runs on page load (no more confusing empty state)
- Clear segmented control for AI / Basic search mode
- Always-visible search section with descriptive subtitle

### Bug Fixes

- Fixed curl compatibility in macOS GUI apps (subprocess PATH resolution)

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
