# alaturka-desktop

Native Linux desktop app for Alaturka Vakitler — alaturka clock, prayer
times, hijri calendar and religious days.

Flatpak app ID: `com.alaturkavakitler.Vakitler`

## Stack

- **GTK4 + libadwaita.** A GNOME-native look means libadwaita, and
  libadwaita is GTK4-only.
- **GJS.** The shared core (`alaturka-core`) is JavaScript, so GJS imports
  it as-is and no translation layer appears. Needs `gjs` installed
  (1.80.2 in the Ubuntu/Mint repositories).
- `alaturka-core` is pulled in as a submodule.

## Tray icon

`libayatana-appindicator3` links against GTK3 and cannot share a process
with GTK4:

```
ImportError: Requiring namespace 'Gtk' version '3.0', but '4.0' is already loaded
```

So using the ready-made indicator library would mean giving up libadwaita.
Instead the icon is published **directly over D-Bus**. Two interfaces, one
code path:

- **`org.x.StatusIcon`** (XApp) — Mint and Cinnamon. This interface carries
  a `Label` property, and `xapp-status@cinnamon.org` renders it in the panel
  as an `St.Label` (see its `applet.js:129,157`). That means the tray icon
  itself can show live text on Mint: a ticking alaturka clock and the
  countdown to the next prayer, with no applet involved.
- **`org.kde.StatusNotifierItem`** — GNOME, KDE, XFCE, Budgie. Icon,
  tooltip and menu only; the protocol has no panel text.

All three watchers are present on a stock Mint 22 session bus:
`org.kde.StatusNotifierWatcher`, `org.x.StatusNotifierWatcher`,
`org.x.StatusIcon.xapp_sn_watcher`.

**Caveat on GNOME:** GNOME Shell has no built-in tray, so the icon only
appears if the user has the AppIndicator extension installed. The app says
so once rather than failing silently.

## Data

Prayer times come from the same source as the website: raw JSON from the
`data-diyanet-namaz-vakitleri` repository, fetched with libsoup3 and cached
under `~/.cache`. Settings live in GSettings.

## Scope

**Phase 1** — prayer times with countdown, alaturka clock, hijri calendar
and religious days, city selection, settings, and adhan notifications.
Native notifications are the main thing the web app cannot do.

**Phase 2** — the share-image creator.

## Status

Empty. No code written yet.
