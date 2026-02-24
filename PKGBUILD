pkgname=moku
pkgver=0.2.0
pkgrel=1
pkgdesc="Native Linux manga reader frontend for Suwayomi-Server"
arch=('x86_64')
url="https://github.com/Youwes09/Moku"
license=('Apache 2.0')
depends=(
    'webkit2gtk-4.1'
    'gtk3'
    'libayatana-appindicator'
    'java-runtime>=21'
)
makedepends=(
    'rust'
    'cargo'
    'nodejs'
    'pnpm'
)
source=(
    "$pkgname-$pkgver.tar.gz::https://github.com/Youwes09/Moku/archive/refs/tags/v$pkgver.tar.gz"
    "suwayomi-server.jar::https://github.com/Suwayomi/Suwayomi-Server/releases/download/v2.1.1867/suwayomi-server-v2.1.1867.jar"
    "jdk.tar.gz::https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jre_x64_linux_hotspot_21.0.3_9.tar.gz"
)
sha256sums=('dfd110ae4f11711ce979020ae65b08ab2d0bd51ecc1ba877ba1780ba037357a4'
            '51e307c2581e4e1a002991ab3e3a77503c8b074c42695987a984a7382d0ac5af'
            'f1af100c4afca2035f446967323230150cfe5872b5a664d98c86963e5c066e0d')

prepare() {
    cd "Moku-$pkgver"
    pnpm install --frozen-lockfile
}

build() {
    cd "Moku-$pkgver"

    # Build frontend
    pnpm build

    # Repack dist for Tauri
    tar -czf packaging/frontend-dist.tar.gz -C dist .

    # Build Tauri binary
    TAURI_SKIP_DEVSERVER_CHECK=true cargo build \
        --release \
        --manifest-path src-tauri/Cargo.toml
}

package() {
    cd "Moku-$pkgver"

    # Moku binary
    install -Dm755 src-tauri/target/release/moku \
        "$pkgdir/usr/bin/moku"

    # Bundled JRE
    install -dm755 "$pkgdir/usr/lib/moku/jre"
    tar -xf "$srcdir/jdk.tar.gz" -C "$pkgdir/usr/lib/moku/jre" --strip-components=1

    # Suwayomi server jar
    install -Dm644 "$srcdir/suwayomi-server.jar" \
        "$pkgdir/usr/lib/moku/tachidesk/Suwayomi-Server.jar"

    # tachidesk-server wrapper script
    install -dm755 "$pkgdir/usr/lib/moku/tachidesk/default-conf"
    cat > "$pkgdir/usr/lib/moku/tachidesk/default-conf/server.conf" << 'EOF'
server.ip = "127.0.0.1"
server.port = 4567
server.webUIEnabled = false
server.initialOpenInBrowserEnabled = false
server.systemTrayEnabled = false
server.downloadAsCbz = true
server.autoDownloadNewChapters = false
server.globalUpdateInterval = 12
server.maxSourcesInParallel = 6
server.extensionRepos = []
EOF

    install -Dm755 /dev/stdin "$pkgdir/usr/bin/tachidesk-server" << 'EOF'
#!/bin/sh
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/moku/tachidesk"
mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/server.conf" ]; then
  cp /usr/lib/moku/tachidesk/default-conf/server.conf "$DATA_DIR/server.conf"
fi

sed -i \
  -e 's|server\.webUIEnabled.*|server.webUIEnabled = false|' \
  -e 's|server\.initialOpenInBrowserEnabled.*|server.initialOpenInBrowserEnabled = false|' \
  -e 's|server\.systemTrayEnabled.*|server.systemTrayEnabled = false|' \
  "$DATA_DIR/server.conf"

grep -q 'server\.webUIEnabled'                "$DATA_DIR/server.conf" || echo 'server.webUIEnabled = false'                >> "$DATA_DIR/server.conf"
grep -q 'server\.initialOpenInBrowserEnabled' "$DATA_DIR/server.conf" || echo 'server.initialOpenInBrowserEnabled = false' >> "$DATA_DIR/server.conf"
grep -q 'server\.systemTrayEnabled'           "$DATA_DIR/server.conf" || echo 'server.systemTrayEnabled = false'           >> "$DATA_DIR/server.conf"

unset DISPLAY
unset WAYLAND_DISPLAY
export _JAVA_OPTIONS="-Djava.awt.headless=true"
export JAVA_TOOL_OPTIONS="-Djava.awt.headless=true"

exec /usr/lib/moku/jre/bin/java \
  -Djava.awt.headless=true \
  -Dapple.awt.UIElement=true \
  -Dsun.java2d.noddraw=true \
  -Dsun.awt.disablegui=true \
  -Dsuwayomi.tachidesk.config.server.rootDir="$DATA_DIR" \
  -jar /usr/lib/moku/tachidesk/Suwayomi-Server.jar
EOF

    # Desktop entry and icons
    install -Dm644 packaging/dev.moku.app.desktop \
        "$pkgdir/usr/share/applications/dev.moku.app.desktop"
    install -Dm644 src-tauri/icons/32x32.png \
        "$pkgdir/usr/share/icons/hicolor/32x32/apps/dev.moku.app.png"
    install -Dm644 src-tauri/icons/128x128.png \
        "$pkgdir/usr/share/icons/hicolor/128x128/apps/dev.moku.app.png"
    install -Dm644 src-tauri/icons/128x128@2x.png \
        "$pkgdir/usr/share/icons/hicolor/256x256/apps/dev.moku.app.png"
    install -Dm644 packaging/dev.moku.app.metainfo.xml \
        "$pkgdir/usr/share/metainfo/dev.moku.app.metainfo.xml"

    install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}
