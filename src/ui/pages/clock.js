// The clock page: what time is it, in both reckonings.
//
// The alaturka clock is the reason this app exists, so it is the large
// figure by default — but which one is large is a setting, because someone
// who wants the ordinary clock big and the alaturka one beneath it is asking
// for the same page with the two swapped, not a different page.

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { TR_MONTHS, TR_WEEKDAYS, CITIES } from '../../../core/src/index.js';
import { upper } from '../../lib/text.js';

export const ClockPage = GObject.registerClass({
    GTypeName: 'AlaturkaClockPage',
}, class ClockPage extends Adw.Bin {
    constructor(store, settings) {
        super();
        this._store = store;
        this._settings = settings;

        const scroll = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vexpand: true,
        });
        const column = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 18,
            margin_top: 28,
            margin_bottom: 28,
            margin_start: 18,
            margin_end: 18,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            vexpand: true,
        });
        // The page is a single centred column: on a wide window it stays
        // readable instead of stretching the figures apart.
        column.set_size_request(320, -1);
        scroll.set_child(column);
        this.set_child(scroll);

        this._city = new Gtk.Label({ css_classes: ['clock-label', 'dim-label'] });
        column.append(this._city);

        // ── The two clocks ──
        const clocks = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            halign: Gtk.Align.CENTER,
        });
        this._mainLabel = new Gtk.Label({ css_classes: ['clock-label', 'vakit-accent'] });
        this._main = new Gtk.Label({ css_classes: ['clock-main', 'tnum'] });
        this._second = new Gtk.Label({ css_classes: ['clock-second', 'tnum', 'dim-label'] });
        clocks.append(this._mainLabel);
        clocks.append(this._main);
        clocks.append(this._second);
        column.append(clocks);

        // ── Current prayer time and the countdown to the next ──
        const vakitBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            halign: Gtk.Align.CENTER,
            css_classes: ['card-soft', 'vakit-tint'],
        });
        const nameRow = new Gtk.Box({ spacing: 8, halign: Gtk.Align.CENTER });
        this._dot = new Gtk.Box({ css_classes: ['dot', 'vakit-dot'], valign: Gtk.Align.CENTER });
        this._vakitName = new Gtk.Label({ css_classes: ['title-3'] });
        this._kerahat = new Gtk.Label({
            label: 'Kerahat',
            css_classes: ['badge', 'vakit-fill'],
            visible: false,
            valign: Gtk.Align.CENTER,
        });
        nameRow.append(this._dot);
        nameRow.append(this._vakitName);
        nameRow.append(this._kerahat);
        vakitBox.append(nameRow);

        this._countdown = new Gtk.Label({ css_classes: ['countdown', 'tnum', 'vakit-accent'] });
        this._countdownLabel = new Gtk.Label({ css_classes: ['clock-label', 'dim-label'] });
        vakitBox.append(this._countdown);
        vakitBox.append(this._countdownLabel);
        column.append(vakitBox);

        // ── Dates ──
        const dates = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            halign: Gtk.Align.CENTER,
        });
        this._hijri = new Gtk.Label({ css_classes: ['title-4'] });
        this._greg = new Gtk.Label({ css_classes: ['dim-label'] });
        dates.append(this._hijri);
        dates.append(this._greg);
        column.append(dates);

        // Not `halign: CENTER`: a wrapping label asked for its minimum
        // width there and broke two-word names onto two lines (see the note
        // in pages/calendar.js).
        this._holy = new Gtk.Label({
            css_classes: ['badge', 'vakit-fill'],
            halign: Gtk.Align.FILL,
            visible: false,
            wrap: true,
            justify: Gtk.Justification.CENTER,
        });
        column.append(this._holy);

        store.connect('tick', () => this.update());
        settings.connect('changed::primary-clock', () => this.update());
        settings.connect('changed::city-plate', () => this.update());
        this.update();
    }

    update() {
        const s = this._store.state;
        if (!s) return;

        const city = CITIES[this._settings.get_string('city-plate')];
        this._city.label = city ? upper(city.name) : '';

        const alaturkaFirst = this._settings.get_string('primary-clock') !== 'normal';
        this._mainLabel.label = upper(alaturkaFirst ? 'Alaturka saat' : 'Saat');
        this._main.label = alaturkaFirst ? s.alaturka : s.clock;
        this._second.label = alaturkaFirst
            ? `${s.clock} vasati`
            : `${s.alaturka} alaturka`;

        this._vakitName.label = s.vakitName;
        this._kerahat.visible = s.kerahat;

        if (s.next) {
            this._countdown.label =
                `${String(s.next.hours).padStart(2, '0')}:${String(s.next.minutes).padStart(2, '0')}:${String(s.next.seconds).padStart(2, '0')}`;
            this._countdownLabel.label = upper(`${s.next.label} kalan süre`);
        } else {
            this._countdown.label = '--:--:--';
            this._countdownLabel.label = upper('Vakit verisi yok');
        }

        this._hijri.label = s.hijriText;
        const d = s.now;
        this._greg.label = `${TR_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;

        const names = s.holyDays.map((h) => h.name);
        this._holy.visible = names.length > 0;
        this._holy.label = names.join(' · ');
    }
});
