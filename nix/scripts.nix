{ pkgs, rustToolchain, version, versions }:

{
  bump = pkgs.writeShellApplication {
    name = "moku-bump";
    runtimeInputs = with pkgs; [
      gnused
      coreutils
      git
      rustToolchain
      nodejs_22
      pnpm
    ];
    text = ''
      [[ $# -lt 1 ]] && { echo "Usage: nix run .#bump -- <version>"; exit 1; }
      VERSION="$1"
      REPO="$(git rev-parse --show-toplevel)"

      sed -i "s/moku = \"[^\"]*\"/moku = \"$VERSION\"/" "$REPO/nix/versions.nix"
      sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$REPO/src-tauri/tauri.conf.json"
      sed -i "0,/^version = \"[^\"]*\"/s//version = \"$VERSION\"/" "$REPO/src-tauri/Cargo.toml"

      (cd "$REPO/src-tauri" && cargo generate-lockfile)

      cd "$REPO"
      pnpm install --frozen-lockfile
      pnpm build:static

      echo "Bumped to v$VERSION — commit, tag, push."
    '';
  };

  tunnel = pkgs.writeShellApplication {
    name = "moku-tunnel";
    runtimeInputs = with pkgs; [ cloudflared ];
    text = ''
      PORT="''${1:-6007}"
      cloudflared tunnel --url "http://localhost:$PORT"
    '';
  };
}
