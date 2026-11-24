// The calendar page: a month grid, in either reckoning.
//
// Both calendars are drawn by the SAME code. A month is reduced to three
// answers — which date does its first cell hold, how many days does it run,
// and does a given date belong to it — and everything downstream (the grid,
// the navigation, the two numbers in each cell) reads those. Writing the
// hijri grid as a second branch would have meant two places to fix every
// time the cell layout changed.
//
// The month's religious days are resolved in ONE pass over the range rather
// than per cell: `holyDaysBetween` walks the days once, and a 42-cell grid
// would otherwise run the whole rule set 42 times on every redraw.

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import {
    toHijri, fromHijri, hijriMonthLength, isoDate, holyDaysBetween,
    TR_MONTHS, TR_WEEKDAYS, KINDS,
} from '../../../core/src/index.js';
import { publicHolidayOn } from '../../lib/public-holidays.js';
import { upper } from '../../lib/text.js';

const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(upper);

const holidayFor = (date) => publicHolidayOn(date.getMonth() + 1, date.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Monday-based weekday slot, which is how the grid is laid out. */
const slot = (d) => (d.getDay() + 6) % 7;

/**
 * The two calendars, behind one interface.
 *
 * `first` is the Gregorian date of day 1, `contains` decides membership
 * (hijri months cannot be compared with `getMonth()`), `step` walks whole
 * months, and `label`/`span` name the month in its own terms and in the
 * other calendar's.
 */
const SYSTEMS = {
    gregorian: {
        id: 'gregorian',
        label: 'Miladi',
        first: (d) => new Date(d.getFullYear(), d.getMonth(), 1),
        length: (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
        contains: (d, anchor) =>
            d.getMonth() === anchor.getMonth() && d.getFullYear() === anchor.getFullYear(),
        step: (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1),
        title: (d) => `${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        // The other calendar's view of the same month: hijri months straddle
        // Gregorian ones, so this is a range rather than a name.
        span: (first, last) => {
            const a = toHijri(first);
            const b = toHijri(last);
            return a.monthName === b.monthName
                ? `${a.monthName} ${a.year}`
                : `${a.monthName} – ${b.monthName} ${b.year}`;
        },
        primary: (d) => String(d.getDate()),
        secondary: (d) => String(toHijri(d).day),
    },

    hijri: {
        id: 'hijri',
        label: 'Hicri',
        first: (d) => {
            const h = toHijri(d);
            return fromHijri(h.year, h.month, 1);
        },
        length: (d) => {
            const h = toHijri(d);
            return hijriMonthLength(h.year, h.month);
        },
        contains: (d, anchor) => {
            const a = toHijri(d);
            const b = toHijri(anchor);
            return a.year === b.year && a.month === b.month;
        },
        step: (d, n) => {
            const h = toHijri(d);
            // 1..12 with the year carried, since `fromHijri` wants a real
            // month number and not a 0 or a 13.
            const index = h.month - 1 + n;
            const year = h.year + Math.floor(index / 12);
            const month = ((index % 12) + 12) % 12 + 1;
            return fromHijri(year, month, 1);
        },
        title: (d) => {
            const h = toHijri(d);
            return `${h.monthName} ${h.year}`;
        },
        span: (first, last) =>
            first.getMonth() === last.getMonth()
                ? `${TR_MONTHS[first.getMonth()]} ${first.getFullYear()}`
                : `${TR_MONTHS[first.getMonth()]} – ${TR_MONTHS[last.getMonth()]} ${last.getFullYear()}`,
        primary: (d) => String(toHijri(d).day),
        secondary: (d) => String(d.getDate()),
    },
};

export const CalendarPage = GObject.registerClass({
    GTypeName: 'AlaturkaCalendarPage',
}, class CalendarPage extends Adw.Bin {
    constructor(store, settings) {
        super();
        this._store = store;
        this._settings = settings;
        this._cells = [];

        const today = new Date();
        this._anchor = today;
        this._selected = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        this._system = SYSTEMS[settings.get_string('calendar-system')] ?? SYSTEMS.gregorian;

        const scroll = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vexpand: true,
        });
        const column = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 14,
            margin_top: 14,
            margin_bottom: 24,
            margin_start: 18,
            margin_end: 18,
        });
        column.set_size_request(320, -1);
        scroll.set_child(column);
        this.set_child(scroll);

        column.append(this._buildDetail());
        column.append(this._buildHeader());
        column.append(this._buildGrid());

        settings.connect('changed::calendar-system', () => {
            this._setSystem(SYSTEMS[settings.get_string('calendar-system')] ?? SYSTEMS.gregorian);
        });
        // The grid does not tick, but the "today" ring moves at midnight and
        // the hijri date moves at the evening adhan.
        store.connect('vakit-changed', () => this.redraw());
        this.redraw();
    }

    // ── The selected day, at the top and in full ──
    //
    // It sits ABOVE the grid because it is the answer most visits are after;
    // the grid is the way to ask a different question. On open it holds
    // today.
    _buildDetail() {
        const detail = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            css_classes: ['card-soft', 'vakit-tint'],
        });

        this._detailWeekday = new Gtk.Label({
            css_classes: ['clock-label', 'vakit-accent'],
            halign: Gtk.Align.START,
        });
        // `wrap` with `halign: START` is a trap: the label then asks for
        // its MINIMUM width — the longest single word — and wraps inside
        // that, so "KAYNAK: DİYANET" broke after the colon in a card three
        // times wider. Filling and aligning the text with `xalign` keeps the
        // wrapping for genuinely long strings without inventing breaks.
        this._detailMain = new Gtk.Label({
            css_classes: ['detail-main'],
            halign: Gtk.Align.FILL,
            xalign: 0,
            wrap: true,
        });
        this._detailOther = new Gtk.Label({
            css_classes: ['detail-other', 'dim-label'],
            halign: Gtk.Align.START,
        });
        this._detailHoly = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            margin_top: 8,
        });
        this._detailHoliday = new Gtk.Label({
            css_classes: ['badge', 'cal-holiday-badge'],
            halign: Gtk.Align.FILL,
            xalign: 0,
            wrap: true,
            margin_top: 6,
            visible: false,
        });
        detail.append(this._detailWeekday);
        detail.append(this._detailMain);
        detail.append(this._detailOther);
        detail.append(this._detailHoly);
        detail.append(this._detailHoliday);
        return detail;
    }

    _buildHeader() {
        const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 });

        const nav = new Gtk.Box({ spacing: 6 });
        const prev = new Gtk.Button({
            icon_name: 'go-previous-symbolic',
            css_classes: ['flat', 'circular'],
            tooltip_text: 'Önceki ay',
        });
        const next = new Gtk.Button({
            icon_name: 'go-next-symbolic',
            css_classes: ['flat', 'circular'],
            tooltip_text: 'Sonraki ay',
        });
        prev.connect('clicked', () => this._shiftMonth(-1));
        next.connect('clicked', () => this._shiftMonth(1));

        const titles = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            hexpand: true,
            valign: Gtk.Align.CENTER,
        });
        this._monthLabel = new Gtk.Label({ css_classes: ['title-4'] });
        this._spanLabel = new Gtk.Label({ css_classes: ['clock-label', 'dim-label'] });
        titles.append(this._monthLabel);
        titles.append(this._spanLabel);

        nav.append(prev);
        nav.append(titles);
        nav.append(next);
        box.append(nav);

        // ── Which calendar the grid is built from ──
        //
        // A session-only switch: the setting is the calendar the page OPENS
        // on, and flipping it here to look something up should not rewrite
        // that preference.
        const tools = new Gtk.Box({ spacing: 6 });
        const toggles = new Gtk.Box({ css_classes: ['linked'], halign: Gtk.Align.START });
        this._systemButtons = {};
        let group = null;
        for (const system of [SYSTEMS.gregorian, SYSTEMS.hijri]) {
            const button = new Gtk.ToggleButton({ label: system.label, group });
            group ??= button;
            button.connect('toggled', () => {
                if (button.active) this._setSystem(system);
            });
            toggles.append(button);
            this._systemButtons[system.id] = button;
        }
        this._systemButtons[this._system.id].active = true;

        this._todayButton = new Gtk.Button({
            label: 'Bugün',
            css_classes: ['flat'],
            halign: Gtk.Align.END,
            hexpand: true,
            tooltip_text: 'Bugüne dön',
        });
        this._todayButton.connect('clicked', () => {
            const now = new Date();
            this._anchor = now;
            this._selected = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            this.redraw();
        });

        tools.append(toggles);
        tools.append(this._todayButton);
        box.append(tools);
        return box;
    }

    _buildGrid() {
        const grid = new Gtk.Grid({
            column_homogeneous: true,
            row_spacing: 2,
            column_spacing: 2,
        });
        WEEKDAY_SHORT.forEach((name, i) => {
            grid.attach(new Gtk.Label({
                label: name,
                css_classes: ['cal-weekday', 'dim-label'],
            }), i, 0, 1, 1);
        });

        for (let i = 0; i < 42; i++) {
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                valign: Gtk.Align.CENTER,
            });
            const primary = new Gtk.Label({ css_classes: ['cal-greg'] });
            const secondary = new Gtk.Label({ css_classes: ['cal-hijri'] });
            const dot = new Gtk.Box({
                css_classes: ['dot'],
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
                visible: false,
            });
            box.append(primary);
            box.append(secondary);
            const holidayMark = new Gtk.Box({
                css_classes: ['cal-holiday-mark'],
                valign: Gtk.Align.CENTER,
                visible: false,
            });
            // Shape and position keep a civil holiday distinct when the
            // same cell also has a religious observance.
            const marks = new Gtk.Box({
                spacing: 4,
                margin_top: 2,
                halign: Gtk.Align.CENTER,
                visible: false,
            });
            marks.append(dot);
            marks.append(holidayMark);
            box.append(marks);

            const button = new Gtk.Button({ child: box, css_classes: ['flat', 'cal-cell'] });
            const cell = { button, primary, secondary, marks, dot, holidayMark, date: null };
            button.connect('clicked', () => {
                if (!cell.date) return;
                this._selected = cell.date;
                // Clicking a day in the leading or trailing week moves the
                // month too, otherwise the selection lands outside the grid.
                if (!this._system.contains(cell.date, this._anchor))
                    this._anchor = cell.date;
                this.redraw();
            });
            grid.attach(button, i % 7, Math.floor(i / 7) + 1, 1, 1);
            this._cells.push(cell);
        }
        return grid;
    }

    _setSystem(system) {
        if (system === this._system) return;
        this._system = system;
        const button = this._systemButtons[system.id];
        if (button && !button.active) button.active = true;
        this.redraw();
    }

    _shiftMonth(delta) {
        this._anchor = this._system.step(this._anchor, delta);
        this.redraw();
    }

    redraw() {
        const sys = this._system;
        const first = sys.first(this._anchor);
        const last = addDays(first, sys.length(this._anchor) - 1);
        const start = addDays(first, -slot(first));

        this._monthLabel.label = sys.title(this._anchor);
        this._spanLabel.label = upper(sys.span(first, last));

        // One walk over the 42 days on screen, not 42 rule evaluations.
        const holy = holyDaysBetween(start, addDays(start, 41));
        const todayISO = isoDate(new Date());
        const selectedISO = isoDate(this._selected);

        this._cells.forEach((cell, i) => {
            const date = addDays(start, i);
            cell.date = date;
            const iso = isoDate(date);

            cell.primary.label = sys.primary(date);
            cell.secondary.label = sys.secondary(date);

            const classes = ['flat', 'cal-cell'];
            if (!sys.contains(date, this._anchor)) classes.push('cal-other-month');
            if (iso === todayISO) classes.push('vakit-tint', 'cal-today');
            if (iso === selectedISO) classes.push('vakit-border', 'vakit-tint');
            cell.button.set_css_classes(classes);

            const days = holy[iso];
            const holiday = holidayFor(date);
            cell.holidayMark.visible = Boolean(holiday);
            cell.marks.visible = Boolean(days || holiday);
            cell.dot.visible = Boolean(days);
            cell.dot.set_css_classes(days ? ['dot', 'vakit-dot'] : ['dot']);
            const names = (days ?? []).map((d) => d.name);
            if (holiday) names.push(holiday);
            const description = names.join(' · ');
            cell.button.tooltip_text = description || null;
            cell.button.update_property([Gtk.AccessibleProperty.DESCRIPTION], [description]);
        });

        this._drawDetail(holy[selectedISO]);
    }

    _drawDetail(days) {
        const d = this._selected;
        const h = toHijri(d);
        const greg = `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
        const hijri = `${h.day} ${h.monthName} ${h.year}`;
        const isToday = isoDate(d) === isoDate(new Date());

        // The larger line is the calendar being read; the other follows it.
        const hijriFirst = this._system.id === 'hijri';
        // An em dash, not a middle dot: at this size, with the letter
        // spacing these labels carry, `·` reads as a stray full stop.
        this._detailWeekday.label = upper(
            `${TR_WEEKDAYS[d.getDay()]}${isToday ? ' — Bugün' : ''}`);
        this._detailMain.label = hijriFirst ? hijri : greg;
        this._detailOther.label = hijriFirst ? greg : hijri;
        const holiday = holidayFor(d);
        this._detailHoliday.label = holiday ?? '';
        this._detailHoliday.visible = Boolean(holiday);

        let child = this._detailHoly.get_first_child();
        while (child) {
            const nextChild = child.get_next_sibling();
            this._detailHoly.remove(child);
            child = nextChild;
        }

        this._detailHoly.visible = Boolean(days?.length);
        for (const day of days ?? []) {
            const row = new Gtk.Box({ spacing: 8 });
            row.append(new Gtk.Label({
                label: KINDS?.[day.kind] ?? day.kind,
                css_classes: ['badge', 'vakit-fill'],
                valign: Gtk.Align.CENTER,
            }));
            const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
            text.append(new Gtk.Label({
                label: day.name,
                css_classes: ['heading'],
                halign: Gtk.Align.START,
            }));
            if (day.note)
                text.append(new Gtk.Label({
                    label: day.note,
                    css_classes: ['dim-label'],
                    halign: Gtk.Align.START,
                }));
            row.append(text);
            this._detailHoly.append(row);
        }
    }
});
