#!/usr/bin/env bash
# build-scripts/pkgbuild-bump.sh
# ─────────────────────────────────────────────────────────────────────────────
# Run this AFTER the git tag has been pushed to GitHub.
#
# Usage:
#   ./build-scripts/pkgbuild-bump.sh 0.3.0
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}  →${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
die()     { echo -e "${RED}  ✗${RESET} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}── $* ──${RESET}"; }

[[ $# -lt 1 ]] && die "Usage: $0 <version>"
VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PKGBUILD="${REPO_ROOT}/PKGBUILD"

command -v curl &>/dev/null || die "curl not found"
[[ -f "$PKGBUILD" ]] || die "PKGBUILD not found: $PKGBUILD"

section "Patching PKGBUILD → ${VERSION}"

TARBALL_URL="https://github.com/Youwes09/Moku/archive/refs/tags/v${VERSION}.tar.gz"
info "Fetching source tarball to compute sha256…"
TARBALL_SHA=$(curl -fsSL "$TARBALL_URL" | sha256sum | awk '{print $1}')

sed -i "s/^pkgver=.*/pkgver=${VERSION}/" "$PKGBUILD"
sed -i "s/^pkgrel=.*/pkgrel=1/"          "$PKGBUILD"

# Replace only the first sha256 entry (source tarball) inside sha256sums=('...')
# The suwayomi jar and jdk hashes are pinned and stay untouched.
# Strategy: match the opening sha256sums=('' then swap just that first hash.
sed -i "s/\(sha256sums=('\)[0-9a-f]\{64\}/\1${TARBALL_SHA}/" "$PKGBUILD"

# Verify the replacement landed
if ! grep -q "$TARBALL_SHA" "$PKGBUILD"; then
  die "sha256 replacement failed — check PKGBUILD sha256sums format"
fi

success "PKGBUILD patched  (pkgver=${VERSION}, sha256=${TARBALL_SHA})"
info    "PKGBUILD → ${PKGBUILD}"