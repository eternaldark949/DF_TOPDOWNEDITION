// ===== LV0 BASEMENT =====
import { BODY_GROUP } from '../core/values.mjs';

/**
 * THE KINDS: what an object is to physics, as data. A kind is a preset of body defaults plus the
 * parts it switches on: `motor` (character, vehicle, projectile or null) and `awareness`. A record
 * names its kind and may override any default. There are no entity classes: every object is a gameEntity.
 */
export const KINDS = Object.freeze({
    entity: { body: { physics_type: 'static', collision_group: 0, collision_mask: 0, query_mask: 0 }, motor: null, awareness: false },
    decoration: { body: { physics_type: 'static', collision_group: 0, collision_mask: 0, query_mask: 0 }, motor: null, awareness: false },
    character: { body: { physics_type: 'character', collision_group: BODY_GROUP.CHARACTER }, motor: 'character', awareness: true },
    vehicle: { body: { physics_type: 'rigid', collision_group: BODY_GROUP.VEHICLE }, motor: 'vehicle', awareness: false },
    projectile: { body: { physics_type: 'rigid', collision_group: BODY_GROUP.PROJECTILE, friction: 0, linear_damping: 0, angular_damping: 0 }, motor: 'projectile', awareness: false },
    prop: { body: { physics_type: 'rigid', collision_group: BODY_GROUP.PROP }, motor: null, awareness: false },
    static: { body: { physics_type: 'static', collision_group: BODY_GROUP.STATIC }, motor: null, awareness: false },
    trigger: { body: { physics_type: 'static', collision_group: BODY_GROUP.SENSOR, ghost: true }, motor: null, awareness: false },
});
/** The motors a kind or a record can switch on. */
export const MOTORS = Object.freeze(['character', 'vehicle', 'projectile']);

export class awarenessMatrix {
    constructor(world, body) { this.world = world; this.body = body; this.options = {}; }
    analyzeSurroundings(options = {}) { this.options = { ...options }; return this.getNearbyEntities(); }
    getNearbyEntities(results = []) { return this.world.peruseNearbyEntities(this.body, this.options, results); }
    getNearestObstacle() { return this.world.findNearestEntity(this.body, { ...this.options, include_ghosts: false }); }
    getMovementClearance(packet, result = {}) { return this.world.getPathClearance({ ...packet, body: this.body, from: this.body.position }, result); }
}
