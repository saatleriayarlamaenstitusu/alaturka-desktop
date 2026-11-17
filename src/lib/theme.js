// The prayer-time colour, pushed into GTK's stylesheet.
//
// The web app sets a `data-vakit` attribute and lets CSS custom properties do
// the rest. GTK 4.14's CSS has no custom properties (those land in 4.16), so
// the colour cannot be a variable the stylesheet reads — the snippet that
// mentions it is regenerated and reloaded whenever the prayer time or the
// colour scheme changes instead. It is six rules, and a reload costs one
// restyle.
//
// ── Why the colour is adjusted before use ──
// The six prayer-time colours were chosen as COLOURS OF A TIME OF DAY, not as
// interface accents, and two of them cannot be read as text: yatsı is
// #2e3b83, a navy that sits at 1.7:1 against libadwaita's dark window
// background, and öğle is #ffd733, which is invisible on a light one.
// Measured on the clock page: the yatsı countdown was barely legible.
//
// The website hit the same wall and solved it by keeping a separate
// `--accent-ui` (see its CLAUDE.md). The same split is made here, but
// computed rather than hand-tuned, because GTK's light and dark backgrounds
// are both known: the accent is mixed toward white or black until it clears
// 4.5:1, and the untouched colour is kept for washes and fills, where it is a
// background and its own readability is not the question.

import Gdk from 'gi://Gdk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

const BASE = '#ae002e';

/** libadwaita's window backgrounds, which the accent has to be read against. */
const BG_DARK = [36, 36, 36];
const BG_LIGHT = [250, 250, 250];

const TARGET_CONTRAST = 4.5;

function parse(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const toHex = (rgb) =>
    `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function linear(v) {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

const luminance = ([r, g, b]) =>
    0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Nudges `rgb` toward white or black until it is readable on `bg`. */
function readable(rgb, bg) {
    const target = luminance(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255];
    if (contrast(rgb, bg) >= TARGET_CONTRAST) return rgb;
    for (let t = 0.05; t < 1; t += 0.05) {
        const candidate = mix(rgb, target, t);
        if (contrast(candidate, bg) >= TARGET_CONTRAST) return candidate;
    }
    return target;
}

/** Black or white, whichever can be read ON this colour. */
const foregroundFor = (rgb) =>
    contrast(rgb, [255, 255, 255]) >= contrast(rgb, [0, 0, 0]) ? '#ffffff' : '#000000';

export class Theme {
    constructor(settings) {
        this._settings = settings;
        this._provider = new Gtk.CssProvider();
        this._color = BASE;

        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), this._provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1);

        const manager = Adw.StyleManager.get_default();
        // Following the system theme means the background can flip while the
        // app is open, and the adjusted accent is computed against it.
        manager.connect('notify::dark', () => this.setColor(this._color));

        this._settings.connect('changed::theme', () => this.applyScheme());
        this._settings.connect('changed::theme-per-vakit', () => this.setColor(this._color));

        this.applyScheme();
        this.setColor(BASE);
    }

    applyScheme() {
        const scheme = {
            light: Adw.ColorScheme.FORCE_LIGHT,
            dark: Adw.ColorScheme.FORCE_DARK,
        }[this._settings.get_string('theme')] ?? Adw.ColorScheme.DEFAULT;
        Adw.StyleManager.get_default().set_color_scheme(scheme);
    }

    setColor(hex) {
        this._color = hex ?? BASE;

        // With the tint turned off the colour stays the brand red rather than
        // disappearing: the interface still needs one highlight, it just
        // stops following the prayer time.
        const raw = parse(this._settings.get_boolean('theme-per-vakit') ? this._color : BASE);
        const bg = Adw.StyleManager.get_default().dark ? BG_DARK : BG_LIGHT;

        const accent = toHex(readable(raw, bg));
        const fill = toHex(raw);
        const onFill = foregroundFor(raw);

        this._provider.load_from_string(`
.vakit-accent { color: ${accent}; }
.vakit-fill { background-color: ${fill}; color: ${onFill}; }
.vakit-tint { background-color: alpha(${fill}, 0.13); }
.vakit-border { border: 1px solid alpha(${accent}, 0.5); }
.vakit-dot { background-color: ${accent}; }
`);
    }
}
