#!/bin/bash
set -euo pipefail
export TZ=UTC

# Build clawsquire-serve and copy to the Tauri sidecar location.
# Usage: ./scripts/copy-sidecar.sh [--release]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PROFILE="debug"
CARGO_FLAGS=""
if [[ "${1:-}" == "--release" ]]; then
    PROFILE="release"
    CARGO_FLAGS="--release"
fi

TRIPLE=$(rustc --print host-tuple)
EXT=""
if [[ "$TRIPLE" == *windows* ]]; then
    EXT=".exe"
fi

echo "[copy-sidecar] building clawsquire-serve ($PROFILE)..."
cargo build -p clawsquire-serve $CARGO_FLAGS

SRC="$ROOT/target/$PROFILE/clawsquire-serve${EXT}"
DEST_DIR="$ROOT/src-tauri/binaries"
DEST="$DEST_DIR/clawsquire-serve-${TRIPLE}${EXT}"

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST"
echo "[copy-sidecar] copied to $DEST ($(du -h "$DEST" | cut -f1))"

# Also copy to target/{profile}/binaries/ for dev mode
DEV_DEST_DIR="$ROOT/target/$PROFILE/binaries"
mkdir -p "$DEV_DEST_DIR"
cp "$SRC" "$DEV_DEST_DIR/clawsquire-serve-${TRIPLE}${EXT}"
echo "[copy-sidecar] dev copy → $DEV_DEST_DIR/"
