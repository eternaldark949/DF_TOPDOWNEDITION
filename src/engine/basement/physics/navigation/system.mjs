// ===== LV0 BASEMENT =====
import { number, vector, clone } from '../core/values.mjs';
import { collisionShape, shapeReach } from '../collision/shape.mjs';
import { referenceBody, referencePosition } from '../spatial/queries.mjs';
import { characterMotor } from '../motors/character.mjs';
import { vehicleMotor } from '../motors/vehicle.mjs';
import { navigationField } from './field.mjs';
import { fieldPlanner } from './planner.mjs';
import { roadNetwork } from './road-network.mjs';

const DEFAULT_PROFILES = { walker: { layer: 'field' }, car: { layer: 'road', near_range: 200 } };

/**
 * World navigation: one request API for travelling from A to B.
 *
 *  - `field` layer: open space around static scenery and props, for people,
 *    animals, drones and off-road vehicles of any radius.
 *  - `road` layer: an authored lane graph for cars and other lane-bound users.
 *
 * Navigation plans routes; the existing motors move bodies along them. It never
 * writes positions. Field obstacles come from the world's one spatial grid.
 */
export class navigationSystem {
    #world; #field; #planner; #profiles = new Map(); #memo = new Map();
    #stats = { path_requests: 0, path_reuses: 0, path_memo_hits: 0, goal_repairs: 0, navigate_requests: 0 };
    constructor(world, { field, memo_size = 256 } = {}) {
        if (!world || typeof world._mutate !== 'function') throw new TypeError('Navigation requires its physicsSystem owner');
        if (world.navigation) throw new Error('The world already owns its navigation system');
        this.#world = world;
        this.memo_size = number(memo_size, 'memo_size', 0, 1e5);
        Object.defineProperty(this, 'roads', { value: new roadNetwork(world), enumerable: true });
        this.#install(field);
        for (const [name, profile] of Object.entries(DEFAULT_PROFILES)) this.registerProfile(name, profile);
    }
    #install(options = {}) { this.#field = new navigationField(this.#world, options); this.#planner = new fieldPlanner(this.#field); this.#memo.clear(); }
    get field() { return this.#field; }
    /** Replace walkable-space settings. Cached chunks are discarded and rebuilt on demand. */
    configureField(options = {}) { this.#install({ ...this.#field.getConfig(), ...options }); return this.#field.getConfig(); }
    registerProfile(name, { layer, near_range = 200, radius } = {}) {
        if (typeof name !== 'string' || !name) throw new TypeError('Profile name must be a nonempty string');
        if (!['field', 'road'].includes(layer)) throw new TypeError("Profile layer must be 'field' or 'road'");
        number(near_range, 'near_range', 0); if (radius !== undefined) number(radius, 'radius', 0);
        this.#profiles.set(name, Object.freeze({ name, layer, near_range, radius })); return name;
    }
    getProfile(name) { const p = this.#profiles.get(name); if (!p) throw new TypeError(`Unknown navigation profile: ${name}`); return { ...p }; }
    /** Agent radius for field planning: circle radius, else the shape's reach. */
    agentRadius(body_or_shape) {
        const b = referenceBody(body_or_shape), shape = b?.body_id ? this.#world._record(b).shape : new collisionShape(body_or_shape);
        const p = shape.packet;
        if (p.shape_type === 'circle') return p.radius + Math.hypot(p.local_position[0], p.local_position[1]);
        return shapeReach(shape);
    }
    #valid(result) {
        for (const [key, revision] of result.dependencies) if (this.#field.chunkRevision(key) !== revision) return false;
        return true;
    }
    /**
     * Field path for a body or shape. `reuse` takes a previous result and returns
     * it unchanged (flagged `reused`) when its goal, radius and chunk revisions
     * still hold, or with only its last leg repaired when the goal moved slightly.
     */
    findPath(packet = {}) {
        this.#stats.path_requests++;
        const world = this.#world, from = referencePosition(world, packet.from ?? packet.body), to = vector(packet.to, 'to');
        const cell = this.#field.cell_size;
        const radius = packet.radius !== undefined ? number(packet.radius, 'radius', 0)
            : packet.collision_shape ? this.agentRadius(packet.collision_shape) : packet.body ? this.agentRadius(packet.body) : 1;
        if (radius > this.#field.max_clearance - cell) throw new RangeError(`Agent radius ${radius} exceeds the field's max_clearance; call navigation.configureField({max_clearance})`);
        const allow_partial = !!packet.allow_partial;
        const prior = packet.reuse;
        if (prior?.dependencies && prior.radius === radius && prior.allow_partial === allow_partial && this.#valid(prior)) {
            const goal = prior.goal, moved = Math.hypot(goal[0] - to[0], goal[1] - to[1]);
            if (moved <= 1e-9) { this.#stats.path_reuses++; prior.reused = true; return prior; }
            const tail = prior.points.at(-2);
            if (moved <= cell * 2 && !prior.partial && tail && this.#planner.segmentClear(tail, to, radius) && this.#field.exactSegmentClearance(to, to, radius + 1) >= radius) {
                this.#stats.goal_repairs++;
                const points = [...prior.points.slice(0, -1), [...to]];
                return Object.assign(prior, { points, goal: [...to], reused: true, length: prior.length - Math.hypot(goal[0] - tail[0], goal[1] - tail[1]) + Math.hypot(to[0] - tail[0], to[1] - tail[1]) });
            }
        }
        const key = this.memo_size ? `${this.#field.cellOf(from[0])},${this.#field.cellOf(from[1])}|${to[0]},${to[1]}|${radius}|${allow_partial}|${packet.max_nodes ?? ''}|${packet.search_margin ?? ''}|${packet.heuristic_weight ?? ''}` : null;
        if (key) {
            const memo = this.#memo.get(key);
            // A memo starts elsewhere in this cell, so its first leg is rechecked from here.
            if (memo && this.#valid(memo) && (memo.points.length < 2 || this.#planner.segmentClear(from, memo.points[1], radius))) {
                this.#stats.path_memo_hits++; this.#memo.delete(key); this.#memo.set(key, memo);
                return this.#copy(memo, from);
            }
        }
        const result = this.#planner.plan({ from, to, radius, max_nodes: packet.max_nodes, search_margin: packet.search_margin, allow_partial, smooth: packet.smooth !== false, heuristic_weight: packet.heuristic_weight });
        if (!result) return null;
        Object.assign(result, { goal: [...to], radius, allow_partial, reused: false });
        if (key) { this.#memo.set(key, result); if (this.#memo.size > this.memo_size) this.#memo.delete(this.#memo.keys().next().value); }
        return this.#copy(result, from);
    }
    /** Memoized results are shared per start cell; each caller gets its own copy starting where it stands. */
    #copy(result, from) {
        const points = result.points.map(p => [p[0], p[1]]); points[0] = [from[0], from[1]];
        return { ...result, points, dependencies: result.dependencies, goal: [...result.goal], reused: false };
    }
    /** Fastest lane route; see roadNetwork.findRoute. */
    findRoute(packet = {}) {
        const profile = this.getProfile(packet.profile ?? 'car');
        if (profile.layer !== 'road') throw new TypeError(`Profile ${profile.name} does not use the road layer`);
        const from = typeof packet.from === 'string' ? packet.from : referencePosition(this.#world, packet.from ?? packet.body);
        return this.roads.findRoute({ ...packet, from, profile: profile.name, near_range: packet.near_range ?? profile.near_range });
    }
    /**
     * Send a body to a destination. Characters walk the field through their own
     * motor; vehicles follow a lane route (or a field path with a field profile).
     */
    navigate(body, to, { profile, ...options } = {}) {
        this.#stats.navigate_requests++;
        const world = this.#world, b = referenceBody(body), r = world._record(b), motor = r.motor;
        if (!(motor instanceof characterMotor) && !(motor instanceof vehicleMotor)) throw new TypeError('navigate requires a character or vehicle motor');
        const chosen = this.getProfile(profile ?? (motor instanceof vehicleMotor ? 'car' : 'walker'));
        const target = Array.isArray(to) ? vector(to, 'to') : to;
        if (chosen.layer === 'road') {
            if (!(motor instanceof vehicleMotor)) throw new TypeError('Road profiles require a vehicle motor');
            const route = this.findRoute({ ...options, body: b, to: target, profile: chosen.name });
            if (!route) { world._emit('movementBlocked', { body: b, reason: 'no_route' }); return null; }
            motor.followPath(route.points, { speed: options.speed, arrival_distance: options.arrival_distance, following_distance: options.following_distance });
            return { layer: 'road', ...route };
        }
        const destination = Array.isArray(target) ? target : referencePosition(world, target);
        if (motor instanceof characterMotor) {
            const path = this.findPath({ ...options, body: b, to: destination, radius: options.radius ?? chosen.radius });
            if (!path) { world._emit('movementBlocked', { body: b, reason: 'no_path' }); return null; }
            motor.moveTo(destination, options);
            return { layer: 'field', ...path };
        }
        const path = this.findPath({ ...options, body: b, to: destination, radius: options.radius ?? chosen.radius });
        if (!path) { world._emit('movementBlocked', { body: b, reason: 'no_path' }); return null; }
        motor.followPath(path.points, { speed: options.speed, arrival_distance: options.arrival_distance });
        return { layer: 'field', ...path };
    }
    /** Mark a region's walkable space for rebuild (e.g. after changing authored blockers). */
    invalidateRegion(bounds) { this.#field.invalidateRegion(bounds); }
    getStatistics() { return { ...this.#stats, field: this.#field.getStatistics(), planner: this.#planner.getStatistics(), roads: this.roads.getStatistics(), memo: this.#memo.size }; }
    _bodySynced(r) { this.#field._bodySynced(r); }
    _bodyRemoved(r) { this.#field._bodyRemoved(r); }
    _clear() { this.#field._clear(); this.#memo.clear(); this.roads._clear(); }
    _saveState() { return { field: this.#field.getConfig(), roads: this.roads._saveState(), profiles: [...this.#profiles.values()].map(p => clone(p)) }; }
    _loadState(packet) {
        if (!packet) return;
        if (packet.field) this.#install(packet.field);
        for (const p of packet.profiles ?? []) this.registerProfile(p.name, p);
        this.roads._loadState(packet.roads);
    }
}
