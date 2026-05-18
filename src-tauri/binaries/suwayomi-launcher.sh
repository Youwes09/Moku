#!/bin/sh
# Moku — Suwayomi launcher sidecar for macOS.
# Tauri calls this script directly as a sidecar (Contents/MacOS/suwayomi-server-{arch}).
# The Suwayomi bundle is placed by Tauri into Contents/Resources/suwayomi-bundle/.
set -e

# Resolve the real directory of this script, following symlinks.
SELF="$0"
while [ -L "$SELF" ]; do
  SELF="$(readlink "$SELF")"
done
DIR="$(cd "$(dirname "$SELF")" && pwd)"

# ── Locate the bundle ─────────────────────────────────────────────────────────
# Inside .app:  sidecar = Contents/MacOS/suwayomi-server-{arch}
#               bundle  = Contents/Resources/suwayomi-bundle/
# Dev / flat layout: bundle sits next to the sidecar, or one level up.
find_bundle() {
  local base="$1"
  for candidate in \
    "${base}/../Resources/suwayomi-bundle" \
    "${base}/suwayomi-bundle" \
    "${base}/../suwayomi-bundle"
  do
    # The jar lives at <bundle>/bin/Suwayomi-Server.jar
    if [ -f "${candidate}/bin/Suwayomi-Server.jar" ]; then
      # Canonicalise (no readlink -f on older macOS sh, use cd trick)
      echo "$(cd "$candidate" && pwd)"
      return 0
    fi
  done
  return 1
}

BUNDLE=$(find_bundle "$DIR") || {
  echo "[sidecar] ERROR: cannot locate suwayomi-bundle relative to $DIR" >&2
  echo "[sidecar] Tried:" >&2
  echo "  $DIR/../Resources/suwayomi-bundle" >&2
  echo "  $DIR/suwayomi-bundle" >&2
  echo "  $DIR/../suwayomi-bundle" >&2
  exit 1
}

JAVA="${BUNDLE}/jre/bin/java"
JAR="${BUNDLE}/bin/Suwayomi-Server.jar"

echo "[sidecar] BUNDLE=$BUNDLE" >&2
echo "[sidecar] JAVA=$JAVA" >&2
echo "[sidecar] JAR=$JAR" >&2

if [ ! -x "$JAVA" ]; then
  echo "[sidecar] ERROR: java not executable at $JAVA" >&2
  exit 1
fi
if [ ! -f "$JAR" ]; then
  echo "[sidecar] ERROR: jar not found at $JAR" >&2
  exit 1
fi

# "$@" will contain the -Dsuwayomi.tachidesk.config.server.rootDir=... flag
# prepended by spawn_server in lib.rs, followed by -jar <path>.
# We call java directly so all JVM flags reach it properly.
exec "$JAVA" \
  -Djava.awt.headless=true \
  "$@" \
  -jar "$JAR"
