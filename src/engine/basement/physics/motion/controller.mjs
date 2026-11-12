// ===== LV0 BASEMENT =====
import { clone, number, vector, sub, add, scale, rotate } from '../core/values.mjs';
import { referenceBody } from '../spatial/queries.mjs';

/** Timelines and orbiting mechanics use the ordinary body's velocity and collision step. */
export class motionController {
    #motions = new Map();
    constructor(world) {
        if (!world || typeof world._mutate !== 'function') throw new TypeError('Controller requires its physicsSystem owner');
        if (world.motion) throw new Error('The world already owns its motion controller');
        Object.defineProperty(this, 'world', { value: world }); Object.freeze(this);
    }
    #body(value) {
        const r = this.world._record(referenceBody(value));
        if (r.config.physics_type === 'static') throw new TypeError('Scripted motion requires a movable or kinematic body');
        return r;
    }
    moveBodyTo(body, packet) {
        const r = this.#body(body), duration = number(packet.duration, 'duration', 1e-7);
        const target = vector(packet.position), rotation = number(packet.rotation ?? r.rotation, 'rotation');
        if (!['linear', 'smooth'].includes(packet.easing ?? 'linear')) throw new TypeError('Invalid easing');
        this.world._mutate(() => {
            if (!this.world.fetchBody(r.id)) return;
            this.#motions.set(r.id, { type: 'move', from: [...r.position], from_rotation: r.rotation, to: target, to_rotation: rotation, duration, elapsed: 0, easing: packet.easing ?? 'linear' });
            r.sleeping = false; r.sleep_time = 0;
        }); return r.handle;
    }
    rotateBodyBy(body, { angle, duration = 0.2, easing = 'smooth' }) {
        const r = this.#body(body); number(angle, 'angle');
        return this.moveBodyTo(body, { position: r.position, rotation: r.rotation + angle, duration, easing });
    }
    orbitBody(body, packet) {
        const r = this.#body(body), center = vector(packet.center), angular_speed = number(packet.angular_speed, 'angular_speed');
        this.world._mutate(() => {
            if (!this.world.fetchBody(r.id)) return;
            this.#motions.set(r.id, { type: 'orbit', center, offset: sub(r.position, center), angular_speed, elapsed: 0, from_rotation: r.rotation, rotate_body: !!packet.rotate_body });
            r.sleeping = false; r.sleep_time = 0;
        }); return r.handle;
    }
    stopBodyMotion(body) {
        const r = this.#body(body);
        this.world._mutate(() => { this.#motions.delete(r.id); r.velocity = [0, 0]; r.angular_velocity = 0; });
    }
    getMotionState(body) { return clone(this.#motions.get(this.world._record(referenceBody(body)).id) ?? null); }
    _remove(body_id) { this.#motions.delete(body_id); }
    _controls(r, dt) {
        const m = this.#motions.get(r.id); if (!m) return false;
        if (m.finished) { this.#motions.delete(r.id); r.velocity = [0, 0]; r.angular_velocity = 0; return true; }
        m.elapsed += dt;
        let target, rotation;
        if (m.type === 'move') {
            const fraction = Math.min(1, m.elapsed / m.duration), t = m.easing === 'smooth' ? fraction * fraction * (3 - 2 * fraction) : fraction;
            target = add(m.from, scale(sub(m.to, m.from), t)); rotation = m.from_rotation + (m.to_rotation - m.from_rotation) * t;
            if (fraction >= 1) {
                // Completion means the timeline ended; contact response may stop the body short.
                m.finished = true; this.world._emit('motionCompleted', { body: r.handle, requested_position: [...m.to] });
            }
        } else {
            const angle = m.elapsed * m.angular_speed;
            target = add(m.center, rotate(m.offset, angle)); rotation = m.from_rotation + (m.rotate_body ? angle : 0);
        }
        r.velocity = scale(sub(target, r.position), 1 / dt); r.angular_velocity = (rotation - r.rotation) / dt;
        return true;
    }
    _clear() { this.#motions.clear(); }
    _saveState() { return [...this.#motions].map(([id, state]) => [id, clone(state)]); }
    _loadState(packet = []) {
        for (const [id, m] of packet) {
            const r = this.#body(this.world.fetchBody(id));
            if (m.type === 'move') {
                this.moveBodyTo(r.handle, { position: m.to, rotation: m.to_rotation, duration: m.duration, easing: m.easing });
                vector(m.from); number(m.from_rotation, 'from_rotation');
            } else if (m.type === 'orbit') { this.orbitBody(r.handle, m); vector(m.offset); number(m.from_rotation, 'from_rotation'); }
            else throw new TypeError('Invalid motion type');
            number(m.elapsed, 'elapsed', 0); this.#motions.set(id, clone(m));
        }
    }
}
