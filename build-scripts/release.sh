#!/usr/bin/env bash
# build-scripts/release.sh
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   ./build-scripts/release.sh 0.2.0
#
# Requires: nix, flatpak-builder, appstream
set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}  →${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${RESET} $*"; }
die()     { echo -e "${RED}  ✗${RESET} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}── $* ──${RESET}"; }

# ── Args ───────────────────────────────────────────────────────────────────────
[[ $# -lt 1 ]] && die "Usage: $0 <version>"
VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FLATPAK_MANIFEST="${REPO_ROOT}/dev.moku.app.yml"
PKGBUILD="${REPO_ROOT}/PKGBUILD"

# ── Sanity checks ──────────────────────────────────────────────────────────────
section "Pre-flight"
command -v nix  &>/dev/null || die "nix not found"
command -v curl &>/dev/null || die "curl not found"
[[ -f "$FLATPAK_MANIFEST" ]] || die "Flatpak manifest not found: $FLATPAK_MANIFEST"
[[ -f "$PKGBUILD"         ]] || die "PKGBUILD not found: $PKGBUILD"
success "OK"

# ── Bump versions ──────────────────────────────────────────────────────────────
section "Bumping version → ${VERSION}"
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" \
  "${REPO_ROOT}/src-tauri/tauri.conf.json"
success "tauri.conf.json → ${VERSION}"

sed -i "0,/^version = \"[^\"]*\"/s//version = \"${VERSION}\"/" \
  "${REPO_ROOT}/src-tauri/Cargo.toml"
success "Cargo.toml      → ${VERSION}"

# flake.nix has two `version = "x.y.z";` strings inside the frontend
# derivation and fetchPnpmDeps — both need to match.
sed -i "s/version = \"[^\"]*\";/version = \"${VERSION}\";/g" \
  "${REPO_ROOT}/flake.nix"
success "flake.nix       → ${VERSION}"

# ── Build frontend ─────────────────────────────────────────────────────────────
section "Building frontend"
cd "$REPO_ROOT"
nix develop --command pnpm install --frozen-lockfile
nix develop --command pnpm build
success "Frontend built → dist/"

# ── Flatpak ────────────────────────────────────────────────────────────────────
section "Regenerating cargo-sources.json"
cd "$REPO_ROOT"
nix-shell \
  -p "python311.withPackages(ps: [ ps.aiohttp ps.tomlkit ])" \
  --run "python3 packaging/flatpak-cargo-generator.py src-tauri/Cargo.lock -o packaging/cargo-sources.json"
success "cargo-sources.json updated"

section "Rebuilding frontend-dist.tar.gz"
tar -czf packaging/frontend-dist.tar.gz -C dist .
FRONTEND_SHA=$(sha256sum packaging/frontend-dist.tar.gz | awk '{print $1}')
success "frontend-dist.tar.gz rebuilt  sha256: ${FRONTEND_SHA}"

section "Patching frontend-dist sha256 in dev.moku.app.yml"
PATCH_SCRIPT=$(mktemp /tmp/patch-sha256-XXXXXX.py)
cat > "$PATCH_SCRIPT" << PYEOF
import re, sys
path = "${FLATPAK_MANIFEST}"
new_sha = "${FRONTEND_SHA}"
text = open(path).read()
pattern = r'(path:\s*packaging/frontend-dist\.tar\.gz\s*\n\s*sha256:\s*)[0-9a-f]+'
replacement = r'\g<1>' + new_sha
updated, n = re.subn(pattern, replacement, text)
if n == 0:
    sys.exit("Could not find frontend-dist sha256 in dev.moku.app.yml")
open(path, 'w').write(updated)
PYEOF
nix-shell -p python3 --run "python3 '$PATCH_SCRIPT'"
rm -f "$PATCH_SCRIPT"
success "dev.moku.app.yml sha256 updated"

section "Building Flatpak bundle"
rm -rf "${REPO_ROOT}/build-dir" "${REPO_ROOT}/repo"
nix shell nixpkgs#appstream nixpkgs#flatpak-builder --command \
  flatpak-builder \
    --repo="${REPO_ROOT}/repo" \
    --force-clean \
    "${REPO_ROOT}/build-dir" \
    "$FLATPAK_MANIFEST"

flatpak build-bundle \
  "${REPO_ROOT}/repo" \
  "${REPO_ROOT}/moku.flatpak" \
  dev.moku.app

rm -rf "${REPO_ROOT}/build-dir" "${REPO_ROOT}/repo"
success "moku.flatpak created"

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
success "v${VERSION} ready"
info    "Flatpak bundle → ${REPO_ROOT}/moku.flatpak"
echo ""
warn    "PKGBUILD not patched yet — tag must exist on GitHub first."
info    "After pushing the tag, run:"
echo -e "    ${CYAN}./build-scripts/pkgbuild-bump.sh ${VERSION}${RESET}"