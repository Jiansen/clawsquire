# ClawSquire

[![GitHub Stars](https://img.shields.io/github/stars/Jiansen/clawsquire?style=flat&logo=github&color=e85d4a)](https://github.com/Jiansen/clawsquire)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-00e5cc?style=flat)](https://github.com/Jiansen/clawsquire/releases)
[![Languages](https://img.shields.io/badge/languages-7-8b5cf6?style=flat)](#languages)
[![License](https://img.shields.io/github/license/Jiansen/clawsquire?color=3b82f6&style=flat)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Jiansen/clawsquire/ci.yml?label=CI&logo=github)](https://github.com/Jiansen/clawsquire/actions)

**The companion app for [OpenClaw](https://openclaw.ai)** — your squire handles onboarding, health checks, config backups, and a visual dashboard so you can focus on what your lobster knight does best.

🌐 [Website](https://clawsquire.com) · 💬 [Discussions](https://github.com/Jiansen/clawsquire/discussions) · 🐛 [Report Bug](https://github.com/Jiansen/clawsquire/issues/new?template=bug_report.yml) · 💡 [Request Feature](https://github.com/Jiansen/clawsquire/issues/new?template=feature_request.yml)

[English](#features) · [中文](#中文) · [日本語](#日本語) · [Español](#español) · [Deutsch](#deutsch) · [Português](#português)

<p align="center">
  <img src="assets/demo.gif" alt="ClawSquire Demo" width="800" />
</p>

## Features

- **Setup Assistant** — Guided installation with scene templates (Telegram, Discord, WhatsApp, Slack, and 20+ more channels)
- **Health Check** — Visual diagnostics, friendlier than `openclaw doctor`
- **Config Backups** — Versioned snapshots with diff and one-click rollback
- **Dashboard** — See your OpenClaw status at a glance
- **Safety Presets** — Conservative / Standard / Full security levels with one-click apply
- **LLM Provider Setup** — Connect 22+ AI providers (OpenAI, Anthropic, DeepSeek, Google, etc.) with live connection testing

## Status

🚧 **In active development** — not yet released. Pre-built binaries coming soon.

## Quick Start (Development)

```bash
# Prerequisites: Rust, Node.js ≥22, pnpm
git clone https://github.com/Jiansen/clawsquire.git
cd clawsquire
pnpm install
pnpm tauri dev
```

> [OpenClaw](https://openclaw.ai/) is recommended but not required to explore the UI. ClawSquire gracefully handles the case when OpenClaw is not installed.

## Languages

EN 🇬🇧 · 简体中文 🇨🇳 · 繁體中文 🇭🇰 · 日本語 🇯🇵 · Español 🇪🇸 · Deutsch 🇩🇪 · Português 🇧🇷

ClawSquire automatically detects your system language. You can also switch languages from the header.

<p align="center">
  <img src="assets/i18n-demo.gif" alt="7-language i18n demo" width="800" />
</p>

## Tech Stack

- **Frontend**: React 19 + Vite 7 + Tailwind CSS 4
- **Backend**: Rust (Tauri 2)
- **i18n**: i18next (7 languages)
- **OpenClaw interface**: CLI wrapper (`openclaw config set/get`, `openclaw doctor`)

## License

MIT

---

## 中文

**ClawSquire** 是 OpenClaw 的伴侣应用——像骑士的侍从一样，帮你穿戴配置、检查装备、保管物资、掌握全局。

### 功能

- **安装向导** — 场景化配置模板（Telegram、WhatsApp、Discord、Slack 等 20+ 渠道）
- **健康检查** — 可视化诊断，比 `openclaw doctor` 更友好
- **配置备份** — 版本化快照 + 差异对比 + 一键回滚
- **仪表盘** — 一眼看清 OpenClaw 运行状态

---

## 日本語

**ClawSquire** は OpenClaw のコンパニオンアプリです。セットアップ、設定診断、バージョン管理バックアップ、ビジュアルダッシュボードをお任せください。

### 機能

- **セットアップアシスタント** — シーンテンプレートによるガイド付きインストール
- **ヘルスチェック** — ビジュアル診断
- **設定バックアップ** — バージョン管理されたスナップショット
- **ダッシュボード** — OpenClaw のステータスを一目で確認

---

## Español

**ClawSquire** es la app compañera de OpenClaw — tu escudero que se encarga de la configuración, diagnósticos, copias de seguridad y un panel visual.

### Características

- **Asistente de configuración** — Instalación guiada con plantillas de escenarios
- **Diagnóstico** — Verificación visual de salud del sistema
- **Respaldos** — Snapshots versionados con comparación y restauración
- **Panel** — Estado de OpenClaw de un vistazo

---

## Deutsch

**ClawSquire** ist die Begleit-App für OpenClaw — dein Knappe kümmert sich um Einrichtung, Systemprüfung, Konfigurationssicherungen und ein visuelles Dashboard.

---

## Português

**ClawSquire** é o app companheiro do OpenClaw — seu escudeiro cuida da configuração, diagnósticos, backups e um painel visual.

---

## Contributing

We welcome contributions of all kinds:

- **Bug reports** — [Open an issue](https://github.com/Jiansen/clawsquire/issues/new?template=bug_report.yml)
- **Feature ideas** — [Request a feature](https://github.com/Jiansen/clawsquire/issues/new?template=feature_request.yml)
- **Translations** — Help us improve existing translations or add new languages
- **Code** — PRs are welcome! See the Quick Start section above to set up your dev environment
- **Discussions** — [Join the conversation](https://github.com/Jiansen/clawsquire/discussions)

If you find ClawSquire useful, please ⭐ star the repo — it helps others discover us!
