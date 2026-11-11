import { impulseCenter, changeAngularSpeed, rotateAtCenter } from '../core/mass.mjs';
import { vector, number, clone, sub, add, rotate, length, scale, dot, cross, EPS, angleDelta } from '../core/values.mjs';
import { bodyRecord, bodyActive, inverseMass, inverseInertia, changeVelocity } from '../core/state.mjs';
import { referenceBody } from '../spatial/queries.mjs';

const records = new WeakMap();
export class physicsConstraint {
    constructor(world, id, packet) {
        records.set(this, { world, id, ...validate(world, packet), applied_impulse: 0 });
        Object.defineProperty(this, 'constraint_id', { value: id, enumerable: true }); Object.freeze(this);
    }
    getState() { const r = records.get(this); return { constraint_id: r.id, ...clone(r.config), applied_impulse: r.applied_impulse }; }
}
export const constraintRecord = c => records.get(c);
function validate(world, packet) {
    const config = { constraint_type: 'distance', local_anchor_a: [0, 0], local_anchor_b: [0, 0], world_target: [0, 0], rest_length: 0,
        stiffness: 30, damping: 4, target_rotation: 0, min_rotation: -Math.PI, max_rotation: Math.PI, motor_speed: 0, max_torque: 0,
        local_axis: [1, 0], min_translation: 0, max_translation: 100, max_force: 0,
        break_impulse: null, ...clone({ ...packet, body_a: undefined, body_b: undefined }) };
    if (!['distance', 'spring', 'hinge', 'attachment', 'drag', 'slider'].includes(config.constraint_type)) throw new TypeError('Invalid constraint_type');
    for (const k of ['local_anchor_a', 'local_anchor_b', 'world_target']) config[k] = vector(config[k]);
    config.local_axis = vector(config.local_axis);
    const axisLength = length(config.local_axis); if (axisLength < EPS) throw new TypeError('Slider axis must have length');
    config.local_axis = scale(config.local_axis, 1 / axisLength);
    for (const k of ['min_translation', 'max_translation']) number(config[k], k);
    if (config.min_translation > config.max_translation) throw new TypeError('Reversed translation limits');
    for (const k of ['rest_length', 'stiffness', 'damping', 'max_torque', 'max_force']) number(config[k], k, 0);
    for (const k of ['target_rotation', 'min_rotation', 'max_rotation', 'motor_speed']) number(config[k], k);
    if (config.break_impulse !== null) number(config.break_impulse, 'break_impulse', 0);
    if (config.min_rotation > config.max_rotation) throw new TypeError('Reversed angular limits');
    const a = world._record(referenceBody(packet.body_a)), b = packet.body_b ? world._record(referenceBody(packet.body_b)) : null;
    config.body_a = a.id; config.body_b = b?.id ?? null;
    return { config, a, b };
}
export function updateConstraint(c, changes) {
    const r = constraintRecord(c), packet = { ...r.config, ...clone(changes), body_a: r.a.handle, body_b: r.b?.handle };
    Object.assign(r, validate(r.world, packet));
}

/** Joints share mass, locks and impulses with contacts. They own no collision index. */
export class constraintSolver {
    static solve(constraint, dt) {
        const r = constraintRecord(constraint), { a, b, config: c } = r;
        if (r.broken || !bodyActive(a) || (b && !bodyActive(b))) return;
        const ra = rotate(c.local_anchor_a, a.rotation), rb = b ? rotate(c.local_anchor_b, b.rotation) : [0, 0];
        const pa = add(a.position, ra), pb = b ? add(b.position, rb) : c.world_target;
        const ca = sub(pa, impulseCenter(a)), cb = b ? sub(pb, impulseCenter(b)) : [0, 0];
        if (c.constraint_type === 'slider') { solveSlider(r, dt, ra, rb, pa, pb); finish(r); return; }
        const d = sub(pb, pa), distance = length(d), n = distance > EPS ? scale(d, 1 / distance) : [1, 0];
        const rest = c.constraint_type === 'distance' || c.constraint_type === 'spring' ? c.rest_length : 0;
        const error = distance - rest;
        const ax = inverseMass(a, 'x'), ay = inverseMass(a, 'y'), bx = inverseMass(b, 'x'), by = inverseMass(b, 'y');
        const ia = inverseInertia(a), ib = inverseInertia(b);
        const den = (ax + bx) * n[0] ** 2 + (ay + by) * n[1] ** 2 + cross(ca, n) ** 2 * ia + cross(cb, n) ** 2 * ib;
        if (den > EPS) {
            const va = add(a.velocity, [-a.angular_velocity * ra[1], a.angular_velocity * ra[0]]);
            const vb = b ? add(b.velocity, [-b.angular_velocity * rb[1], b.angular_velocity * rb[0]]) : [0, 0];
            const relative = dot(sub(vb, va), n);
            const bias = error * Math.min(0.2 / dt, c.stiffness);
            const request = (bias + relative * Math.min(1, c.damping * dt)) / den;
            const impulse = c.max_force > 0 ? Math.max(-c.max_force*dt,Math.min(c.max_force*dt,request)) : request;
            r.applied_impulse += Math.abs(impulse);
            changeVelocity(a, scale(n, impulse), pa); if (b) changeVelocity(b, scale(n, -impulse), pb);
            if (c.constraint_type !== 'spring') {
                const correction = error * 0.5 / den;
                a.position[0] += n[0] * correction * ax; a.position[1] += n[1] * correction * ay;
                rotateAtCenter(a, cross(ca, n) * correction * ia);
                if (b) { b.position[0] -= n[0] * correction * bx; b.position[1] -= n[1] * correction * by; rotateAtCenter(b, -cross(cb, n) * correction * ib); }
            }
        }
        if (c.constraint_type === 'hinge' || c.constraint_type === 'attachment') {
            const angle = angleDelta(b?.rotation ?? 0, a.rotation), inv = ia + ib;
            let angular_error = c.constraint_type === 'attachment' ? angleDelta(c.target_rotation, angle)
                : angle < c.min_rotation ? angle - c.min_rotation : angle > c.max_rotation ? angle - c.max_rotation : 0;
            if (inv > EPS) {
                const v = a.angular_velocity - (b?.angular_velocity ?? 0), limit = c.max_torque * dt;
                const motor = limit ? Math.max(-limit, Math.min(limit, (c.motor_speed - v) / inv)) : 0;
                const j = angular_error ? (-angular_error * Math.min(c.stiffness, 0.2 / dt) - v) / inv + motor : motor;
                changeAngularSpeed(a, j * ia); if (b) changeAngularSpeed(b, -j * ib);
                const correction = -angular_error * 0.5 / inv;
                rotateAtCenter(a, correction * ia); if (b) rotateAtCenter(b, -correction * ib);
                r.applied_impulse += Math.abs(j);
            }
        }
        finish(r);
    }
}
function finish(r) {
        const { a, b, config: c } = r;
        if (c.break_impulse !== null && r.applied_impulse > c.break_impulse) {
            r.broken = true;
            r.world._emit('constraintBroken', { constraint_id: r.id, body_a: a.handle, body_b: b?.handle ?? null, impulse: r.applied_impulse });
            r.world.removeConstraint(r.id);
        }
}

// Prismatic joint: the axis is authored in B's frame (world frame if B is absent).
// The same inverse masses and angular Jacobians as physical contacts are used here.
function solveSlider(r, dt, ra, rb, pa, pb) {
    const { a, b, config: c } = r;
    const axis = rotate(c.local_axis, b?.rotation ?? 0), normal = [-axis[1], axis[0]], delta = sub(pa, pb);
    const ax = inverseMass(a, 'x'), ay = inverseMass(a, 'y'), bx = inverseMass(b, 'x'), by = inverseMass(b, 'y');
    const ia = inverseInertia(a), ib = inverseInertia(b);
    const row = (n, error, motor = false) => {
        const ja = cross(sub(pa, impulseCenter(a)), n), jb = b ? cross(sub(pb, impulseCenter(b)), n) : 0;
        const den = (ax + bx) * n[0] ** 2 + (ay + by) * n[1] ** 2 + ja ** 2 * ia + jb ** 2 * ib;
        if (den <= EPS) return;
        const va = add(a.velocity, [-a.angular_velocity * ra[1], a.angular_velocity * ra[0]]);
        const vb = b ? add(b.velocity, [-b.angular_velocity * rb[1], b.angular_velocity * rb[0]]) : [0, 0];
        let j = ((motor ? c.motor_speed : -error * Math.min(c.stiffness, 0.2 / dt)) - dot(sub(va, vb), n)) / den;
        if (motor) j = Math.max(-c.max_force * dt, Math.min(c.max_force * dt, j));
        changeVelocity(a, scale(n, j), pa); if (b) changeVelocity(b, scale(n, -j), pb);
        r.applied_impulse += Math.abs(j);
        if (!motor) {
            const correction = -error * 0.5 / den;
            a.position[0] += n[0] * correction * ax; a.position[1] += n[1] * correction * ay; rotateAtCenter(a, ja * correction * ia);
            if (b) { b.position[0] -= n[0] * correction * bx; b.position[1] -= n[1] * correction * by; rotateAtCenter(b, -jb * correction * ib); }
        }
    };
    row(normal, dot(delta, normal));
    const at = dot(delta, axis), error = at < c.min_translation ? at - c.min_translation : at > c.max_translation ? at - c.max_translation : 0;
    if (error) row(axis, error);
    if (c.max_force && !(at <= c.min_translation && c.motor_speed < 0) && !(at >= c.max_translation && c.motor_speed > 0)) row(axis, 0, true);
    const inv = ia + ib;
    if (inv > EPS) {
        const error = angleDelta(c.target_rotation, angleDelta(b?.rotation ?? 0, a.rotation));
        const j = (-error * Math.min(c.stiffness, 0.2 / dt) - a.angular_velocity + (b?.angular_velocity ?? 0)) / inv;
        changeAngularSpeed(a, j * ia); rotateAtCenter(a, -error * 0.5 * ia / inv);
        if (b) { changeAngularSpeed(b, -j * ib); rotateAtCenter(b, error * 0.5 * ib / inv); }
        r.applied_impulse += Math.abs(j);
    }
}
