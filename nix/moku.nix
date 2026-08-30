{
  lib,
  pkgs,
  rustToolchain,
  runtimeLibs,
  gstPluginPath,
  version,
  versions,
  src,
  appIcon,
  tsunaguBin,
}:

pkgs.stdenv.mkDerivation {
  pname = "moku";
  inherit version src;

  nativeBuildInputs = with pkgs; [
    rustToolchain
    nodejs_22
    pnpm
    pnpmConfigHook
    pkg-config
    wrapGAppsHook3
    rustPlatform.cargoSetupHook
  ];

  buildInputs = runtimeLibs;

  pnpmDeps = pkgs.fetchPnpmDeps {
    pname = "moku";
    inherit version src;
    fetcherVersion = 4;
    hash = versions.frontend.pnpmHash;
  };

  cargoDeps = pkgs.rustPlatform.importCargoLock {
    lockFile = ../src-tauri/Cargo.lock;
    outputHashes = {
      "tauri-plugin-discord-rpc-0.1.0" = versions.gitDeps.tauri-plugin-discord-rpc;
    };
  };

  env = {
    PKG_CONFIG_PATH = "${pkgs.openssl.dev}/lib/pkgconfig";
    TAURI_SKIP_DEVSERVER_CHECK = "true";
    cargoRoot = "src-tauri";
  };

  buildPhase = ''
    export HOME=$(mktemp -d)
    pnpm exec tauri build --config '{"bundle":{"resources":null}}'
  '';

  installPhase = ''
    install -Dm755 src-tauri/target/release/moku $out/bin/moku

    mkdir -p "$out/share/applications"
    cat > "$out/share/applications/moku.desktop" << EOF2
[Desktop Entry]
Version=1.0
Type=Application
Name=Moku
Comment=Manga, novel and anime reader
Exec=$out/bin/moku
Icon=moku
Terminal=false
Categories=Graphics;Viewer;
Keywords=manga;comic;novel;anime;reader;
StartupWMClass=moku
EOF2

    for size in 32x32 128x128 256x256 512x512; do
      f="src-tauri/icons/$size.png"
      [ -f "$f" ] && install -Dm644 "$f" \
        "$out/share/icons/hicolor/$size/apps/moku.png"
    done

    for size in 128x128 256x256; do
      f="src-tauri/icons/''${size}@2x.png"
      [ -f "$f" ] && install -Dm644 "$f" \
        "$out/share/icons/hicolor/''${size}@2/apps/moku.png"
    done

    install -Dm644 "${appIcon}" \
      "$out/share/icons/hicolor/scalable/apps/moku.svg"

    wrapProgram $out/bin/moku \
      --prefix XDG_DATA_DIRS : "${lib.makeSearchPath "share/gsettings-schemas" [
        pkgs.gsettings-desktop-schemas
        pkgs.gtk3
      ]}" \
      --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath runtimeLibs}" \
      --prefix GST_PLUGIN_SYSTEM_PATH_1_0 : "${gstPluginPath}" \
      --prefix GIO_EXTRA_MODULES : "${pkgs.glib-networking}/lib/gio/modules" \
      --set TSUNAGU_BIN "${tsunaguBin}" \
      --set GDK_BACKEND wayland \
      --set WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS 1
  '';

  meta.mainProgram = "moku";
}
