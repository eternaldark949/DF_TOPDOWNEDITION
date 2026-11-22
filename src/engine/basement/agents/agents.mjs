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
    signals: Object.freeze({ green: 7, clear: 2, walk: 8 }),   // seconds each way in is green, the all-red between, and the walk (every way red) once round
    seed: 1
});

/** An `agents` record (`{settings?, profiles: {name: profile}}`) checked against AGENTS and AGENT_PROFILE. Returns it. */
export function readAgents(record, where = 'agents') {
    const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!plain(record) || Object.keys(record).some(k => k !== 'settings' && k !== 'profiles') || !plain(record.profiles)) throw new TypeError(`${where} is {settings?, profiles: {name: profile}}`);
    for (const key of Object.keys(record.settings ?? {})) if (!Object.hasOwn(AGENTS, key)) throw new TypeError(`${where}.settings: unknown setting ${key} (one of ${Object.keys(AGENTS).join(', ')})`);
    for (const key of Object.keys(record.settings?.signals ?? {})) if (!Object.hasOwn(AGENTS.signals, key)) throw new TypeError(`${where}.settings.signals: unknown ${key} (one of ${Object.keys(AGENTS.signals).join(', ')})`);
    for (const [name, p] of Object.entries(record.profiles)) {
        if (!plain(p)) throw new TypeError(`${where}.profiles.${name} is a profile`);
        for (const key of Object.keys(p)) if (!Object.hasOwn(AGENT_PROFILE, key)) throw new TypeError(`${where}.profiles.${name}: unknown field ${key} (one of ${Object.keys(AGENT_PROFILE).join(', ')})`);
        for (const key of ['count', 'speed', 'gap', 'spacing', 'spread']) if (p[key] !== undefined && !(Number.isFinite(p[key]) && p[key] >= 0)) throw new TypeError(`${where}.profiles.${name}.${key} is a number (>= 0)`);
        if (p.looks !== undefined && p.looks !== null && !(Array.isArray(p.looks) && p.looks.every(plain))) throw new TypeError(`${where}.profiles.${name}.looks is a list of look values`);
    }
    return record;
}
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const random = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const inside = (p, v, margin) => v && p[0] > v[0] - margin && p[0] < v[2] + margin && p[1] > v[1] - margin && p[1] < v[3] + margin;
const base = id => id.endsWith(':reverse') ? id.slice(0, -8) : id;

/**
 * The life of a street network: `new agentSystem(physics, {network, profiles: {name: profile}, spawn(name, profile,
 * {position, rotation}) → entity | {entity, updateState?, remove?}, remove?(handle), ...settings})`. It lays the
 * network's lanes into `physics.navigation.roads`; `updateState(seconds, {focus: [x, y], view?: [left, top, right,
 * bottom]})` runs a step; `dispose()` takes every agent away and clears the lanes and lights.
 */
export class agentSystem {
    #physics; #net; #lanes = new Map(); #crossing = new Map(); #signals = new Map(); #junctions; #spawn; #remove;
    #pool = new Map(); #agents = []; #time = 0; #serial = 0; #rand; #stats = { made: 0, gone: 0, trips: 0, no_route: 0, ms: 0 };
    constructor(physics, { network, profiles = {}, spawn, remove = null, ...settings } = {}) {
        if (!physics?.navigation?.roads || !physics.traffic) throw new TypeError('agentSystem needs a physicsSystem with navigation and traffic');
        if (!network?.lanes) throw new TypeError('agentSystem needs a street network (streetNetwork)');
        if (typeof spawn !== 'function') throw new TypeError('agentSystem needs a spawn(name, profile, pose) hook');
        for (const key of Object.keys(settings)) if (!Object.hasOwn(AGENTS, key)) throw new TypeError(`agents: unknown setting ${key}`);
        this.settings = Object.freeze({ ...AGENTS, ...settings, signals: Object.freeze({ ...AGENTS.signals, ...settings.signals }) });
        this.profiles = Object.freeze(Object.fromEntries(Object.entries(profiles).map(([name, p]) => {
            for (const key of Object.keys(p)) if (!Object.hasOwn(AGENT_PROFILE, key)) throw new TypeError(`agents.${name}: unknown field ${key}`);
            return [name, Object.freeze({ ...AGENT_PROFILE, ...p })];
        })));
        this.#physics = physics; this.#net = network; this.#spawn = spawn; this.#remove = remove; this.#rand = random(this.settings.seed);
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
        // The lights: each junction's phases in turn, each followed by the clear; junctions start at their own point.
        const { green, clear, walk } = this.settings.signals;
        this.#junctions = network.junctions.map(j => {
            const spans = [...j.phases.map(ids => ({ ids, seconds: green })), ...(walk > 0 ? [{ ids: [], seconds: walk }] : [])];
            const cycle = spans.reduce((s, p) => s + p.seconds + clear, 0);
            return { spans, cycle, offset: (hash(j.junction_id) % 1000) / 1000 * cycle };
        });
        this.#lights(0);
    }
    get agents() { return this.#agents.map(a => ({ name: a.name, entity: a.entity, state: a.state })); }
    getStatistics() { return { ...this.#stats, agents: this.#agents.length, by_profile: Object.fromEntries(Object.keys(this.profiles).map(n => [n, this.#agents.filter(a => a.name === n).length])) }; }
    /** A light's state now: 'go' or 'stop'. */
    getSignal(signal_id) { return this.#signals.get(signal_id) ?? 'stop'; }
    #lights(time) {
        const clear = this.settings.signals.clear;
        for (const j of this.#junctions) {
            let t = (time + j.offset) % j.cycle, on = null;
            for (const s of j.spans) { if (t < s.seconds) { on = s; break; } t -= s.seconds; if (t < clear) break; t -= clear; }
            for (const s of j.spans) for (const id of s.ids) {
                const state = s === on ? 'go' : 'stop';
                if (this.#signals.get(id) !== state) { this.#signals.set(id, state); this.#physics.traffic.setSignal(id, state); }
            }
        }
    }
    updateState(seconds, { focus, view = null } = {}) {
        const t0 = performance.now();
        this.#time += seconds; this.#lights(this.#time);
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
            const reverse = lane.two_way && this.#rand() < .5;
            return { lane, position: p, rotation: Math.atan2((b[1] - a[1]) * (reverse ? -1 : 1), (b[0] - a[0]) * (reverse ? -1 : 1)) };
        }
        return null;
    }
    #make(name, profile, focus, view, anywhere = false) {
        const at = this.#place(profile, focus, view, anywhere); if (!at) return false;
        const handle = this.#spawn(name, profile, { position: at.position, rotation: at.rotation }); if (!handle) return false;
        const entity = handle.entity ?? handle, a = { id: ++this.#serial, name, profile, handle, entity, car: profile.network === 'car', side: 4 + this.#rand() * profile.spread, focus, state: 'new', route_id: null, way: null, step: 0, on: null, spot: null };
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
        // Coming up to a crossing: wait on the kerb while the road it crosses has a green, then hold the crosswalk.
        const red = c => c.waits_for.some(id => this.getSignal(id) === 'go');
        const next = a.way[a.step + 1], ahead_crossing = next && this.#crossing.get(next.lane), crossing = this.#crossing.get(leg.lane);
        if (ahead_crossing && d < 40 && red(ahead_crossing)) {
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
            if (red(crossing) && dist(here, leg.from) < 26) { motor.setMovement([0, 0]); a.state = 'waiting'; return; }
            traffic.enterWalkway(crossing.walkway_id, a.entity); a.on = crossing.walkway_id;
        }
        // Keep the gap to anyone just ahead on the way, else walk on.
        let pace = a.profile.speed;
        for (const o of this.#agents) {
            if (o === a || o.car) continue;
            const ox = o.entity.position[0] - here[0], oy = o.entity.position[1] - here[1], ahead = (ox * dx + oy * dy) / d;
            if (ahead > 0 && ahead < 22 + a.profile.gap && Math.abs((ox * dy - oy * dx) / d) < 12) pace = Math.min(pace, a.profile.speed * (o.state === 'waiting' ? .3 : .6));   // (round one waiting, slowly: it stands to one side)
        }
        motor.setMovement([dx / d, dy / d], { speed: pace, face_movement: true });
        a.state = pace > 0 ? 'walking' : 'waiting';
    }
    dispose() {
        for (const a of [...this.#agents]) this.#take(a);
        for (const id of this.#signals.keys()) this.#physics.traffic.setSignal(id, 'stop');
        this.#signals.clear();
        // Its lanes and nodes out of the roads (and the world's grid), whatever else they hold.
        const roads = this.#physics.navigation.roads, ids = [];
        for (const l of this.#lanes.values()) { ids.push(l.lane_id); if (l.two_way) ids.push(`${l.lane_id}:reverse`); }
        for (const id of ids) roads.removeLane(id);
        for (const n of this.#net.nodes) roads.removeNode(n.node_id);
    }
}
