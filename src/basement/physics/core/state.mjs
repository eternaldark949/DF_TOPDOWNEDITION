import { PHYSICS_TYPES, BODY_GROUP, vector, number, mask, clone, freeze } from './values.mjs';
import { collisionShape, shapeBounds, shapeReach } from '../collision/shape.mjs';
import { massProperties, massCenter, impulseCenter, supportedInertia, centerVelocity, setCenterVelocity } from './mass.mjs';

const bodies = new WeakMap();
export const bodyRecord = body => { const r = bodies.get(body); if (!r) throw new TypeError('Expected a physicsBody'); return r; };
export const bindBody = (body, record) => bodies.set(body, record);
export function bodyConfig(packet = {}) {
    const p = clone(packet);
    const type = p.physics_type ?? 'rigid';
    if (!PHYSICS_TYPES.includes(type)) throw new TypeError(`Invalid physics_type: ${type}`);
    const shape = new collisionShape(p.collision_shape ?? { shape_type: 'circle', radius: 1 });
    const lock = p.axis_lock ?? {};
    const exclusions = [...(p.collision_exclusions ?? [])];
    if (exclusions.some(id => !Number.isSafeInteger(id) || id < 1)) throw new TypeError('Invalid collision exclusion id');
    return {
        name: String(p.name ?? ''), owner_id: p.owner_id ?? null, tags: [...(p.tags ?? [])].map(String),
        physics_type: type, collision_shape: shape.packet,
        render_shape: p.render_shape == null ? null : new collisionShape(p.render_shape).packet,
        light_shape: p.light_shape == null ? null : new collisionShape(p.light_shape).packet,
        collision_exclusions: [...new Set(exclusions)],
        contact_priority: number(p.contact_priority ?? 0, 'contact_priority', 0),
        position: vector(p.position ?? [0, 0]), rotation: number(p.rotation ?? 0, 'rotation'),
        linear_velocity: vector(p.linear_velocity ?? [0, 0]), angular_velocity: number(p.angular_velocity ?? 0, 'angular_velocity'),
        mass: number(p.mass ?? 1, 'mass', 1e-7),
        friction: number(p.friction ?? 0.5, 'friction', 0), restitution: number(p.restitution ?? 0, 'restitution', 0, 1),
        linear_damping: number(p.linear_damping ?? 0, 'linear_damping', 0), angular_damping: number(p.angular_damping ?? 0, 'angular_damping', 0),
        collision_group: mask(p.collision_group ?? BODY_GROUP.PROP, 'collision_group'),
        collision_mask: mask(p.collision_mask ?? BODY_GROUP.ALL, 'collision_mask'), query_mask: mask(p.query_mask ?? BODY_GROUP.ALL, 'query_mask'),
        ghost: !!p.ghost, continuous_collision: p.continuous_collision !== false, sleep_enabled: p.sleep_enabled !== false,
        active: p.active !== false,
        axis_lock: { x: !!lock.x, y: !!lock.y, rotation: !!lock.rotation },
    };
}
export function bodyActive(r) {
    for (let current = r; current; current = current.parent_mount?.parent) if (!current.config.active || current.removed) return false;
    return true;
}
export function snapshot(r) {
    return { ...clone(r.config), body_id: r.id, position: [...r.position], rotation: r.rotation,
        linear_velocity: [...r.velocity], angular_velocity: r.angular_velocity, sleeping: r.sleeping, active: bodyActive(r), attached_to: r.parent_mount?.parent.id ?? null };
}
export const pose = r => ({ position: r.position, rotation: r.rotation });
export const previousPose = r => ({ position: r.previous_position, rotation: r.previous_rotation });
// Derived geometry stays on the official record. It is not another spatial index,
// and is never serialized or exposed by reference to callers.
export function bodyBounds(r, type = 'collision') {
    if(type!=='collision'&&!r.config[`${type}_shape`])return bodyBounds(r);
    const shape=type==='collision'?r.shape:r.config[`${type}_shape`]??r.shape;
    const cache=(r.bounds_cache??=Object.create(null)),prior=cache[type],x=r.position[0],y=r.position[1],rotation=r.rotation;
    if(prior&&prior.shape===shape&&prior.x===x&&prior.y===y&&prior.rotation===rotation)return prior.bounds;
    const bounds=shapeBounds(shape,r.position,rotation);
    if(prior){prior.shape=shape;prior.x=x;prior.y=y;prior.rotation=rotation;prior.bounds=bounds;}
    else cache[type]={shape,x,y,rotation,bounds};
    r.metrics.bounds_calculations++;return bounds;
}
export const liveBounds = r => bodyBounds(r);
export function sweptBounds(r) {
    const bounds=liveBounds(r),x=r.position[0],y=r.position[1],px=r.previous_position[0],py=r.previous_position[1];
    if(x===px&&y===py&&r.rotation===r.previous_rotation)return bounds;
    const prior=r.sweep_cache;
    if(prior&&prior.bounds===bounds&&prior.px===px&&prior.py===py&&prior.previous_rotation===r.previous_rotation)return prior.value;
    const reach=shapeReach(r.shape);
    const value=prior?.value??{};
    value.left=Math.min(bounds.left,Math.min(x,px)-reach);value.right=Math.max(bounds.right,Math.max(x,px)+reach);
    value.top=Math.min(bounds.top,Math.min(y,py)-reach);value.bottom=Math.max(bounds.bottom,Math.max(y,py)+reach);
    if(prior){prior.bounds=bounds;prior.px=px;prior.py=py;prior.previous_rotation=r.previous_rotation;}
    else r.sweep_cache={bounds,px,py,previous_rotation:r.previous_rotation,value};
    r.metrics.swept_bounds_calculations++;return value;
}
export const physical = r => bodyActive(r) && !r.parent_mount && r.config.physics_type !== 'no_collision';
export const movable = r => !r.parent_mount && ['rigid', 'character', 'no_collision'].includes(r.config.physics_type);
export function inverseMass(r, axis) {
    if (!r || !movable(r) || r.config.axis_lock[axis]) return 0;
    return 1 / massProperties(r).mass;
}
export function inverseInertia(r) {
    if (!r || !movable(r) || (r.config.physics_type === 'character' && !r.motor?.config.physical_turning) || r.config.axis_lock.rotation) return 0;
    return 1 / supportedInertia(r);
}
export function enforceLocks(r) {
    if (r.parent_mount) return;
    if (r.config.physics_type === 'static') { r.velocity = [0, 0]; r.angular_velocity = 0; return; }
    const lock = r.config.axis_lock;
    if (lock.x) r.velocity[0] = 0;
    if (lock.y) r.velocity[1] = 0;
    if (lock.rotation) r.angular_velocity = 0;
}
export function changeVelocity(r, impulse, point = null) {
    const velocity = centerVelocity(r), center = impulseCenter(r);
    point ??= massCenter(r);
    velocity[0] += impulse[0] * inverseMass(r, 'x');
    velocity[1] += impulse[1] * inverseMass(r, 'y');
    if (point) r.angular_velocity += ((point[0] - center[0]) * impulse[1] - (point[1] - center[1]) * impulse[0]) * inverseInertia(r);
    setCenterVelocity(r, velocity);
    if (movable(r)) { r.sleeping = false; r.sleep_time = 0; }
}
export function readonlyState(r, result) { Object.assign(result, snapshot(r)); return result; }
export function immutableState(r) { return freeze(snapshot(r)); }
