// ===== LV0 BASEMENT =====
// TIMERS: the world's clock. A calendar clock (year, month, day, hour, minute, second) that moves `speed` game
// seconds for every second it is stepped, its months and leap years as data, and the day cut into phases (dawn,
// day, dusk, night, ...) as data: each phase starts at a time of day, says how dark it is (`dark`, 0 day to 1 the
// full night) and may name colours (`colors: {sky, sun}`), and both blend into the next phase's across the phase.
// It does not step itself: the Lobby steps it with the game (so it pauses and speeds up with the game).

const MONTHS = [['January', 31], ['February', 28], ['March', 31], ['April', 30], ['May', 31], ['June', 30], ['July', 31], ['August', 31], ['September', 30], ['October', 31], ['November', 30], ['December', 31]];
/**
 * A clock record's fields and their defaults.
 * - start: when the clock starts: `{year, month, day, time}`, `time` as "HH:MM" or "HH:MM:SS" (or [h, m, s]).
 * - speed: game seconds that pass for each second of play (1 is real time; 60 is a game minute a second).
 * - months: `[{name, days}]` (the Gregorian twelve by default); leap: `{month, every, except, unless}` (a day added
 *   to `month` in years divisible by `every`, but not by `except` unless by `unless`), or null for none.
 * - separator: between hours, minutes and seconds when the time is written.
 * - phases: `[{name, from, dark, colors}]` round the day, in order of `from` ("HH:MM"); each lasts until the next
 *   one starts (the last until the first, past midnight). `dark` (0 to 1) and `colors` ({name: '#rrggbb'}) blend
 *   from a phase's own at its start to the next phase's at its end. No phases: always 'day', never dark.
 */
export const WORLD_CLOCK = Object.freeze({
    start: Object.freeze({ year: 1, month: 1, day: 1, time: '12:00' }), speed: 1,
    months: Object.freeze(MONTHS.map(([name, days]) => Object.freeze({ name, days }))),
    leap: Object.freeze({ month: 2, every: 4, except: 100, unless: 400 }), separator: ':', phases: Object.freeze([])
});
const DAY = 86400, COLOUR = /^#[0-9a-f]{6}$/i, plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const fail = (where, message) => { throw new TypeError(`${where}: ${message}`); };
const whole = (v, lo, hi = Infinity) => Number.isInteger(v) && v >= lo && v <= hi;

/** Seconds into the day of "HH:MM", "HH:MM:SS" or [h, m, s] (minutes and seconds under 60, hours under 24). */
export function readTimeOfDay(value, where = 'time') {
    const parts = typeof value === 'string' ? (/^\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value) ? value.split(':').map(Number) : null) : Array.isArray(value) ? value : null;
    const [h = NaN, m = 0, s = 0] = parts ?? [];
    if (!parts || parts.length > 3 || !whole(h, 0, 23) || !whole(m, 0, 59) || !(Number.isFinite(s) && s >= 0 && s < 60)) fail(where, 'is a time of day "HH:MM" or "HH:MM:SS" (or [h, m, s])');
    return h * 3600 + m * 60 + s;
}
/** A clock record checked and filled in from the defaults, its phases sorted by start. Unknown fields are refused. */
export function readWorldClock(record = {}, where = 'world_clock') {
    if (!plain(record)) fail(where, `is {${Object.keys(WORLD_CLOCK).join(', ')}}`);
    const { kind, ...fields } = record;
    for (const key of Object.keys(fields)) if (!Object.hasOwn(WORLD_CLOCK, key)) fail(where, `unknown field ${key} (one of ${Object.keys(WORLD_CLOCK).join(', ')})`);
    const out = { ...WORLD_CLOCK, ...fields };
    if (!(Number.isFinite(out.speed) && out.speed >= 0)) fail(where, 'speed is game seconds per second (>= 0)');
    if (typeof out.separator !== 'string') fail(where, 'separator is text');
    if (!Array.isArray(out.months) || !out.months.length || out.months.some(m => !plain(m) || typeof m.name !== 'string' || !whole(m.days, 1, 1000))) fail(where, 'months is [{name, days}]');
    if (out.leap !== null && !(plain(out.leap) && whole(out.leap.month, 1, out.months.length) && whole(out.leap.every, 1) && ['except', 'unless'].every(k => out.leap[k] === undefined || whole(out.leap[k], 1)))) fail(where, 'leap is {month, every, except?, unless?} or null');
    const s = out.start;
    if (!plain(s) || Object.keys(s).some(k => !['year', 'month', 'day', 'time'].includes(k))) fail(where, 'start is {year, month, day, time}');
    const start = { ...WORLD_CLOCK.start, ...s };
    if (!Number.isInteger(start.year) || !whole(start.month, 1, out.months.length) || !whole(start.day, 1, daysIn(out, start.year, start.month))) fail(where, 'start names a day the calendar has');
    readTimeOfDay(start.time, `${where}.start.time`);
    if (!Array.isArray(out.phases)) fail(where, 'phases is [{name, from, dark, colors}]');
    const names = new Set(), phases = out.phases.map((p, i) => {
        const at = `${where}.phases[${i}]`;
        if (!plain(p) || Object.keys(p).some(k => !['name', 'from', 'dark', 'colors'].includes(k))) fail(at, 'is {name, from, dark?, colors?}');
        if (typeof p.name !== 'string' || !p.name || names.has(p.name)) fail(at, 'name is text, once per clock'); names.add(p.name);
        const dark = p.dark ?? 0; if (!(Number.isFinite(dark) && dark >= 0 && dark <= 1)) fail(at, 'dark is 0 (day) to 1 (the full night)');
        const colors = p.colors ?? {}; if (!plain(colors) || Object.values(colors).some(c => typeof c !== 'string' || !COLOUR.test(c))) fail(at, "colors is {name: '#rrggbb'}");
        return Object.freeze({ name: p.name, from: readTimeOfDay(p.from, `${at}.from`), dark, colors: Object.freeze({ ...colors }) });
    }).sort((a, b) => a.from - b.from);
    for (let i = 1; i < phases.length; i++) if (phases[i].from === phases[i - 1].from) fail(where, `phases ${phases[i - 1].name} and ${phases[i].name} start at the same time`);
    return Object.freeze({ ...out, start: Object.freeze(start), phases: Object.freeze(phases) });
}
function isLeap(settings, year) { const l = settings.leap; if (!l) return false; return year % l.every === 0 && (!l.except || year % l.except !== 0 || (!!l.unless && year % l.unless === 0)); }
function daysIn(settings, year, month) { return settings.months[month - 1].days + (settings.leap && month === settings.leap.month && isLeap(settings, year) ? 1 : 0); }
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), toHex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * The world's clock (WORLD_CLOCK's record). The Lobby calls `updateState(seconds)` each fixed step; anything
 * reads the date and time, the phase and how dark it is, and may listen for each new hour, day and phase.
 */
export class worldClock {
    #settings; #year; #month; #day; #seconds; #listeners = new Map(); #phase_index = -1;
    constructor(record = {}) { this.configure(record); }
    /** Takes a new clock record (readWorldClock) and sets the clock to its start. Returns the clock. */
    configure(record = {}) {
        this.#settings = readWorldClock(record);
        const { year, month, day, time } = this.#settings.start;
        this.#year = year; this.#month = month; this.#day = day; this.#seconds = readTimeOfDay(time);
        this.#phase_index = this.#phaseIndex(); return this;
    }
    /** The clock's settings as read (WORLD_CLOCK's fields). */
    get settings() { return this.#settings; }
    get year() { return this.#year; }
    get month() { return this.#month; }
    get month_name() { return this.#settings.months[this.#month - 1].name; }
    get day() { return this.#day; }
    get hour() { return Math.floor(this.#seconds / 3600); }
    get minute() { return Math.floor(this.#seconds / 60) % 60; }
    get second() { return Math.floor(this.#seconds) % 60; }
    /** Seconds into the day (0 to 86400, with fractions). */
    get time_of_day() { return this.#seconds; }
    get speed() { return this.#settings.speed; }
    /** How many game seconds pass for each second of play (0 stops the clock). */
    setSpeed(speed) { if (!(Number.isFinite(speed) && speed >= 0)) throw new RangeError('Clock speed is game seconds per second (>= 0)'); this.#settings = Object.freeze({ ...this.#settings, speed }); return this; }
    /** The time written out: "HH:MM", or "HH:MM:SS" with `seconds`. */
    text({ seconds = false } = {}) { const sep = this.#settings.separator, two = n => String(n).padStart(2, '0'); return `${two(this.hour)}${sep}${two(this.minute)}${seconds ? sep + two(this.second) : ''}`; }
    /** The date written out: "month.day.year" (the year in four figures). */
    date() { return `${this.#month}.${this.#day}.${String(this.#year).padStart(4, '0')}`; }
    /**
     * Sets the clock. `{year, month, day, time}` (any of them; `time` as "HH:MM[:SS]" or [h, m, s]), or `{hour,
     * minute, second}` where minutes and seconds past 59 and hours past 23 carry into the next hour and day.
     */
    setTime({ year, month, day, time, hour, minute, second } = {}) {
        if (year !== undefined) { if (!Number.isInteger(year)) throw new TypeError('year is a whole number'); this.#year = year; }
        if (month !== undefined) { if (!whole(month, 1, this.#settings.months.length)) throw new RangeError(`month is 1 to ${this.#settings.months.length}`); this.#month = month; }
        this.#day = Math.min(this.#day, daysIn(this.#settings, this.#year, this.#month));
        if (day !== undefined) { if (!whole(day, 1, daysIn(this.#settings, this.#year, this.#month))) throw new RangeError('day is one the month has'); this.#day = day; }
        if (time !== undefined) this.#seconds = readTimeOfDay(time);
        if ([hour, minute, second].some(v => v !== undefined)) {
            const total = (hour ?? this.hour) * 3600 + (minute ?? this.minute) * 60 + (second ?? this.second);
            if (!(Number.isFinite(total) && total >= 0)) throw new RangeError('hour, minute and second are numbers (>= 0)');
            this.#seconds = total % DAY; for (let d = Math.floor(total / DAY); d > 0; d--) this.#nextDay();
        }
        this.#phase_index = this.#phaseIndex(); return this;
    }
    #nextDay() {
        if (++this.#day > daysIn(this.#settings, this.#year, this.#month)) { this.#day = 1; if (++this.#month > this.#settings.months.length) { this.#month = 1; this.#year++; } }
    }
    #phaseIndex(at = this.#seconds) { const p = this.#settings.phases; if (!p.length) return -1; let i = p.length - 1; for (let k = 0; k < p.length; k++) if (p[k].from <= at) i = k; return i; }
    /**
     * The phase of the day now: `{name, from, to, progress, dark, colors}`, `from` and `to` in seconds into the day
     * (`to` past midnight wraps), `progress` how far through it (0 to 1). With no phases, a whole 'day'.
     */
    get phase() {
        const p = this.#settings.phases, i = this.#phase_index;
        if (i < 0) return { name: 'day', from: 0, to: DAY, progress: this.#seconds / DAY, dark: 0, colors: {} };
        const now = p[i], next = p[(i + 1) % p.length], length = (next.from - now.from + DAY) % DAY || DAY;
        return { name: now.name, from: now.from, to: next.from, progress: Math.min(1, ((this.#seconds - now.from + DAY) % DAY) / length), dark: now.dark, colors: now.colors, next: next.name };
    }
    /** True while the phase named `name` holds. */
    is(name) { return this.phase.name === name; }
    /** How dark it is now (0 to 1): the phase's `dark` blending into the next phase's across it. */
    get darkness() { const p = this.#settings.phases; if (!p.length) return 0; const ph = this.phase, next = p[(this.#phase_index + 1) % p.length]; return ph.dark + (next.dark - ph.dark) * ph.progress; }
    /** The colour `name` now ('#rrggbb', blending into the next phase's), or null when the phase does not name it. */
    color(name) {
        const p = this.#settings.phases; if (!p.length) return null;
        const ph = this.phase, a = ph.colors[name], b = p[(this.#phase_index + 1) % p.length].colors[name] ?? a; if (!a) return null;
        const x = hex(a), y = hex(b); return toHex(x.map((v, j) => v + (y[j] - v) * ph.progress));
    }
    /**
     * Listens for 'hour' (each new hour, with `{hour, day}`), 'day' (each new day, with `{year, month, day}`) or
     * 'phase' (each new phase, with `{name, previous}`). Returns the call that stops listening.
     */
    on(event, fn) {
        if (!['hour', 'day', 'phase'].includes(event)) throw new TypeError("Clock events are 'hour', 'day' and 'phase'");
        if (typeof fn !== 'function') throw new TypeError('A clock listener is a function');
        let set = this.#listeners.get(event); if (!set) this.#listeners.set(event, set = new Set()); set.add(fn); return () => set.delete(fn);
    }
    #emit(event, detail) { for (const fn of [...(this.#listeners.get(event) ?? [])]) fn(detail, this); }
    /**
     * Moves the clock `seconds` of play on (`speed` game seconds each), carrying into hours, days, months and years,
     * and tells the listeners of each hour, day and phase it passes. Returns the game seconds it moved.
     */
    updateState(seconds) {
        if (!(Number.isFinite(seconds) && seconds >= 0)) throw new RangeError('The clock steps by seconds (>= 0)');
        const moved = seconds * this.#settings.speed; if (!(moved > 0)) return 0;
        let left = moved;
        while (left > 0) {
            // To the next hour or phase boundary at most, so each hour, day and phase passed is told in order.
            const p = this.#settings.phases, to_hour = 3600 - (this.#seconds % 3600);
            const to_phase = p.length > 1 ? ((p[(this.#phase_index + 1) % p.length].from - this.#seconds + DAY) % DAY || DAY) : Infinity, stride = Math.min(left, to_hour, to_phase);
            this.#seconds += stride; left -= stride;
            if (this.#seconds >= DAY - 1e-9) { this.#seconds = 0; this.#nextDay(); this.#emit('day', { year: this.#year, month: this.#month, day: this.#day }); }
            if (stride === to_hour) this.#emit('hour', { hour: this.hour, day: this.#day });
            const i = this.#phaseIndex();
            if (i !== this.#phase_index) { const previous = this.#settings.phases[this.#phase_index]?.name ?? null; this.#phase_index = i; this.#emit('phase', { name: this.#settings.phases[i].name, previous }); }
        }
        return moved;
    }
    /** The clock as plain data, for a save: `{year, month, day, time_of_day, speed}`. */
    state() { return { year: this.#year, month: this.#month, day: this.#day, time_of_day: this.#seconds, speed: this.#settings.speed }; }
    /** Puts back a saved `state()`. */
    restore({ year, month, day, time_of_day, speed = this.#settings.speed }) {
        if (!(Number.isFinite(time_of_day) && time_of_day >= 0 && time_of_day < DAY)) throw new RangeError('time_of_day is seconds into the day');
        this.setSpeed(speed); this.setTime({ year, month, day }); this.#seconds = time_of_day; this.#phase_index = this.#phaseIndex(); return this;
    }
}
