#!/bin/bash
# Builds a .deb from the Meson install tree.
#
# No debhelper, no debian/rules: the app is interpreted, there is nothing to
# compile, and `dpkg-deb --build` over a staged prefix is the whole job. A
# full source package would be the right move only if this were going into
# Debian proper rather than onto a Releases page.
#
# Dependencies are declared rather than bundled. gjs, GTK 4 and libadwaita
# are all in Ubuntu 22.04+ and Mint 21+, and vendoring a JS interpreter into
# a .deb to avoid three `Depends:` lines would be worse for everyone.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(grep -oP "version: '\K[^']+" "$here/meson.build" | head -1)"
arch=all
pkg="alaturka-vakitler_${version}_${arch}"
out="${1:-$here/_build/deb}"
stage="$out/$pkg"

rm -rf "$stage"
mkdir -p "$stage/DEBIAN"

meson setup "$out/meson" "$here" --prefix=/usr --wipe >/dev/null
DESTDIR="$stage" meson install -C "$out/meson" --quiet

cat > "$stage/DEBIAN/control" <<CONTROL
Package: alaturka-vakitler
Version: $version
Section: utils
Priority: optional
Architecture: $arch
Depends: gjs (>= 1.72), gir1.2-gtk-4.0, gir1.2-adw-1, gir1.2-soup-3.0, dconf-gsettings-backend | gsettings-backend
Maintainer: Saatleri Ayarlama Enstitüsü <info@alaturkavakitler.com>
Homepage: https://alaturkavakitler.com
Description: Alaturka saat, namaz vakitleri ve hicri takvim
 Alaturka clock (time elapsed since the evening adhan), Diyanet prayer
 times with a countdown, and a hijri calendar with the religious days,
 as a native GTK4/libadwaita desktop application.
CONTROL

# The schema has to be compiled on the target, not shipped compiled: other
# packages write into the same directory and the cache is shared.
cat > "$stage/DEBIAN/postinst" <<'POSTINST'
#!/bin/sh
set -e
glib-compile-schemas /usr/share/glib-2.0/schemas || true
gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
update-desktop-database -q /usr/share/applications || true
POSTINST

cat > "$stage/DEBIAN/postrm" <<'POSTRM'
#!/bin/sh
set -e
if [ "$1" = remove ] || [ "$1" = purge ]; then
    glib-compile-schemas /usr/share/glib-2.0/schemas || true
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi
POSTRM

chmod 0755 "$stage/DEBIAN/postinst" "$stage/DEBIAN/postrm"
find "$stage/usr" -type d -exec chmod 0755 {} +

dpkg-deb --root-owner-group --build "$stage" "$out/$pkg.deb" >/dev/null
echo "$out/$pkg.deb"
