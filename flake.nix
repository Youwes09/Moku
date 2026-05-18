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
  };

  outputs =
    inputs@{ flake-parts, crane, rust-overlay, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      perSystem =
        { system, lib, ... }:
        let
          version = "0.9.4";

          pkgs = import inputs.nixpkgs {
            inherit system;
            overlays = [ rust-overlay.overlays.default ];
          };

          rustToolchain = pkgs.rust-bin.stable.latest.default.override {
            extensions = [
              "rust-src"
              "rust-analyzer"
            ];
          };

          craneLib = (crane.mkLib pkgs).overrideToolchain rustToolchain;

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
            filter =
              path: type:
              let
                base = builtins.baseNameOf path;
              in
              (lib.hasInfix "/src" path)
              || base == "index.html"
              || base == "package.json"
              || base == "pnpm-lock.yaml"
              || base == "tsconfig.json"
              || base == "vite.config.ts";
          };

          cargoSrc = lib.cleanSourceWith {
            src = ./src-tauri;
            filter =
              path: type:
              (craneLib.filterCargoSources path type)
              || (lib.hasInfix "/icons/" path)
              || (lib.hasInfix "/capabilities/" path)
              || (builtins.baseNameOf path == "tauri.conf.json");
          };

          suwayomiServer = pkgs.callPackage ./nix/server.nix { };

          frontend = pkgs.callPackage ./nix/frontend.nix {
            inherit version;
            src = frontendSrc;
          };

          moku = import ./nix/moku.nix {
            inherit lib craneLib pkgs runtimeLibs frontend suwayomiServer version cargoSrc;
            appIcon = ./src/assets/moku-icon.svg;
          };

          scripts = import ./nix/scripts.nix { inherit pkgs rustToolchain version; };

        in
        {
          packages = {
            inherit moku frontend suwayomiServer;
            default = moku;
          };

          apps = {
            default = { type = "app"; program = "${moku}/bin/moku"; };
            moku = { type = "app"; program = "${moku}/bin/moku"; };
            bump = { type = "app"; program = "${scripts.bump}/bin/moku-bump"; };
            post-tag-bump = { type = "app"; program = "${scripts.postTagBump}/bin/moku-post-tag-bump"; };
            flatpak = { type = "app"; program = "${scripts.flatpak}/bin/moku-flatpak"; };
            tunnel = { type = "app"; program = "${scripts.tunnel}/bin/moku-tunnel"; };
          };

          devShells.default = pkgs.mkShell {
            buildInputs = runtimeLibs;
            nativeBuildInputs = with pkgs; [
              rustToolchain
              pkg-config
              wrapGAppsHook3
              nodejs_22
              pnpm
              suwayomiServer
              cloudflared
              xdg-utils
              (python3.withPackages (ps: [
                ps.aiohttp
                ps.tomlkit
              ]))
            ];
            shellHook = ''
              export NO_STRIP=true
              export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig''${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
              export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}''${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath runtimeLibs}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

              echo "Moku dev shell — pnpm install && pnpm tauri:dev"
              echo ""
              echo "  nix run .#bump          -- <ver>"
              echo "  git commit && git tag && git push"
              echo "  nix run .#post-tag-bump -- <ver>"
              echo "  nix run .#flatpak       -- <ver>"
              echo "  nix run .#tunnel        -- [port]"
            '';
          };

          formatter = pkgs.nixfmt-rfc-style;
        };
    };
}
