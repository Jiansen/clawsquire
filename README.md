# ClawSquire

**The companion app for OpenClaw** — your squire handles onboarding, health checks, config backups, and a visual dashboard so you can focus on what your lobster knight does best.

[English](#features) · [中文](#中文) · [日本語](#日本語) · [Español](#español) · [Deutsch](#deutsch) · [Português](#português)

## Features

- **Setup Assistant** — Guided installation with scene templates (Telegram bot, Discord bot, LLM provider, VPS deploy)
- **Health Check** — Visual diagnostics, friendlier than `openclaw doctor`
- **Config Backups** — Versioned snapshots with diff and one-click rollback
- **Dashboard** — See your OpenClaw status at a glance

## Quick Start

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| macOS | [ClawSquire.dmg](https://github.com/Jiansen/clawsquire/releases/latest) |
| Linux | [ClawSquire.AppImage](https://github.com/Jiansen/clawsquire/releases/latest) |
| Windows | [ClawSquire-Setup.msi](https://github.com/Jiansen/clawsquire/releases/latest) |

> Prerequisite: [OpenClaw](https://github.com/openclaw/openclaw) must be installed on your system.

## Languages

EN 🇬🇧 · 简体中文 🇨🇳 · 繁體中文 🇭🇰 · 日本語 🇯🇵 · Español 🇪🇸 · Deutsch 🇩🇪 · Português 🇧🇷

ClawSquire automatically detects your system language. You can also switch languages in Settings.

## Development

```bash
# Prerequisites: Rust, Node.js ≥22, pnpm
pnpm install
pnpm tauri dev
```

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

- **安装向导** — 场景化配置模板（Telegram 群聊助手、Discord 机器人、LLM 接入、VPS 部署）
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
