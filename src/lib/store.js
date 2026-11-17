// One place that knows what time it is.
//
// Every page needs the same four answers — which prayer time are we in, how
// long until the next, what is the alaturka clock reading, what is today's
// hijri date — and they all have to change on the same tick. So the ticking
// lives here and pages subscribe; nothing else owns a timer.
//
// The snapshot is rebuilt whole every second rather than mutated in place.
// Each field is a string or a small number, so there is nothing to gain from
// patching, and a whole object means a page can never read a half-updated
// state.

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {
    calculateAlaturka, createVakitTable, findVakit, nextVakit, isKerahat,
    nowHijri, holyDaysOn, isoDate, VAKIT_COLORS,
} from '../../core/src/index.js';

import { fetchCity, readCache, coversToday } from './vakitler.js';

export const Store = GObject.registerClass({
    GTypeName: 'AlaturkaStore',
    Signals: {
        // One tick. Everything a page draws comes from `store.state`.
        'tick': {},
        // The prayer time changed — pages re-theme, the notifier fires.
        'vakit-changed': { param_types: [GObject.TYPE_STRING] },
        // Prayer-time data arrived, failed, or is being fetched.
        'data-changed': {},
    },
}, class Store extends GObject.Object {
    constructor(settings) {
        super();
        this._settings = settings;
        this._vakitler = null;
        this._table = null;
        this._tableDay = null;
        this._vakit = null;
        this._timer = 0;

        /** 'idle' | 'loading' | 'ready' | 'offline' | 'error' */
        this.status = 'idle';
        this.statusMessage = '';
        this.state = this._snapshot(new Date());

        this._settings.connect('changed::city-plate', () => this.load());
        this._settings.connect('changed::hijri-offset', () => this._refresh());
    }

    get plate() {
        return this._settings.get_string('city-plate');
    }

    /** Cache first so the window has something to draw, then the network. */
    async load() {
        const plate = this.plate;
        const cached = readCache(plate);
        if (cached) {
            this._setDays(cached);
            this.status = coversToday(cached) ? 'ready' : 'offline';
            this._refresh();
        } else {
            this.status = 'loading';
            this.emit('data-changed');
        }

        try {
            const days = await fetchCity(plate);
            // The city may have been changed again while this was in flight.
            if (plate !== this.plate) return;
            this._setDays(days);
            this.status = 'ready';
            this.statusMessage = '';
        } catch (e) {
            if (plate !== this.plate) return;
            if (coversToday(this._vakitler)) {
                // We have what today needs; the failure is not worth a banner.
                this.status = 'ready';
            } else {
                this.status = this._vakitler ? 'offline' : 'error';
                this.statusMessage = e.message ?? String(e);
            }
            logError(e, 'vakit verisi alınamadı');
        }
        this._refresh();
    }

    /**
     * Replaces the prayer-time data and drops the cached table with it.
     *
     * The table is only rebuilt when the day turns, which is right as long
     * as the data stands still — and it does not: changing the city brings
     * a whole new set of times for the SAME day. Measured: after switching
     * city the page kept counting down to the old city's next prayer,
     * because `_refresh` saw today's date unchanged and reused the table
     * built from the previous city. Every assignment to `_vakitler` goes
     * through here so that cannot be forgotten at a call site.
     */
    _setDays(days) {
        this._vakitler = days;
        this._table = null;
        this._tableDay = null;
    }

    start() {
        if (this._timer) return;
        this._refresh();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._timer) GLib.Source.remove(this._timer);
        this._timer = 0;
    }

    /** Raw prayer-time JSON, for the pages that need a specific day. */
    get days() {
        return this._vakitler;
    }

    get table() {
        return this._table;
    }

    _refresh() {
        const now = new Date();

        // Rebuilding the table parses twelve time strings, so it is done
        // when the day turns — or when `_setDays` drops it because the data
        // itself changed — rather than every second.
        const today = isoDate(now);
        if (today !== this._tableDay || !this._table) {
            this._table = createVakitTable(this._vakitler, now);
            this._tableDay = today;
        }

        const previous = this._vakit;
        this.state = this._snapshot(now);
        this._vakit = this.state.vakit;

        this.emit('tick');
        this.emit('data-changed');
        if (this._vakit && this._vakit !== previous)
            this.emit('vakit-changed', this._vakit);
    }

    _snapshot(now) {
        const table = this._table;
        const vakit = table ? findVakit(table, now) : null;
        const next = table ? nextVakit(table, now) : null;
        const hijriShift = this._settings.get_boolean('hijri-offset');
        const aksam = hijriShift ? table?.aksam?.time ?? null : null;
        // The hijri day begins at sunset, and the religious days are hijri
        // rules, so they move with it: after the evening adhan both read
        // tomorrow's date. `nowHijri` does this itself when given `aksam`;
        // `holyDaysOn` takes a plain date, so the same shift is applied here.
        const hijriDay = aksam && now >= aksam
            ? new Date(now.getTime() + 86400000)
            : now;

        return {
            now,
            iso: isoDate(now),
            alaturka: calculateAlaturka(now, this._vakitler),
            clock: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
            seconds: now.getSeconds(),
            vakit,
            vakitName: vakit ? table[vakit].name : '—',
            color: vakit ? VAKIT_COLORS[vakit] : '#ae002e',
            next,
            kerahat: next && vakit && table ? isKerahat(next, vakit, table, now) : false,
            hijri: nowHijri('object', now, aksam),
            hijriText: nowHijri('string', now, aksam),
            holyDays: holyDaysOn(hijriDay),
        };
    }
});
