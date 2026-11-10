import { massProperties, ownInertia, changeAngularSpeed } from '../core/mass.mjs';
import { bodyRecord, changeVelocity, inverseInertia } from '../core/state.mjs';
import { EPS, vector, number, length, sub, scale, add, unit, clamp, angleDelta, clone } from '../core/values.mjs';
import { shapeReach } from '../collision/shape.mjs';
import { referencePosition, referenceBody } from '../spatial/queries.mjs';

export class characterMotor {
    constructor(body, config = {}) {
        this.body = body;
        this.config = { max_speed: 180, acceleration: 900, braking: 1200, arrival_distance: 2, physical_turning: false, turn_speed: 12, turn_acceleration: 80, ...clone(config) };
        for (const k of ['max_speed', 'acceleration', 'braking', 'arrival_distance', 'turn_speed', 'turn_acceleration']) number(this.config[k], k, 0);
        if (typeof this.config.physical_turning !== 'boolean') throw new TypeError('physical_turning must be boolean');
        this.suspended_for = 0; this.intent = null; this.path = null; this.replan = 0; this.facing = null;
    }
    _request(fn) { const r = bodyRecord(this.body); r.world._mutate(() => { r.sleeping = false; r.sleep_time = 0; fn(); }); return this; }
    setMovement(direction, options = {}) { const v = vector(direction); if (options.speed !== undefined) number(options.speed, 'speed', 0); return this._request(() => { this.intent = { ...clone(options), mode: 'direction', direction: v }; this.path = null; }); }
    setRotation(angle, options = {}) { this.body.setRotation(angle, { preserve_velocity: true, ...options }); return this; }
    moveTo(position, options = {}) { const target = vector(position); return this._request(() => { this.intent = { ...clone(options), mode: 'move', target }; this.path = null; this.replan = 0; }); }
    followTarget(target, options = {}) { referencePosition(bodyRecord(this.body).world, target); return this._request(() => { this.intent = { ...clone(options), mode: 'follow', target }; this.path = null; this.replan = 0; }); }
    fleeTarget(target, options = {}) { referencePosition(bodyRecord(this.body).world, target); return this._request(() => { this.intent = { ...clone(options), mode: 'flee', target }; }); }
    lookAtTarget(target, options = {}) { referencePosition(bodyRecord(this.body).world, target); return this._request(() => { this.facing = { ...clone(options), target }; }); }
    clearFacing(){return this._request(()=>{this.facing=null;});}
    lookInDirection(direction, options = {}) { const d = vector(direction); return this._request(() => { this.facing = { ...clone(options), direction:d }; }); }
    teleportInDirection(direction, { distance, angle, ...options }) {
        const r = bodyRecord(this.body); number(distance, 'distance', 0);
        if(angle!==undefined)number(angle,'angle');
        const heading=vector(direction??[Math.cos(angle??r.rotation),Math.sin(angle??r.rotation)]);
        if(length(heading)<=EPS)return null;
        return this.teleportTo(add(r.position, scale(unit(heading), distance)), options);
    }
    dashTo(position, options = {}) { return this.moveTo(position, { ...options, speed: options.speed ?? this.config.max_speed * 3, direct: true }); }
    teleportTo(position, options = {}) {
        const world = bodyRecord(this.body).world;
        if ((options.placement_mode ?? 'clear') === 'exact') this.body.setPosition(position, options);
        else {
            const landing = world.findClearPlacement({ ...options, body: this.body, to: position, include_ghosts: false });
            if (landing) this.body.setPosition(landing.position, { ...options, placement_mode: 'clear' });
            else return null;
        }
        return this;
    }
    stopMovement() { return this._request(() => { this.intent = null; this.path = null; if (!bodyRecord(this.body).parent_mount) this.body.stopMovement(); }); }
    cancelMovement() { return this._request(() => { this.intent = null; this.path = null; }); }
    suspendMovement(seconds) { number(seconds, 'seconds', 0); return this._request(() => { this.suspended_for = seconds; }); }
    evadeBody(threat, { distance = 50, speed = this.config.max_speed * 2, min_distance = 4 } = {}) {
        number(distance, 'distance', 0); number(speed, 'speed', EPS); number(min_distance, 'min_distance', 0);
        const r = bodyRecord(this.body), other = r.world._record(referenceBody(threat));
        const forward = length(other.velocity) > EPS ? unit(other.velocity) : [Math.cos(other.rotation), Math.sin(other.rotation)];
        const side = [-forward[1], forward[0]], delta = sub(r.position, other.position), sign = delta[0] * side[0] + delta[1] * side[1] >= 0 ? 1 : -1;
        for (const direction of [sign, -sign]) {
            const to = add(r.position, scale(side, distance * direction));
            const clearance = r.world.getPathClearance({ body: this.body, from: r.position, to, include_ghosts: false });
            const travel = Math.min(distance, Math.max(0, clearance.distance - 1e-3));
            if (travel < min_distance) continue;
            return this.dashTo(add(r.position, scale(side, travel * direction)), { speed });
        }
        return null;
    }
    getMovementState(result = {}) { return Object.assign(result, { mode: this.intent?.mode ?? 'idle', suspended_for: this.suspended_for, has_path: !!this.path, speed: length(bodyRecord(this.body).velocity) }); }
    _update(dt) {
        if (this.suspended_for > 0) { this.suspended_for = Math.max(0, this.suspended_for - dt); return; }
        const r = bodyRecord(this.body), world = r.world, intent = this.intent;
        let desired = [0, 0], target = null, heading = null;
        const braking = this.config.braking * r.config.mass / massProperties(r).mass;
        if (intent) {
            const speed = number(intent.speed ?? this.config.max_speed, 'speed', 0);
            if (intent.mode === 'direction') {
                const n = length(intent.direction), v = n > 1 ? scale(intent.direction, 1 / n) : intent.direction;
                const a = intent.space === 'local' ? r.rotation : 0;
                desired = [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]; desired = scale(desired, speed);
            } else {
                try { target = referencePosition(world, intent.target); }
                catch { this.intent = null; this.path = null; world._emit('movementBlocked', { body: this.body, reason: 'missing_target' }); target = [...r.position]; }
                const delta = sub(target, r.position), distance = length(delta);
                let arrive = intent.arrival_distance ?? this.config.arrival_distance;
                if (intent.mode === 'follow' && !Array.isArray(intent.target) && this.intent) {
                    const other = world._record(referenceBody(intent.target));
                    const reach = body => body.shape.packet.shape_type === 'circle' ? body.shape.packet.radius : shapeReach(body.shape);
                    arrive = Math.max(arrive, reach(r) + reach(other) + 1e-3);
                }
                const approach = intent.mode === 'follow' ? add(target, scale(unit(delta), -arrive)) : target;
                if (intent.mode === 'flee') {
                    if (distance < (intent.safety_distance ?? 200)) desired = scale(unit(scale(delta, -1)), speed);
                } else if (distance > arrive + EPS) {
                    this.replan -= dt;
                    if (!intent.direct && (!this.path || this.replan <= 0)) {
                        this.path = world.findPath({ ...intent, body: this.body, to: approach }); this.replan = 0.25;
                        this.path_index = 1;
                    }
                    let goal = approach;
                    if (!intent.direct) {
                        if (!this.path) { world._emit('movementBlocked', { body: this.body, reason: 'no_path' }); goal = r.position; }
                        else {
                            while (this.path_index < this.path.points.length - 1 && length(sub(this.path.points[this.path_index], r.position)) < Math.max(2, speed * dt)) this.path_index++;
                            goal = this.path.points[this.path_index];
                        }
                    }
                    const d = sub(goal, r.position), cap = Math.min(speed, Math.max(0, Math.sqrt(2 * braking * Math.max(0, distance - arrive) + (braking * dt) ** 2) - braking * dt), length(d) / dt);
                    desired = scale(unit(d), cap);
                } else if (intent.mode === 'move') {
                    this.intent = null; this.path = null; world._emit('destinationReached', { body: this.body, position: [...r.position] });
                }
            }
            if (intent.personal_space > 0) {
                const neighbours = world.peruseNearbyEntities(this.body, { near_range: intent.personal_space, include_groups: intent.avoid_groups });
                const heading = unit(desired), side = [-heading[1], heading[0]];
                for (const hit of neighbours) {
                    const pressure = 1 - hit.distance / intent.personal_space;
                    desired = add(desired, scale(hit.direction, -speed * pressure));
                    // Right-side passing is relative to the requested heading. Opposing
                    // walkers therefore choose opposite world-space sides without pairs
                    // being coordinated in a separate crowd solver or grid.
                    if (heading[0] * hit.direction[0] + heading[1] * hit.direction[1] > 0.5) desired = add(desired, scale(side, speed * pressure));
                }
                const actual = length(desired); if (actual > speed) desired = scale(desired, speed / actual);
            }
            if (intent.face_movement && length(desired) > 0.01 && !r.config.axis_lock.rotation) heading = Math.atan2(desired[1], desired[0]);
        }
        const difference = sub(desired, r.velocity), d = length(difference);
        const accel = length(desired) > length(r.velocity) ? this.config.acceleration : this.config.braking;
        if (d) changeVelocity(r, scale(difference, Math.min(1, accel * dt / d) * r.config.mass), r.position);
        if (this.facing && !r.config.axis_lock.rotation) {
            let target;
            try { target = this.facing.direction ? add(r.position, this.facing.direction) : referencePosition(world, this.facing.target); } catch { this.facing = null; target = null; }
            if (target) {
                const d = sub(target, r.position);
                if (length(d) > 1e-7) {
                    const a = Math.atan2(d[1], d[0]);
                    heading = this.config.physical_turning ? a : r.rotation + clamp(angleDelta(r.rotation, a), -(this.facing.turn_speed ?? 12) * dt, (this.facing.turn_speed ?? 12) * dt);
                }
            }
        }
        if (this.config.physical_turning && !r.config.axis_lock.rotation) {
            const turnSpeed = this.facing?.turn_speed ?? this.config.turn_speed;
            const target = heading == null ? 0 : clamp(angleDelta(r.rotation, heading) / dt, -turnSpeed, turnSpeed);
            const budget = ownInertia(r) * this.config.turn_acceleration * dt;
            changeAngularSpeed(r, clamp(target - r.angular_velocity, -budget * inverseInertia(r), budget * inverseInertia(r)));
        } else if (heading != null) r.rotation = heading;
    }
}
