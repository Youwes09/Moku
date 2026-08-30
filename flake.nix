{
  description = "Moku — manga/novel/anime reader frontend for Tsunagu";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    # The backend. `nix run .#moku` launches this via the TSUNAGU_BIN env var
    # (see nix/moku.nix + src-tauri/src/backend.rs) instead of a bundled sidecar.
    # Tracks the default branch; `nix flake update tsunagu` pulls the latest commit.
    tsunagu = {
      url = "github:moku-project/Tsunagu";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, rust-overlay, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      perSystem =
        { system, lib, ... }:
        let
          versions = import ./nix/versions.nix;
          version = versions.moku;

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

          # WebKitGTK plays <video>/<audio> through GStreamer 1.0 — without
          # these plugins it fails silently ("GStreamer element appsink not
          # found", grey video). libav covers h264/aac (mp4); good/bad/ugly
          # cover demuxers, sinks (autoaudiosink) and misc codecs.
          gstPlugins = with pkgs.gst_all_1; [
            gstreamer
            gst-plugins-base
            gst-plugins-good
            gst-plugins-bad
            gst-plugins-ugly
            gst-libav
          ];

          runtimeLibs = (with pkgs; [
            webkitgtk_4_1
            gtk3
            glib
            glib-networking   # GIO TLS backend — without it the webview can't
                              # fetch external https:// resources (AniList covers)
            cairo
            pango
            atk
            gdk-pixbuf
            libsoup_3
            openssl
            dbus
            libappindicator-gtk3
            gsettings-desktop-schemas
          ]) ++ gstPlugins;

          gstPluginPath = pkgs.lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" gstPlugins;

          src = lib.cleanSourceWith {
            src = ./.;
            filter =
              path: type:
              let
                base = builtins.baseNameOf path;
              in
              (lib.hasInfix "/src" path)
              || (lib.hasInfix "/src-tauri/src" path)
              || (lib.hasInfix "/src-tauri/icons" path)
              || (lib.hasInfix "/src-tauri/capabilities" path)
              || (lib.hasInfix "/static" path)
              || base == "index.html"
              || base == "package.json"
              || base == "pnpm-lock.yaml"
              || base == "pnpm-workspace.yaml"
              || base == "tsconfig.json"
              || base == "vite.config.ts"
              || base == "svelte.config.js"
              || base == "Cargo.toml"
              || base == "Cargo.lock"
              || base == "build.rs"
              || base == "tauri.conf.json";
          };


          tsunaguBin = "${inputs.tsunagu.packages.${system}.default}/bin/tsunagu";

          moku = pkgs.callPackage ./nix/moku.nix {
            inherit lib pkgs rustToolchain runtimeLibs version src versions gstPluginPath tsunaguBin;
            appIcon = ./src/lib/assets/moku-icon.svg;
          };

          scripts = import ./nix/scripts.nix { inherit pkgs rustToolchain version versions; };

        in
        {
          packages = {
            inherit moku;
            default = moku;
          };

          apps = {
            default = { type = "app"; program = "${moku}/bin/moku"; };
            moku    = { type = "app"; program = "${moku}/bin/moku"; };
            bump    = { type = "app"; program = "${scripts.bump}/bin/moku-bump"; };
            tunnel  = { type = "app"; program = "${scripts.tunnel}/bin/moku-tunnel"; };
          };

          devShells.default = pkgs.mkShell {
            buildInputs = runtimeLibs;
            nativeBuildInputs = with pkgs; [
              rustToolchain
              pkg-config
              wrapGAppsHook3
              nodejs_22
              pnpm
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
              export GST_PLUGIN_SYSTEM_PATH_1_0="${gstPluginPath}''${GST_PLUGIN_SYSTEM_PATH_1_0:+:$GST_PLUGIN_SYSTEM_PATH_1_0}"
              export GIO_EXTRA_MODULES="${pkgs.glib-networking}/lib/gio/modules''${GIO_EXTRA_MODULES:+:$GIO_EXTRA_MODULES}"

              # Same launch path as `nix run .#moku`: backend.rs picks up
              # TSUNAGU_BIN and spawns this exact server (with its matching jar +
              # JRE). Tracks the `tsunagu` flake input — `nix flake update
              # tsunagu` + re-enter the shell to move it.
              export TSUNAGU_BIN="${tsunaguBin}"

              echo "Moku dev shell — pnpm install && pnpm tauri:dev"
              echo ""
              echo "  backend: ${tsunaguBin}"
              echo "  nix run .#bump   -- <ver>   bump version + rebuild frontend"
              echo "  nix run .#tunnel -- [port]  expose local server via cloudflare"
            '';
          };

          formatter = pkgs.nixfmt-rfc-style;
        };
    };
}
