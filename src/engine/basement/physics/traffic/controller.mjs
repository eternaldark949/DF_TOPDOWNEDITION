// ===== LV0 BASEMENT =====
import { massProperties } from '../core/mass.mjs';
import { number, vector, clone, freeze, sub, dot, length, scale, clamp } from '../core/values.mjs';
import { referenceBody } from '../spatial/queries.mjs';
import { vehicleMotor } from '../motors/vehicle.mjs';

/** Route topology and reservations are scheduling data. Geometry queries use the world's index. */
export class trafficController {
    #routes = new Map(); #drivers = new Map(); #signals = new Map(); #reservations = new Map();
    constructor(world) {
        if (!world || typeof world._mutate !== 'function') throw new TypeError('Controller requires its physicsSystem owner');
        if (world.traffic) throw new Error('The world already owns its traffic controller');
        Object.defineProperty(this, 'world', { value: world }); Object.freeze(this);
    }
    registerRoute(route_id, packet) {
        if (typeof route_id !== 'string' || !route_id || this.#routes.has(route_id)) throw new TypeError('Route id must be unique');
        const points = packet.points?.map(p => vector(p));
        if (!points || points.length < 2 || points.length > 4096) throw new TypeError('Route needs two or more points');
        const segments = [], distances = [0];
        for (let i = 1; i < points.length; i++) {
            const delta = sub(points[i], points[i - 1]), distance = length(delta);
            if (distance <= 1e-7) throw new TypeError('Route has a zero-length segment');
            segments.push({ from: points[i - 1], direction: scale(delta, 1 / distance), length: distance, start: distances.at(-1) });
            distances.push(distances.at(-1) + distance);
        }
        const route_length = distances.at(-1);
        if (packet.loop && length(sub(points[0], points.at(-1))) > 1e-7) throw new TypeError('Loop route must be closed');
        const stops = clone(packet.stops ?? []);
        for (const stop of stops) {
            number(stop.distance, 'stop distance', 0, route_length);
            number(stop.clearance_distance ??= 20, 'clearance_distance', 0);
            if (!stop.signal_id && !stop.conflict_id) throw new TypeError('Stop needs a signal_id or conflict_id');
            for (const key of ['signal_id', 'conflict_id']) if (stop[key] !== undefined && (typeof stop[key] !== 'string' || !stop[key])) throw new TypeError(`Invalid ${key}`);
        }
        stops.sort((a, b) => a.distance - b.distance);
        const config = freeze({ points, stops, speed_limit: number(packet.speed_limit ?? 180, 'speed_limit', 0), loop: !!packet.loop });
        this.#routes.set(route_id, { config, segments, length: route_length }); return route_id;
    }
    getSignal(signal_id) { return this.#signals.get(signal_id) ?? 'stop'; }
    getRouteStart(route_id) {
        const route = this.#routes.get(route_id); if (!route) throw new TypeError('Unknown route');
        const first = route.segments[0]; return { position: [...first.from], rotation: Math.atan2(first.direction[1], first.direction[0]) };
    }
    addVehicle(vehicle, packet) {
        const body = referenceBody(vehicle), r = this.world._record(body);
        if (!(r.motor instanceof vehicleMotor)) throw new TypeError('Traffic requires a vehicle motor');
        const route = this.#routes.get(packet.route_id); if (!route) throw new TypeError('Unknown route');
        const config = freeze({ route_id: packet.route_id, following_distance: number(packet.following_distance ?? 8, 'following_distance', 0),
            prediction_seconds: number(packet.prediction_seconds ?? 2, 'prediction_seconds', 0, 10),
            arrival_distance: number(packet.arrival_distance ?? 3, 'arrival_distance', 0) });
        this.world._mutate(() => {
            this.removeVehicle(body); this.#drivers.set(body.body_id, { body, config, segment: 0, progress: 0, speed_cap: route.config.speed_limit, stop_index: 0, finished: false, suspended: false });
            r.motor.path_controller.path = clone(route.config.points); r.motor.path_controller.index = 1;
            r.motor.path_controller.options = { speed: route.config.speed_limit, following_distance: config.following_distance, arrival_distance: config.arrival_distance };
            r.sleeping = false;
        }); return body;
    }
    requestPassingRoute(vehicle, { route_id, reservation_id = `passing:${route_id}`, ...options }) {
        const body = referenceBody(vehicle), r = this.world._record(body), route = this.#routes.get(route_id);
        if (!(r.motor instanceof vehicleMotor) || !route) throw new TypeError('Passing requires a vehicle and registered alternative route');
        if (typeof reservation_id !== 'string' || !reservation_id) throw new TypeError('Invalid passing reservation id');
        const clear = () => {
            const owner = this.#reservations.get(reservation_id);
            if (owner !== undefined && owner !== r.id) return false;
            let at = r.position, rotation = r.rotation;
            // An authored alternative includes its merge and remaining itinerary. The
            // engine verifies each segment; the caller never tests cars or geometry.
            for (let i = 1; i < route.config.points.length; i++) {
                const to = route.config.points[i], delta = sub(to, at), next_rotation = Math.atan2(delta[1], delta[0]);
                if (!this.world.getPathClearance({ body, from: at, to, from_rotation: rotation, to_rotation: next_rotation, include_ghosts: false }).clear) return false;
                at = to; rotation = next_rotation;
            }
            return true;
        };
        if (!clear()) return false;
        // Validate driver configuration before queuing any mutation.
        number(options.following_distance ?? 8, 'following_distance', 0);
        number(options.prediction_seconds ?? 2, 'prediction_seconds', 0, 10);
        number(options.arrival_distance ?? 3, 'arrival_distance', 0);
        this.world._mutate(() => {
            if (!this.world.fetchBody(r.id)) return;
            if (!clear()) { this.world._emit('passingRouteBlocked', { body, route_id }); return; }
            this.addVehicle(body, { route_id, ...options }); this.#reservations.set(reservation_id, r.id);
            this.world._emit('passingRouteAccepted', { body, route_id });
        }); return true;
    }
    removeVehicle(vehicle) {
        const id = typeof vehicle === 'number' ? vehicle : this.world._record(referenceBody(vehicle)).id;
        this.#drivers.delete(id);
        for (const [key, owner] of this.#reservations) if (owner === id) this.#reservations.delete(key);
    }
    setSignal(signal_id, state) {
        if (typeof signal_id !== 'string' || !signal_id || !['stop', 'go'].includes(state)) throw new TypeError('Signal requires an id and stop/go state');
        this.world._mutate(() => this.#signals.set(signal_id, state));
    }
    getSpeedCap(body) { return this.#drivers.get(this.world._record(referenceBody(body)).id)?.speed_cap ?? Infinity; }
    getState(vehicle) {
        const d = this.#drivers.get(this.world._record(referenceBody(vehicle)).id);
        return d ? { ...clone(d.config), progress: d.progress, speed_cap: d.speed_cap, finished: d.finished, suspended: !!d.suspended, body_id: d.body.body_id } : null;
    }
    _update() {
        // Stable order makes an unreserved crossing deterministic. No pairwise driver scan.
        for (const [id, d] of this.#drivers) {
            if (!this.world.fetchBody(id)) { this.removeVehicle(id); continue; }
            const r = this.world._record(d.body), route = this.#routes.get(d.config.route_id);
            if (r.parent_mount) {
                if (!d.suspended) for (const [key, owner] of this.#reservations) if (owner === id) this.#reservations.delete(key);
                d.suspended = true; d.speed_cap = 0; continue;
            }
            d.suspended = false;
            if (!r.config.active) { this.removeVehicle(id); continue; }
            if (d.finished) continue;
            // Track adjacent route segments; do not search every road or every car.
            let s = route.segments[d.segment];
            while (d.segment < route.segments.length - 1 && dot(sub(r.position, s.from), s.direction) >= s.length) s = route.segments[++d.segment];
            d.progress = s.start + clamp(dot(sub(r.position, s.from), s.direction), 0, s.length);
            d.speed_cap = route.config.speed_limit;
            const motor = r.motor, speed = Math.max(0, motor.getSpeed()), braking = motor.config.braking * r.config.mass / massProperties(r).mass;
            for (; d.stop_index < route.config.stops.length; d.stop_index++) {
                const stop = route.config.stops[d.stop_index], remaining = stop.distance - d.progress;
                if (remaining < -stop.clearance_distance) {
                    if (this.#reservations.get(stop.conflict_id) === id) this.#reservations.delete(stop.conflict_id);
                    continue;
                }
                // Once over the line, finish clearing the crossing even if the signal changes.
                if (remaining < 0) break;
                const horizon = speed * speed / (2 * braking) + motor.config.wheel_base + d.config.following_distance;
                const signal_ok = !stop.signal_id || this.#signals.get(stop.signal_id) === 'go';
                const owner = this.#reservations.get(stop.conflict_id);
                let admitted = signal_ok && (!stop.conflict_id || owner === undefined || owner === id);
                if (admitted && stop.conflict_id && remaining <= horizon) this.#reservations.set(stop.conflict_id, id);
                if (!admitted) d.speed_cap = Math.min(d.speed_cap, Math.sqrt(2 * braking * Math.max(0, remaining - motor.config.wheel_base / 2 - d.config.following_distance)));
                break;
            }
            // Predict moving bodies found through the shared spatial grid. Static forward clearance
            // is handled by pathMotor, with the same masks and physical shapes.
            const horizon = d.config.prediction_seconds;
            const radius = motor.config.max_speed * horizon + motor.config.wheel_base * 2;
            for (const hit of this.world.peruseNearbyEntities(d.body, { near_range: radius, query_body: d.body, include_ghosts: false })) {
                const other = this.world._record(hit.body);
                if (other.config.physics_type === 'static') continue;
                const relative = sub(other.position, r.position), ahead = dot(relative, [Math.cos(r.rotation), Math.sin(r.rotation)]);
                if (ahead < 0) continue;
                const contact = this.world.predictCollision({ body_a: d.body, body_b: hit.body, seconds: horizon });
                if (!contact) continue;
                const distance = Math.max(0, speed * contact.seconds - d.config.following_distance);
                d.speed_cap = Math.min(d.speed_cap, Math.sqrt(2 * braking * distance));
            }
            if (!motor.path_controller.path) {
                if (route.config.loop) {
                    // A loop must be authored closed; teleporting between endpoints is never implied.
                    if (length(sub(route.config.points[0], route.config.points.at(-1))) > d.config.arrival_distance) throw new Error('Loop route must be closed');
                    for (const [key, owner] of this.#reservations) if (owner === id) this.#reservations.delete(key);
                    d.segment = d.stop_index = 0; d.progress = 0;
                    motor.path_controller.path = clone(route.config.points); motor.path_controller.index = 1;
                } else { d.finished = true; d.speed_cap = 0; this.removeVehicle(id); this.world._emit('trafficRouteCompleted', { body: d.body, route_id: d.config.route_id }); }
            }
        }
    }
    _clear() { this.#drivers.clear(); this.#reservations.clear(); this.#routes.clear(); this.#signals.clear(); }
    _saveState() { return { routes: [...this.#routes].map(([id, r]) => [id, clone(r.config)]), signals: [...this.#signals], reservations: [...this.#reservations], drivers: [...this.#drivers].map(([id, d]) => [id, { ...clone(d), body: undefined }]) }; }
    _loadState(packet) {
        if (!packet) return;
        for (const [id, cfg] of packet.routes) this.registerRoute(id, cfg);
        for (const [id, state] of packet.signals) this.setSignal(id, state);
        for (const [id, d] of packet.drivers) {
            const r = this.world._record(id);
            if (!(r.motor instanceof vehicleMotor) || !this.#routes.has(d.config.route_id)) throw new TypeError('Invalid saved traffic driver');
            number(d.segment, 'segment', 0, this.#routes.get(d.config.route_id).segments.length - 1);
            number(d.progress, 'progress', 0); number(d.speed_cap, 'speed_cap', 0); number(d.stop_index, 'stop_index', 0);
            if (![d.segment, d.stop_index].every(Number.isInteger)) throw new TypeError('Invalid traffic cursor');
            this.#drivers.set(id, { ...clone(d), body: r.handle });
        }
        for (const [key, id] of packet.reservations) { if (!this.#drivers.has(id)) throw new TypeError('Reservation has no driver'); this.#reservations.set(key, id); }
    }
}
