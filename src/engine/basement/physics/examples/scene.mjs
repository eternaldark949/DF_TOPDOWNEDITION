// ===== LV0 BASEMENT =====
import { physicsSystem, BODY_GROUP } from '../index.mjs';

/** This file acts as a game client: definitions, requests and event handling only. */
export function createSandbox() {
    const physics = new physicsSystem({ cell_size: 64 });
    const scenery = [
        { position: [400, 10], dimensions: [800, 20] },
        { position: [400, 490], dimensions: [800, 20] },
        { position: [10, 250], dimensions: [20, 500] },
        { position: [790, 250], dimensions: [20, 500] },
        { position: [400, 240], dimensions: [30, 180] },
    ].map(p => physics.elements.createStatic({ position: p.position, collision_group: BODY_GROUP.STATIC, collision_shape: { shape_type: 'box', dimensions: p.dimensions } }));
    const character = physics.createCharacter({ name: 'Walker', position: [120, 120], collision_shape: { shape_type: 'circle', radius: 12 }, movement: { max_speed: 150 } });
    const vehicle = physics.createVehicle({ name: 'Car', position: [150, 350], mass: 1000, collision_shape: { shape_type: 'box', dimensions: [64, 34] }, vehicle_template: { max_speed: 180, wheel_base: 40 } });
    const props = [[540, 150], [570, 220], [610, 300]].map(position => physics.elements.createProp({ position, mass: 5, collision_shape: { shape_type: 'box', dimensions: [24, 24] } }));
    const impacts = [];
    physics.on('projectileHit', e => { impacts.push({ target_id: e.target_body.body_id, point: e.world_point }); if (impacts.length > 10) impacts.shift(); });
    return {
        physics, character, vehicle, props, scenery, impacts,
        walk: direction => character.setMovement(direction),
        drive: ({ throttle = 0, steer = 0, brake = 0 }) => { vehicle.accelerateVehicle(throttle); vehicle.steerVehicle(steer); vehicle.brakeVehicle(brake); },
        shoot: target => physics.createProjectile({ position: character.physics_controller.body.position, owner_id: character.body_id, target, speed: 600, lifetime: 2, impact_strength: 120, collision_shape: { shape_type: 'circle', radius: 2 } }),
        step: () => physics.updateState(),
    };
}
