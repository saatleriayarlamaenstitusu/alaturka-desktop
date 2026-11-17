// The window: a header bar, a view switcher, three pages.
//
// `AdwViewSwitcher` in the header on a wide window and `AdwViewSwitcherBar`
// at the bottom on a narrow one is the standard libadwaita pattern, and it
// happens to match the web app, where navigation sits at the bottom on a
// phone and moves to the side on a desktop. `AdwBreakpoint` does the
// swapping, so there is no size handler to keep in step.

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { ClockPage } from './pages/clock.js';
import { TimesPage } from './pages/times.js';
import { CalendarPage } from './pages/calendar.js';

export const Window = GObject.registerClass({
    GTypeName: 'AlaturkaWindow',
}, class Window extends Adw.ApplicationWindow {
    constructor(application, store, settings) {
        super({
            application,
            title: 'Alaturka Vakitler',
            default_width: settings.get_int('window-width'),
            default_height: settings.get_int('window-height'),
            maximized: settings.get_boolean('window-maximized'),
            // 380, not 360: the calendar grid is seven 40px cells plus
            // spacing and margins, and Adwaita warned on every resize step
            // once the floor let the window shrink under its own content
            // ("AdwToolbarView exceeds AlaturkaWindow width: requested 370
            // px, 360 px available").
            width_request: 380,
            height_request: 420,
        });
        this._settings = settings;
        this._store = store;

        const stack = new Adw.ViewStack({ vexpand: true });
        stack.add_titled_with_icon(
            new ClockPage(store, settings), 'clock', 'Saat', 'preferences-system-time-symbolic');
        stack.add_titled_with_icon(
            new TimesPage(store, settings), 'times', 'Vakitler', 'view-list-symbolic');
        stack.add_titled_with_icon(
            new CalendarPage(store, settings), 'calendar', 'Takvim', 'x-office-calendar-symbolic');
        this._stack = stack;

        const switcher = new Adw.ViewSwitcher({
            stack,
            policy: Adw.ViewSwitcherPolicy.WIDE,
        });
        const header = new Adw.HeaderBar({ title_widget: switcher });

        const menu = Gtk.PopoverMenu.new_from_model(this._menuModel());
        const menuButton = new Gtk.MenuButton({
            icon_name: 'open-menu-symbolic',
            popover: menu,
            tooltip_text: 'Menü',
        });
        header.pack_end(menuButton);

        this._refreshButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            tooltip_text: 'Vakitleri yeniden indir',
            action_name: 'app.refresh',
        });
        header.pack_start(this._refreshButton);

        const switcherBar = new Adw.ViewSwitcherBar({ stack });

        const toolbar = new Adw.ToolbarView();
        toolbar.add_top_bar(header);
        toolbar.set_content(stack);
        toolbar.add_bottom_bar(switcherBar);
        this.set_content(toolbar);

        // Narrow: the switcher drops out of the header and the bar appears.
        //
        // 560px, not 480: the header also holds the window controls and the
        // menu, and on a layout with controls on BOTH sides the three
        // labels started ellipsizing ("Vakit…") at around 500px. The
        // threshold is where the header runs out of room, not where the
        // page does.
        const breakpoint = Adw.Breakpoint.new(
            Adw.BreakpointCondition.parse('max-width: 560px'));
        breakpoint.add_setter(switcher, 'visible', false);
        breakpoint.add_setter(switcherBar, 'reveal', true);
        this.add_breakpoint(breakpoint);

        stack.set_visible_child_name(this._startPage());
        stack.connect('notify::visible-child-name', () => {
            settings.set_string('last-page', stack.get_visible_child_name());
        });

        this.connect('close-request', () => {
            if (!this.maximized) {
                settings.set_int('window-width', this.default_width);
                settings.set_int('window-height', this.default_height);
            }
            settings.set_boolean('window-maximized', this.maximized);
            return false;
        });
    }

    _startPage() {
        const wanted = this._settings.get_string('last-page');
        return ['clock', 'times', 'calendar'].includes(wanted) ? wanted : 'clock';
    }

    _menuModel() {
        const menu = new Gio.Menu();
        menu.append('Ayarlar', 'app.preferences');
        menu.append('Vakitleri yenile', 'app.refresh');
        menu.append('Alaturka Vakitler Hakkında', 'app.about');
        return menu;
    }
});
