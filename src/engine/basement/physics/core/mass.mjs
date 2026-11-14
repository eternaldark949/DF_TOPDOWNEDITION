// ===== LV0 BASEMENT =====
import { shapeBounds } from '../collision/shape.mjs';
import { add, sub, scale, rotate } from './values.mjs';

// Cached on canonical records. Relationships contain references, never copied body state.
export function invalidateMass(r) {
    for (let at = r; at; at = at.parent_mount?.parent) at.mass_properties = null;
}
export function ownInertia(r) {
    const p = r.config.collision_shape, mass = r.config.mass;
    if (p.shape_type === 'circle') return mass * p.radius ** 2 / 2;
    const b = shapeBounds(r.shape, [0, 0], 0);
    return mass * ((b.right - b.left) ** 2 + (b.bottom - b.top) ** 2) / 12;
}
export function massProperties(r) {
    if (r.mass_properties) return r.mass_properties;
    const parts = [{ mass: r.config.mass, center: [0, 0], inertia: ownInertia(r), count: 1 }];
    for (const e of r.mass_children ?? []) if (e.combine_mass && e.child.config.active && !e.child.removed) {
        const p = massProperties(e.child);
        parts.push({ mass: p.mass, center: add(e.local_position, rotate(p.local_center, e.local_rotation)), inertia: p.inertia, count: p.body_count });
    }
    let mass = 0, weighted = [0, 0], count = 0;
    for (const p of parts) { mass += p.mass; weighted = add(weighted, scale(p.center, p.mass)); count += p.count; }
    const center = scale(weighted, 1 / mass);
    let inertia = 0;
    for (const p of parts) { const d = sub(p.center, center); inertia += p.inertia + p.mass * (d[0] ** 2 + d[1] ** 2); }
    return r.mass_properties = { mass, local_center: center, inertia, body_count: count };
}
export function centerOffset(r) {
    const properties = massProperties(r), cache = r.mass_offset;
    if (cache?.properties === properties && cache.rotation === r.rotation) return cache.value;
    const value = rotate(properties.local_center, r.rotation);
    r.mass_offset = { properties, rotation: r.rotation, value }; return value;
}
export const massCenter = r => add(r.position, centerOffset(r));
// A locked origin axis supplies an external reaction. The angular Jacobian and
// effective inertia include that support, rather than rotating a locked origin.
export function impulseCenter(r) {
    const center = massCenter(r);
    return [r.config.axis_lock.y ? r.position[0] : center[0], r.config.axis_lock.x ? r.position[1] : center[1]];
}
export function supportedInertia(r) {
    const p = massProperties(r), d = centerOffset(r), lock = r.config.axis_lock;
    return p.inertia + p.mass * ((lock.x ? d[1] ** 2 : 0) + (lock.y ? d[0] ** 2 : 0));
}
export const centerVelocity = r => { const d = centerOffset(r); return add(r.velocity, [-r.angular_velocity * d[1], r.angular_velocity * d[0]]); };
export function setCenterVelocity(r, velocity) {
    const d = centerOffset(r); r.velocity = sub(velocity, [-r.angular_velocity * d[1], r.angular_velocity * d[0]]);
    if (r.config.axis_lock.x) r.velocity[0] = 0;
    if (r.config.axis_lock.y) r.velocity[1] = 0;
}
export function changeAngularSpeed(r, delta) {
    if (!delta) return;
    const velocity = centerVelocity(r); r.angular_velocity += delta; setCenterVelocity(r, velocity);
    // A turn wakes the body, as a push does: a joint's spin is otherwise lost on a sleeping body.
    r.sleeping = false; r.sleep_time = 0;
}
export function rotateAtCenter(r, delta) {
    const center = massCenter(r), velocity = centerVelocity(r);
    const origin = [...r.position];
    r.rotation += delta; r.position = sub(center, centerOffset(r)); setCenterVelocity(r, velocity);
    if (r.config.axis_lock.x) { r.position[0] = origin[0]; r.velocity[0] = 0; }
    if (r.config.axis_lock.y) { r.position[1] = origin[1]; r.velocity[1] = 0; }
}
export function integrateAtCenter(r, dt) {
    const velocity = centerVelocity(r), center = add(massCenter(r), scale(velocity, dt));
    const origin = [...r.position];
    r.rotation += r.angular_velocity * dt; r.position = sub(center, centerOffset(r)); setCenterVelocity(r, velocity);
    if (r.config.axis_lock.x) { r.position[0] = origin[0]; r.velocity[0] = 0; }
    if (r.config.axis_lock.y) { r.position[1] = origin[1]; r.velocity[1] = 0; }
}
