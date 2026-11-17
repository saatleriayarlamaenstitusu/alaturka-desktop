// Prayer times: fetch, cache, merge.
//
// The source is the same raw JSON the website reads, from the
// `data-diyanet-namaz-vakitleri` repository. Measured: it holds a ROLLING
// 36-DAY WINDOW (nine days behind, today, twenty-six ahead), not a year.
//
// That window is why the cache MERGES instead of replacing. The alaturka
// clock before today's maghrib counts from YESTERDAY's maghrib, so the past
// days matter; if the app is left running across a window roll, or opened
// after a month offline, a plain overwrite would drop days the clock still
// needs. Merging also means the app keeps working offline for as long as the
// last download reaches.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

// Measured: cjs/older GJS does not wrap `*_async` methods in promises by
// itself (`At least 4 arguments required, but only 3 passed`). Newer GJS
// does, and asking again is harmless, so this stays unconditional.
Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');

const BASE = 'https://raw.githubusercontent.com/saatleriayarlamaenstitusu/data-diyanet-namaz-vakitleri/main/data/namaz/';

/** Days older than this are dropped from the cache on write. */
const KEEP_DAYS = 400;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function cacheDir() {
    return GLib.build_filenamev([GLib.get_user_cache_dir(), 'alaturka-vakitler']);
}

function cacheFile(plate) {
    return Gio.File.new_for_path(GLib.build_filenamev([cacheDir(), `${plate}.json`]));
}

/** Reads the cached times for a city, or null when there is no usable cache. */
export function readCache(plate) {
    const file = cacheFile(plate);
    try {
        const [ok, bytes] = file.load_contents(null);
        if (!ok) return null;
        const parsed = JSON.parse(decoder.decode(bytes));
        return parsed?.days ?? null;
    } catch {
        // No cache yet, or a half-written file. Either way there is nothing
        // to recover and the next fetch will replace it.
        return null;
    }
}

function writeCache(plate, days) {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000)
        .toISOString()
        .slice(0, 10);
    const pruned = {};
    for (const iso of Object.keys(days).sort())
        if (iso >= cutoff) pruned[iso] = days[iso];

    try {
        Gio.File.new_for_path(cacheDir()).make_directory_with_parents(null);
    } catch {
        // Already there.
    }

    const payload = JSON.stringify({ plate, fetchedAt: new Date().toISOString(), days: pruned });
    cacheFile(plate).replace_contents(
        encoder.encode(payload), null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    return pruned;
}

let session = null;
function soup() {
    if (!session) {
        session = new Soup.Session({ timeout: 15, user_agent: 'alaturka-vakitler/0.1' });
    }
    return session;
}

/**
 * Downloads one city's times and merges them into the cache.
 * @param {string} plate licence-plate code, e.g. "6"
 * @returns {Promise<Record<string, Record<string, string>>>} every cached day
 */
export async function fetchCity(plate) {
    const message = Soup.Message.new('GET', `${BASE}${plate}.json`);
    const bytes = await soup().send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);

    const status = message.get_status();
    if (status !== Soup.Status.OK)
        throw new Error(`Vakit verisi alınamadı (HTTP ${status})`);

    const fresh = JSON.parse(decoder.decode(bytes.get_data()));
    if (!fresh || typeof fresh !== 'object' || !Object.keys(fresh).length)
        throw new Error('Vakit verisi boş geldi');

    return writeCache(plate, { ...(readCache(plate) ?? {}), ...fresh });
}

/** Does the cache cover today and yesterday — the two days the clock needs? */
export function coversToday(days, now = new Date()) {
    if (!days) return false;
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return Boolean(days[iso(now)] && days[iso(new Date(now.getTime() - 86400000))]);
}
