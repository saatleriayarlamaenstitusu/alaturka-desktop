# The app is JavaScript and data, so there is nothing to compile — Meson is
# here for the INSTALL, and because a Meson project is what Flatpak, the
# .deb rules and distro packagers all already know how to drive.
project('alaturka-vakitler',
  version: '0.1.0',
  meson_version: '>= 1.0.0',
  license: 'MIT',
)

gnome = import('gnome')

app_id = 'com.alaturkavakitler.Vakitler'
prefix = get_option('prefix')
bindir = prefix / get_option('bindir')
datadir = prefix / get_option('datadir')
pkgdatadir = datadir / meson.project_name()

# The source tree is installed as-is. The module paths inside it are
# relative (`../../core/src/index.js`), so the layout has to survive the
# copy — which is exactly why src/, core/ and data/ keep their shape here.
install_subdir('src', install_dir: pkgdatadir)
install_data('data' / 'style.css', install_dir: pkgdatadir / 'data')

core_src = meson.current_source_dir() / 'core' / 'src'
if not import('fs').is_dir(core_src)
  error('core/ is empty — run: git submodule update --init')
endif
install_subdir('core' / 'src', install_dir: pkgdatadir / 'core')
install_subdir('core' / 'data', install_dir: pkgdatadir / 'core')

configure_file(
  input: 'bin' / 'alaturka-vakitler.in',
  output: 'alaturka-vakitler',
  configuration: {
    'GJS': get_option('gjs'),
    'PKGDATADIR': pkgdatadir,
  },
  install: true,
  install_dir: bindir,
  install_mode: 'rwxr-xr-x',
)

configure_file(
  input: 'data' / app_id + '.desktop.in',
  output: app_id + '.desktop',
  configuration: { 'EXEC': bindir / 'alaturka-vakitler' },
  install: true,
  install_dir: datadir / 'applications',
)

install_data('data' / app_id + '.metainfo.xml',
  install_dir: datadir / 'metainfo')

install_data('data' / app_id + '.gschema.xml',
  install_dir: datadir / 'glib-2.0' / 'schemas')

install_subdir('data' / 'icons', install_dir: datadir, exclude_files: [])

# Compiles the schema and refreshes the icon cache after `meson install`,
# and skips both when DESTDIR is set so package builds stay reproducible.
gnome.post_install(
  glib_compile_schemas: true,
  gtk_update_icon_cache: true,
  update_desktop_database: true,
)
