{
  lib,
  craneLib,
  pkgs,
  runtimeLibs,
  frontend,
  suwayomiServer,
  version,
  cargoSrc,
  appIcon,
}:

let
  commonArgs = {
    src = cargoSrc;
    pname = "moku";
    inherit version;
    strictDeps = true;
    buildInputs = runtimeLibs;
    nativeBuildInputs = with pkgs; [ pkg-config wrapGAppsHook3 ];
    preBuild = ''
      cp -r ${frontend} ../dist
    '';
  };

  cargoArtifacts = craneLib.buildDepsOnly commonArgs;
in
craneLib.buildPackage (commonArgs // {
  inherit cargoArtifacts;

  meta.mainProgram = "moku";

  postInstall = ''
    mkdir -p "$out/share/applications"
    cat > "$out/share/applications/moku.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Moku
Comment=Manga reader frontend for Suwayomi
Exec=$out/bin/moku
Icon=moku
Terminal=false
Categories=Graphics;Viewer;
Keywords=manga;comic;reader;suwayomi;
StartupWMClass=moku
EOF

    for size in 32x32 128x128 256x256 512x512; do
      src="icons/$size.png"
      [ -f "$src" ] && install -Dm644 "$src" \
        "$out/share/icons/hicolor/$size/apps/moku.png"
    done

    for size in 128x128 256x256; do
      src="icons/''${size}@2x.png"
      [ -f "$src" ] && install -Dm644 "$src" \
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
      --prefix PATH : "${lib.makeBinPath [ suwayomiServer ]}" \
      --set GDK_BACKEND wayland \
      --set WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS 1
  '';
})
