#!/usr/bin/env -S gjs -m
// Alaturka Vakitler, for the Linux desktop.
//
// The prayer-time, hijri and alaturka-clock rules are NOT reimplemented here:
// they come from `alaturka-core`, the same module the website uses, imported
// as plain ESM because GJS runs it unchanged (measured). What this file owns
// is the shell — an Adw.Application, its actions, and the one store that
// ticks.

import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import System from 'system';

import { Store } from './lib/store.js';
import { Theme } from './lib/theme.js';
import { Notifier } from './lib/notify.js';
import { Window } from './ui/window.js';
import { PrefsDialog } from './ui/prefs.js';

const APP_ID = 'com.alaturkavakitler.Vakitler';

// ── Why this is here, and this early ──
//
// GTK builds the X11 WM_CLASS from the program name, and for a GJS app the
// program name is the interpreter: the window came up as `gjs.gjs`. The
// desktop entry says `StartupWMClass=com.alaturkavakitler.Vakitler`, so the
// panel could not match the running window to the entry and the taskbar
// showed a fallback icon even though every icon file was installed and the
// cache was fresh. Measured after installing the .deb.
//
// It has to run before the first window is realized, which is why it sits
// at module scope and not in `vfunc_startup`.
GLib.set_prgname(APP_ID);
GLib.set_application_name('Alaturka Vakitler');

/**
 * Where this file lives, so the stylesheet can be found next to it.
 * `import.meta.url` is supported by GJS's ESM loader (measured), which keeps
 * this honest whether the app runs from a checkout or an install prefix.
 */
const SRC_DIR = GLib.path_get_dirname(
    GLib.filename_from_uri(import.meta.url)[0]);

const Application = GObject.registerClass({
    GTypeName: 'AlaturkaApplication',
}, class Application extends Adw.Application {
    constructor() {
        super({
            application_id: APP_ID,
            flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
            resource_base_path: null,
        });
        this._window = null;
    }

    vfunc_startup() {
        super.vfunc_startup();

        this._settings = new Gio.Settings({ schema_id: APP_ID });
        this._theme = new Theme(this._settings);
        this._store = new Store(this._settings);
        this._notifier = new Notifier(this, this._store, this._settings);

        this._loadStyle();

        // Belt and braces for X11, where the window's own icon is a
        // separate hint from WM_CLASS.
        Gtk.Window.set_default_icon_name(APP_ID);

        this._store.connect('vakit-changed', () => {
            this._theme.setColor(this._store.state.color);
        });

        this._addAction('preferences', () => {
            new PrefsDialog(this._settings).present(this._window);
        }, ['<primary>comma']);
        this._addAction('refresh', () => this._store.load(), ['<primary>r']);
        this._addAction('about', () => this._showAbout());
        this._addAction('quit', () => this.quit(), ['<primary>q']);

        this._store.start();
        this._store.load();
    }

    vfunc_activate() {
        if (!this._window)
            this._window = new Window(this, this._store, this._settings);
        this._window.present();
    }

    _addAction(name, callback, accels = []) {
        const action = new Gio.SimpleAction({ name });
        action.connect('activate', callback);
        this.add_action(action);
        if (accels.length) this.set_accels_for_action(`app.${name}`, accels);
    }

    _loadStyle() {
        const path = GLib.build_filenamev([SRC_DIR, '..', 'data', 'style.css']);
        const file = Gio.File.new_for_path(path);
        if (!file.query_exists(null)) {
            logError(new Error(`stylesheet not found: ${path}`));
            return;
        }
        const provider = new Gtk.CssProvider();
        provider.load_from_file(file);
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    _showAbout() {
        const about = new Adw.AboutDialog({
            application_name: 'Alaturka Vakitler',
            application_icon: APP_ID,
            developer_name: 'Saatleri Ayarlama Enstitüsü',
            version: '0.1.0',
            comments: 'Alaturka saat, namaz vakitleri ve hicri takvim.\n'
                + 'Vakitler Diyanet verisinden, hicri takvim Diyanet\'in '
                + 'ay başlangıçları tablosundan geliyor.',
            website: 'https://alaturkavakitler.com',
            issue_url: 'https://github.com/saatleriayarlamaenstitusu/alaturka-desktop/issues',
            license_type: Gtk.License.MIT_X11,
        });
        about.present(this._window);
    }
});

export function main(argv) {
    return new Application().run(argv);
}

System.exit(main([System.programInvocationName, ...ARGV]));
