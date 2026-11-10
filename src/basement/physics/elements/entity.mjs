/** Entity metadata/lifecycle only. Physical state lives exclusively in the engine body. */
const records = new WeakMap();
const legacyFields = Object.fromEntries(['angle', 'angularVelocity', 'lastX', 'lastY', 'x', 'y', 'vx', 'vy', 'velX', 'velY', 'angularVel', 'collisionMask'].map(key => [key, {
    get() { throw new Error(`Use engine body state instead of legacy ${key}`); },
    set() { throw new Error(`Use engine requests instead of writing ${key}`); }, configurable: false,
}]));
export function entityRecord(entity) {
    const record = records.get(entity);
    if (!record) throw new TypeError('Expected a gameEntity');
    return record;
}
function initializeEntity(entity, elements, packet, Constructor) {
    if (!elements || typeof elements._construct !== 'function') throw new TypeError('Construct entities through a gameElements owner');
    records.set(entity, elements._construct(entity, packet, Constructor));
    // A subclass field initializer cannot replace identity, a component or the live pose.
    for (const key of ['entity_id', 'body_id', 'entity_type', 'template_id', 'name', 'tags', 'assets', 'data', 'physics_system', 'body', 'physics_controller', 'awareness', 'registered', 'pending', 'destroyed', 'active', 'position', 'rotation',
        'linear_velocity', 'angular_velocity', 'mass', 'physics_type', 'collision_shape', 'collision_group', 'collision_mask', 'query_mask', 'axis_lock', 'ghost']) {
        const getter = Object.getOwnPropertyDescriptor(gameEntity.prototype, key).get;
        Object.defineProperty(entity, key, { get: getter, configurable: false, enumerable: false });
    }
    Object.defineProperties(entity, legacyFields);
    return entity;
}
// Save restoration uses the same base initialization without replaying arbitrary gameplay constructors.
export function restoreEntity(elements, packet, Constructor) { return initializeEntity(Object.create(Constructor.prototype), elements, packet, Constructor); }
export class gameEntity {
    static entity_type = 'entity';
    static physics_role = 'entity';
    constructor(elements, packet = {}) {
        initializeEntity(this, elements, packet, new.target);
    }
    get entity_id() { return entityRecord(this).body.body_id; }
    get body_id() { return this.entity_id; }
    get entity_type() { return entityRecord(this).entity_type; }
    get template_id() { return entityRecord(this).template_id; }
    get name() { return entityRecord(this).name; }
    get tags() { return entityRecord(this).tags; }
    get assets() { return entityRecord(this).assets; }
    get data() { return entityRecord(this).data; }
    get physics_system() { return entityRecord(this).elements.world; }
    get body() { return entityRecord(this).body; }
    get physics_controller() { return entityRecord(this).controller; }
    get awareness() { return entityRecord(this).awareness; }
    get registered() { return entityRecord(this).registered; }
    get pending() { const r = entityRecord(this); return !r.registered && !r.destroyed; }
    get destroyed() { return entityRecord(this).destroyed; }
    get active() { const r = entityRecord(this); return r.registered && !r.destroyed && r.body.getState().active; }
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
    activate() { const r = entityRecord(this); r.elements._requireLive(this); r.elements.world.activateBody(r.body); return this; }
    deactivate() { const r = entityRecord(this); r.elements._requireLive(this); r.elements.world.deactivateBody(r.body); return this; }
    destroy() { const r = entityRecord(this); if (!r.destroyed) r.elements.world.removeBody(r.body); return this; }
    updateBody(changes) { const r = entityRecord(this); r.elements._requireLive(this); r.elements.world.updateBody(r.body, changes); return this; }
    setPosition(position, options) { this.body.setPosition(position, options); return this; }
    setRotation(rotation, options) { this.body.setRotation(rotation, options); return this; }
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
