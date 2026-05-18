{
  lib,
  stdenvNoCC,
  fetchurl,
  makeWrapper,
  jdk21_headless,
}:
let
  jdk = jdk21_headless;
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "suwayomi-server";
  version = "2.1.2087";

  src = fetchurl {
    url = "https://github.com/Suwayomi/Suwayomi-Server-preview/releases/download/v${finalAttrs.version}/Suwayomi-Server-v${finalAttrs.version}.jar";
    hash = "sha256-9YmkImdCUjlME7KJqci+aRkFv1g++39NXxUBrl6R5rM=";
  };

  nativeBuildInputs = [ makeWrapper ];

  dontUnpack = true;

  buildPhase = ''
    runHook preBuild

    install -Dm644 $src $out/share/suwayomi-server/suwayomi-server.jar

    makeWrapper ${jdk}/bin/java $out/bin/suwayomi-server \
      --add-flags "-Dsuwayomi.tachidesk.config.server.initialOpenInBrowserEnabled=false" \
      --add-flags "-jar $out/share/suwayomi-server/suwayomi-server.jar"

    runHook postBuild
  '';

  meta = {
    description = "Free and open source manga reader server that runs extensions built for Mihon (Tachiyomi)";
    homepage = "https://github.com/Suwayomi/Suwayomi-Server";
    downloadPage = "https://github.com/Suwayomi/Suwayomi-Server-preview/releases";
    changelog = "https://github.com/Suwayomi/Suwayomi-Server-preview/releases/tag/v${finalAttrs.version}";
    license = lib.licenses.mpl20;
    platforms = jdk.meta.platforms;
    sourceProvenance = [ lib.sourceTypes.binaryBytecode ];
    mainProgram = "suwayomi-server";
  };
})
