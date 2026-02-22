{
  description = "Moku — manga reader frontend for Suwayomi";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    crane.url = "github:ipetkov/crane";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nix-appimage = {
      url = "github:ralismark/nix-appimage";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, crane, rust-overlay, nix-appimage, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      perSystem =
        { system, pkgs, lib, ... }:
        let
          pkgs' = import inputs.nixpkgs {
            inherit system;
            overlays = [ rust-overlay.overlays.default ];
          };

          rustToolchain = pkgs'.rust-bin.stable.latest.default.override {
            extensions = [
              "rust-src"
              "rust-analyzer"
            ];
          };

          craneLib = (crane.mkLib pkgs').overrideToolchain rustToolchain;

          runtimeLibs = with pkgs; [
            webkitgtk_4_1
            gtk3
            glib
            cairo
            pango
            atk
            gdk-pixbuf
            libsoup_3
            openssl
            dbus
            libappindicator-gtk3
            gsettings-desktop-schemas
          ];

          frontendSrc = lib.cleanSourceWith {
            src = ./.;
            filter = path: type:
              let base = builtins.baseNameOf path;
              in
              (lib.hasInfix "/src" path)
              || base == "index.html"
              || base == "package.json"
              || base == "pnpm-lock.yaml"
              || base == "tsconfig.json"
              || base == "tsconfig.node.json"
              || base == "vite.config.ts"
              || base == "postcss.config.js"
              || base == "postcss.config.cjs"
              || base == "tailwind.config.js"
              || base == "tailwind.config.ts";
          };

          frontend = pkgs.stdenv.mkDerivation {
            pname = "moku-frontend";
            version = "0.1.0";
            src = frontendSrc;

            nativeBuildInputs = with pkgs; [
              nodejs_22
              pnpm
              pnpmConfigHook
            ];

            pnpmDeps = pkgs.fetchPnpmDeps {
              pname = "moku-frontend";
              version = "0.1.0";
              src = frontendSrc;
              fetcherVersion = 1;
              hash = "sha256-2Hdzsjwbb+CKiRn/nGHwLeysKvpvEhd5C213YgWmOSU=";
            };

            buildPhase = "pnpm build";
            installPhase = "cp -r dist $out";
          };

          cargoSrc = lib.cleanSourceWith {
            src = ./src-tauri;
            filter = path: type:
              (craneLib.filterCargoSources path type)
              || (lib.hasInfix "/icons/" path)
              || (lib.hasInfix "/capabilities/" path)
              || (builtins.baseNameOf path == "tauri.conf.json");
          };

          commonArgs = {
            src = cargoSrc;
            cargoToml = ./src-tauri/Cargo.toml;
            cargoLock = ./src-tauri/Cargo.lock;
            strictDeps = true;
            buildInputs = runtimeLibs;
            nativeBuildInputs = with pkgs; [
              pkg-config
              wrapGAppsHook3
            ];
            preBuild = ''
              cp -r ${frontend} ../dist
            '';
            WEBKIT_DISABLE_COMPOSITING_MODE = "1";
          };

          cargoArtifacts = craneLib.buildDepsOnly commonArgs;

          moku = craneLib.buildPackage (commonArgs // {
            inherit cargoArtifacts;
            meta.mainProgram = "moku";
            postInstall = ''
              wrapProgram $out/bin/moku \
                --prefix XDG_DATA_DIRS : "${lib.makeSearchPath "share/gsettings-schemas" [
                  pkgs.gsettings-desktop-schemas
                  pkgs.gtk3
                ]}" \
                --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath runtimeLibs}" \
                --prefix PATH : "${lib.makeBinPath [ pkgs.suwayomi-server ]}"
            '';
          });

        in
        {
          packages = {
            inherit moku frontend;
            default = moku;
            appimage = nix-appimage.bundlers."${system}".default moku;
          };

          devShells.default = pkgs.mkShell {
            buildInputs = runtimeLibs;
            nativeBuildInputs = with pkgs; [
              rustToolchain
              pkg-config
              wrapGAppsHook3
              nodejs_22
              pnpm
              suwayomi-server
              xdg-utils
            ];
            shellHook = ''
              export WEBKIT_DISABLE_COMPOSITING_MODE=1
              export APPIMAGE_EXTRACT_AND_RUN=1
              export NO_STRIP=true
              export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig''${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
              export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}''${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"

              if [ ! -e /usr/bin/xdg-open ]; then
                sudo ln -sf ${pkgs.xdg-utils}/bin/xdg-open /usr/bin/xdg-open
              fi

              LINUXDEPLOY="$HOME/.cache/tauri/linuxdeploy-x86_64.AppImage"
              LINUXDEPLOY_REAL="$HOME/.cache/tauri/linuxdeploy-x86_64.AppImage.real"
              if [ -f "$LINUXDEPLOY" ] && [ ! -f "$LINUXDEPLOY_REAL" ]; then
                mv "$LINUXDEPLOY" "$LINUXDEPLOY_REAL"
                printf '#!/bin/sh\nexec ${pkgs.appimage-run}/bin/appimage-run "%s" "$@"\n' "$LINUXDEPLOY_REAL" > "$LINUXDEPLOY"
                chmod +x "$LINUXDEPLOY"
                echo "linuxdeploy wrapped with appimage-run"
              fi

              echo "Moku dev shell"
              echo "  pnpm install && pnpm tauri:dev"
            '';
          };

          formatter = pkgs.nixfmt-rfc-style;
        };
    };
}
