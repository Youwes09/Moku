#!/usr/bin/env bash
# build-scripts/release.sh
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   ./build-scripts/release.sh 0.2.0           — full release (AUR + Flatpak)
#   ./build-scripts/release.sh 0.2.0 --aur     — AUR bin package only
#   ./build-scripts/release.sh 0.2.0 --flatpak — Flatpak sources + bundle only
#
# Requires: nix, podman (for AUR .SRCINFO generation in Arch container)

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
[[ $# -lt 1 ]] && die "Usage: $0 <version> [--aur|--flatpak]"

VERSION="$1"
MODE="${2:-all}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
AUR_DIR="${REPO_ROOT}/../moku-bin"
TARBALL="moku-${VERSION}-x86_64.tar.gz"
FLATPAK_MANIFEST="${REPO_ROOT}/dev.moku.app.yml"

# ── Sanity checks ──────────────────────────────────────────────────────────────
section "Pre-flight"
command -v nix &>/dev/null || die "nix not found"

if [[ "$MODE" == "all" || "$MODE" == "--aur" ]]; then
  command -v podman &>/dev/null || die "podman not found — needed for Arch container (makepkg)"
  [[ -d "$AUR_DIR" ]]           || die "AUR dir not found at $AUR_DIR\nClone it first:\n  git clone ssh://aur@aur.archlinux.org/moku-bin.git ../moku-bin"
  [[ -f "${AUR_DIR}/PKGBUILD" ]] || die "PKGBUILD not found in $AUR_DIR"
fi
success "OK"

# ── Bump versions ──────────────────────────────────────────────────────────────
section "Bumping version → ${VERSION}"

sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" \
  "${REPO_ROOT}/src-tauri/tauri.conf.json"
success "tauri.conf.json → ${VERSION}"

sed -i "0,/^version = \"[^\"]*\"/s//version = \"${VERSION}\"/" \
  "${REPO_ROOT}/src-tauri/Cargo.toml"
success "Cargo.toml      → ${VERSION}"

# ── Build frontend ─────────────────────────────────────────────────────────────
section "Building frontend"
cd "$REPO_ROOT"
nix develop --command pnpm install --frozen-lockfile
nix develop --command pnpm build
success "Frontend built → dist/"

# ── Build Rust binary ──────────────────────────────────────────────────────────
section "Building Rust binary"
nix develop --command cargo build --release --manifest-path src-tauri/Cargo.toml

BINARY="${REPO_ROOT}/src-tauri/target/release/moku"
[[ -f "$BINARY" ]] || die "Binary not found: $BINARY"
success "Binary → $BINARY"

# ── Flatpak ────────────────────────────────────────────────────────────────────
if [[ "$MODE" == "all" || "$MODE" == "--flatpak" ]]; then
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

  # Patch the sha256 in dev.moku.app.yml automatically via a temp script
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

  # Clean up intermediate build artefacts — keep only moku.flatpak
  rm -rf "${REPO_ROOT}/build-dir" "${REPO_ROOT}/repo"
  success "moku.flatpak created"
fi

# ── AUR tarball + PKGBUILD ─────────────────────────────────────────────────────
if [[ "$MODE" == "all" || "$MODE" == "--aur" ]]; then
  section "Assembling release tarball"
  cd "$REPO_ROOT"
  STAGE="release-${VERSION}"
  rm -rf "$STAGE"

  install -Dm755 "$BINARY"                                "${STAGE}/usr/bin/moku"
  install -Dm644 packaging/dev.moku.app.desktop           "${STAGE}/usr/share/applications/dev.moku.app.desktop"
  install -Dm644 src-tauri/icons/32x32.png                "${STAGE}/usr/share/icons/hicolor/32x32/apps/dev.moku.app.png"
  install -Dm644 src-tauri/icons/128x128.png              "${STAGE}/usr/share/icons/hicolor/128x128/apps/dev.moku.app.png"
  install -Dm644 "src-tauri/icons/128x128@2x.png"         "${STAGE}/usr/share/icons/hicolor/256x256/apps/dev.moku.app.png"
  install -Dm644 packaging/dev.moku.app.metainfo.xml      "${STAGE}/usr/share/metainfo/dev.moku.app.metainfo.xml"

  tar -czf "$TARBALL" "$STAGE/"
  AUR_SHA=$(sha256sum "$TARBALL" | awk '{print $1}')
  rm -rf "$STAGE"
  success "Tarball: ${TARBALL}  sha256: ${AUR_SHA}"

  section "Patching PKGBUILD"
  PKGBUILD="${AUR_DIR}/PKGBUILD"
  sed -i "s/^pkgver=.*/pkgver=${VERSION}/"                    "$PKGBUILD"
  sed -i "s/^pkgrel=.*/pkgrel=1/"                             "$PKGBUILD"
  sed -i "s/sha256sums=('[^']*')/sha256sums=('${AUR_SHA}')/"  "$PKGBUILD"
  success "PKGBUILD patched"

  # Tarball is only needed for the GitHub upload — remind user then it can go
  info "Tarball kept at ${REPO_ROOT}/${TARBALL} — upload it to GitHub, then it can be deleted"

  section "Generating .SRCINFO (Arch container)"
  # Mount only the AUR dir into a throwaway Arch container and run makepkg
  podman run --rm \
    --volume "${AUR_DIR}:/aur:z" \
    --workdir /aur \
    archlinux:latest \
    bash -c "
      pacman -Sy --noconfirm pacman >/dev/null 2>&1
      source PKGBUILD
      makepkg --printsrcinfo > .SRCINFO
    "
  success ".SRCINFO generated"

  section "Next steps"
  echo ""
  echo -e "  ${BOLD}1. Upload tarball to GitHub:${RESET}"
  echo -e "     ${CYAN}gh release create v${VERSION} '${REPO_ROOT}/${TARBALL}' --title 'v${VERSION}' --generate-notes${RESET}"
  echo ""
  echo -e "  ${BOLD}2. Push AUR:${RESET}"
  echo -e "     ${CYAN}cd ${AUR_DIR}${RESET}"
  echo -e "     ${CYAN}git add PKGBUILD .SRCINFO${RESET}"
  echo -e "     ${CYAN}git commit -m 'Update to ${VERSION}'${RESET}"
  echo -e "     ${CYAN}git push origin master${RESET}"
  echo ""
  echo -e "  ${BOLD}3. Clean up:${RESET}"
  echo -e "     ${CYAN}rm -f ${REPO_ROOT}/${TARBALL}${RESET}"
fi

echo ""
success "v${VERSION} ready"