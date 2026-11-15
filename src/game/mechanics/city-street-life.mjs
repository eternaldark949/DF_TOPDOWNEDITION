import { TrafficManager, PedestrianManager, registerStreetEntityTypes } from '../boot/game-street.mjs';
import { loadRoadNavigation } from '../data/road-navigation.mjs';
import RULES from '../data/game-street-life.json' with { type: 'json' };

const scratch = {};   // (a body's pose read without copying its whole state)

/**
 * The city's traffic and walkers round a focus (the player). Cars come on in a ring past the view on a
 * lane, drive a trip on the city's lane network (Basement navigation) to another lane and go when it ends
 * or when they fall far behind; walkers come on at sidewalk waypoints in a ring of their own and wander the
 * sidewalks and crossings (`PedestrianManager`). A car stood still past `stall_seconds` out of sight
 * goes too, and past `stall_limit` anywhere (cars that lock each other at a crossing would wait for ever). Every junction has lights in two phases, one for the lanes
 * coming in north-south and one for east-west, with an all-stop between: a car's trip stops before each turn
 * through a junction until its phase is green and the junction is clear (one car crosses a junction at a
 * time, so cars turning across each other never lock). The numbers are Directory data (`game-street-life.json`).
 * `new cityStreetLife(world, {navigation, sidewalks, random})` takes the exported city's `navigation` and
 * `sidewalks`; `updateState(seconds, {focus, time})` runs a step.
 */
export class cityStreetLife {
    #world; #rules; #random; #spawnable = []; #junctions = new Map(); #turns = new Map(); #routes = new Map(); #walkable = []; #signals = new Map(); #trips = 0; #still = new Map();
    constructor(world, { navigation, sidewalks, intersections = [], rules = RULES, random = Math.random }) {
        this.#world = world; this.#rules = rules; this.#random = random; registerStreetEntityTypes(world);
        this.traffic = new TrafficManager(world); this.pedestrians = new PedestrianManager(world, { random });
        const roads = world.navigation.roads, first = navigation.lanes[0]?.lane_id;
        if (first && !roads.getLane(first)) loadRoadNavigation(roads, navigation);   // (the world outlives the level: its roads are loaded once)
        const at = new Map(navigation.nodes.map(n => [n.node_id, n.position])), group = junctionGroups(intersections, rules.junction_gap);
        for (const lane of navigation.lanes) {
            const a = at.get(lane.from), b = at.get(lane.to);
            if (lane.turn) {
                const junction = lane.lane_id.split(':')[0], into = lane.from.replace(/:out$/, ''), start = at.get(`${into}:in`) ?? a;
                const axis = Math.abs(a[0] - start[0]) > Math.abs(a[1] - start[1]) ? 'ew' : 'ns';
                this.#turns.set(lane.lane_id, { signal_id: `${junction}:${axis}`, conflict_id: group.get(junction) ?? junction, position: a, end: b });
                if (!this.#junctions.has(junction)) this.#junctions.set(junction, this.#junctions.size);
            } else if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 200) this.#spawnable.push({ lane_id: lane.lane_id, middle: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
        }
        this.pedestrians.setNetwork({ nodes: sidewalks.map(n => ({ id: n.id, position: [n.x, n.y], connections: n.connections, crosswalk_id: n.crossing === undefined ? null : `crossing:${n.crossing}` })) });
        this.#walkable = sidewalks;
    }
    /** The lights' state at `time` (seconds): each junction's phases, its own offset so the city does not change at once. */
    #lights(time) {
        const { signal_go: go, signal_clear: clear } = this.#rules, cycle = 2 * (go + clear);
        for (const [junction, index] of this.#junctions) {
            const t = (time + index * 3.7) % cycle;
            for (const [axis, state] of [['ns', t < go ? 'go' : 'stop'], ['ew', t >= go + clear && t < 2 * go + clear ? 'go' : 'stop']]) {
                const id = `${junction}:${axis}`; if (this.#signals.get(id) !== state) { this.#signals.set(id, state); this.#world.traffic.setSignal(id, state); }
            }
        }
    }
    #ring(list, at, [near, far], position) {
        const picks = [];
        for (const item of list) { const d = Math.hypot(position(item)[0] - at[0], position(item)[1] - at[1]); if (d >= near && d <= far) picks.push(item); }
        return picks.length ? picks[Math.floor(this.#random() * picks.length)] : null;
    }
    /** A trip from a lane in the ring round `focus` to one a trip's length away, as a registered route with its stops; or null. */
    #trip(focus) {
        const from = this.#ring(this.#spawnable, focus, this.#rules.car_ring, s => s.middle); if (!from) return null;
        const to = this.#ring(this.#spawnable, from.middle, this.#rules.trip, s => s.middle); if (!to) return null;
        const route = this.#world.navigation.findRoute({ from: from.middle, to: to.middle, near_range: 60 }); if (!route || route.points.length < 2) return null;
        const points = route.points.filter((p, i, all) => !i || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-3); if (points.length < 2) return null;
        const along = [0]; for (let i = 1; i < points.length; i++) along.push(along[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
        // One stop before each crossing: its phase's light and the crossing itself, held until the car is clear of
        // it; junctions close together are one crossing, so a car never waits inside one for the next.
        const nearest = q => { let best = 0, bd = Infinity; points.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = i; } }); return along[best]; };
        const stops = []; let open = null;
        for (const lane_id of route.lanes.slice(1)) {
            const turn = this.#turns.get(lane_id); if (!turn) continue;
            const clear = nearest(turn.end) + this.#rules.junction_clearance;
            if (open?.conflict_id === turn.conflict_id) { open.clearance_distance = clear - open.distance; continue; }
            const distance = nearest(turn.position) - this.#rules.stop_before_turn;
            if (distance > 0) stops.push(open = { distance, signal_id: turn.signal_id, conflict_id: turn.conflict_id, clearance_distance: clear - distance }); else open = null;
        }
        const route_id = `city_trip:${++this.#trips}`; this.#world.traffic.registerRoute(route_id, { points, stops }); return route_id;
    }
    updateState(seconds, { focus, time }) {
        const R = this.#rules, far = e => { const [x, y] = e.getRenderState(1, scratch).position; return Math.hypot(x - focus[0], y - focus[1]) > R.despawn; };
        this.#lights(time);
        this.traffic.updateState();
        // A car gone far behind leaves; so does one stood still past the stall time out of sight (two cars that
        // lock at a crossing would wait for ever), and in sight past the stall limit: it comes on again elsewhere.
        for (const car of this.traffic.getAmbientVehicles()) {
            if (car.data.control_mode !== 'AI') continue;
            const still = Math.abs(car.getSpeed()) < 5 ? (this.#still.get(car) ?? 0) + seconds : 0; this.#still.set(car, still);
            const [x, y] = car.getRenderState(1, scratch).position, d = Math.hypot(x - focus[0], y - focus[1]);
            if (d > R.despawn || still > R.stall_seconds && d > R.view_reach || still > R.stall_limit) { this.#still.delete(car); car.destroy(); }
        }
        for (const [car, route_id] of this.#routes) if (car.destroyed && this.#world.traffic.releaseRoute(route_id)) { this.#routes.delete(car); this.#still.delete(car); }
        for (let i = 0; i < R.spawn_tries && this.traffic.getAmbientVehicles().length < R.cars; i++) {
            const route_id = this.#trip(focus); if (!route_id) continue;
            const car = this.traffic.spawn({ route_id });
            if (car) this.#routes.set(car, route_id); else this.#world.traffic.releaseRoute(route_id);
        }
        for (const walker of this.pedestrians.getPedestrians()) if (far(walker)) walker.destroy();
        for (let i = 0; i < R.spawn_tries && this.pedestrians.getPedestrians().length < R.pedestrians; i++) {
            const node = this.#ring(this.#walkable, focus, R.walker_ring, n => [n.x, n.y]); if (node) this.pedestrians.spawnAtNode(node.id);
        }
        this.pedestrians.updateState(seconds);
    }
    /** Takes every car and walker off the street. */
    clearStreet() { this.traffic.clearStreet(); this.pedestrians.clearStreet(); for (const [car, route_id] of this.#routes) if (car.destroyed) this.#world.traffic.releaseRoute(route_id); this.#routes.clear(); }
}

/** Each junction's crossing: junctions whose boxes come within `gap` of each other are one, named by the first. */
function junctionGroups(intersections, gap) {
    const parent = new Map(intersections.map(i => [i.id, i.id])), root = id => { while (parent.get(id) !== id) id = parent.get(id); return id; };
    for (let i = 0; i < intersections.length; i++) for (let j = i + 1; j < intersections.length; j++) {
        const a = intersections[i], b = intersections[j], dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
        if (Math.hypot(dx, dy) <= gap) parent.set(root(b.id), root(a.id));
    }
    return new Map(intersections.map(i => [i.id, root(i.id)]));
}

