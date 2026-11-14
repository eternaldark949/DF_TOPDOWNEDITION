// ===== LV0 BASEMENT =====
import { number, vector, clone, freeze } from '../core/values.mjs';
import { pathGeometry } from '../motion/path-geometry.mjs';

/**
 * Authored lane graph for vehicles and any other lane-bound travellers.
 *
 * Nodes are junctions; lanes are directed polylines between them. Lane bounds
 * live in the world's one spatial grid (as nonphysical entries), so snapping a
 * position to the nearest lane is a shared-grid query, not a private index.
 * Routes minimise travel time and are cached per (profile, node pair) until the
 * network changes.
 */
const SPATIAL = 'navigation:lane:';
export class roadNetwork {
    #world; #nodes = new Map(); #lanes = new Map(); #out = new Map(); #revision = 0; #cache = new Map(); #fastest = 0; #found = [];
    #stats = { route_requests: 0, route_cache_hits: 0, route_searches: 0, expanded_nodes: 0, snaps: 0 };
    constructor(world, { cache_size = 2048 } = {}) {
        this.#world = world; this.cache_size = number(cache_size, 'cache_size', 0, 1e6);
        Object.freeze(this);
    }
    get revision() { return this.#revision; }
    #changed() { this.#revision++; this.#cache.clear(); }
    addNode(node_id, { position }) {
        if (typeof node_id !== 'string' || !node_id) throw new TypeError('Road node id must be a nonempty string');
        if (this.#nodes.has(node_id)) throw new Error(`Duplicate road node: ${node_id}`);
        this.#nodes.set(node_id, freeze({ node_id, position: vector(position, 'position') })); this.#out.set(node_id, []);
        this.#changed(); return node_id;
    }
    /** Adds a directed lane, or two with `two_way:true` (the reverse id is `${lane_id}:reverse`). */
    addLane(lane_id, { from, to, points = [], speed_limit = 180, cost_scale = 1, profiles = ['car'], two_way = false, open = true }) {
        if (typeof lane_id !== 'string' || !lane_id) throw new TypeError('Lane id must be a nonempty string');
        const ids = two_way ? [lane_id, `${lane_id}:reverse`] : [lane_id];
        for (const id of ids) if (this.#lanes.has(id)) throw new Error(`Duplicate lane: ${id}`);
        const a = this.#nodes.get(from), b = this.#nodes.get(to);
        if (!a || !b) throw new TypeError('Lane endpoints must be registered road nodes');
        if (from === to && !points.length) throw new TypeError('A loop lane needs intermediate points');
        number(speed_limit, 'speed_limit', 1e-6); number(cost_scale, 'cost_scale', 1e-6);
        if (!Array.isArray(profiles) || !profiles.length || profiles.some(p => typeof p !== 'string' || !p)) throw new TypeError('profiles must be nonempty strings');
        const forward = [a.position, ...points.map(p => vector(p, 'lane point')), b.position];
        this.#insert(ids[0], from, to, forward, { speed_limit, cost_scale, profiles, open: !!open });
        if (two_way) this.#insert(ids[1], to, from, [...forward].reverse(), { speed_limit, cost_scale, profiles, open: !!open });
        this.#changed(); return ids;
    }
    #insert(lane_id, from, to, points, { speed_limit, cost_scale, profiles, open }) {
        let length = 0; for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
        pathGeometry.projectOnPath(points, points[0]); // validates segments
        const lane = { lane_id, from, to, points: freeze(clone(points)), length, speed_limit, cost_scale, profiles: new Set(profiles), open, seconds: length / speed_limit * cost_scale };
        this.#lanes.set(lane_id, lane); this.#out.get(from).push(lane);
        this.#fastest = Math.max(this.#fastest, speed_limit / cost_scale);
        const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
        for (const [x, y] of points) { bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x); bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y); }
        this.#world._mutate(() => this.#world.spatial_grid.registerInstance(SPATIAL + lane_id, bounds, freeze({ navigation_lane: lane_id })));
    }
    removeLane(lane_id) {
        const lane = this.#lanes.get(lane_id); if (!lane) return false;
        this.#lanes.delete(lane_id); const out = this.#out.get(lane.from); out.splice(out.indexOf(lane), 1);
        this.#world._mutate(() => this.#world.spatial_grid.removeInstance(SPATIAL + lane_id));
        this.#changed(); return true;
    }
    /** Closed lanes are skipped by routing (roadworks, a crash, a story block). */
    setLaneOpen(lane_id, open) {
        const lane = this.#lanes.get(lane_id); if (!lane) throw new TypeError(`Unknown lane: ${lane_id}`);
        if (lane.open !== !!open) { lane.open = !!open; this.#changed(); }
        return lane_id;
    }
    getLane(lane_id) { const l = this.#lanes.get(lane_id); return l ? { lane_id, from: l.from, to: l.to, points: clone(l.points), length: l.length, speed_limit: l.speed_limit, cost_scale: l.cost_scale, profiles: [...l.profiles], open: l.open } : null; }
    getNode(node_id) { const n = this.#nodes.get(node_id); return n ? clone(n) : null; }
    /** Nearest open lane usable by a profile, through the shared spatial grid. */
    snapToLane(position, { profile = 'car', near_range = 200 } = {}, results = null) {
        const at = vector(position, 'position'); number(near_range, 'near_range', 0);
        this.#stats.snaps++;
        const found = this.#world.spatial_grid.queryRadius(at, near_range, this.#found), hits = [];
        for (const value of found) {
            const lane = value?.navigation_lane !== undefined ? this.#lanes.get(value.navigation_lane) : null;
            if (!lane || !lane.open || !lane.profiles.has(profile)) continue;
            const p = pathGeometry.projectOnPath(lane.points, at);
            if (p.distance <= near_range) hits.push({ lane, along: p.distance_along, position: p.position, distance: p.distance });
        }
        found.length = 0;
        hits.sort((a, b) => a.distance - b.distance || (a.lane.lane_id < b.lane.lane_id ? -1 : 1));
        if (results) { results.length = 0; results.push(...hits); return results; }
        return hits[0] ?? null;
    }
    /**
     * One multi-source, multi-target A*: sources and targets map node ids to the
     * extra seconds of their partial lanes. Stops once no open entry can beat the
     * best complete route. Results are cached until the network changes.
     */
    #search(sources, targets, profile) {
        const key = `${profile}|${[...sources].map(([n, v]) => `${n}:${v.cost.toFixed(4)}`).join(',')}|${[...targets].map(([n, v]) => `${n}:${v.cost.toFixed(4)}`).join(',')}`;
        const cached = this.#cache.get(key);
        if (cached !== undefined) { this.#stats.route_cache_hits++; this.#cache.delete(key); this.#cache.set(key, cached); return cached; }
        this.#stats.route_searches++;
        const fastest = this.#fastest || 1, goals = [...targets.keys()].map(id => this.#nodes.get(id).position);
        const h = id => { const p = this.#nodes.get(id).position; let best = Infinity; for (const q of goals) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1])); return best / fastest; };
        const g = new Map(), via = new Map(), origin = new Map(), closed = new Set(), open = [];
        const push = (cost, node) => { let i = open.length; open.push(null); while (i) { const p = (i - 1) >> 1; if (open[p][0] <= cost) break; open[i] = open[p]; i = p; } open[i] = [cost, node]; };
        const pop = () => {
            const top = open[0], last = open.pop();
            if (open.length) { let i = 0; for (;;) { const l = i * 2 + 1; if (l >= open.length) break; const m = l + 1 < open.length && open[l + 1][0] < open[l][0] ? l + 1 : l; if (open[m][0] >= last[0]) break; open[i] = open[m]; i = m; } open[i] = last; }
            return top;
        };
        for (const [node, { cost }] of sources) if (cost < (g.get(node) ?? Infinity)) { g.set(node, cost); origin.set(node, node); push(cost + h(node), node); }
        let best = null;
        while (open.length) {
            const [f, node] = pop();
            if (best && f >= best.seconds) break;
            if (closed.has(node)) continue; closed.add(node); this.#stats.expanded_nodes++;
            const goal = targets.get(node);
            if (goal) {
                const total = g.get(node) + goal.cost;
                if (!best || total < best.seconds) {
                    const lanes = []; for (let n = node; via.has(n); n = via.get(n).from) lanes.push(via.get(n).lane_id);
                    best = { seconds: total, lanes: lanes.reverse(), source: origin.get(node), target: node };
                }
            }
            for (const lane of this.#out.get(node)) {
                if (!lane.open || !lane.profiles.has(profile) || closed.has(lane.to)) continue;
                const cost = g.get(node) + lane.seconds;
                if (cost >= (g.get(lane.to) ?? Infinity)) continue;
                g.set(lane.to, cost); via.set(lane.to, lane); origin.set(lane.to, origin.get(node)); push(cost + h(lane.to), lane.to);
            }
        }
        if (this.cache_size) { this.#cache.set(key, best); if (this.#cache.size > this.cache_size) this.#cache.delete(this.#cache.keys().next().value); }
        return best;
    }
    /**
     * Fastest lane route between two positions (or node ids). Both ends snap to
     * the nearest usable lanes; the result is a polyline ready for followPath.
     */
    findRoute({ from, to, profile = 'car', near_range = 200, max_candidates = 4 } = {}) {
        this.#stats.route_requests++;
        number(max_candidates, 'max_candidates', 1, 16);
        const ends = (value, start) => {
            if (typeof value === 'string') {
                const node = this.#nodes.get(value); if (!node) throw new TypeError(`Unknown road node: ${value}`);
                return [{ node_id: value, position: node.position }];
            }
            const snaps = this.snapToLane(value, { profile, near_range }, []);
            return snaps.slice(0, max_candidates).map(s => ({ ...s, start }));
        };
        const starts = ends(from, true), goals = ends(to, false);
        if (!starts.length || !goals.length) return null;
        let best = null;
        const consider = (seconds, build) => { if (!best || seconds < best.seconds) best = { seconds, build }; };
        const seconds = (lane, distance) => distance / lane.speed_limit * lane.cost_scale;
        const sources = new Map(), targets = new Map(), keep = (map, node, cost, end) => { if (!map.has(node) || cost < map.get(node).cost) map.set(node, { cost, end }); };
        for (const s of starts) {
            if (s.lane) keep(sources, s.lane.to, seconds(s.lane, s.lane.length - s.along), s); else keep(sources, s.node_id, 0, s);
            for (const t of goals) if (s.lane && t.lane && s.lane === t.lane && s.along <= t.along)
                consider(seconds(s.lane, t.along - s.along), () => ({ lanes: [s.lane.lane_id], points: this.#slice(s.lane, s.along, t.along) }));
        }
        for (const t of goals) { if (t.lane) keep(targets, t.lane.from, seconds(t.lane, t.along), t); else keep(targets, t.node_id, 0, t); }
        const found = this.#search(sources, targets, profile);
        if (found) {
            const s = sources.get(found.source).end, t = targets.get(found.target).end;
            consider(found.seconds, () => {
                const lanes = [], points = [];
                const append = list => { for (const p of list) { const last = points.at(-1); if (!last || last[0] !== p[0] || last[1] !== p[1]) points.push([p[0], p[1]]); } };
                if (s.lane) { lanes.push(s.lane.lane_id); append(this.#slice(s.lane, s.along, s.lane.length)); } else append([s.position]);
                for (const id of found.lanes) { lanes.push(id); append(this.#lanes.get(id).points); }
                if (t.lane) { lanes.push(t.lane.lane_id); append(this.#slice(t.lane, 0, t.along)); } else append([t.position]);
                return { lanes, points };
            });
        }
        if (!best) return null;
        const { lanes, points } = best.build();
        if (points.length < 2) points.push([...points[0]]);
        let length = 0; for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
        return { points, lanes, length, travel_seconds: best.seconds, revision: this.#revision };
    }
    #slice(lane, a, b) {
        const out = [pathGeometry.pointOnPath(lane.points, a).position];
        let walked = 0;
        for (let i = 1; i < lane.points.length; i++) {
            walked += Math.hypot(lane.points[i][0] - lane.points[i - 1][0], lane.points[i][1] - lane.points[i - 1][1]);
            if (walked > a && walked < b) out.push([...lane.points[i]]);
        }
        out.push(pathGeometry.pointOnPath(lane.points, b).position);
        return out;
    }
    getStatistics() { return { ...this.#stats, nodes: this.#nodes.size, lanes: this.#lanes.size, cached_routes: this.#cache.size, revision: this.#revision }; }
    _saveState() {
        const lanes = [...this.#lanes.values()].map(l => ({ lane_id: l.lane_id, from: l.from, to: l.to, points: clone(l.points.slice(1, -1)), speed_limit: l.speed_limit, cost_scale: l.cost_scale, profiles: [...l.profiles], open: l.open }));
        return { nodes: [...this.#nodes.values()].map(n => clone(n)), lanes };
    }
    _loadState(packet) {
        if (!packet) return;
        for (const n of packet.nodes ?? []) this.addNode(n.node_id, n);
        for (const l of packet.lanes ?? []) this.addLane(l.lane_id, { ...l, two_way: false });
    }
    _clear() { this.#nodes.clear(); this.#lanes.clear(); this.#out.clear(); this.#fastest = 0; this.#changed(); }
}
