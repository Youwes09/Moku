#!/bin/sh
#  — Suwayomi launcher for Linux AppImage/deb.
# Tauri resolves this via resolve_server_binary() in lib.rs, which looks for
# "suwayomi-launcher" or "suwayomi-launcher.sh" in the resource directory.
set -e

# ── Locate our resource directory ─────────────────────────────────────────────
# In an AppImage: resources sit at <mountpoint>/resources/
# In a deb install: /usr/lib/moku/resources/ (Tauri's default)
# We resolve relative to this script's own location.
SELF="$0"
while [ -L "$SELF" ]; do
  SELF="$(readlink "$SELF")"
done
SCRIPT_DIR="$(cd "$(dirname "$SELF")" && pwd)"

# Tauri places resources one level up from the binary on Linux.
# Try a few candidates so this works in both AppImage and installed layouts.
find_resource() {
  for candidate in \
    "${SCRIPT_DIR}" \
    "${SCRIPT_DIR}/../resources" \
    "${SCRIPT_DIR}/resources"
  do
    if [ -f "${candidate}/Suwayomi-Server.jar" ]; then
      echo "$(cd "$candidate" && pwd)"
      return 0
    fi
  done
  return 1
}

RESOURCE_DIR=$(find_resource) || {
  echo "[launcher] ERROR: cannot locate Suwayomi-Server.jar relative to $SCRIPT_DIR" >&2
  exit 1
}

JAR="${RESOURCE_DIR}/Suwayomi-Server.jar"
JAVA="${RESOURCE_DIR}/jre/bin/java"
CATCH_ABORT="${RESOURCE_DIR}/catch_abort.so"

echo "[launcher] RESOURCE_DIR=$RESOURCE_DIR" >&2
echo "[launcher] JAVA=$JAVA" >&2
echo "[launcher] JAR=$JAR" >&2

if [ ! -x "$JAVA" ]; then
  echo "[launcher] ERROR: java not executable at $JAVA" >&2
  exit 1
fi
if [ ! -f "$JAR" ]; then
  echo "[launcher] ERROR: jar not found at $JAR" >&2
  exit 1
fi

# ── Data directory ─────────────────────────────────────────────────────────────
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/Tachidesk"
mkdir -p "$DATA_DIR"

# ── Seed server.conf on first run ──────────────────────────────────────────────
if [ ! -f "$DATA_DIR/server.conf" ]; then
  cat > "$DATA_DIR/server.conf" << 'EOF'
server.ip = "127.0.0.1"
server.port = 4567
server.webUIEnabled = true
server.initialOpenInBrowserEnabled = false
server.systemTrayEnabled = false
server.webUIInterface = "browser"
server.webUIFlavor = "WebUI"
server.webUIChannel = "PREVIEW"
server.electronPath = ""
server.debugLogsEnabled = false
server.downloadAsCbz = true
server.autoDownloadNewChapters = false
server.globalUpdateInterval = 12
server.maxSourcesInParallel = 6
server.extensionRepos = []
EOF
fi

# ── Force-patch the three keys that cause JCEF/GUI crashes ────────────────────
sed -i \
  -e 's|server\.webUIEnabled.*|server.webUIEnabled = true|' \
  -e 's|server\.initialOpenInBrowserEnabled.*|server.initialOpenInBrowserEnabled = false|' \
  -e 's|server\.systemTrayEnabled.*|server.systemTrayEnabled = false|' \
  "$DATA_DIR/server.conf"

# Append keys if absent (e.g. user-managed conf missing them)
grep -q 'server\.webUIEnabled'                "$DATA_DIR/server.conf" || echo 'server.webUIEnabled = true'                >> "$DATA_DIR/server.conf"
grep -q 'server\.initialOpenInBrowserEnabled' "$DATA_DIR/server.conf" || echo 'server.initialOpenInBrowserEnabled = false' >> "$DATA_DIR/server.conf"
grep -q 'server\.systemTrayEnabled'           "$DATA_DIR/server.conf" || echo 'server.systemTrayEnabled = false'           >> "$DATA_DIR/server.conf"

# ── Suppress any GUI environment that would confuse the JVM ───────────────────
unset DISPLAY
unset WAYLAND_DISPLAY

export _JAVA_OPTIONS="-Djava.awt.headless=true"
export JAVA_TOOL_OPTIONS="-Djava.awt.headless=true"

# ── LD_PRELOAD catch_abort.so if present ──────────────────────────────────────
# Catches SIGTRAP/SIGILL from KCEF/Webview so a bad extension can't
# bring down the whole server process (mirrors the Flatpak build).
if [ -f "$CATCH_ABORT" ]; then
  export LD_PRELOAD="${CATCH_ABORT}${LD_PRELOAD:+:$LD_PRELOAD}"
fi

exec "$JAVA" \
  -Djava.awt.headless=true \
  -Dapple.awt.UIElement=true \
  -Dsun.java2d.noddraw=true \
  -Dsun.awt.disablegui=true \
  -Dsuwayomi.tachidesk.config.server.rootDir="$DATA_DIR" \
  -jar "$JAR"