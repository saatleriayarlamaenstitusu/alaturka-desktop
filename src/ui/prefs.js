// Settings, as a libadwaita preferences dialog.
//
// A dialog rather than a fourth page: the window has three things it shows
// and one place where it is configured, and a view switcher with a gear in
// it reads as four equal destinations when one of them is not.

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import GLib from 'gi://GLib';

import { CITIES, VAKIT_KEYS } from '../../core/src/index.js';

const VAKIT_NAMES = {
    imsak: 'İmsak', gunes: 'Güneş', ogle: 'Öğle',
    ikindi: 'İkindi', aksam: 'Akşam', yatsi: 'Yatsı',
};

/**
 * How much warning a prayer time can be given, as the combo row's list.
 * -1 silences it, 0 is the adhan itself; the rest are minutes.
 */
const NOTIFY_CHOICES = [
    { value: -1, label: 'Kapalı' },
    { value: 0, label: 'Tam vakitte' },
    { value: 5, label: '5 dakika önce' },
    { value: 10, label: '10 dakika önce' },
    { value: 15, label: '15 dakika önce' },
    { value: 20, label: '20 dakika önce' },
    { value: 30, label: '30 dakika önce' },
    { value: 45, label: '45 dakika önce' },
    { value: 60, label: '1 saat önce' },
    { value: 90, label: '1,5 saat önce' },
    { value: 120, label: '2 saat önce' },
];

/** Cities sorted by name, as a list the combo row can index into. */
const CITY_LIST = Object.values(CITIES)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

export const PrefsDialog = GObject.registerClass({
    GTypeName: 'AlaturkaPrefsDialog',
}, class PrefsDialog extends Adw.PreferencesDialog {
    constructor(settings) {
        super({ title: 'Ayarlar' });
        this._settings = settings;

        const page = new Adw.PreferencesPage();
        this.add(page);

        // ── City ──
        const cityGroup = new Adw.PreferencesGroup({ title: 'Konum' });
        const names = new Gtk.StringList();
        for (const c of CITY_LIST) names.append(c.name);

        const cityRow = new Adw.ComboRow({
            title: 'Şehir',
            subtitle: 'Namaz vakitleri bu şehre göre indirilir',
            model: names,
        });
        const plate = settings.get_string('city-plate');
        cityRow.selected = Math.max(0, CITY_LIST.findIndex((c) => c.plate === plate));
        cityRow.connect('notify::selected', () => {
            const city = CITY_LIST[cityRow.selected];
            if (city) settings.set_string('city-plate', city.plate);
        });
        cityGroup.add(cityRow);

        // Provenance belongs here rather than on the pages themselves. It
        // was tried under the calendar's selected day and it read as a
        // footnote on every single date; it is one fact about the app, so
        // it is stated once, where the app is described.
        const timesSource = new Adw.ActionRow({
            title: 'Namaz vakitleri kaynağı',
            subtitle: 'Diyanet İşleri Başkanlığı',
        });
        timesSource.activatable = false;
        cityGroup.add(timesSource);
        page.add(cityGroup);

        // ── Clock ──
        const clockGroup = new Adw.PreferencesGroup({ title: 'Saat' });

        const clockRow = new Adw.ComboRow({
            title: 'Büyük gösterilen saat',
            model: new Gtk.StringList({ strings: ['Alaturka saat', 'Vasati saat'] }),
        });
        clockRow.selected = settings.get_string('primary-clock') === 'normal' ? 1 : 0;
        clockRow.connect('notify::selected', () => {
            settings.set_string('primary-clock', clockRow.selected === 1 ? 'normal' : 'alaturka');
        });
        clockGroup.add(clockRow);

        const hijriRow = new Adw.SwitchRow({
            title: 'Hicri tarihi akşam ezanıyla kaydır',
            subtitle: 'Hicri gün güneş batımıyla başlar',
            active: settings.get_boolean('hijri-offset'),
        });
        hijriRow.connect('notify::active', () => {
            settings.set_boolean('hijri-offset', hijriRow.active);
        });
        clockGroup.add(hijriRow);
        page.add(clockGroup);

        // ── Calendar ──
        const calGroup = new Adw.PreferencesGroup({ title: 'Takvim' });
        const calRow = new Adw.ComboRow({
            title: 'Varsayılan takvim',
            subtitle: 'Takvim sayfasının açılacağı sistem',
            model: new Gtk.StringList({ strings: ['Miladi', 'Hicri'] }),
        });
        const systems = ['gregorian', 'hijri'];
        calRow.selected = Math.max(0, systems.indexOf(settings.get_string('calendar-system')));
        calRow.connect('notify::selected', () => {
            settings.set_string('calendar-system', systems[calRow.selected] ?? 'gregorian');
        });
        calGroup.add(calRow);

        const hijriSource = new Adw.ActionRow({
            title: 'Hicri takvim kaynağı',
            subtitle: 'Diyanet\'in ay başlangıçları tablosu (2022–2036); '
                + 'dışında ortalama ay uzunluğuyla tahmin edilir',
        });
        hijriSource.activatable = false;
        calGroup.add(hijriSource);
        page.add(calGroup);

        // ── Appearance ──
        const lookGroup = new Adw.PreferencesGroup({ title: 'Görünüm' });

        const themeRow = new Adw.ComboRow({
            title: 'Tema',
            model: new Gtk.StringList({ strings: ['Sistem', 'Açık', 'Koyu'] }),
        });
        const themes = ['auto', 'light', 'dark'];
        themeRow.selected = Math.max(0, themes.indexOf(settings.get_string('theme')));
        themeRow.connect('notify::selected', () => {
            settings.set_string('theme', themes[themeRow.selected] ?? 'auto');
        });
        lookGroup.add(themeRow);

        const tintRow = new Adw.SwitchRow({
            title: 'Vakit rengini kullan',
            subtitle: 'Vurgu rengi bulunulan vakte göre değişir',
            active: settings.get_boolean('theme-per-vakit'),
        });
        tintRow.connect('notify::active', () => {
            settings.set_boolean('theme-per-vakit', tintRow.active);
        });
        lookGroup.add(tintRow);
        page.add(lookGroup);

        // ── Notifications ──
        //
        // The warning is per prayer time because the useful amount of
        // notice is not the same for all of them: an hour before imsak is
        // the difference between eating and not, a quarter of an hour
        // before yatsı is plenty.
        const notifyGroup = new Adw.PreferencesGroup({
            title: 'Bildirimler',
            description: 'Vakit girmeden önce haber ver',
        });
        const notifyRow = new Adw.SwitchRow({
            title: 'Vakit hatırlatması',
            active: settings.get_boolean('notifications'),
        });
        notifyRow.connect('notify::active', () => {
            settings.set_boolean('notifications', notifyRow.active);
        });
        notifyGroup.add(notifyRow);

        const labels = new Gtk.StringList();
        for (const c of NOTIFY_CHOICES) labels.append(c.label);

        const offsetRows = [];
        for (const key of VAKIT_KEYS) {
            const row = new Adw.ComboRow({
                title: VAKIT_NAMES[key] ?? key,
                model: labels,
            });
            const current = this._offset(key);
            row.selected = Math.max(0, NOTIFY_CHOICES.findIndex((c) => c.value === current));
            row.connect('notify::selected', () => {
                const choice = NOTIFY_CHOICES[row.selected];
                if (choice) this._setOffset(key, choice.value);
            });
            notifyGroup.add(row);
            offsetRows.push(row);
        }

        // Rows for an announcement that is switched off would be settings
        // with nothing to act on; they follow the master switch.
        const syncRows = () => {
            const on = settings.get_boolean('notifications');
            for (const row of offsetRows) row.sensitive = on;
        };
        syncRows();
        notifyRow.connect('notify::active', syncRows);

        page.add(notifyGroup);
    }

    /** Minutes of warning stored for a prayer time (-1 when silenced). */
    _offset(key) {
        const entry = this._settings.get_value('notify-offsets').lookup_value(key, null);
        return entry ? entry.get_int32() : -1;
    }

    /**
     * Writes one prayer time's warning back.
     *
     * GSettings has no "set one entry" for a dictionary: the whole
     * `a{si}` is replaced, so the others are read out and carried over.
     */
    _setOffset(key, minutes) {
        const current = this._settings.get_value('notify-offsets').deep_unpack();
        current[key] = minutes;
        const builder = new GLib.VariantBuilder(GLib.VariantType.new('a{si}'));
        for (const [k, v] of Object.entries(current))
            builder.add_value(GLib.Variant.new('{si}', [k, v]));
        this._settings.set_value('notify-offsets', builder.end());
    }
});
