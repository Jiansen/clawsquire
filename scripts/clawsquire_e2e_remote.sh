#!/usr/bin/env bash
# clawsquire_e2e_remote.sh — Remote VPS E2E smoke test
#
# Tests: SSH connectivity → serve binary download → serve startup → WebSocket auth → environment.detect
#
# Usage:
#   VPS_HOST=43.165.2.183 VPS_USER=ubuntu VPS_KEY=~/.ssh/id_ed25519 bash scripts/clawsquire_e2e_remote.sh
#   VPS_HOST=... VPS_PASSWORD=... bash scripts/clawsquire_e2e_remote.sh  (uses sshpass if available)
#
# Required env vars:
#   VPS_HOST     — IP or hostname of VPS
#   VPS_USER     — SSH user (default: ubuntu)
#   VPS_KEY      — path to SSH private key (optional, uses agent if absent)
#
# Optional env vars:
#   SERVE_VERSION  — version to download (default: latest from PROTOCOL_VERSION)
#   SERVE_PORT     — port for serve (default: 19900)
#   SERVE_TOKEN    — token for serve (default: e2e-test-token)
#   SKIP_DOWNLOAD  — if set, skip binary download (assumes it's already on VPS)
#   KEEP_SERVE     — if set, don't kill serve after test (for manual inspection)

set -euo pipefail
export TZ=UTC

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
VPS_HOST="${VPS_HOST:?VPS_HOST is required}"
VPS_USER="${VPS_USER:-ubuntu}"
VPS_KEY="${VPS_KEY:-}"
SERVE_PORT="${SERVE_PORT:-19900}"
SERVE_TOKEN="${SERVE_TOKEN:-e2e-test-token}"
SERVE_VERSION="${SERVE_VERSION:-0.3.0}"
GITHUB_REPO="Jiansen/clawsquire"
BINARY_NAME="clawsquire-serve-linux-x86_64"
REMOTE_BIN_PATH="/tmp/clawsquire-serve-e2e"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log_ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }
log_err()  { echo -e "${RED}[✗]${NC} $*"; }
log_step() { echo -e "\n${YELLOW}>>> $*${NC}"; }

PASS=0; FAIL=0
assert_ok() {
  if eval "$1"; then
    log_ok "$2"
    ((PASS++)) || true
  else
    log_err "$2"
    ((FAIL++)) || true
  fi
}

# ---------------------------------------------------------------------------
# SSH helper
# ---------------------------------------------------------------------------
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15"
if [[ -n "$VPS_KEY" ]]; then
  SSH_OPTS="$SSH_OPTS -i $VPS_KEY"
fi

ssh_run() {
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "$@"
}

# Run a multi-line script on the VPS using heredoc (avoids command-line length limits)
ssh_run_script() {
  local script="$1"
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" bash <<REMOTE
${script}
REMOTE
}

# ---------------------------------------------------------------------------
# Step 1: SSH connectivity
# ---------------------------------------------------------------------------
log_step "Step 1: SSH connectivity"
if ssh_run "echo ok" > /dev/null 2>&1; then
  log_ok "SSH connected to ${VPS_USER}@${VPS_HOST}"
else
  log_err "Cannot SSH to ${VPS_HOST}. Check VPS_HOST, VPS_USER, VPS_KEY."
  exit 1
fi

# ---------------------------------------------------------------------------
# Steps 2-4: Cleanup + Download + Start (single SSH session to avoid rate limits)
# ---------------------------------------------------------------------------
log_step "Step 2-4: Cleanup → Download → Start serve"
SERVE_LOG="/tmp/clawsquire-serve-e2e.log"
DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/v${SERVE_VERSION}/${BINARY_NAME}"

DOWNLOAD_STEP=""
if [[ -z "${SKIP_DOWNLOAD:-}" ]]; then
  DOWNLOAD_STEP="curl -fsSL '${DOWNLOAD_URL}' -o '${REMOTE_BIN_PATH}' && chmod +x '${REMOTE_BIN_PATH}' && echo 'download ok'"
else
  DOWNLOAD_STEP="echo 'SKIP_DOWNLOAD: using existing binary at ${REMOTE_BIN_PATH}'"
fi

REMOTE_SETUP_SCRIPT="
pkill -f 'clawsquire-serve.*--port ${SERVE_PORT}' 2>/dev/null || true
sleep 0.5
echo 'cleanup ok'
${DOWNLOAD_STEP}
nohup '${REMOTE_BIN_PATH}' --port ${SERVE_PORT} --token '${SERVE_TOKEN}' > '${SERVE_LOG}' 2>&1 &
echo \$! > /tmp/clawsquire-serve-e2e.pid
for i in \$(seq 1 20); do
  grep -q '\"ready\":true' '${SERVE_LOG}' 2>/dev/null && echo 'serve ready' && break
  sleep 0.5
done
cat '${SERVE_LOG}'
"

if ssh_run_script "$REMOTE_SETUP_SCRIPT"; then
  log_ok "Serve started on port ${SERVE_PORT}"
else
  log_err "Setup failed. Check if ${BINARY_NAME} is available at v${SERVE_VERSION}."
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 5: WebSocket protocol test (run on VPS to avoid firewall)
# ---------------------------------------------------------------------------
log_step "Step 5: WebSocket protocol smoke test (running on VPS)"

PROTOCOL_VERSION="${SERVE_VERSION}"

PYTHON_TEST=$(cat <<PYEOF
import socket, struct, hashlib, base64, os, json, sys

HOST = '127.0.0.1'
PORT = ${SERVE_PORT}
TOKEN = '${SERVE_TOKEN}'
PROTOCOL_VERSION = '${PROTOCOL_VERSION}'

def ws_handshake(sock):
    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET / HTTP/1.1\r\n"
        f"Host: {HOST}:{PORT}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += sock.recv(4096)
    if b"101" not in resp:
        raise Exception(f"WS handshake failed: {resp[:200]}")

def ws_send(sock, payload):
    data = payload.encode() if isinstance(payload, str) else payload
    length = len(data)
    mask_key = os.urandom(4)
    masked = bytes(b ^ mask_key[i % 4] for i, b in enumerate(data))
    if length <= 125:
        header = struct.pack("BB", 0x81, 0x80 | length)
    elif length <= 65535:
        header = struct.pack("!BBH", 0x81, 0xFE, length)
    else:
        header = struct.pack("!BBQ", 0x81, 0xFF, length)
    sock.sendall(header + mask_key + masked)

def ws_recv(sock):
    def recv_exact(n):
        buf = b""
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                raise Exception("Connection closed")
            buf += chunk
        return buf
    header = recv_exact(2)
    fin = (header[0] & 0x80) != 0
    opcode = header[0] & 0x0F
    masked = (header[1] & 0x80) != 0
    length = header[1] & 0x7F
    if length == 126:
        length = struct.unpack("!H", recv_exact(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", recv_exact(8))[0]
    if masked:
        mask = recv_exact(4)
    payload = recv_exact(length)
    if masked:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return payload.decode()

try:
    sock = socket.create_connection((HOST, PORT), timeout=10)
    ws_handshake(sock)

    # Auth handshake
    auth = json.dumps({"protocol_version": PROTOCOL_VERSION, "token": TOKEN})
    ws_send(sock, auth)
    resp = json.loads(ws_recv(sock))
    assert resp.get("ok"), f"Auth failed: {resp}"
    assert "agent_info" in resp, f"Missing agent_info: {resp}"
    agent = resp["agent_info"]
    print(f"AUTH OK: serve_version={agent['serve_version']} os={agent['os']} arch={agent['arch']}")
    # server_capabilities is present in v0.3.0-pre.2+; warn if absent (older serve)
    if "server_capabilities" in resp and resp["server_capabilities"]:
        caps = resp["server_capabilities"]
        assert caps["protocol_version"] == PROTOCOL_VERSION, f"Version mismatch: {caps}"
        print(f"CAPABILITIES OK: {len(caps['methods'])} methods")
    else:
        print("WARNING: server_capabilities absent (old serve binary — upgrade recommended)")

    # environment.detect
    req = json.dumps({"jsonrpc": "2.0", "method": "environment.detect", "params": {}, "id": 1})
    ws_send(sock, req)
    result = json.loads(ws_recv(sock))
    assert result.get("result"), f"environment.detect failed: {result}"
    env = result["result"]
    assert "platform" in env, f"Missing platform in env: {env}"
    print(f"ENVIRONMENT OK: platform={env['platform']} openclaw_installed={env.get('openclaw_installed')}")

    # version.info
    req2 = json.dumps({"jsonrpc": "2.0", "method": "version.info", "params": {}, "id": 2})
    ws_send(sock, req2)
    result2 = json.loads(ws_recv(sock))
    print(f"VERSION_INFO: {result2.get('result', result2.get('error'))}")

    # Send WebSocket close frame (opcode 0x8)
    sock.sendall(struct.pack("BB", 0x88, 0x80) + os.urandom(4))
    sock.close()
    print("ALL CHECKS PASSED")
    sys.exit(0)
except Exception as e:
    print(f"FAIL: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
)

# Upload Python test script to VPS and run it (avoids shell quoting nightmares)
REMOTE_PY_SCRIPT="/tmp/clawsquire_e2e_ws.py"
echo "$PYTHON_TEST" | ssh_run "cat > ${REMOTE_PY_SCRIPT}"

WS_TEST_RESULT=$(ssh_run "python3 ${REMOTE_PY_SCRIPT}" 2>&1) && WS_EXIT=0 || WS_EXIT=$?
ssh_run "rm -f ${REMOTE_PY_SCRIPT}" || true

if [[ $WS_EXIT -eq 0 ]]; then
  echo "$WS_TEST_RESULT"
  log_ok "WebSocket protocol smoke test passed"
  ((PASS++)) || true
else
  echo "$WS_TEST_RESULT"
  log_err "WebSocket protocol smoke test FAILED"
  ((FAIL++)) || true
  log_warn "Serve log:"
  ssh_run "cat ${SERVE_LOG}" || true
fi

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
if [[ -z "${KEEP_SERVE:-}" ]]; then
  log_step "Cleanup: killing serve"
  ssh_run "pkill -f 'clawsquire-serve' 2>/dev/null || true" || true
  log_ok "Serve killed"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "================================================"
if [[ $FAIL -eq 0 ]]; then
  log_ok "ALL CHECKS PASSED ($PASS passed, $FAIL failed)"
  echo "VPS E2E smoke test: PASS"
  exit 0
else
  log_err "SOME CHECKS FAILED ($PASS passed, $FAIL failed)"
  echo "VPS E2E smoke test: FAIL"
  exit 1
fi
