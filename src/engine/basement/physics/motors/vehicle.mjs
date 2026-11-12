// ===== LV0 BASEMENT =====
import { massProperties, ownInertia, impulseCenter, changeAngularSpeed } from '../core/mass.mjs';
import { bodyRecord, changeVelocity, inverseMass, inverseInertia } from '../core/state.mjs';
import { number, dot, sub, length, scale, clamp, angleDelta, clone, add, cross } from '../core/values.mjs';

export class pathMotor {
    constructor(body) { this.body = body; this.path = null; this.index = 1; this.options = {}; }
    followPath(path, options = {}) {
        const points = path.points ?? path;
        if (!Array.isArray(points) || points.length < 2) throw new TypeError('Path requires at least two points');
        const packet = clone(points); for (const p of packet) { number(p[0], 'path x'); number(p[1], 'path y'); }
        const r = bodyRecord(this.body); r.world._mutate(() => { r.sleeping = false; r.world.traffic.removeVehicle(this.body); this.path = packet; this.index = 1; this.options = clone(options); }); return this;
    }
    driveTo(position, options = {}) {
        const r = bodyRecord(this.body), path = r.world.findPath({ ...options, body: this.body, to: position });
        if (!path) { r.world._emit('movementBlocked', { body: this.body, reason: 'no_path' }); return null; }
        return this.followPath(path, options);
    }
    _controls(motor) {
        if (!this.path) return null;
        const r = bodyRecord(this.body), cfg = motor.config, point = this.path[this.index], delta = sub(point, r.position), d = length(delta);
        if (d < Math.max(this.options.arrival_distance ?? 3, Math.abs(dot(r.velocity, [Math.cos(r.rotation), Math.sin(r.rotation)])) / 30)) {
            if (this.index === this.path.length - 1) { this.path = null; Object.assign(motor.inputs, { throttle: 0, brake: 1, steer: 0 }); r.world._emit('destinationReached', { body: this.body, position: [...r.position] }); return { throttle: 0, brake: 1, steer: 0 }; }
            this.index++;
        }
        const target = sub(this.path[this.index], r.position), facing = [Math.cos(r.rotation), Math.sin(r.rotation)], speed = Math.max(0, dot(r.velocity, facing));
        const error = angleDelta(r.rotation, Math.atan2(target[1], target[0]));
        const steer = clamp(error * 2, -1, 1), max = this.options.speed ?? cfg.max_speed;
        const braking = cfg.braking * r.config.mass / massProperties(r).mass;
        const stop = speed * speed / (2 * braking) + cfg.wheel_base;
        const look = scale(facing, Math.max(stop, cfg.wheel_base * 2)), to = [r.position[0] + look[0], r.position[1] + look[1]];
        const clearance = r.world.getPathClearance({ body: this.body, from: r.position, to, from_rotation: r.rotation, include_ghosts: false });
        const safe = clearance.clear ? max : Math.sqrt(2 * braking * Math.max(0, clearance.distance - (this.options.following_distance ?? 4)));
        const end = this.index === this.path.length - 1 ? Math.sqrt(2 * braking * Math.max(0, length(target) - 2)) : max;
        const desired = Math.min(r.world.traffic.getSpeedCap(this.body), max * Math.max(0.15, 1 - Math.abs(error) / Math.PI), safe, end);
        return { steer, throttle: speed < desired - 0.5 ? 1 : 0, brake: speed > desired + 0.5 ? 1 : 0 };
    }
}

export class vehicleMotor {
    constructor(body, template = {}) {
        this.body = body; this.path_controller = new pathMotor(body);
        this.surface = { grip: 1, wetness: 0 }; this.axles = { load: 0, front_slip: 0, rear_slip: 0 };
        this.inputs = { throttle: 0, brake: 0, steer: 0, handbrake: 0 }; this.steering = 0;
        this._configure(template);
    }
    _configure(template) {
        const cfg = { max_speed: 300, reverse_speed: 90, acceleration: 100, braking: 240, wheel_base: 40, max_steering: 0.6, steering_rate: 2, lateral_grip: 12, drag: 0.1, tyre_model: 'bicycle', front_grip: 1, rear_grip: 1, cornering_stiffness: 12, max_lateral_acceleration: 500, load_transfer: 0.15, load_rate: 5, ...clone(template) };
        if (!['bicycle', 'two_axle'].includes(cfg.tyre_model)) throw new TypeError('Invalid tyre_model');
        for (const k of Object.keys(cfg)) if (k !== 'tyre_model') number(cfg[k], k, ['wheel_base', 'braking'].includes(k) ? 1e-7 : 0);
        this.config = cfg;
    }
    _input(key, value, min = 0) { number(value, key, min, 1); const r = bodyRecord(this.body); r.world._mutate(() => { r.sleeping = false; r.world.traffic.removeVehicle(this.body); this.path_controller.path = null; this.inputs[key] = value; }); return this; }
    assembleVehicle(template) { bodyRecord(this.body).world._mutate(() => this._configure(template)); return this; }
    accelerateVehicle(amount = 1) { return this._input('throttle', amount); }
    reverseVehicle(amount = 1) { return this._input('throttle', -number(amount, 'reverse', 0, 1), -1); }
    brakeVehicle(amount = 1) { return this._input('brake', amount); }
    steerVehicle(amount) { return this._input('steer', amount, -1); }
    realignSteering() { return this.steerVehicle(0); }
    setHandbrake(amount) { return this._input('handbrake', amount); }
    followPath(path, options) { this.path_controller.followPath(path, options); return this; }
    driveTo(position, options) { return this.path_controller.driveTo(position, options) ? this : null; }
    stopVehicle() { this._input('throttle', 0); return this.brakeVehicle(1); }
    parkVehicle() { this.stopVehicle(); if (!bodyRecord(this.body).world.getAttachmentState(this.body)) this.body.stopMovement(); return this; }
    setSurface({ grip = 1, wetness = 0 } = {}) {
        number(grip, 'grip', 0); number(wetness, 'wetness', 0, 1);
        bodyRecord(this.body).world._mutate(() => { this.surface = { grip, wetness }; }); return this;
    }
    getSpeed() { const r = bodyRecord(this.body); return dot(r.velocity, [Math.cos(r.rotation), Math.sin(r.rotation)]); }
    getVehicleState(result = {}) { return Object.assign(result, { speed: this.getSpeed(), steering: this.steering, following_path: !!this.path_controller.path, axles: clone(this.axles), surface: clone(this.surface), ...this.body.getState() }); }
    _update(dt) {
        const r = bodyRecord(this.body), c = this.config, input = { ...this.inputs, ...this.path_controller._controls(this) };
        const f = [Math.cos(r.rotation), Math.sin(r.rotation)], side = [-f[1], f[0]];
        let speed = dot(r.velocity, f), lateral = dot(r.velocity, side);
        const top = input.throttle < 0 ? c.reverse_speed : c.max_speed;
        // Propulsion does not clamp away collision impulses above top speed.
        if (Math.abs(speed) < top || speed * input.throttle < 0) speed += input.throttle * c.acceleration * dt;
        const braking = (input.brake + input.handbrake) * c.braking * dt;
        speed -= Math.sign(speed) * Math.min(Math.abs(speed), braking);
        speed *= Math.exp(-c.drag * dt);
        if (c.tyre_model === 'bicycle') lateral *= Math.exp(-c.lateral_grip * this.surface.grip * (1 - this.surface.wetness * 0.35) * (input.handbrake ? 0.2 : 1) * dt);
        this.steering += clamp(input.steer * c.max_steering - this.steering, -c.steering_rate * dt, c.steering_rate * dt);
        const desired = [f[0] * speed + side[0] * lateral, f[1] * speed + side[1] * lateral];
        changeVelocity(r, scale(sub(desired, r.velocity), r.config.mass), r.position);
        // Steering drives the canonical angular velocity. Contact response and mounted
        // point velocities therefore observe the same yaw that integration advances.
        if (c.tyre_model === 'bicycle' && !r.config.axis_lock.rotation) {
            const yaw = speed / c.wheel_base * Math.tan(this.steering);
            const grip = c.lateral_grip * this.surface.grip * (1 - this.surface.wetness * 0.35);
            changeAngularSpeed(r, ownInertia(r) * inverseInertia(r) * (yaw - r.angular_velocity) * (1 - Math.exp(-grip * dt)));
        }
        if (c.tyre_model === 'two_axle') this._tyres(dt, input, f);
    }
    _tyres(dt, input, forward) {
        const r = bodyRecord(this.body), c = this.config, half = c.wheel_base / 2;
        const requested = clamp((input.brake - Math.abs(input.throttle) * 0.4) * c.load_transfer, -0.45, 0.45);
        this.axles.load += (requested - this.axles.load) * (1 - Math.exp(-c.load_rate * dt));
        const surface = this.surface.grip * (1 - this.surface.wetness * 0.35);
        const axle = (distance, steer, grip, key) => {
            const offset = scale(forward, distance), point = add(r.position, offset), angle = r.rotation + steer;
            const normal = [-Math.sin(angle), Math.cos(angle)];
            const velocity = add(r.velocity, [-r.angular_velocity * offset[1], r.angular_velocity * offset[0]]);
            const slip = dot(velocity, normal); this.axles[key] = slip;
            const den = inverseMass(r, 'x') * normal[0] ** 2 + inverseMass(r, 'y') * normal[1] ** 2 + cross(sub(point, impulseCenter(r)), normal) ** 2 * inverseInertia(r);
            if (den <= 1e-7) return;
            const cap = r.config.mass * 0.5 * c.max_lateral_acceleration * Math.max(0, grip) * surface * dt;
            const impulse = clamp(-slip * (1 - Math.exp(-c.cornering_stiffness * dt)) / den, -cap, cap);
            changeVelocity(r, scale(normal, impulse), point);
        };
        axle(half, this.steering, c.front_grip * (1 + this.axles.load), 'front_slip');
        axle(-half, 0, c.rear_grip * (1 - this.axles.load) * (1 - input.handbrake * 0.8), 'rear_slip');
    }
}
