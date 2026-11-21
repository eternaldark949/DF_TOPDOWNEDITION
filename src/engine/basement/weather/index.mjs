// ===== LV0 BASEMENT =====
// WEATHER: the world's weather as states and intensities, after ETERNAL's Python worldSystem and weatherSystem
// (CLEAR, RAINING, SNOWING; LIGHT, NORMAL, HEAVY, HELLISH). A state names the particle systems it brings (rain,
// snow, splashes); an intensity scales how many are born. Changing the weather fades the old state out and the
// new one in, and the intensity across, over `fade` seconds of play, as the Python's drop pool grew and shrank
// towards its count. It moves no particles itself: a map level reads `amount(state)` and sets its systems'
// rates. It does not step itself: the Lobby steps it with the game.

/**
 * A weather record's fields and their defaults.
 * - states: `{name: {particles: [{system, area, at, margin}]}}`: what each state brings, as a map's `particles`
 *   (a `system` is a particle system record or its resource id; `area: 'view'` falls wherever the camera looks).
 * - intensities: `{name: scale}`: how many of a state's particles are born, as a share of its systems' own rates.
 * - start: `{state, intensity}`: the weather when the clock starts.
 * - fade: seconds of play a change of weather takes (0 changes at once).
 */
export const WORLD_WEATHER = Object.freeze({
    states: Object.freeze({ clear: Object.freeze({ particles: Object.freeze([]) }) }),
    intensities: Object.freeze({ light: .35, normal: 1, heavy: 1.8, hellish: 3 }),
    start: Object.freeze({ state: 'clear', intensity: 'normal' }), fade: 6
});
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v), fail = (where, message) => { throw new TypeError(`${where}: ${message}`); };
/** A weather record checked and filled in from the defaults. Unknown fields are refused. */
export function readWorldWeather(record = {}, where = 'world_weather') {
    if (!plain(record)) fail(where, `is {${Object.keys(WORLD_WEATHER).join(', ')}}`);
    const { kind, ...fields } = record;
    for (const key of Object.keys(fields)) if (!Object.hasOwn(WORLD_WEATHER, key)) fail(where, `unknown field ${key} (one of ${Object.keys(WORLD_WEATHER).join(', ')})`);
    const out = { ...WORLD_WEATHER, ...fields };
    if (!plain(out.states) || !Object.keys(out.states).length) fail(where, 'states is {name: {particles}}');
    const states = Object.fromEntries(Object.entries(out.states).map(([name, s]) => {
        const at = `${where}.states.${name}`;
        if (!plain(s) || Object.keys(s).some(k => k !== 'particles')) fail(at, 'is {particles: [{system, area, at, margin}]}');
        const particles = s.particles ?? [];
        if (!Array.isArray(particles)) fail(at, 'particles is a list of {system, area?, at?, margin?}');
        particles.forEach((p, i) => {
            if (!plain(p) || Object.keys(p).some(k => !['system', 'area', 'at', 'margin'].includes(k))) fail(`${at}.particles[${i}]`, 'is {system, area?, at?, margin?}');
            if (typeof p.system !== 'string' && !plain(p.system)) fail(`${at}.particles[${i}]`, 'system is a particle system record or its id');
            if (p.area !== undefined && p.area !== 'view' && !(Array.isArray(p.area) && p.area.length === 4 && p.area.every(Number.isFinite))) fail(`${at}.particles[${i}]`, "area is 'view' or [x, y, width, height]");
            if (p.margin !== undefined && !(Number.isFinite(p.margin) && p.margin >= 0)) fail(`${at}.particles[${i}]`, 'margin is world units (>= 0)');
        });
        return [name, Object.freeze({ particles: Object.freeze(particles.map(p => Object.freeze({ ...p }))) })];
    }));
    if (!plain(out.intensities) || !Object.keys(out.intensities).length || Object.values(out.intensities).some(v => !(Number.isFinite(v) && v >= 0 && v <= 16))) fail(where, 'intensities is {name: scale (0 to 16)}');
    if (!plain(out.start) || !Object.hasOwn(states, out.start.state) || !Object.hasOwn(out.intensities, out.start.intensity ?? 'normal')) fail(where, 'start is {state, intensity} naming one of each');
    if (!(Number.isFinite(out.fade) && out.fade >= 0)) fail(where, 'fade is seconds (>= 0)');
    return Object.freeze({ states: Object.freeze(states), intensities: Object.freeze({ ...out.intensities }), start: Object.freeze({ state: out.start.state, intensity: out.start.intensity ?? 'normal' }), fade: out.fade });
}

/**
 * The world's weather (WORLD_WEATHER's record). The Lobby calls `updateState(seconds)` each fixed step; a map level
 * reads `amount(state)` for each state's particle systems.
 */
export class worldWeather {
    #settings; #state; #intensity; #weights = new Map(); #scale = 1; #scale_rate = 0; #fade = 0; #listeners = new Set();
    constructor(record = {}) { this.configure(record); }
    /** Takes a new weather record (readWorldWeather) and starts its `start` weather at once. Returns it. */
    configure(record = {}) {
        this.#settings = readWorldWeather(record);
        this.#state = this.#settings.start.state; this.#intensity = this.#settings.start.intensity; this.#fade = this.#settings.fade;
        this.#weights = new Map(Object.keys(this.#settings.states).map(name => [name, name === this.#state ? 1 : 0]));
        this.#scale = this.#settings.intensities[this.#intensity]; return this;
    }
    /** The record as read. */
    get settings() { return this.#settings; }
    /** The weather it is (or is turning into): its state and intensity names. */
    get state() { return this.#state; }
    get intensity() { return this.#intensity; }
    /** True while the weather is still fading from one to the next. */
    get changing() { const want = this.#settings.intensities[this.#intensity]; return Math.abs(this.#scale - want) > 1e-6 || [...this.#weights].some(([n, w]) => Math.abs(w - (n === this.#state ? 1 : 0)) > 1e-6); }
    /**
     * Changes the weather to `state` at `intensity` (by default the one it has), fading over `fade` seconds of play
     * (the record's by default; 0 at once). Tells the listeners. Returns the weather.
     */
    set(state, intensity = this.#intensity, { fade = this.#settings.fade } = {}) {
        if (!Object.hasOwn(this.#settings.states, state)) throw new TypeError(`Unknown weather: ${state} (one of ${Object.keys(this.#settings.states).join(', ')})`);
        if (!Object.hasOwn(this.#settings.intensities, intensity)) throw new TypeError(`Unknown weather intensity: ${intensity} (one of ${Object.keys(this.#settings.intensities).join(', ')})`);
        if (!(Number.isFinite(fade) && fade >= 0)) throw new RangeError('fade is seconds (>= 0)');
        const previous = { state: this.#state, intensity: this.#intensity };
        this.#state = state; this.#intensity = intensity; this.#fade = fade; this.#scale_rate = Math.abs(this.#settings.intensities[intensity] - this.#scale);
        if (fade === 0) this.updateState(0, true);
        if (previous.state !== state || previous.intensity !== intensity) for (const fn of [...this.#listeners]) fn({ state, intensity, previous }, this);
        return this;
    }
    /** How much of `state` there is now: its share of the weather (fading in or out) times the intensity's scale. */
    amount(state) { return (this.#weights.get(state) ?? 0) * this.#scale; }
    /** Every state's amount now, `{name: amount}`. */
    amounts() { return Object.fromEntries([...this.#weights.keys()].map(n => [n, this.amount(n)])); }
    /** Listens for each change of weather (`{state, intensity, previous}`). Returns the call that stops listening. */
    on(event, fn) { if (event !== 'change') throw new TypeError("The weather's event is 'change'"); if (typeof fn !== 'function') throw new TypeError('A weather listener is a function'); this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
    /** Moves the fade `seconds` of play on. */
    updateState(seconds, all = false) {
        if (!(Number.isFinite(seconds) && seconds >= 0)) throw new RangeError('The weather steps by seconds (>= 0)');
        const k = all || this.#fade === 0 ? Infinity : seconds / this.#fade, step = (v, to, d) => v < to ? Math.min(to, v + d) : Math.max(to, v - d);
        for (const [name, w] of this.#weights) this.#weights.set(name, step(w, name === this.#state ? 1 : 0, k));
        const want = this.#settings.intensities[this.#intensity]; this.#scale = step(this.#scale, want, k * this.#scale_rate);
    }
    /** The weather as plain data, for a save. */
    save() { return { state: this.#state, intensity: this.#intensity }; }
    /** Puts back a saved weather, at once. */
    restore({ state, intensity }) { return this.set(state, intensity, { fade: 0 }); }
}
