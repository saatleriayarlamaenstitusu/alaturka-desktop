// The prayer-times page: the day's six times, and where we are in them.
//
// The times are shown as a plain list rather than a timeline. The website
// has both, and on a desktop window the list is the one that answers the
// question — the timeline earns its place on a phone where it fills a screen
// that would otherwise be empty.

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { VAKIT_KEYS, TR_MONTHS, TR_WEEKDAYS } from '../../../core/src/index.js';
import { upper } from '../../lib/text.js';

export const TimesPage = GObject.registerClass({
    GTypeName: 'AlaturkaTimesPage',
}, class TimesPage extends Adw.Bin {
    constructor(store, settings) {
        super();
        this._store = store;
        this._settings = settings;
        this._rows = {};

        const scroll = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vexpand: true,
        });
        const column = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            margin_top: 18,
            margin_bottom: 24,
            margin_start: 18,
            margin_end: 18,
        });
        column.set_size_request(320, -1);
        scroll.set_child(column);
        this.set_child(scroll);

        this._banner = new Adw.Banner({ revealed: false });
        column.append(this._banner);

        // ── Header: the countdown, which is why the page is open ──
        const head = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            css_classes: ['card-soft', 'vakit-tint'],
        });
        this._nextLabel = new Gtk.Label({
            css_classes: ['clock-label', 'dim-label'],
            halign: Gtk.Align.START,
        });
        this._countdown = new Gtk.Label({
            css_classes: ['countdown', 'tnum', 'vakit-accent'],
            halign: Gtk.Align.START,
        });
        this._date = new Gtk.Label({
            css_classes: ['dim-label'],
            halign: Gtk.Align.START,
        });
        head.append(this._nextLabel);
        head.append(this._countdown);
        head.append(this._date);
        column.append(head);

        // ── The six rows ──
        const list = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 });
        for (const key of VAKIT_KEYS) {
            const row = new Gtk.Box({ spacing: 10, css_classes: ['vakit-row'] });
            const dot = new Gtk.Box({ css_classes: ['dot'], valign: Gtk.Align.CENTER });
            const name = new Gtk.Label({ hexpand: true, halign: Gtk.Align.START });
            const time = new Gtk.Label({ css_classes: ['vakit-time', 'tnum'] });
            row.append(dot);
            row.append(name);
            row.append(time);
            list.append(row);
            this._rows[key] = { row, dot, name, time };
        }
        column.append(list);

        this._tomorrow = new Gtk.Label({
            css_classes: ['dim-label'],
            halign: Gtk.Align.START,
        });
        column.append(this._tomorrow);

        store.connect('tick', () => this.update());
        store.connect('data-changed', () => this.update());
        this.update();
    }

    update() {
        const s = this._store.state;
        const table = this._store.table;

        const status = this._store.status;
        this._banner.revealed = status === 'error' || status === 'offline';
        if (status === 'error')
            this._banner.title = this._store.statusMessage || 'Vakit verisi alınamadı';
        else if (status === 'offline')
            this._banner.title = 'Çevrimdışı — gösterilen vakitler önbellekten';

        if (s?.next) {
            this._nextLabel.label = upper(`${s.next.name} vaktine`);
            this._countdown.label =
                `${String(s.next.hours).padStart(2, '0')}:${String(s.next.minutes).padStart(2, '0')}:${String(s.next.seconds).padStart(2, '0')}`;
        } else {
            this._nextLabel.label = upper('Sonraki vakit');
            this._countdown.label = '--:--:--';
        }

        const d = s?.now ?? new Date();
        this._date.label = `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${TR_WEEKDAYS[d.getDay()]}`;

        for (const key of VAKIT_KEYS) {
            const r = this._rows[key];
            const cell = table?.[key];
            r.name.label = cell?.name ?? key;
            r.time.label = cell?.value ?? '--:--';

            const current = s?.vakit === key;
            const passed = Boolean(cell?.time) && !current && cell.time < d;

            // Only the current row carries the accent; the dot is the only
            // mark on the others, so the eye lands on one place.
            r.row.set_css_classes(
                current ? ['vakit-row', 'vakit-tint'] : passed ? ['vakit-row', 'passed'] : ['vakit-row']);
            r.dot.set_css_classes(current ? ['dot', 'vakit-dot'] : ['dot', 'dim-label']);
            r.dot.opacity = current ? 1 : 0.35;
            r.time.set_css_classes(
                current ? ['vakit-time', 'tnum', 'vakit-accent'] : ['vakit-time', 'tnum']);
        }

        const imsak = table?.imsak?.valueTomorrow;
        this._tomorrow.label = imsak ? `Yarın imsak ${imsak}` : '';
        this._tomorrow.visible = Boolean(imsak);
    }
});
