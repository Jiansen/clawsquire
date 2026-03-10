#!/usr/bin/env bash
set -euo pipefail
export TZ=UTC

# ClawSquire Remote Install Script
# Installs OpenClaw on a VPS with optional pre-configuration.
# API keys are NEVER passed as arguments — configure them interactively after install.

OPENCLAW_NPM_PKG="openclaw"
NODE_MIN_VERSION=18

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
fail()  { echo -e "${RED}[error]${NC} $*"; exit 1; }

# --- Parse arguments ---
PROVIDER=""
CHANNEL=""
SAFETY="standard"
NO_START=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider)  PROVIDER="$2"; shift 2 ;;
    --channel)   CHANNEL="$2"; shift 2 ;;
    --safety)    SAFETY="$2"; shift 2 ;;
    --no-start)  NO_START=true; shift ;;
    --help|-h)
      echo "Usage: curl -sSL <url> | bash -s -- [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --provider <name>     Pre-select LLM provider (openai, anthropic, deepseek, ...)"
      echo "  --channel <name>      Pre-select channel (telegram, whatsapp, discord, ...)"
      echo "  --safety <level>      Safety preset (conservative, standard, full) [default: standard]"
      echo "  --no-start            Don't auto-start gateway after install"
      echo "  --help                Show this help"
      exit 0
      ;;
    *) warn "Unknown option: $1"; shift ;;
  esac
done

# --- Detect OS ---
detect_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    echo "$ID"
  elif command -v uname &>/dev/null; then
    uname -s | tr '[:upper:]' '[:lower:]'
  else
    echo "unknown"
  fi
}

OS=$(detect_os)
info "Detected OS: $OS"

# --- Check/install Node.js ---
install_node_if_needed() {
  if command -v node &>/dev/null; then
    local ver
    ver=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$ver" -ge "$NODE_MIN_VERSION" ]]; then
      ok "Node.js v$(node -v | sed 's/v//') found"
      return 0
    else
      warn "Node.js v$(node -v | sed 's/v//') found, but v${NODE_MIN_VERSION}+ required"
    fi
  fi

  info "Installing Node.js LTS..."
  case "$OS" in
    ubuntu|debian)
      curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - || fail "Failed to add NodeSource repo"
      sudo apt-get install -y nodejs || fail "Failed to install Node.js"
      ;;
    centos|rhel|fedora|amzn)
      curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash - || fail "Failed to add NodeSource repo"
      sudo yum install -y nodejs || fail "Failed to install Node.js"
      ;;
    *)
      fail "Unsupported OS for automatic Node.js install: $OS. Please install Node.js >= $NODE_MIN_VERSION manually."
      ;;
  esac

  if command -v node &>/dev/null; then
    ok "Node.js $(node -v) installed"
  else
    fail "Node.js installation failed"
  fi
}

install_node_if_needed

# --- Install OpenClaw ---
info "Installing $OPENCLAW_NPM_PKG..."
if command -v openclaw &>/dev/null; then
  local_ver=$(openclaw --version 2>/dev/null || echo "unknown")
  ok "OpenClaw already installed: $local_ver"
  info "Upgrading to latest..."
fi

npm install -g "${OPENCLAW_NPM_PKG}@latest" || fail "npm install failed"
ok "OpenClaw $(openclaw --version 2>/dev/null || echo '?') installed"

# --- Apply safety preset ---
if [[ -n "$SAFETY" && "$SAFETY" != "standard" ]]; then
  info "Applying safety preset: $SAFETY"
  case "$SAFETY" in
    conservative)
      openclaw config set commands.native false --json 2>/dev/null || true
      openclaw config set commands.nativeSkills false --json 2>/dev/null || true
      openclaw config set commands.restart false --json 2>/dev/null || true
      ;;
    full)
      openclaw config set commands.native true --json 2>/dev/null || true
      openclaw config set commands.nativeSkills true --json 2>/dev/null || true
      openclaw config set commands.restart true --json 2>/dev/null || true
      ;;
  esac
  ok "Safety preset '$SAFETY' applied"
fi

# --- Pre-select provider (no key!) ---
if [[ -n "$PROVIDER" ]]; then
  info "Provider '$PROVIDER' pre-selected"
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}  Next step: Configure your $PROVIDER API key${NC}"
  echo -e "${YELLOW}  Run: openclaw config set models.providers.$PROVIDER.apiKey '\"YOUR_KEY\"'${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
fi

# --- Pre-select channel ---
if [[ -n "$CHANNEL" ]]; then
  info "Channel '$CHANNEL' pre-selected"
  case "$CHANNEL" in
    telegram)
      echo -e "${YELLOW}  Next step: openclaw channels add --channel telegram --token YOUR_BOT_TOKEN${NC}"
      ;;
    whatsapp)
      echo -e "${YELLOW}  Next step: openclaw channels add --channel whatsapp  (then scan QR code)${NC}"
      ;;
    *)
      echo -e "${YELLOW}  Next step: openclaw channels add --channel $CHANNEL --token YOUR_TOKEN${NC}"
      ;;
  esac
  echo ""
fi

# --- Start gateway (unless --no-start) ---
if [[ "$NO_START" == "false" ]]; then
  info "Setting gateway mode to local..."
  openclaw config set gateway.mode '"local"' --json 2>/dev/null || true

  info "Installing and starting gateway service..."
  openclaw gateway install 2>/dev/null || true
  openclaw gateway start 2>/dev/null || true

  if openclaw gateway status 2>/dev/null | grep -qi "running\|healthy\|listening"; then
    ok "Gateway is running"
  else
    warn "Gateway may not have started. Run 'openclaw gateway start' manually."
  fi
fi

# --- Done ---
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  OpenClaw installation complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Version:  $(openclaw --version 2>/dev/null || echo 'unknown')"
echo "  Config:   ~/.openclaw/openclaw.json"
echo ""
if [[ -n "$PROVIDER" ]]; then
  echo "  To configure LLM:  openclaw config set models.providers.$PROVIDER.apiKey '\"YOUR_KEY\"'"
fi
if [[ -n "$CHANNEL" ]]; then
  echo "  To add channel:    openclaw channels add --channel $CHANNEL --token YOUR_TOKEN"
fi
echo "  Run doctor:        openclaw doctor"
echo "  Start gateway:     openclaw gateway start"
echo ""
echo "  Need help? https://github.com/Jiansen/clawsquire/issues"
echo ""
