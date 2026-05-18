pkgname=moku
pkgver=0.9.4
pkgrel=1
pkgdesc="Native Linux manga reader frontend for Suwayomi-Server"
arch=('x86_64')
url="https://github.com/moku-project/Moku"
license=('Apache-2.0')
depends=(
    'webkit2gtk-4.1'
    'gtk3'
    'libayatana-appindicator'
    'java-runtime>=21'
)
makedepends=(
    'rust'
    'nodejs-pnpm'
)
optdepends=(
    'discord: Discord rich presence'
)
options=('!strip')
source=(
    "$pkgname-$pkgver.tar.gz::https://github.com/moku-project/Moku/archive/refs/tags/v$pkgver.tar.gz"
    "Suwayomi-Server-v2.1.2087.jar::https://github.com/Suwayomi/Suwayomi-Server-preview/releases/download/v2.1.2087/Suwayomi-Server-v2.1.2087.jar"
)
noextract=("Suwayomi-Server-v2.1.2087.jar")
sha256sums=(
    'fc1c8268b812e70e56460c8930ca8ae83bcd30eea5903ddfef4e30a3a9a5c1cc'
    'f589a422674252394c13b289a9c8be691905bf583efb7f4d5f1501ae5e91e6b3'
)
b2sums=(
    'SKIP'
    'SKIP'
)

prepare() {
    cd "Moku-$pkgver"
    pnpm install --frozen-lockfile
}

build() {
    cd "Moku-$pkgver"
    pnpm build
    TAURI_SKIP_DEVSERVER_CHECK=true cargo build \
        --release \
        --manifest-path src-tauri/Cargo.toml
}

package() {
    cd "Moku-$pkgver"

    install -Dm755 src-tauri/target/release/moku \
        "$pkgdir/usr/bin/moku"

    install -Dm644 "$srcdir/Suwayomi-Server-v2.1.2087.jar" \
        "$pkgdir/usr/lib/moku/tachidesk/Suwayomi-Server.jar"

    install -dm755 "$pkgdir/usr/lib/moku/tachidesk/default-conf"
    cat > "$pkgdir/usr/lib/moku/tachidesk/default-conf/server.conf" << 'CONF'
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
CONF

    install -Dm755 /dev/stdin "$pkgdir/usr/bin/moku-suwayomi" << 'LAUNCHER'
#!/bin/sh
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/Tachidesk"
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

exec java \
  -Djava.awt.headless=true \
  -Dapple.awt.UIElement=true \
  -Dsun.java2d.noddraw=true \
  -Dsun.awt.disablegui=true \
  -Dsuwayomi.tachidesk.config.server.rootDir="$DATA_DIR" \
  -jar /usr/lib/moku/tachidesk/Suwayomi-Server.jar
LAUNCHER

    install -Dm644 packaging/io.github.moku_project.Moku.desktop \
        "$pkgdir/usr/share/applications/io.github.moku_project.Moku.desktop"
    install -Dm644 src-tauri/icons/32x32.png \
        "$pkgdir/usr/share/icons/hicolor/32x32/apps/io.github.moku_project.Moku.png"
    install -Dm644 src-tauri/icons/128x128.png \
        "$pkgdir/usr/share/icons/hicolor/128x128/apps/io.github.moku_project.Moku.png"
    install -Dm644 src-tauri/icons/128x128@2x.png \
        "$pkgdir/usr/share/icons/hicolor/256x256/apps/io.github.moku_project.Moku.png"
    install -Dm644 packaging/io.github.moku_project.Moku.metainfo.xml \
        "$pkgdir/usr/share/metainfo/io.github.moku_project.Moku.metainfo.xml"

    install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}
