// ===== LV0 BASEMENT =====
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
        local_axis: [1, 0], min_translation: 0, max_translation: 100, max_force: 0, spring_stiffness: 0, spring_damping: 0, one_way: false,
        break_impulse: null, ...clone({ ...packet, body_a: undefined, body_b: undefined }) };
    if (!['distance', 'spring', 'hinge', 'attachment', 'drag', 'slider'].includes(config.constraint_type)) throw new TypeError('Invalid constraint_type');
    for (const k of ['local_anchor_a', 'local_anchor_b', 'world_target']) config[k] = vector(config[k]);
    config.local_axis = vector(config.local_axis);
    const axisLength = length(config.local_axis); if (axisLength < EPS) throw new TypeError('Slider axis must have length');
    config.local_axis = scale(config.local_axis, 1 / axisLength);
    for (const k of ['min_translation', 'max_translation']) number(config[k], k);
    if (config.min_translation > config.max_translation) throw new TypeError('Reversed translation limits');
    for (const k of ['rest_length', 'stiffness', 'damping', 'max_torque', 'max_force', 'spring_stiffness', 'spring_damping']) number(config[k], k, 0);
    for (const k of ['target_rotation', 'min_rotation', 'max_rotation', 'motor_speed']) number(config[k], k);
    if (config.break_impulse !== null) number(config.break_impulse, 'break_impulse', 0);
    if (typeof config.one_way !== 'boolean') throw new TypeError('one_way must be a boolean');
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
        const r = constraintRecord(constraint), { a, b, config: c } = r, bm = c.one_way ? null : b;
        if (r.broken || !bodyActive(a) || (b && !bodyActive(b))) return;
        const ra = rotate(c.local_anchor_a, a.rotation), rb = b ? rotate(c.local_anchor_b, b.rotation) : [0, 0];
        const pa = add(a.position, ra), pb = b ? add(b.position, rb) : c.world_target;
        const ca = sub(pa, impulseCenter(a)), cb = b ? sub(pb, impulseCenter(b)) : [0, 0];
        if (c.constraint_type === 'slider') { solveSlider(r, dt, ra, rb, pa, pb); finish(r); return; }
        const d = sub(pb, pa), distance = length(d), n = distance > EPS ? scale(d, 1 / distance) : [1, 0];
        if (c.constraint_type === 'hinge' || c.constraint_type === 'attachment') { solvePin(r, dt, ra, rb, ca, cb, d); solveAngle(r, dt); finish(r); return; }
        const rest = c.constraint_type === 'distance' || c.constraint_type === 'spring' ? c.rest_length : 0;
        const error = distance - rest;
        const ax = inverseMass(a, 'x'), ay = inverseMass(a, 'y'), bx = inverseMass(bm, 'x'), by = inverseMass(bm, 'y');
        const ia = inverseInertia(a), ib = inverseInertia(bm);
        const den = (ax + bx) * n[0] ** 2 + (ay + by) * n[1] ** 2 + cross(ca, n) ** 2 * ia + cross(cb, n) ** 2 * ib;
        if (den > EPS) {
            const va = add(a.velocity, [-a.angular_velocity * ra[1], a.angular_velocity * ra[0]]);
            const vb = b ? add(b.velocity, [-b.angular_velocity * rb[1], b.angular_velocity * rb[0]]) : [0, 0];
            const relative = dot(sub(vb, va), n);
            const bias = error * Math.min(0.2 / dt, c.stiffness);
            const request = (bias + relative * Math.min(1, c.damping * dt)) / den;
            const impulse = c.max_force > 0 ? Math.max(-c.max_force*dt,Math.min(c.max_force*dt,request)) : request;
            r.applied_impulse += Math.abs(impulse);
            changeVelocity(a, scale(n, impulse), pa); if (bm) changeVelocity(bm, scale(n, -impulse), pb);
            if (c.constraint_type !== 'spring') {
                const correction = error * 0.5 / den;
                a.position[0] += n[0] * correction * ax; a.position[1] += n[1] * correction * ay;
                rotateAtCenter(a, cross(ca, n) * correction * ia);
                if (bm) { bm.position[0] -= n[0] * correction * bx; bm.position[1] -= n[1] * correction * by; rotateAtCenter(bm, -cross(cb, n) * correction * ib); }
            }
        }
        finish(r);
    }
}
/**
 * A pin: the two anchors are one point. Solved on both axes at once (a 2×2 effective mass), so the
 * velocity at the pin is removed rather than softened and a hinged limb turns about its pin instead
 * of about its own centre. Position drift is corrected the same way, split by each body's mobility.
 */
function solvePin(r, dt, ra, rb, ca, cb, d) {
    const { a, b, config: c } = r, bm = c.one_way ? null : b;
    const ax = inverseMass(a, 'x'), ay = inverseMass(a, 'y'), bx = inverseMass(bm, 'x'), by = inverseMass(bm, 'y'), ia = inverseInertia(a), ib = inverseInertia(bm);
    const k11 = ax + bx + ia * ca[1] ** 2 + ib * cb[1] ** 2, k22 = ay + by + ia * ca[0] ** 2 + ib * cb[0] ** 2, k12 = -ia * ca[0] * ca[1] - ib * cb[0] * cb[1];
    const det = k11 * k22 - k12 * k12;
    if (!(det > EPS * EPS)) return;
    const solve = v => [(k22 * v[0] - k12 * v[1]) / det, (k11 * v[1] - k12 * v[0]) / det];
    const va = add(a.velocity, [-a.angular_velocity * ra[1], a.angular_velocity * ra[0]]);
    const vb = b ? add(b.velocity, [-b.angular_velocity * rb[1], b.angular_velocity * rb[0]]) : [0, 0];
    let impulse = solve(add(sub(vb, va), scale(d, Math.min(0.2 / dt, c.stiffness))));
    const size = length(impulse); if (c.max_force > 0 && size > c.max_force * dt) impulse = scale(impulse, c.max_force * dt / size);
    r.applied_impulse += length(impulse);
    const pa = add(a.position, ra), pb = b ? add(b.position, rb) : c.world_target;
    changeVelocity(a, impulse, pa); if (bm) changeVelocity(bm, scale(impulse, -1), pb);
    const move = scale(solve(d), 0.5);
    a.position[0] += move[0] * ax; a.position[1] += move[1] * ay; rotateAtCenter(a, cross(ca, move) * ia);
    if (bm) { bm.position[0] -= move[0] * bx; bm.position[1] -= move[1] * by; rotateAtCenter(bm, -cross(cb, move) * ib); }
}
/** A hinge's limits, motor and return spring, or an attachment's fixed angle. */
function solveAngle(r, dt) {
    const { a, b, config: c } = r, bm = c.one_way ? null : b, ia = inverseInertia(a), ib = inverseInertia(bm);
    const angle = angleDelta(b?.rotation ?? 0, a.rotation), inv = ia + ib;
    let angular_error = c.constraint_type === 'attachment' ? angleDelta(c.target_rotation, angle)
        : angle < c.min_rotation ? angle - c.min_rotation : angle > c.max_rotation ? angle - c.max_rotation : 0;
    if (inv > EPS) {
        const v = a.angular_velocity - (b?.angular_velocity ?? 0), limit = c.max_torque * dt;
        const motor = limit ? Math.max(-limit, Math.min(limit, (c.motor_speed - v) / inv)) : 0;
        const j = angular_error ? (-angular_error * Math.min(c.stiffness, 0.2 / dt) - v) / inv + motor : motor;
        changeAngularSpeed(a, j * ia); if (bm) changeAngularSpeed(bm, -j * ib);
        const correction = -angular_error * 0.5 / inv;
        rotateAtCenter(a, correction * ia); if (bm) rotateAtCenter(bm, -correction * ib);
        r.applied_impulse += Math.abs(j);
        // A hinge's return spring: angular acceleration toward target_rotation, independent of
        // inertia (spring_stiffness in 1/s², spring_damping in 1/s). Solved in every iteration
        // with dt = step / iterations, so it sums to one full step.
        if (c.constraint_type === 'hinge' && (c.spring_stiffness || c.spring_damping)) {
            const err = angleDelta(c.target_rotation, angle), w = a.angular_velocity - (b?.angular_velocity ?? 0);
            const k = (-c.spring_stiffness * err - c.spring_damping * w) * dt / inv;
            changeAngularSpeed(a, k * ia); if (bm) changeAngularSpeed(bm, -k * ib);
        }
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
    const { a, b, config: c } = r, bm = c.one_way ? null : b;
    const axis = rotate(c.local_axis, b?.rotation ?? 0), normal = [-axis[1], axis[0]], delta = sub(pa, pb);
    const ax = inverseMass(a, 'x'), ay = inverseMass(a, 'y'), bx = inverseMass(bm, 'x'), by = inverseMass(bm, 'y');
    const ia = inverseInertia(a), ib = inverseInertia(bm);
    const row = (n, error, motor = false) => {
        const ja = cross(sub(pa, impulseCenter(a)), n), jb = b ? cross(sub(pb, impulseCenter(b)), n) : 0;
        const den = (ax + bx) * n[0] ** 2 + (ay + by) * n[1] ** 2 + ja ** 2 * ia + jb ** 2 * ib;
        if (den <= EPS) return;
        const va = add(a.velocity, [-a.angular_velocity * ra[1], a.angular_velocity * ra[0]]);
        const vb = b ? add(b.velocity, [-b.angular_velocity * rb[1], b.angular_velocity * rb[0]]) : [0, 0];
        let j = ((motor ? c.motor_speed : -error * Math.min(c.stiffness, 0.2 / dt)) - dot(sub(va, vb), n)) / den;
        if (motor) j = Math.max(-c.max_force * dt, Math.min(c.max_force * dt, j));
        changeVelocity(a, scale(n, j), pa); if (bm) changeVelocity(bm, scale(n, -j), pb);
        r.applied_impulse += Math.abs(j);
        if (!motor) {
            const correction = -error * 0.5 / den;
            a.position[0] += n[0] * correction * ax; a.position[1] += n[1] * correction * ay; rotateAtCenter(a, ja * correction * ia);
            if (bm) { bm.position[0] -= n[0] * correction * bx; bm.position[1] -= n[1] * correction * by; rotateAtCenter(bm, -jb * correction * ib); }
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
        if (bm) { changeAngularSpeed(bm, -j * ib); rotateAtCenter(bm, error * 0.5 * ib / inv); }
        r.applied_impulse += Math.abs(j);
    }
}
