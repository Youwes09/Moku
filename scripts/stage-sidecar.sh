#!/usr/bin/env bash
set -euo pipefail

MOKU_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TSUNAGU_DIR="${TSUNAGU_DIR:-$MOKU_DIR/../Tsunagu}"
RES="$MOKU_DIR/src-tauri/resources"

[ -d "$TSUNAGU_DIR/backend" ] || { echo "no Tsunagu checkout at $TSUNAGU_DIR" >&2; exit 1; }
[ -d "$TSUNAGU_DIR/dist/sandbox/runtime" ] || {
  echo "no $TSUNAGU_DIR/dist/sandbox — run 'make dist' in Tsunagu first" >&2; exit 1; }

mkdir -p "$RES"
VER="$(cd "$TSUNAGU_DIR" && git describe --tags --always --dirty 2>/dev/null || echo dev)"

echo "==> building tsunagu ($VER) for this host"
( cd "$TSUNAGU_DIR" && nix develop --command sh -c \
  "cd backend && go build -trimpath -ldflags '-s -w -X main.serverVersion=$VER' -o '$RES/tsunagu' ./cmd/server" )

echo "==> copying sandbox.jar + jlink runtime"
rm -rf "$RES/sandbox"
cp -r "$TSUNAGU_DIR/dist/sandbox" "$RES/sandbox"
chmod -R u+rwX "$RES/sandbox"

echo "==> staged:"
ls -la "$RES"
"$RES/tsunagu" --version
