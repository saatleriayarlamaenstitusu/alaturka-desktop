// Vakit hatırlatmaları.
//
// This is the thing the web app cannot do properly: tell you a prayer time
// is coming while its window is not open. And "coming" is the point — an
// announcement at the adhan itself arrives too late to act on, so each
// prayer time carries its own warning in minutes (`notify-offsets`):
// -1 silences it, 0 means at the adhan, anything else is minutes before.
//
// The notifier owns no timer. The store already ticks once a second and
// already knows the table, so this is a listener: on every tick it asks
// whether a reminder's moment has just gone by. A single `GLib.timeout`
// per reminder was the obvious alternative and is worse — it has to be
// torn down and rebuilt whenever the city, the data or a setting changes,
// and a suspended laptop wakes with its timeouts long overdue.

import Gio from 'gi://Gio';

import { VAKIT_KEYS } from '../../core/src/index.js';

/** A reminder stays worth sending for this long after its moment. */
const GRACE_MS = 5 * 60 * 1000;

const OFF = -1;

function isoDay(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hhmm(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "1 saat" / "20 dakika" — the warning said the way a person would say it. */
function spanText(minutes) {
    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return hours === 1 ? 'bir saat' : `${hours} saat`;
    }
    if (minutes > 60) {
        const hours = Math.floor(minutes / 60);
        return `${hours} saat ${minutes % 60} dakika`;
    }
    return `${minutes} dakika`;
}

export class Notifier {
    constructor(application, store, settings) {
        this._app = application;
        this._settings = settings;
        this._store = store;
        /** Reminders already sent, by `day-vakit-minutes`. */
        this._sent = new Set();

        store.connect('tick', () => this._check());
    }

    /** Minutes of warning for a prayer time, or -1 when it is silenced. */
    _offset(key) {
        const dict = this._settings.get_value('notify-offsets');
        const entry = dict.lookup_value(key, null);
        return entry ? entry.get_int32() : OFF;
    }

    _check() {
        if (!this._settings.get_boolean('notifications')) return;

        const table = this._store.table;
        if (!table) return;

        const now = new Date();
        this._prune(now);
        for (const key of VAKIT_KEYS) {
            const minutes = this._offset(key);
            if (minutes === OFF) continue;

            const cell = table[key];
            if (!cell) continue;

            // Today's and tomorrow's both, so a reminder whose warning
            // reaches back across midnight (imsak at an hour's notice) is
            // not missed on either side of the day boundary.
            for (const [at, value] of [[cell.time, cell.value], [cell.timeTomorrow, cell.valueTomorrow]]) {
                if (!at) continue;
                const when = new Date(at.getTime() - minutes * 60000);
                const delta = now - when;
                if (delta < 0 || delta > GRACE_MS) continue;

                const id = `${isoDay(when)}-${key}-${minutes}`;
                if (this._sent.has(id)) continue;
                this._sent.add(id);
                this._send(id, cell, minutes, value, at);
            }
        }
    }

    /**
     * Forgets reminders older than yesterday. The app can stay open for
     * weeks; the set only ever needs the days a reminder can belong to.
     */
    _prune(now) {
        if (this._sent.size < 32) return;
        const keep = [-1, 0, 1].map((d) => isoDay(new Date(now.getTime() + d * 86400000)));
        for (const id of this._sent) {
            if (!keep.some((day) => id.startsWith(day))) this._sent.delete(id);
        }
    }

    _send(id, cell, minutes, value, at) {
        const time = value ?? hhmm(at);
        const notification = new Gio.Notification();
        if (minutes <= 0) {
            notification.set_title(`${cell.name} vakti`);
            notification.set_body(`Vakit girdi · ${time}`);
        } else {
            notification.set_title(`${cell.name} yaklaşıyor`);
            notification.set_body(`${spanText(minutes)} sonra ${cell.name.toLocaleLowerCase('tr-TR')} · ${time}`);
        }
        notification.set_priority(Gio.NotificationPriority.NORMAL);
        this._app.send_notification(id, notification);
    }
}
