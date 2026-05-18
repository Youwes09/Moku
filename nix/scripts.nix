{ pkgs, rustToolchain, version }:

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
      (python3.withPackages (ps: [ ps.aiohttp ps.tomlkit ]))
    ];
    text = ''
      [[ $# -lt 1 ]] && { echo "Usage: nix run .#bump -- <version>"; exit 1; }
      VERSION="$1"
      REPO="$(git rev-parse --show-toplevel)"

      echo "── Bumping version fields to $VERSION ──"
      sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" \
        "$REPO/src-tauri/tauri.conf.json"
      sed -i "0,/^version = \"[^\"]*\"/s//version = \"$VERSION\"/" \
        "$REPO/src-tauri/Cargo.toml"
      sed -i "s/version = \"[^\"]*\";/version = \"$VERSION\";/g" \
        "$REPO/flake.nix"
      sed -i "s/^pkgver=.*/pkgver=$VERSION/" "$REPO/PKGBUILD"
      sed -i "s/^pkgrel=.*/pkgrel=1/"        "$REPO/PKGBUILD"
      echo "Done"

      echo "── Regenerating Cargo.lock ──"
      (cd "$REPO/src-tauri" && cargo generate-lockfile)
      echo "Done"

      echo "── Building frontend ──"
      cd "$REPO"
      pnpm install --frozen-lockfile
      pnpm build
      echo "Done"

      echo "── Repacking frontend-dist.tar.gz ──"
      tar -czf "$REPO/packaging/frontend-dist.tar.gz" -C "$REPO" dist
      FRONTEND_SHA=$(sha256sum "$REPO/packaging/frontend-dist.tar.gz" | awk '{print $1}')
      echo "sha256: $FRONTEND_SHA"

      echo "── Regenerating cargo-sources.json ──"
      python3 "$REPO/packaging/flatpak-cargo-generator.py" \
        "$REPO/src-tauri/Cargo.lock" \
        -o "$REPO/packaging/cargo-sources.json"
      echo "Done"

      echo "── Patching flatpak manifest ──"
      MANIFEST="$REPO/io.github.moku_project.Moku.yml"
      sed -i "s/tag: v[^[:space:]]*/tag: v$VERSION/" "$MANIFEST"
      python3 - "$MANIFEST" "$FRONTEND_SHA" <<'PYEOF'
      import re, sys
      path, sha = sys.argv[1], sys.argv[2]
      text = open(path).read()
      updated, n = re.subn(
        r'(path:\s*packaging/frontend-dist\.tar\.gz\s*\n\s*sha256:\s*)[0-9a-f]+',
        r'\g<1>' + sha, text)
      if n == 0:
          sys.exit("ERROR: could not find frontend-dist sha256 in manifest")
      open(path, 'w').write(updated)
      PYEOF
      echo "Done"

      echo ""
      echo "Bumped to v$VERSION — commit, tag, push, then: nix run .#post-tag-bump -- $VERSION"
    '';
  };

  postTagBump = pkgs.writeShellApplication {
    name = "moku-post-tag-bump";
    runtimeInputs = with pkgs; [ gnused coreutils git curl ];
    text = ''
      [[ $# -lt 1 ]] && { echo "Usage: nix run .#post-tag-bump -- <version>"; exit 1; }
      VERSION="$1"
      REPO="$(git rev-parse --show-toplevel)"
      MANIFEST="$REPO/io.github.moku_project.Moku.yml"
      PKGBUILD="$REPO/PKGBUILD"

      echo "── Resolving commit for v$VERSION ──"
      COMMIT=$(git ls-remote https://github.com/moku-project/Moku.git "refs/tags/v$VERSION" \
        | awk '{print $1}')
      [[ -z "$COMMIT" ]] && { echo "ERROR: tag v$VERSION not found on remote"; exit 1; }
      echo "commit: $COMMIT"
      sed -i "s/commit: [0-9a-f]\{40\}/commit: $COMMIT/" "$MANIFEST"
      echo "Done"

      echo "── Fetching PKGBUILD tarball sha256 ──"
      TARBALL_URL="https://github.com/moku-project/Moku/archive/refs/tags/v$VERSION.tar.gz"
      TARBALL_SHA=$(curl -fsSL "$TARBALL_URL" | sha256sum | awk '{print $1}')
      sed -i "/sha256sums=/,/)/{ 0,/'/s/'[^']*'/'$TARBALL_SHA'/ }" "$PKGBUILD"
      grep -q "$TARBALL_SHA" "$PKGBUILD" \
        || { echo "ERROR: PKGBUILD sha256 replacement failed"; exit 1; }
      echo "Done"

      echo ""
      echo "post-tag-bump complete for v$VERSION"
    '';
  };

  flatpak = pkgs.writeShellApplication {
    name = "moku-flatpak";
    runtimeInputs = with pkgs; [ coreutils git appstream flatpak-builder flatpak ];
    text = ''
      [[ $# -lt 1 ]] && { echo "Usage: nix run .#flatpak -- <version>"; exit 1; }
      REPO="$(git rev-parse --show-toplevel)"
      MANIFEST="$REPO/io.github.moku_project.Moku.yml"

      rm -rf "$REPO/build-dir" "$REPO/repo"
      flatpak-builder \
        --repo="$REPO/repo" \
        --force-clean \
        "$REPO/build-dir" \
        "$MANIFEST"
      flatpak build-bundle "$REPO/repo" "$REPO/moku.flatpak" io.github.moku_project.Moku
      rm -rf "$REPO/build-dir" "$REPO/repo"

      echo "moku.flatpak created"
    '';
  };

  tunnel = pkgs.writeShellApplication {
    name = "moku-tunnel";
    runtimeInputs = with pkgs; [ cloudflared ];
    text = ''
      PORT="''${1:-4567}"
      cloudflared tunnel --url "http://localhost:$PORT"
    '';
  };
}
