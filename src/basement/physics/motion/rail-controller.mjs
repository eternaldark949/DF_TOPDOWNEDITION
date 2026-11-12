import { clone, number, angleDelta } from '../core/values.mjs';
import { referenceBody } from '../spatial/queries.mjs';
import { railGeometry } from './rail-geometry.mjs';

/**
 * Bodies that ride fixed lines: a lane, a curve through a junction, a track. A RIDER's place is the rail it is on and
 * how far along; its speed follows pedals toward the slowest of its limits. Its pose is read off the rail and handed
 * to the ordinary step as a velocity, so contacts, mounts and interpolation see a normal moving body.
 *
 * The engine owns the motion. The game owns the policy: it registers the rails, says which rail comes next, and sets
 * each rider's limits (a speed cap, a place to stop) from its own rules: lights, junction access, right of way.
 *
 * Every number that shapes the motion is a PROFILE field, in world units, seconds and radians:
 *
 *   top_speed, acceleration, braking     the vehicle: its fastest (flat out; it cruises a little under), how hard it pulls, how hard it stops
 *   body_length                          bumper to bumper, for the gap to the rider ahead
 *   min_gap                              the gap it keeps behind a stopped leader
 *   reaction_seconds                     following: the distance covered in this long is kept out of the room to stop
 *   follow_brake_share, match_share      following: the share of its braking it plans on; of a leader's speed it matches
 *   look_base, look_seconds              how far ahead it looks for a leader: base + length + stopping distance + speed × seconds
 *   stop_brake_share, stop_tolerance     stopping at a line: the share of its braking it plans on; how near counts as there
 *   pedal_urgency                        0..1: how hard it works the pedals toward a new speed
 *   pedal_speed_band                     a difference in speed past this is chased hard; inside it, eased
 *   pedal_brake_onset, pedal_creep_onset the overspeed that puts it on the brake at speed, and near a stop
 *   pedal_min_brake                      the lightest brake it uses once braking
 *   pedal_brake_seconds                  braking: the pedal that would shed the overspeed in this long
 *   pedal_gain_up, pedal_gain_down, pedal_gain_hold   pedal per unit of speed difference: speeding up, slowing, holding
 *   reverse_floor                        below this speed an opposite pedal drives rather than brakes
 *   rest_speed                           slower than this is stopped
 *   bend_lateral_acceleration            the sideways pull it accepts through a bend (0: bends don't slow it)
 *   bend_min_speed, bend_look_base, bend_look_seconds   the slowest a bend makes it; how far ahead it reads the bend
 *   slide_per_acceleration               the slide through a bend: sideways speed per unit of sideways pull (speed² × bend)
 *   slide_max, slide_ease_rate           the most it slides; how fast the slide builds and fades (per second)
 *   slip_max, slip_floor_speed           the most the nose turns in (as a sine); the speed below which it stops growing
 *   join_ease_rate                       joining off the line: how fast the offset and heading error ease away (per second)
 */
const PROFILE = Object.freeze({
    top_speed: 300, acceleration: 600, braking: 1000, body_length: 40, min_gap: 20,
    reaction_seconds: 4 / 60, follow_brake_share: 0.85, match_share: 0.85,
    look_base: 60, look_seconds: 8 / 60, stop_brake_share: 0.8, stop_tolerance: 2,
    pedal_urgency: 0.6, pedal_speed_band: 30, pedal_brake_onset: 18, pedal_creep_onset: 3, pedal_min_brake: 0.12,
    pedal_brake_seconds: 2 / 60, pedal_gain_up: 0.5 / 60, pedal_gain_down: 0.4 / 60, pedal_gain_hold: 0.2 / 60,
    reverse_floor: 15, rest_speed: 0.03,
    bend_lateral_acceleration: 0, bend_min_speed: 150, bend_look_base: 60, bend_look_seconds: 22 / 60,
    slide_per_acceleration: 0, slide_max: 156, slide_ease_rate: 13.39, slip_max: 0.7, slip_floor_speed: 30,
    join_ease_rate: 6.32,
});
const POSITIVE = new Set(['top_speed', 'acceleration', 'braking', 'body_length', 'pedal_brake_seconds', 'slip_floor_speed']);
const MAX_HOPS = 24, LEADER_HOPS = 6, DISPLACED = 1e-6;

export class railController {
    #rails = new Map(); #riders = new Map(); #order = new Map(); #orderValid = false;
    #point = { x: 0, y: 0, rotation: 0, curvature: 0 };
    constructor(world) {
        if (!world || typeof world._mutate !== 'function') throw new TypeError('Controller requires its physicsSystem owner');
        if (world.rails) throw new Error('The world already owns its rail controller');
        Object.defineProperty(this, 'world', { value: world }); Object.freeze(this);
    }

    // ===== RAILS =====

    /** A rail from its points (and their headings, for an authored curve). `next_rail_id` is where it leads by default,
     *  entered `next_distance` along that rail. */
    registerRail(rail_id, { points, rotations, next_rail_id = null, next_distance = 0 } = {}) {
        this.#name(rail_id);
        if (this.#rails.has(rail_id)) throw new Error(`Rail already registered: ${rail_id}`);
        const table = railGeometry.sampleRail({ points, rotations });
        const rail = { rail_id, table, points: clone(points), rotations: rotations ? [...rotations] : null, next_rail_id: null, next_distance: 0 };
        this.#link(rail, next_rail_id, next_distance);
        this.world._mutate(() => { this.#rails.set(rail_id, rail); this.#orderValid = false; });
        return this;
    }
    setNextRail(rail_id, next_rail_id = null, next_distance = 0) {
        const rail = this.#rail(rail_id), link = this.#link({}, next_rail_id, next_distance);
        this.world._mutate(() => Object.assign(rail, link));
        return this;
    }
    removeRail(rail_id) {
        this.#rail(rail_id);
        for (const rider of this.#riders.values()) if (rider.rail_id === rail_id) throw new Error(`Rail still has riders: ${rail_id}`);
        this.world._mutate(() => { this.#rails.delete(rail_id); this.#orderValid = false; });
        return this;
    }
    getRail(rail_id) { const rail = this.#rail(rail_id); return { rail_id, length: rail.table.length, next_rail_id: rail.next_rail_id, next_distance: rail.next_distance }; }
    listRails() { return [...this.#rails.keys()]; }
    /** Where `distance` along a rail is: { position, rotation, curvature }. */
    getRailPoint(rail_id, distance) {
        const point = railGeometry.pointOnRail(this.#rail(rail_id).table, number(distance, 'distance'), {});
        return { position: [point.x, point.y], rotation: point.rotation, curvature: point.curvature };
    }

    // ===== RIDERS =====

    /**
     * Put a body on a rail. Left out, `distance` is the nearest point of the rail to where the body stands, and
     * whatever it is off the line (sideways, and in heading) eases away instead of snapping. `speed` defaults to its
     * speed along the rail now.
     */
    rideRail(body, { rail_id, distance, speed, profile = {} } = {}) {
        const record = this.#body(body), rail = this.#rail(rail_id), table = rail.table;
        const settings = this.#profile(profile);
        const joined = railGeometry.projectOnRail(table, record.position, {});
        const along = distance === undefined ? joined.distance : number(distance, 'distance', 0, table.length);
        const rider = { body_id: record.id, record, rail_id, distance: along, slide: 0, profile: settings,
            speed_cap: null, stop_distance: null, next_rail_id: null, next_distance: 0,
            join_lateral: 0, join_rotation: 0, pose: null, ended: false,
            leader_id: null, gap: null, target_speed: settings.top_speed };
        const heading = railGeometry.pointOnRail(table, along, {}).rotation;
        if (distance === undefined) { rider.join_lateral = joined.lateral; rider.join_rotation = angleDelta(heading, record.rotation); }
        const along_speed = record.velocity[0] * Math.cos(heading) + record.velocity[1] * Math.sin(heading);
        rider.speed = Math.max(0, speed === undefined ? along_speed : number(speed, 'speed', 0));
        this.world._mutate(() => {
            if (!this.world.fetchBody(record.id)) return;
            this.#riders.set(record.id, rider); this.#orderValid = false;
            record.sleeping = false; record.sleep_time = 0;
            this.#place(rider, 0);
        });
        return record.handle;
    }
    /** Off the rail: the body keeps the velocity it has and answers to its own motor again. */
    leaveRail(body) {
        const record = this.world._record(referenceBody(body));
        this.world._mutate(() => { if (this.#riders.delete(record.id)) this.#orderValid = false; });
        return record.handle;
    }
    isRiding(body) { return this.#riders.has(this.world._record(referenceBody(body)).id); }
    /**
     * The game's policy for one rider. A field left out keeps its value; null clears it.
     *   speed_cap      the fastest it may go for now
     *   stop_distance  where along its current rail its centre must stop (a line, a queue)
     *   next_rail_id   the rail it takes at the end of this one, entered at next_distance, instead of the rail's own
     */
    setRiderLimits(body, limits = {}) {
        const rider = this.#rider(body), next = {};
        if (limits.speed_cap !== undefined) next.speed_cap = limits.speed_cap === null ? null : number(limits.speed_cap, 'speed_cap', 0);
        if (limits.stop_distance !== undefined) next.stop_distance = limits.stop_distance === null ? null : number(limits.stop_distance, 'stop_distance');
        if (limits.next_rail_id !== undefined) Object.assign(next, this.#link({}, limits.next_rail_id, limits.next_distance ?? 0));
        this.world._mutate(() => Object.assign(rider, next));
        return this;
    }
    setRiderProfile(body, profile) {
        const rider = this.#rider(body), settings = this.#profile({ ...rider.profile, ...profile });
        this.world._mutate(() => { rider.profile = settings; });
        return this;
    }
    /** A detached reading: where it is, how fast, how far it slides, who it follows and the speed it is aiming for. */
    getRiderState(body) {
        const rider = this.#rider(body);
        return { body_id: rider.body_id, rail_id: rider.rail_id, distance: rider.distance, speed: rider.speed, slide: rider.slide,
            target_speed: rider.target_speed, leader_body_id: rider.leader_id, gap: rider.gap, ended: rider.ended,
            speed_cap: rider.speed_cap, stop_distance: rider.stop_distance, next_rail_id: rider.next_rail_id, next_distance: rider.next_distance,
            profile: { ...rider.profile } };
    }
    /** The riders on a rail, nearest its start first, as body handles. */
    getRailRiders(rail_id, results = []) {
        this.#rail(rail_id); this.#sort();
        results.length = 0;
        for (const rider of this.#order.get(rail_id) ?? []) results.push(rider.record.handle);
        return results;
    }

    // ===== THE STEP =====

    /** Once a step, before the bodies move: each rider's speed, place and pose for this step. */
    _update(dt) {
        if (!this.#riders.size) return;
        for (const rider of [...this.#riders.values()]) {
            const record = rider.record;
            // Moved by something else since it was put there (a contact, an impulse, a placement): it is a body again
            const pose = rider.pose;
            if (pose && (Math.abs(record.position[0] - pose.x) > DISPLACED || Math.abs(record.position[1] - pose.y) > DISPLACED
                || Math.abs(angleDelta(record.rotation, pose.rotation)) > DISPLACED)) {
                this.#riders.delete(rider.body_id); this.#orderValid = false;
                this.world._emit('railDisplaced', { body: record.handle, rail_id: rider.rail_id, distance: rider.distance });
            }
        }
        this.#orderValid = false; this.#sort();
        for (const rider of this.#riders.values()) {
            if (!rider.record.config.active || rider.record.parent_mount) continue;
            this.#drive(rider, dt);
            this.#advance(rider);
            this.#place(rider, dt);
            const record = rider.record, pose = rider.pose;     // a body with anywhere left to go must not fall asleep short of it
            if (pose.x !== record.position[0] || pose.y !== record.position[1] || pose.rotation !== record.rotation) { record.sleeping = false; record.sleep_time = 0; }
        }
    }
    /** Per body, in the step: the velocity that carries it to its pose. True when the rail has it. */
    _controls(record, dt) {
        const rider = this.#riders.get(record.id);
        if (!rider || !rider.pose) return false;
        record.velocity = [(rider.pose.x - record.position[0]) / dt, (rider.pose.y - record.position[1]) / dt];
        record.angular_velocity = (rider.pose.rotation - record.rotation) / dt;
        return true;
    }

    /** The pedals: this step's speed, toward the slowest of the top speed, the game's cap, the bend, the leader and the stop. */
    #drive(rider, dt) {
        const p = rider.profile, speed = rider.speed;
        let target = p.top_speed;
        if (rider.speed_cap !== null) target = Math.min(target, rider.speed_cap);
        if (p.bend_lateral_acceleration > 0) {
            const bend = this.#bendAhead(rider, p.bend_look_base + speed * p.bend_look_seconds);
            if (bend > 1e-9) target = Math.min(target, Math.max(p.bend_min_speed, Math.sqrt(p.bend_lateral_acceleration / bend)));
        }
        const look = p.look_base + p.body_length + speed * speed / (2 * p.braking) + speed * p.look_seconds;
        const leader = this.#leader(rider, look);
        rider.leader_id = leader ? leader.body_id : null; rider.gap = leader ? this.#gap : null;
        if (leader) target = Math.min(target, this.#followCap(this.#gap, speed, leader.speed, p, leader.profile.braking));
        if (rider.stop_distance !== null) {
            const room = rider.stop_distance - rider.distance;
            target = Math.min(target, room < p.stop_tolerance ? 0 : Math.sqrt(2 * p.braking * p.stop_brake_share * room));
        }
        rider.target_speed = target;
        let next = Math.max(0, this.#roll(speed, this.#pedal(speed, target, p, dt), p, dt));
        if (next < p.rest_speed) next = 0;
        rider.speed = next;
        rider.distance += next * dt;
    }
    /** The sharpest bend within `look` of a rider, read through onto the rails it runs onto. */
    #bendAhead(rider, look) {
        let rail = this.#rails.get(rider.rail_id), from = rider.distance, sharpest = 0, own = true;
        for (let hop = 0; rail && look > 0 && hop < LEADER_HOPS; hop++) {
            sharpest = Math.max(sharpest, railGeometry.sharpestBend(rail.table, from, from + look));
            look -= rail.table.length - from;
            const planned = own && rider.next_rail_id !== null;
            const next_id = planned ? rider.next_rail_id : rail.next_rail_id; from = planned ? rider.next_distance : rail.next_distance;
            rail = next_id === null ? null : this.#rails.get(next_id); own = false;
        }
        return sharpest;
    }
    /** The pedal a driver gives to reach a speed: -1 (full brake) .. 1 (full throttle). */
    #pedal(speed, target, p, dt) {
        const difference = target - speed, effort = 0.5 + p.pedal_urgency;
        if (speed > p.pedal_creep_onset && (difference < -p.pedal_brake_onset || (target < p.pedal_speed_band && difference < -p.pedal_creep_onset))) {
            return Math.max(-1, Math.min(-p.pedal_min_brake, difference / (p.braking * p.pedal_brake_seconds)));
        }
        if (difference > p.pedal_speed_band) return Math.min(1, difference * p.pedal_gain_up * effort);
        if (difference < -p.pedal_speed_band) return Math.max(-1, difference * p.pedal_gain_down * effort);
        return difference * p.pedal_gain_hold;
    }
    /** One step of speed along the line. The drag is solved from the top speed, so full throttle settles exactly there. */
    #roll(speed, pedal, p, dt) {
        if (Math.abs(pedal) > 0.1) {
            if (speed * pedal < 0 && Math.abs(speed) > p.reverse_floor) speed -= Math.sign(speed) * Math.min(Math.abs(speed), Math.abs(pedal) * p.braking * dt);
            else speed += pedal * p.acceleration * dt;
        }
        return speed * (p.top_speed / (p.acceleration * dt + p.top_speed));
    }
    /** The fastest speed that can still stop behind a leader. */
    #followCap(gap, speed, leader_speed, p, leader_braking) {
        if (gap < p.min_gap) return 0;
        const braking = p.braking * p.follow_brake_share, ahead = Math.max(0, leader_speed);
        const room = gap - p.min_gap - speed * p.reaction_seconds;
        if (room <= 0) return ahead * p.match_share;
        return Math.sqrt(ahead * ahead * (braking / leader_braking) + 2 * braking * room);
    }
    /** The nearest rider ahead: the nearest past it on its own rail, else the nearest on the rails it runs onto.
     *  Leaves the bumper-to-bumper gap in #gap. */
    #gap = 0;
    #leader(rider, look) {
        let rail = this.#rails.get(rider.rail_id), ahead = -rider.distance, from = rider.distance, own = true;
        for (let hop = 0; rail && ahead < look && hop < LEADER_HOPS; hop++) {
            let nearest = null;                                 // riders move as the step goes, so the list's order is not trusted here
            for (const other of this.#order.get(rail.rail_id) ?? []) {
                if (other === rider || !other.record.config.active || (own ? other.distance <= from : other.distance < from)) continue;
                if (!nearest || other.distance < nearest.distance || (other.distance === nearest.distance && other.body_id < nearest.body_id)) nearest = other;
            }
            if (nearest) {
                this.#gap = ahead + nearest.distance - rider.profile.body_length / 2 - nearest.profile.body_length / 2;
                return this.#gap < look ? nearest : null;
            }
            const planned = own && rider.next_rail_id !== null;
            const next_id = planned ? rider.next_rail_id : rail.next_rail_id; from = planned ? rider.next_distance : rail.next_distance;
            ahead += rail.table.length - from;
            rail = next_id === null ? null : this.#rails.get(next_id); own = false;
        }
        return null;
    }
    /** Past the end of its rail: onto the next (the one the game planned, else the rail's own), or waiting at a dead end. */
    #advance(rider) {
        for (let hop = 0; hop < MAX_HOPS; hop++) {
            const rail = this.#rails.get(rider.rail_id), length = rail.table.length;
            if (rider.distance < length) { rider.ended = false; return; }
            const planned = rider.next_rail_id !== null;
            const next_id = planned ? rider.next_rail_id : rail.next_rail_id, entry = planned ? rider.next_distance : rail.next_distance;
            if (next_id === null || !this.#rails.has(next_id)) {
                rider.distance = length; rider.speed = 0;
                if (!rider.ended) { rider.ended = true; this.world._emit('railEnded', { body: rider.record.handle, rail_id: rider.rail_id }); }
                return;
            }
            const from_rail_id = rider.rail_id;
            rider.distance = entry + (rider.distance - length); rider.rail_id = next_id;
            rider.next_rail_id = null; rider.next_distance = 0; rider.stop_distance = null;
            const left = this.#order.get(from_rail_id), at = left ? left.indexOf(rider) : -1;       // riders stepped after it this step must find it here
            if (at >= 0) left.splice(at, 1);
            if (!this.#order.has(next_id)) this.#order.set(next_id, []);
            this.#order.get(next_id).push(rider);
            this.#orderValid = false;
            this.world._emit('railChanged', { body: rider.record.handle, from_rail_id, rail_id: next_id });
        }
    }
    /** Where its place on the rail puts the body: on the line, the nose turned in by the slide through a bend. */
    #place(rider, dt) {
        const p = rider.profile, point = railGeometry.pointOnRail(this.#rails.get(rider.rail_id).table, rider.distance, this.#point);
        const speed = rider.speed;
        if (dt > 0) {
            const pull = -p.slide_per_acceleration * speed * speed * point.curvature;
            const wanted = Math.max(-p.slide_max, Math.min(p.slide_max, pull));
            rider.slide += (wanted - rider.slide) * (1 - Math.exp(-p.slide_ease_rate * dt));
        }
        const slip = Math.asin(Math.max(-p.slip_max, Math.min(p.slip_max, rider.slide / Math.max(p.slip_floor_speed, Math.abs(speed)))));
        const lateral = rider.join_lateral, yaw = rider.join_rotation;
        rider.pose = { x: point.x - Math.sin(point.rotation) * lateral, y: point.y + Math.cos(point.rotation) * lateral,
            rotation: rider.record.rotation + angleDelta(rider.record.rotation, point.rotation - slip + yaw) };
        if (dt > 0 && (lateral || yaw)) {
            const keep = Math.exp(-p.join_ease_rate * dt);
            rider.join_lateral = Math.abs(lateral) < 0.05 ? 0 : lateral * keep;
            rider.join_rotation = Math.abs(yaw) < 0.002 ? 0 : yaw * keep;
        }
        if (dt === 0) rider.pose = null;                        // just joined: nothing is commanded until its first step
    }
    /** Each rail's riders, nearest its start first. */
    #sort() {
        if (this.#orderValid) return;
        this.#order.clear();
        for (const rider of this.#riders.values()) {
            let list = this.#order.get(rider.rail_id);
            if (!list) this.#order.set(rider.rail_id, list = []);
            list.push(rider);
        }
        for (const list of this.#order.values()) list.sort((a, b) => a.distance - b.distance || a.body_id - b.body_id);
        this.#orderValid = true;
    }

    // ===== VALIDATION, LIFECYCLE, SAVES =====

    #name(rail_id) { if (typeof rail_id !== 'string' || !rail_id.trim()) throw new TypeError('rail_id must be a nonempty string'); }
    #rail(rail_id) { const rail = this.#rails.get(rail_id); if (!rail) throw new Error(`Unknown rail: ${rail_id}`); return rail; }
    #rider(body) {
        const rider = this.#riders.get(this.world._record(referenceBody(body)).id);
        if (!rider) throw new TypeError('Body is not riding a rail');
        return rider;
    }
    #body(value) {
        const record = this.world._record(referenceBody(value));
        if (record.config.physics_type === 'static') throw new TypeError('A rail rider must be a movable or kinematic body');
        return record;
    }
    #link(target, next_rail_id, next_distance) {
        if (next_rail_id !== null) this.#name(next_rail_id);
        target.next_rail_id = next_rail_id; target.next_distance = next_rail_id === null ? 0 : number(next_distance, 'next_distance', 0);
        return target;
    }
    #profile(packet) {
        if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw new TypeError('A rider profile must be an object');
        for (const key of Object.keys(packet)) if (!(key in PROFILE)) throw new TypeError(`Unknown rider profile field: ${key}`);
        const profile = { ...PROFILE, ...packet };
        for (const key of Object.keys(profile)) number(profile[key], key, POSITIVE.has(key) ? 1e-7 : 0);
        number(profile.pedal_urgency, 'pedal_urgency', 0, 1); number(profile.slip_max, 'slip_max', 0, 1);
        return profile;
    }
    _remove(body_id) { if (this.#riders.delete(body_id)) this.#orderValid = false; }
    _clear() { this.#rails.clear(); this.#riders.clear(); this.#order.clear(); this.#orderValid = false; }
    _saveState() {
        return { format_version: 1,
            rails: [...this.#rails.values()].map(rail => ({ rail_id: rail.rail_id, points: clone(rail.points), rotations: rail.rotations ? [...rail.rotations] : null,
                next_rail_id: rail.next_rail_id, next_distance: rail.next_distance })),
            riders: [...this.#riders.values()].map(rider => ({ body_id: rider.body_id, rail_id: rider.rail_id, distance: rider.distance, speed: rider.speed,
                slide: rider.slide, profile: { ...rider.profile }, speed_cap: rider.speed_cap, stop_distance: rider.stop_distance,
                next_rail_id: rider.next_rail_id, next_distance: rider.next_distance, join_lateral: rider.join_lateral, join_rotation: rider.join_rotation,
                ended: rider.ended, pose: rider.pose ? { ...rider.pose } : null })) };
    }
    _loadState(saved) {
        if (saved === undefined) return;
        if (!saved || saved.format_version !== 1 || !Array.isArray(saved.rails) || !Array.isArray(saved.riders)) throw new TypeError('Invalid saved rails');
        for (const rail of saved.rails) this.registerRail(rail.rail_id, { points: rail.points, rotations: rail.rotations ?? undefined, next_rail_id: rail.next_rail_id, next_distance: rail.next_distance });
        for (const entry of saved.riders) {
            this.rideRail(entry.body_id, { rail_id: entry.rail_id, distance: entry.distance, speed: entry.speed, profile: entry.profile });
            const rider = this.#riders.get(entry.body_id);
            this.setRiderLimits(entry.body_id, { speed_cap: entry.speed_cap, stop_distance: entry.stop_distance, next_rail_id: entry.next_rail_id, next_distance: entry.next_distance });
            rider.slide = number(entry.slide, 'slide'); rider.join_lateral = number(entry.join_lateral, 'join_lateral'); rider.join_rotation = number(entry.join_rotation, 'join_rotation');
            rider.ended = entry.ended === true;
            rider.pose = entry.pose ? { x: number(entry.pose.x, 'pose x'), y: number(entry.pose.y, 'pose y'), rotation: number(entry.pose.rotation, 'pose rotation') } : null;
        }
    }
}
