// Adhan notifications.
//
// This is the thing the web app cannot do: tell you the prayer time has come
// when its window is not open. The store already knows when the prayer time
// changes, so the notifier is only a listener — no second timer, and no risk
// of the two disagreeing about which prayer time it is.

import Gio from 'gi://Gio';

export class Notifier {
    constructor(application, store, settings) {
        this._app = application;
        this._settings = settings;
        this._armed = false;

        store.connect('vakit-changed', (_s, vakit) => this._fire(store, vakit));
        // The first `vakit-changed` fires as soon as data loads and only
        // reports which prayer time we are already inside — it is not an
        // adhan that just happened, so it is swallowed.
        store.connect('vakit-changed', () => { this._armed = true; });
    }

    _fire(store, vakit) {
        if (!this._armed) return;
        if (!this._settings.get_boolean('notifications')) return;

        const table = store.table;
        const cell = table?.[vakit];
        if (!cell) return;

        const next = store.state?.next;
        const notification = new Gio.Notification();
        notification.set_title(`${cell.name} vakti`);
        notification.set_body(next
            ? `${cell.value} · ${next.name} ${next.at.getHours()}:${String(next.at.getMinutes()).padStart(2, '0')}`
            : cell.value);
        notification.set_priority(Gio.NotificationPriority.NORMAL);

        this._app.send_notification(`vakit-${vakit}`, notification);
    }
}
