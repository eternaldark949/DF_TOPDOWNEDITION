import { impulseCenter } from '../core/mass.mjs';
import { inverseMass, inverseInertia, changeVelocity, movable } from '../core/state.mjs';
import { dot, sub, cross, add, scale, EPS } from '../core/values.mjs';

export class contactSolver {
    static resolve(a, b, contact, { correct_position = true } = {}) {
        const n = contact.normal, t = [-n[1], n[0]], p = contact.world_point;
        const yieldsA = a.config.contact_priority < b.config.contact_priority && movable(a), yieldsB = b.config.contact_priority < a.config.contact_priority && movable(b);
        // A higher-priority movable participant yields neither position nor velocity to a lower-priority one.
        // Immovable scenery always wins, regardless of the authored priority.
        const weightA = yieldsB ? 0 : 1, weightB = yieldsA ? 0 : 1;
        const ax = inverseMass(a, 'x') * weightA, ay = inverseMass(a, 'y') * weightA, bx = inverseMass(b, 'x') * weightB, by = inverseMass(b, 'y') * weightB;
        const ia = inverseInertia(a) * weightA, ib = inverseInertia(b) * weightB;
        const impulse = (r, value, weight) => { if (weight) changeVelocity(r, value, p); };
        const mass = v => (ax + bx) * v[0] ** 2 + (ay + by) * v[1] ** 2;
        if (correct_position && contact.penetration_depth > EPS) {
            const inv = mass(n), c = inv ? Math.max(0, contact.penetration_depth - 1e-6) / inv : 0;
            a.position[0] -= n[0] * c * ax; a.position[1] -= n[1] * c * ay;
            b.position[0] += n[0] * c * bx; b.position[1] += n[1] * c * by;
        }
        const ra = sub(p, impulseCenter(a)), rb = sub(p, impulseCenter(b));
        const oa = sub(p, a.position), ob = sub(p, b.position);
        const at = (r, off) => add(r.velocity, [-r.angular_velocity * off[1], r.angular_velocity * off[0]]);
        const relative = sub(at(b, ob), at(a, oa)), speed = dot(relative, n);
        let j = 0, jt = 0;
        if (speed < 0) {
            const den = mass(n) + cross(ra, n) ** 2 * ia + cross(rb, n) ** 2 * ib;
            if (den > EPS) {
                const e = Math.min(a.config.restitution, b.config.restitution);
                j = -(1 + e) * speed / den;
                impulse(a, scale(n, -j), weightA); impulse(b, scale(n, j), weightB);
                const rv = sub(at(b, ob), at(a, oa));
                const td = mass(t) + cross(ra, t) ** 2 * ia + cross(rb, t) ** 2 * ib;
                const cap = Math.sqrt(a.config.friction * b.config.friction) * j;
                jt = td > EPS ? Math.max(-cap, Math.min(cap, -dot(rv, t) / td)) : 0;
                impulse(a, scale(t, -jt), weightA); impulse(b, scale(t, jt), weightB);
            }
        }
        if (contact.penetration_depth > 1e-5 || j > EPS) for (const r of [a, b]) if (movable(r)) { r.sleeping = false; r.sleep_time = 0; }
        return { normal_impulse: j, tangent_impulse: jt, relative_velocity: relative };
    }
}
