// ===== LV0 BASEMENT =====
// AGENTS: the life of a street network (streetNetwork's data), kept round a focus. Each profile is data: which lanes
// it uses (`network`: a lane profile such as car or foot), how many there are round the focus, how fast they go and
// what gap they keep. Every agent runs the same loop each step: sense (its lane ahead, the light, the crosswalk),
// decide (go, wait, turn round for a new trip) and move. A car hands its trip to the traffic controller, which
// follows the car ahead on its lanes and stops at red lights and at crosswalks in use; someone on foot walks the
// pavements and crosses where the lights let them, holding the crosswalk while they are on it. The junctions' lights
// cycle through their phases with a clear (every light red) between, and once round a walk, every light red, for those on foot. Agents appear out of sight round the focus and
// go once they are far behind it. It knows nothing of the game: the game makes each agent (`spawn`) and takes it
// away (`remove`).

/** An agent profile's fields and their defaults. */
export const AGENT_PROFILE = Object.freeze({
    network: 'car',          // the lane profile it uses: car agents drive (traffic), any other walks
    count: 10,               // how many round the focus
    speed: 150,              // units a second
    gap: 12,                 // kept to whatever is ahead in its lane
    spacing: 90,             // no two are made closer than this
    spread: 18,              // on foot, how far to the right of the way each keeps (up to)
    avoid: true,             // on foot, steers round what is in its way (people, the player, props) instead of walking into it
    look_ahead: 48,          // how far ahead it looks for what is in its way
    room: 24,                // how far either side of the way it may step to get round
    template: null,          // what the game makes it from (read by `spawn`, not here)
    looks: null              // the looks to pick from (read by `spawn`)
});
/** The agent system's settings and their defaults. */
export const AGENTS = Object.freeze({
    near: 750,               // agents appear at least this far from the focus (and out of view)
    far: 1500,               // and at most this far
    gone: 1900,              // and go once further than this
    trip: [700, 2400],       // how far a trip is, as the crow flies
    per_step: 2,             // at most this many appear each step
    signals: Object.freeze({ green: 7, clear: 2, walk: 8, hold: 6, flash: 2 }),   // seconds each way in is green, the all-red between, the walk (every way red) once round, how much longer the all-red may hold while the junction or its crossings are still in use, and the end of the walk when nobody starts across
    looks: Object.freeze({ head: null, bar: null, strip: null }),   // what the lights look like: templates for a light's head, its stop bar and a crossing's walk strips (none drawn when null)
    seed: 1
});

/** An `agents` record (`{settings?, profiles: {name: profile}}`) checked against AGENTS and AGENT_PROFILE. Returns it. */
export function readAgents(record, where = 'agents') {
    const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!plain(record) || Object.keys(record).some(k => k !== 'settings' && k !== 'profiles') || !plain(record.profiles)) throw new TypeError(`${where} is {settings?, profiles: {name: profile}}`);
    for (const key of Object.keys(record.settings ?? {})) if (!Object.hasOwn(AGENTS, key)) throw new TypeError(`${where}.settings: unknown setting ${key} (one of ${Object.keys(AGENTS).join(', ')})`);
    for (const key of Object.keys(record.settings?.signals ?? {})) if (!Object.hasOwn(AGENTS.signals, key)) throw new TypeError(`${where}.settings.signals: unknown ${key} (one of ${Object.keys(AGENTS.signals).join(', ')})`);
    for (const [key, v] of Object.entries(record.settings?.signals ?? {})) if (!(Number.isFinite(v) && v >= 0)) throw new TypeError(`${where}.settings.signals.${key} is seconds (>= 0)`);
    for (const [key, v] of Object.entries(record.settings?.looks ?? {})) { if (!Object.hasOwn(AGENTS.looks, key)) throw new TypeError(`${where}.settings.looks: unknown ${key} (one of ${Object.keys(AGENTS.looks).join(', ')})`); if (v !== null && typeof v !== 'string') throw new TypeError(`${where}.settings.looks.${key} is a template id or null`); }
    for (const [name, p] of Object.entries(record.profiles)) {
        if (!plain(p)) throw new TypeError(`${where}.profiles.${name} is a profile`);
        for (const key of Object.keys(p)) if (!Object.hasOwn(AGENT_PROFILE, key)) throw new TypeError(`${where}.profiles.${name}: unknown field ${key} (one of ${Object.keys(AGENT_PROFILE).join(', ')})`);
        if (p.avoid !== undefined && typeof p.avoid !== 'boolean') throw new TypeError(`${where}.profiles.${name}.avoid is true or false`);
        for (const key of ['count', 'speed', 'gap', 'spacing', 'spread', 'look_ahead', 'room']) if (p[key] !== undefined && !(Number.isFinite(p[key]) && p[key] >= 0)) throw new TypeError(`${where}.profiles.${name}.${key} is a number (>= 0)`);
        if (p.looks !== undefined && p.looks !== null && !(Array.isArray(p.looks) && p.looks.every(plain))) throw new TypeError(`${where}.profiles.${name}.looks is a list of look values`);
    }
    return record;
}
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const random = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const inside = (p, v, margin) => v && p[0] > v[0] - margin && p[0] < v[2] + margin && p[1] > v[1] - margin && p[1] < v[3] + margin;
const GRID_CARS = Object.freeze({ groups: 4, skip: 0, loose: false, instances: false });
const NOT_BY_LINE = 160;              // no car is made this near the end of a lane into a junction
const LOOKS_EVERY = 30;                // steps between looks for the lights round the focus to place or take away
const SENSE_EVERY = 3;                 // steps between a walker's looks ahead (they are staggered)
const TURNS = [.45, .9, 1.3, 1.6];   // the headings tried to a side, nearest the way first (radians off it; plus is right)
const GRID_PEOPLE = Object.freeze({ groups: 2, skip: 0, loose: false, instances: false });
const GRID_THINGS = Object.freeze({ groups: 1 | 8, skip: 0, loose: false, instances: false });
const BIG = 160;                       // wider than this both ways: a building or wall, left to collision
const KEEP = Object.freeze({ angle: 0, pace: 1 });
const base = id => id.endsWith(':reverse') ? id.slice(0, -8) : id;

/**
 * The life of a street network: `new agentSystem(physics, {network, profiles: {name: profile}, spawn(name, profile,
 * {position, rotation}) → entity | {entity, updateState?, remove?}, remove?(handle), place?(template, {position,
 * rotation, values}) → entity, ...settings})`. It lays the
 * network's lanes into `physics.navigation.roads`; `updateState(seconds, {focus: [x, y], view?: [left, top, right,
 * bottom]})` runs a step; `dispose()` takes every agent away and clears the lanes and lights.
 */
export class agentSystem {
    #physics; #net; #lanes = new Map(); #crossing = new Map(); #signals = new Map(); #light = new Map(); #junctions; #junction = new Map(); #spawn; #remove; #placeLook;
    #carOn = new Map(); #looks_in = 0; #looking = new Set();
    #boxes = []; #near = []; #pool = new Map(); #agents = []; #time = 0; #serial = 0; #rand; #stats = { made: 0, gone: 0, trips: 0, no_route: 0, ms: 0 };
    constructor(physics, { network, profiles = {}, spawn, remove = null, place = null, ...settings } = {}) {
        if (!physics?.navigation?.roads || !physics.traffic) throw new TypeError('agentSystem needs a physicsSystem with navigation and traffic');
        if (!network?.lanes) throw new TypeError('agentSystem needs a street network (streetNetwork)');
        if (typeof spawn !== 'function') throw new TypeError('agentSystem needs a spawn(name, profile, pose) hook');
        for (const key of Object.keys(settings)) if (!Object.hasOwn(AGENTS, key)) throw new TypeError(`agents: unknown setting ${key}`);
        this.settings = Object.freeze({ ...AGENTS, ...settings, signals: Object.freeze({ ...AGENTS.signals, ...settings.signals }), looks: Object.freeze({ ...AGENTS.looks, ...settings.looks }) });
        this.profiles = Object.freeze(Object.fromEntries(Object.entries(profiles).map(([name, p]) => {
            for (const key of Object.keys(p)) if (!Object.hasOwn(AGENT_PROFILE, key)) throw new TypeError(`agents.${name}: unknown field ${key}`);
            return [name, Object.freeze({ ...AGENT_PROFILE, ...p })];
        })));
        this.#physics = physics; this.#net = network; this.#spawn = spawn; this.#remove = remove; this.#placeLook = place; this.#rand = random(this.settings.seed);
        const roads = physics.navigation.roads;
        for (const n of network.nodes) roads.addNode(n.node_id, n);
        for (const l of network.lanes) { roads.addLane(l.lane_id, l); this.#lanes.set(l.lane_id, l); }
        for (const c of network.crossings) this.#crossing.set(c.lane_id, c);
        // Where each kind may appear: lanes along the road (not through a junction), by their profile.
        const nodes = new Map(network.nodes.map(n => [n.node_id, n.position]));
        for (const l of network.lanes) {
            if (l.kind !== 'road' && l.kind !== 'pavement') continue;
            const a = nodes.get(l.from), b = nodes.get(l.to), points = [a, ...l.points, b];
            for (const p of l.profiles) { if (!this.#pool.has(p)) this.#pool.set(p, []); this.#pool.get(p).push({ lane: l, points }); }
        }
        // The lights: each junction's phases in turn (a green for each way in, then the walk), each followed by the
        // all-red clear; junctions start at their own point of the round.
        const { green, clear, walk } = this.settings.signals;
        this.#junctions = network.junctions.map(j => {
            const spans = [...j.phases.map(ids => ({ ids, seconds: green, walk: false })), ...(walk > 0 ? [{ ids: [], seconds: walk, walk: true }] : [])];
            let t = (hash(j.junction_id) % 1000) / 1000 * spans.reduce((s, p) => s + p.seconds + clear, 0), i = 0, clearing = false;
            for (;;) { if (t < spans[i].seconds) break; t -= spans[i].seconds; if (t < clear) { clearing = true; break; } t -= clear; i = (i + 1) % spans.length; }
            const rec = { id: j.junction_id, position: j.position, area: j.area ?? null, spans, i, t, clearing, crossings: [], signals: [], looks: null };
            this.#junction.set(rec.id, rec); return rec;
        });
        for (const c of network.crossings) for (const id of c.junctions ?? []) this.#junction.get(id)?.crossings.push(c);
        for (const s of network.signals ?? []) this.#junction.get(s.junction_id)?.signals.push(s);
        this.#lights(0);
    }
    get agents() { return this.#agents.map(a => ({ name: a.name, entity: a.entity, state: a.state })); }
    getStatistics() { return { ...this.#stats, agents: this.#agents.length, by_profile: Object.fromEntries(Object.keys(this.profiles).map(n => [n, this.#agents.filter(a => a.name === n).length])) }; }
    /** A light's state for the traffic now: 'go' or 'stop'. */
    getSignal(signal_id) { return this.#signals.get(signal_id) ?? 'stop'; }
    /** What a light shows now: 'go', 'amber' (its green just ended: the all-red after it) or 'stop'. */
    getLight(signal_id) { return this.#light.get(signal_id) ?? 'stop'; }
    /** A crossing's walk light now: 'walk', 'flash' (the walk is ending: nobody starts across) or 'wait'. Unlit crossings always walk. */
    getWalk(walkway_id) {
        const c = this.#net.crossings.find(x => x.walkway_id === walkway_id); return c ? this.#walkLight(c) : 'wait';
    }
    #walkLight(c) {
        let out = 'walk';
        for (const id of c.junctions ?? []) { const j = this.#junction.get(id); if (!j) continue; const w = this.#junctionWalk(j); if (w === 'wait') return 'wait'; if (w === 'flash') out = 'flash'; }
        return out;
    }
    #junctionWalk(j) { const s = j.spans[j.i]; return !s.walk || j.clearing ? 'wait' : s.seconds - j.t <= this.settings.signals.flash ? 'flash' : 'walk'; }
    /**
     * Each junction's lights move on: a green or the walk runs its seconds, then every light is red for `clear`
     * seconds, and longer while a car is still in the junction (the spatial grid) or (up to `hold` more) anyone is
     * still on its crossings, so the next way in or the walk never starts into them.
     */
    #lights(seconds) {
        const { clear, hold } = this.settings.signals;
        for (const j of this.#junctions) {
            j.t += seconds;
            if (!j.clearing && j.t >= j.spans[j.i].seconds) { j.t -= j.spans[j.i].seconds; j.clearing = true; }
            if (j.clearing && j.t >= clear && !(j.area && this.#carIn(j.area, 0)) && (j.t >= clear + hold || this.#crossingsClear(j))) { j.clearing = false; j.t = 0; j.i = (j.i + 1) % j.spans.length; }
            this.#show(j);
        }
    }
    /** Nobody on the junction's crossings. */
    #crossingsClear(j) {
        const traffic = this.#physics.traffic;
        for (const c of j.crossings) if (traffic.getWalkway(c.walkway_id).length) return false;
        return true;
    }
    /** Is a car's body over `area` (shrunk by `inset`)? Asked of the spatial grid. */
    #carIn(area, inset) {
        const physics = this.#physics, a = { left: area.left + inset, top: area.top + inset, right: area.right - inset, bottom: area.bottom - inset };
        for (const body of physics.spatial_grid.queryBounds(a, this.#near, GRID_CARS)) {
            const b = physics.getBodyBounds(body); if (b.right > a.left && b.left < a.right && b.bottom > a.top && b.top < a.bottom) return true;
        }
        return false;
    }
    /** May someone on foot start across `c` now: its walk light walks and no car is on it (asked once a step). */
    #mayCross(c) {
        if (this.#walkLight(c) !== 'walk') return false;
        let on = this.#carOn.get(c.walkway_id); if (on === undefined) this.#carOn.set(c.walkway_id, on = this.#carIn(c.area ?? { left: 0, top: 0, right: 0, bottom: 0 }, 2));
        return !on;
    }
    /** Sets each of the junction's lights (for the traffic and for its looks) and its crossings' walk looks. */
    #show(j) {
        const span = j.spans[j.i];
        for (const s of j.spans) for (const id of s.ids) {
            const light = s === span ? (j.clearing ? 'amber' : 'go') : 'stop', go = light === 'go' ? 'go' : 'stop';
            if (this.#signals.get(id) !== go) { this.#signals.set(id, go); this.#physics.traffic.setSignal(id, go); }
            if (this.#light.get(id) !== light) { this.#light.set(id, light); for (const l of j.looks ?? []) if (l.signal_id === id) this.#lookShows(l); }
        }
        const walk = this.#junctionWalk(j);
        if (j.walk !== walk) { j.walk = walk; for (const l of j.looks ?? []) if (l.walkway_id) this.#lookShows(l); }
    }
    /** A look's properties from its light: a head's or a bar's `go`, `amber` and `red`, a walk strip's `walk`, `flash` and `wait` (one of them set). */
    #lookShows(l) {
        const set = (k, v) => { if (!!l.entity.get(k) !== v) l.entity.set(k, v); };
        if (l.signal_id) { const light = this.getLight(l.signal_id); set('go', light === 'go'); set('amber', light === 'amber'); set('red', light === 'stop'); }
        else { const w = this.#walkLight(l.crossing); set('walk', w === 'walk'); set('flash', w === 'flash'); set('wait', w === 'wait'); }
    }
    /**
     * The lights' looks round the focus (with `settings.looks` and a `place(template, {position, rotation, values})`
     * hook): each light's head and stop bar and each crossing's walk strips, placed for the junctions within `far` and
     * taken away past `gone`. A bar and a strip lie along their own x, from the value `left` to `right`.
     */
    #placeLooks(focus) {
        const L = this.settings.looks; if (!this.#placeLook || !(L.head || L.bar || L.strip)) return;
        const { far, gone } = this.settings;
        for (const j of this.#junctions) {
            const d = dist(j.position, focus);
            if (j.looks && d > gone) { for (const l of j.looks) l.entity.destroy?.(); j.looks = null; this.#looking.delete(j); continue; }
            if (j.looks || d > far) continue;
            j.looks = []; this.#looking.add(j);
            const line = ([p, q]) => ({ position: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], rotation: Math.atan2(q[1] - p[1], q[0] - p[0]), values: { left: -dist(p, q) / 2, right: dist(p, q) / 2 } });
            const put = (template, pose, rec) => { if (!template) return; const entity = this.#placeLook(template, pose); if (entity) { const l = { entity, ...rec }; j.looks.push(l); this.#lookShows(l); } };
            for (const s of j.signals) { put(L.head, { position: s.head, rotation: s.rotation, values: {} }, { signal_id: s.signal_id }); put(L.bar, line(s.bar), { signal_id: s.signal_id }); }
            for (const c of j.crossings) if (c.junctions[0] === j.id) for (const strip of c.strips ?? []) put(L.strip, line(strip), { walkway_id: c.walkway_id, crossing: c });
        }
    }
    updateState(seconds, { focus, view = null } = {}) {
        const t0 = performance.now();
        this.#time += seconds; this.#carOn.clear(); this.#lights(seconds);
        if (focus && !(this.#looks_in-- > 0)) { this.#looks_in = LOOKS_EVERY - 1; this.#placeLooks(focus); }
        if (focus) {
            // Those far behind go; the rest sense, decide and move.
            for (const a of [...this.#agents]) if (a.entity.destroyed || dist(a.entity.position, focus) > this.settings.gone) this.#take(a);
            for (const a of this.#agents) a.car ? this.#drive(a) : this.#walk(a, seconds);
            // New ones out of sight, a few a step.
            let made = 0;
            for (const [name, profile] of Object.entries(this.profiles)) {
                let have = this.#agents.filter(a => a.name === name).length;
                while (have < profile.count && made < this.settings.per_step) { if (!this.#make(name, profile, focus, view)) break; have++; made++; }
            }
        }
        for (const a of this.#agents) a.handle.updateState?.();
        this.#stats.ms = performance.now() - t0;
    }
    /** Fills each profile up to its count round the focus at once, anywhere but too near (a level arriving). */
    populate({ focus, view = null } = {}) {
        for (const [name, profile] of Object.entries(this.profiles)) {
            let tries = profile.count * 4;
            while (this.#agents.filter(a => a.name === name).length < profile.count && tries-- > 0) this.#make(name, profile, focus, view, true);
        }
    }
    #place(profile, focus, view, anywhere) {
        const pool = this.#pool.get(profile.network) ?? []; if (!pool.length) return null;
        const { near, far } = this.settings;
        for (let tries = 0; tries < 24; tries++) {
            const { lane, points } = pool[Math.floor(this.#rand() * pool.length)];
            const k = Math.floor(this.#rand() * (points.length - 1)), u = .1 + .8 * this.#rand(), a = points[k], b = points[k + 1];
            const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], d = dist(p, focus);
            if (d > far || (!anywhere && (d < near || inside(p, view, 80)))) continue;
            if (this.#agents.some(o => dist(o.entity.position, p) < profile.spacing)) continue;
            // (no car is made where the lights could not stop it: past its stop line, or too near it to stop)
            if (profile.network === 'car' && lane.to_junction && dist(p, points.at(-1)) < NOT_BY_LINE) continue;
            const reverse = lane.two_way && this.#rand() < .5;
            return { lane, position: p, rotation: Math.atan2((b[1] - a[1]) * (reverse ? -1 : 1), (b[0] - a[0]) * (reverse ? -1 : 1)) };
        }
        return null;
    }
    #make(name, profile, focus, view, anywhere = false) {
        const at = this.#place(profile, focus, view, anywhere); if (!at) return false;
        const handle = this.#spawn(name, profile, { position: at.position, rotation: at.rotation }); if (!handle) return false;
        const entity = handle.entity ?? handle, a = { id: ++this.#serial, name, profile, handle, entity, car: profile.network === 'car', side: 4 + this.#rand() * profile.spread, sense_in: Math.floor(this.#rand() * SENSE_EVERY), steer: KEEP, focus, state: 'new', route_id: null, way: null, step: 0, on: null, spot: null };
        this.#agents.push(a); this.#stats.made++;
        if (!this.#trip(a, focus)) { this.#take(a); return false; }
        return true;
    }
    #take(a) {
        const traffic = this.#physics.traffic;
        if (a.on) traffic.leaveWalkway(a.on, a.entity.body_id ?? a.entity);
        if (a.car && !a.entity.destroyed) traffic.removeVehicle(a.entity);
        if (a.route_id) traffic.releaseRoute(a.route_id);
        if (this.#remove) this.#remove(a.handle); else if (a.handle.remove) a.handle.remove(); else a.entity.destroy?.();
        this.#agents.splice(this.#agents.indexOf(a), 1); this.#stats.gone++;
    }
    /** A new trip from where it stands to somewhere a trip away, still round the focus. */
    #trip(a, focus) {
        const roads = this.#physics.navigation.roads, profile = a.profile, from = [...a.entity.position], [lo, hi] = this.settings.trip;
        const pool = this.#pool.get(profile.network) ?? [];
        for (let tries = 0, searches = 0; tries < 60 && searches < 3; tries++) {
            const { points } = pool[Math.floor(this.#rand() * pool.length)], q = points[Math.floor(this.#rand() * points.length)];
            const d = dist(q, from); if (d < lo || d > hi || dist(q, a.focus ?? focus) > this.settings.gone) continue;
            searches++;
            const route = roads.findRoute({ from, to: q, profile: profile.network, near_range: 80 });
            if (!route || route.length < lo / 2) continue;
            this.#stats.trips++;
            return a.car ? this.#drivePlan(a, route) : this.#walkPlan(a, route);
        }
        this.#stats.no_route++; return false;
    }
    // ---- cars: the trip is a traffic route along the lanes, its stops the lights and crosswalks it meets ----
    #drivePlan(a, route) {
        const traffic = this.#physics.traffic, points = [], stops = [];
        for (const p of route.points) if (!points.length || dist(points.at(-1), p) > 1e-3) points.push(p);
        if (points.length < 2) return false;
        let total = 0; for (let i = 1; i < points.length; i++) total += dist(points[i], points[i - 1]);
        let start = 0;
        route.spans.forEach((span, i) => {
            const lane = this.#lanes.get(span.lane_id), next = route.spans[i + 1]?.lane_id;
            for (const s of lane?.stops ?? []) {
                if (s.distance < span.from - 1e-6 || s.distance > span.to + 1e-6) continue;
                if (s.signal_id && s.turn !== next) continue;   // (only the light for the way it turns)
                stops.push({ ...(s.signal_id ? { signal_id: s.signal_id, conflict_id: s.turn, clearance_distance: s.clearance ?? 20 } : { walkway_id: s.walkway_id }), distance: Math.min(total, Math.max(0, start + s.distance - span.from)) });
            }
            start += span.to - span.from;
        });
        if (a.route_id) traffic.releaseRoute(a.route_id);
        a.route_id = traffic.registerRoute(`agents:${a.id}:${this.#stats.trips}`, { points, stops, speed_limit: a.profile.speed, lanes: route.spans });
        traffic.addVehicle(a.entity, { route_id: a.route_id, following_distance: a.profile.gap });
        a.state = 'driving'; return true;
    }
    #drive(a) {
        const state = this.#physics.traffic.getState(a.entity);
        if (state && !state.finished) return;
        // At the trip's end: on to another, or away.
        if (!this.#trip(a, a.focus)) this.#take(a);
    }
    // ---- on foot: the trip is the pavements and crossings it walks, each crossing waiting for its lights ----
    #walkPlan(a, route) {
        const way = [], points = route.points;
        // Each span's end along the route's points: walk to it, knowing which lane it is.
        let walked = 0, k = 1, start = 0;
        for (const span of route.spans) {
            const end = start + span.to - span.from;
            while (k < points.length && walked + dist(points[k], points[k - 1]) <= end + 1e-6) { walked += dist(points[k], points[k - 1]); way.push({ from: points[k - 1], to: points[k], lane: base(span.lane_id) }); k++; }
            start = end;
        }
        while (k < points.length) { way.push({ from: points[k - 1], to: points[k], lane: base(route.spans.at(-1).lane_id) }); k++; }
        if (!way.length) return false;
        a.way = way; a.step = 0; a.state = 'walking'; return true;
    }
    #walk(a, seconds) {
        const traffic = this.#physics.traffic, motor = a.entity.motor, here = a.entity.position;
        // Each keeps to the right of the way it walks, by its own amount, so two ways pass and a queue spreads.
        const target = leg => { const dx = leg.to[0] - leg.from[0], dy = leg.to[1] - leg.from[1], d = Math.hypot(dx, dy) || 1; return [leg.to[0] - dy / d * a.side, leg.to[1] + dx / d * a.side]; };
        let leg = a.way?.[a.step];
        // Reached this leg's end: off any crosswalk it was, on to the next.
        while (leg && dist(here, target(leg)) < 10) {
            if (a.on && this.#crossing.get(leg.lane)?.walkway_id === a.on) { traffic.leaveWalkway(a.on, a.entity); a.on = null; }
            leg = a.way[++a.step];
        }
        if (!leg) { if (!this.#trip(a, a.focus)) this.#take(a); else this.#walk(a, seconds); return; }
        const to = target(leg), dx = to[0] - here[0], dy = to[1] - here[1], d = Math.hypot(dx, dy) || 1;
        // Coming up to a crossing: wait on the kerb until its walk light walks and no car is on it, then hold the crosswalk.
        const next = a.way[a.step + 1], ahead_crossing = next && this.#crossing.get(next.lane), crossing = this.#crossing.get(leg.lane);
        if (ahead_crossing && d < 40 && !this.#mayCross(ahead_crossing)) {
            // Waiting for the walk: a spot of its own on the kerb, set back from the road and along the crossing's
            // width, so a crowd stands spread along the kerb and clear of the turning cars.
            if (!a.spot) {
                const ux = next.to[0] - next.from[0], uy = next.to[1] - next.from[1], n = Math.hypot(ux, uy) || 1, back = 12 + this.#rand() * 16, along = (this.#rand() - .5) * 56;
                a.spot = [next.from[0] - ux / n * back - uy / n * along, next.from[1] - uy / n * back + ux / n * along];
            }
            const sx = a.spot[0] - here[0], sy = a.spot[1] - here[1], sd = Math.hypot(sx, sy);
            if (sd > 4) motor.setMovement([sx / sd, sy / sd], { speed: a.profile.speed * .7, face_movement: true }); else motor.setMovement([0, 0]);
            a.state = 'waiting'; return;
        }
        a.spot = null;
        if (crossing && a.on !== crossing.walkway_id) {
            if (!this.#mayCross(crossing) && dist(here, leg.from) < 26) { motor.setMovement([0, 0]); a.state = 'waiting'; return; }
            traffic.enterWalkway(crossing.walkway_id, a.entity); a.on = crossing.walkway_id;
        }
        // Sense what is in the way and steer round it (or follow it, if it goes our way); else walk on.
        let ux = dx / d, uy = dy / d, pace = a.profile.speed;
        if (a.profile.avoid !== false) {
            if (!(a.sense_in-- > 0)) { a.sense_in = SENSE_EVERY - 1; a.steer = this.#steer(a, leg, [ux, uy]); }
            const { angle, pace: k } = a.steer, c = Math.cos(angle), sn = Math.sin(angle);
            [ux, uy] = [ux * c - uy * sn, ux * sn + uy * c]; pace *= k;
        }
        motor.setMovement(pace > 0 ? [ux, uy] : [0, 0], { speed: pace, face_movement: true });
        a.state = pace > 0 ? 'walking' : 'waiting';
    }
    /**
     * Sense and decide for one walker. Sense: the spatial grid gives what is near (people, the player, lamps, benches,
     * planters); each is its box, grown by the walker's own size. Decide: the way ahead clear, straight on; something
     * going its way, follow it, slower; else the first clear heading of a few to one side, kept to that side till past
     * (the side it is on of what is in the way, the right when square behind it, so two people meeting both step
     * right), within `room` of the way by the time it is level; that side without room, the other. None clear, the one
     * that gets furthest, slowly, or wait; held up, it may step further aside and try both sides. Buildings and walls (anything wider than BIG both ways) are left to collision: the pavements run beside
     * them, and a building's box would cover its forecourt. Returns { angle, pace } (radians off the way, a share of speed).
     */
    #steer(a, leg, dir) {
        const physics = this.#physics, here = a.entity.position, look = a.profile.look_ahead, room = a.profile.room, self = a.entity.body;
        // Its own size from its collision shape (a rig's drawn bounds are wider, arms and all).
        a.radius ??= (() => { const c = a.entity.collision_shape ?? {}; return Math.max(3, c.radius ?? (c.dimensions ? Math.min(...c.dimensions) / 2 : 8)); })();
        const r = a.radius, reach = look + r, boxes = this.#boxes; boxes.length = 0;
        const area = { left: here[0] - reach, right: here[0] + reach, top: here[1] - reach, bottom: here[1] + reach };
        // People (and the player) are their body's middle and about its own size, not the box round their swinging arms.
        for (const body of physics.spatial_grid.queryBounds(area, this.#near, GRID_PEOPLE)) {
            if (body === self) continue;
            const bb = physics.getBodyBounds(body), cx = (bb.left + bb.right) / 2, cy = (bb.top + bb.bottom) / 2, k = 1.9 * r;   // two people about its size
            const box = [cx - k, cy - k, cx + k, cy + k]; if (!(here[0] > box[0] && here[0] < box[2] && here[1] > box[1] && here[1] < box[3])) { box.body = body; boxes.push(box); }
        }
        // Lamps, benches, planters, props: their boxes. Buildings and walls are left to collision.
        for (const body of physics.spatial_grid.queryBounds(area, this.#near, GRID_THINGS)) {
            const bb = physics.getBodyBounds(body);
            if (bb.right - bb.left > BIG && bb.bottom - bb.top > BIG) continue;
            const box = [bb.left - r, bb.top - r, bb.right + r, bb.bottom + r];
            if (here[0] > box[0] && here[0] < box[2] && here[1] > box[1] && here[1] < box[3]) continue;   // already against it: collision parts them
            box.body = body; boxes.push(box);
        }
        if (!boxes.length) return KEEP;
        const lx = leg.to[0] - leg.from[0], ly = leg.to[1] - leg.from[1], ln = Math.hypot(lx, ly) || 1;
        const off = p => ((p[0] - leg.from[0]) * ly - (p[1] - leg.from[1]) * lx) / ln;   // signed distance from the way's line
        let need = look, past = look, wide = room + (a.held ?? 0) * r;   // how far a heading must be clear, where it is judged past, and how far aside it may go (wider the longer it has been held up)
        const probe = angle => {
            const c = Math.cos(angle), sn = Math.sin(angle), vx = dir[0] * c - dir[1] * sn, vy = dir[0] * sn + dir[1] * c;
            // Stepping aside may take it up to `room` from the way (and further only back towards it), by the time it is past.
            if (angle) { const end = Math.abs(off([here[0] + vx * past, here[1] + vy * past])); if (end > wide && end > Math.abs(off(here))) return { clear: -1 }; }
            let clear = look, hit = null;
            for (const box of boxes) {   // where the walker's path enters the grown box (the slab test)
                let t0 = 0, t1 = clear;
                for (const [p, v, lo, hi] of [[here[0], vx, box[0], box[2]], [here[1], vy, box[1], box[3]]]) {
                    if (Math.abs(v) < 1e-9) { if (p < lo || p > hi) { t0 = Infinity; break; } continue; }
                    const ta = (lo - p) / v, tb = (hi - p) / v; t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
                }
                if (t0 <= t1 && t0 < clear) { clear = t0; hit = box; }
            }
            return { clear, hit };
        };
        const ahead = probe(0);
        if (ahead.clear >= look) { a.held = 0; a.pass = 0; return KEEP; }
        // Going our way, about as fast: follow it at a distance rather than weave round it.
        const v = ahead.hit.body.linear_velocity;
        if (v && v[0] * dir[0] + v[1] * dir[1] > a.profile.speed * .4) return { angle: 0, pace: ahead.clear > a.profile.gap ? .8 : .35 };
        need = Math.min(look * .9, ahead.clear + 4 * r); past = Math.min(need, ahead.clear + r);
        let best = { angle: 0, clear: ahead.clear };
        // It keeps to one side till past: the side it is already on of what is in the way (the right when square behind it).
        if (!a.pass) { const h = ahead.hit, q = ((h[0] + h[2]) / 2 - here[0]) * -dir[1] + ((h[1] + h[3]) / 2 - here[1]) * dir[0]; a.pass = q > r / 4 ? -1 : 1; }
        // Its side; the other when its side has no room, or after it has been held up a while.
        for (let sides = 0; sides < 2; sides++) {
            let roomy = false;
            for (const turn of TURNS) {
                const angle = turn * a.pass, { clear } = probe(angle);
                if (clear >= need) return { angle, pace: 1 };
                if (clear >= 0) roomy = true;
                if (clear > best.clear) best = { angle, clear };
            }
            if (sides || roomy && !(a.held > 1)) break; a.pass = -a.pass;
        }
        if (best.clear < r / 2) { a.held = Math.min(4, (a.held ?? 0) + 1); return { angle: 0, pace: 0 }; }
        return { angle: best.angle, pace: Math.max(.25, best.clear / look) };
    }
    dispose() {
        for (const a of [...this.#agents]) this.#take(a);
        for (const id of this.#signals.keys()) this.#physics.traffic.setSignal(id, 'stop');
        this.#signals.clear();
        for (const j of this.#looking) { for (const l of j.looks) l.entity.destroy?.(); j.looks = null; }
        this.#looking.clear();
        // Its lanes and nodes out of the roads (and the world's grid), whatever else they hold.
        const roads = this.#physics.navigation.roads, ids = [];
        for (const l of this.#lanes.values()) { ids.push(l.lane_id); if (l.two_way) ids.push(`${l.lane_id}:reverse`); }
        for (const id of ids) roads.removeLane(id);
        for (const n of this.#net.nodes) roads.removeNode(n.node_id);
    }
}
