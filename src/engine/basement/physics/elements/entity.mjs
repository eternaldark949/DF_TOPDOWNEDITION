// ===== LV0 BASEMENT =====
import {bodyActive} from '../core/state.mjs';
/** Entity metadata/lifecycle only. Physical state lives exclusively in the engine body. */
const records = new WeakMap();
const BLOCKED = ['__proto__', 'constructor', 'prototype'];
const propertyKey = key => { if (typeof key !== 'string' || !key || BLOCKED.includes(key)) throw new TypeError('A property key is a non-empty string'); return key; };
const pointOf = target => { const p = Array.isArray(target) ? target : target?.position; if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) throw new TypeError('Expected a point [x, y] or something with a position'); return p; };
const bodyOf = target => target instanceof gameEntity ? target.body : target;
const legacyFields = Object.fromEntries(['angle', 'angularVelocity', 'lastX', 'lastY', 'x', 'y', 'vx', 'vy', 'velX', 'velY', 'angularVel', 'collisionMask'].map(key => [key, {
    get() { throw new Error(`Use engine body state instead of legacy ${key}`); },
    set() { throw new Error(`Use engine requests instead of writing ${key}`); }, configurable: false,
}]));
export function entityRecord(entity) {
    const record = records.get(entity);
    if (!record) throw new TypeError('Expected a gameEntity');
    return record;
}
function initializeEntity(entity, elements, packet) {
    if (!elements || typeof elements._construct !== 'function') throw new TypeError('Construct entities through a gameElements owner');
    records.set(entity, elements._construct(entity, packet));
    // A subclass field initializer cannot replace identity, a component or the live pose.
    for (const key of ['entity_id', 'body_id', 'kind', 'template_id', 'name', 'tags', 'assets', 'data', 'physics_system', 'body', 'motor', 'awareness', 'registered', 'pending', 'destroyed', 'active', 'position', 'rotation',
        'linear_velocity', 'angular_velocity', 'mass', 'physics_type', 'collision_shape', 'collision_group', 'collision_mask', 'query_mask', 'axis_lock', 'ghost', 'parent', 'children']) {
        const getter = Object.getOwnPropertyDescriptor(gameEntity.prototype, key).get;
        Object.defineProperty(entity, key, { get: getter, configurable: false, enumerable: false });
    }
    Object.defineProperties(entity, legacyFields);
    return entity;
}
// Save restoration uses the same base initialization without replaying arbitrary gameplay constructors.
export function restoreEntity(elements, packet) { return initializeEntity(Object.create(gameEntity.prototype), elements, packet); }
export class gameEntity {
    constructor(elements, packet = {}) {
        if (new.target !== gameEntity) throw new TypeError('There are no entity subclasses: an object is a gameEntity, and its kind, parts and properties are data');
        initializeEntity(this, elements, packet);
    }
    get entity_id() { return entityRecord(this).body.body_id; }
    get body_id() { return this.entity_id; }
    /** What it is to physics: the kind preset it was made from. */
    get kind() { return entityRecord(this).kind; }
    get template_id() { return entityRecord(this).template_id; }
    get name() { return entityRecord(this).name; }
    get tags() { return entityRecord(this).tags; }
    get assets() { return entityRecord(this).assets; }
    get data() { return entityRecord(this).data; }
    get physics_system() { return entityRecord(this).elements.world; }
    get body() { return entityRecord(this).body; }
    /** Its motor part (a character, vehicle or projectile motor), or null. */
    get motor() { return entityRecord(this).motor; }
    get awareness() { return entityRecord(this).awareness; }
    get registered() { return entityRecord(this).registered; }
    get pending() { const r = entityRecord(this); return !r.registered && !r.destroyed; }
    get destroyed() { return entityRecord(this).destroyed; }
    get active() { const r = entityRecord(this); return r.registered && !r.destroyed && bodyActive(r.elements.world._record(r.body)); }
    get position() { return this.body.position; }
    get rotation() { return this.body.rotation; }
    get linear_velocity() { return this.body.linear_velocity; }
    get angular_velocity() { return this.body.angular_velocity; }
    get mass() { return this.body.getState().mass; }
    get physics_type() { return this.body.getState().physics_type; }
    get collision_shape() { return this.body.getState().collision_shape; }
    get collision_group() { return this.body.getState().collision_group; }
    get collision_mask() { return this.body.getState().collision_mask; }
    get query_mask() { return this.body.getState().query_mask; }
    get axis_lock() { return this.body.getState().axis_lock; }
    get ghost() { return this.body.getState().ghost; }
    // ----- Properties: game data on the object, read and written by key. -----
    get(key, fallback = undefined) { const d = entityRecord(this).data; propertyKey(key); return Object.hasOwn(d, key) ? d[key] : fallback; }
    has(key) { return Object.hasOwn(entityRecord(this).data, propertyKey(key)); }
    set(key, value) {
        const r = entityRecord(this); r.elements._requireLive(this); propertyKey(key);
        const previous = r.data[key]; if (Object.is(previous, value) && Object.hasOwn(r.data, key)) return this;
        if (value === undefined) delete r.data[key]; else r.data[key] = value;
        r.elements.world._emit('propertyChanged', { body: r.body, entity: this, key, value, previous }); return this;
    }
    // ----- Placement: readable verbs over the body. -----
    moveTo(x, y, options) { return this.setPosition(Array.isArray(x) ? x : [x, y], Array.isArray(x) ? y : options); }
    rotateTo(angle, options) { return this.setRotation(angle, options); }
    toWorld(local) { const [x, y] = pointOf(local), [px, py] = this.position, a = this.rotation, c = Math.cos(a), s = Math.sin(a); return [px + x * c - y * s, py + x * s + y * c]; }
    toLocal(point) { const [x, y] = pointOf(point), [px, py] = this.position, a = this.rotation, c = Math.cos(a), s = Math.sin(a), dx = x - px, dy = y - py; return [dx * c + dy * s, -dx * s + dy * c]; }
    distanceTo(target) { const [x, y] = pointOf(target), [px, py] = this.position; return Math.hypot(x - px, y - py); }
    directionTo(target) { const [x, y] = pointOf(target), [px, py] = this.position, d = Math.hypot(x - px, y - py); return d ? [(x - px) / d, (y - py) / d] : [0, 0]; }
    // ----- Parenting: a child rides its parent at a local offset until it is detached. -----
    get parent() { const r = entityRecord(this), mount = r.elements.world.getAttachmentState(r.body); return mount ? r.elements.fetchEntity(mount.parent_body_id) : null; }
    get children() { const r = entityRecord(this); return r.elements.world.getAttachedBodies(r.body).map(body => r.elements.getEntityForBody(body)).filter(Boolean); }
    attach(child, { at = [0, 0], rotation = 0, combine_mass = false, rig_anchor = null } = {}) {
        const r = entityRecord(this); r.elements._requireLive(this);
        r.elements.world.attachBody(bodyOf(child), { parent_body: r.body, local_position: at, local_rotation: rotation, combine_mass, rig_anchor }); return this;
    }
    detach(child = null, { exit_points, inherit_velocity } = {}) {   // true when it left; false when no exit point was clear
        const r = entityRecord(this), body = child === null ? r.body : bodyOf(child), mount = r.elements.world.getAttachmentState(body);
        if (child !== null && mount?.parent_body_id !== this.entity_id) throw new Error('That object is not attached to this one');
        if (!mount) return false;
        return r.elements.world.detachBody(body, { exit_points: exit_points ?? [mount.local_position], inherit_velocity }) !== null;
    }
    activate() { const r = entityRecord(this); r.elements._requireLive(this); r.elements.world.activateBody(r.body); return this; }
    deactivate() { const r = entityRecord(this); r.elements._requireLive(this); r.elements.world.deactivateBody(r.body); return this; }
    destroy() { const r = entityRecord(this); if (!r.destroyed) r.elements.world.removeBody(r.body); return this; }
    updateBody(changes) { const r = entityRecord(this); r.elements._requireLive(this); r.elements.world.updateBody(r.body, changes); return this; }
    setPosition(position, options) { this.body.setPosition(position, options); return this; }
    /** Turns it; a character motor turns it its own way (facing, not an instant snap of the body). */
    setRotation(rotation, options) { (typeof entityRecord(this).motor?.setRotation === 'function' ? entityRecord(this).motor : this.body).setRotation(rotation, options); return this; }
    getState(result = {}) { return entityRecord(this).elements._snapshotEntity(this, result); }
    getRenderState(blend, result = {}) { return this.body.getRenderState(blend, result); }
    getAsset(slot) {
        const r = entityRecord(this), id = r.assets[slot];
        if (!id) throw new Error(`Entity has no asset slot: ${slot}`);
        return r.elements.asset_library.getResource(id);
    }
    setAsset(slot, resource_id) { entityRecord(this).elements._setAsset(this, slot, resource_id); return this; }
    on(event_name, handler) { return entityRecord(this).elements._subscribe(this, event_name, handler); }
    createConstraint(packet = {}) { const r = entityRecord(this); r.elements._requireLive(this); return r.elements.world.createConstraint({ ...packet, body_a: r.body }); }
}
