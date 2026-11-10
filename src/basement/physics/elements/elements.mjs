import { gameEntity } from './entity.mjs';

/** Official element inheritance. Base construction creates and registers the components. */
export class gameCharacter extends gameEntity { static entity_type = 'character'; static physics_role = 'character'; }
export class gameVehicle extends gameEntity { static entity_type = 'vehicle'; static physics_role = 'vehicle'; }
export class gameProjectile extends gameEntity { static entity_type = 'projectile'; static physics_role = 'projectile'; }
export class gameProp extends gameEntity { static entity_type = 'prop'; static physics_role = 'prop'; }
export class gameStatic extends gameEntity { static entity_type = 'static'; static physics_role = 'static'; }
export class gameTrigger extends gameEntity { static entity_type = 'trigger'; static physics_role = 'trigger'; }
export class gameDecoration extends gameEntity { static entity_type = 'decoration'; static physics_role = 'decoration'; }
for (const method of ['suspendMovement', 'evadeBody', 'setMovement', 'setRotation', 'moveTo', 'followTarget', 'fleeTarget', 'lookAtTarget', 'lookInDirection', 'clearFacing', 'teleportInDirection', 'dashTo', 'teleportTo', 'stopMovement', 'cancelMovement', 'getMovementState']) {
    Object.defineProperty(gameCharacter.prototype, method, { value: function (...args) { return this.physics_controller[method](...args); } });
}
for (const method of ['assembleVehicle', 'setSurface', 'accelerateVehicle', 'brakeVehicle', 'reverseVehicle', 'steerVehicle', 'realignSteering', 'setHandbrake', 'followPath', 'driveTo', 'stopVehicle', 'parkVehicle', 'getSpeed', 'getVehicleState']) {
    Object.defineProperty(gameVehicle.prototype, method, { value: function (...args) { return this.physics_controller[method](...args); } });
}
for (const method of ['launchProjectile', 'redirectProjectile', 'removeProjectile']) {
    Object.defineProperty(gameProjectile.prototype, method, { value: function (...args) { return this.physics_controller[method](...args); } });
}
export class awarenessMatrix {
    constructor(world, body) { this.world = world; this.body = body; this.options = {}; }
    analyzeSurroundings(options = {}) { this.options = { ...options }; return this.getNearbyEntities(); }
    getNearbyEntities(results = []) { return this.world.peruseNearbyEntities(this.body, this.options, results); }
    getNearestObstacle() { return this.world.findNearestEntity(this.body, { ...this.options, include_ghosts: false }); }
    getMovementClearance(packet, result = {}) { return this.world.getPathClearance({ ...packet, body: this.body, from: this.body.position }, result); }
}
