# Sourced by CI jobs that need versions from nix/versions.nix.
# Usage:  source .github/read_versions.sh
# Exports: MOKU_VERSION  TSUNAGU_VERSION
#
# Uses only POSIX -E grep (no -P) so this works on both GNU grep (Linux/Windows)
# and BSD grep (macOS), which does not support -P/PCRE.

_nix="$( cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd )/nix/versions.nix"
_t=$(cat "$_nix")

# Match `key = "value"` with -E, then strip the surrounding quotes.
_pick() { echo "$_t" | grep -oE "${1}"'[[:space:]]*=[[:space:]]*"[^"]+"' | grep -oE '"[^"]+"' | tr -d '"'; }

export MOKU_VERSION=$(_pick "moku")
export TSUNAGU_VERSION=$(_pick "tsunagu")

unset _nix _t
unset -f _pick
