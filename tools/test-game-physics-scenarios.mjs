import {registerGameEntityTypes} from '../src/directory/game-entity-types.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../src/basement/physics/index.mjs';
import { createGameAssetLibrary } from '../src/directory/game-assets.mjs';
const world=()=>{const p=new physicsSystem({asset_library:createGameAssetLibrary()});registerGameEntityTypes(p);return p;};
const step = (p, n) => { for (let i = 0; i < n; i++) p.updateState(); };
// These exercise Directory definitions on the engine. They are not legacy game cutover tests.
test('group 1 definitions: building compounds and props use common contacts and persist', () => {
    const p = world(), board = p.createEntity({ template: 'df:billboard', position: [100, 100] });
    const prop = p.createEntity({ template: 'df:prop', position: [50, 100], linear_velocity: [120, 0] });
    let contacts = 0; board.on('contactBegin', () => contacts++); step(p, 30);
    assert.ok(contacts > 0); assert.ok(prop.position[0] < 100);
    const snapshot = p.savePhysicsState(), q = world(); q.loadPhysicsState(snapshot);
    assert.equal(q.elements.fetchEntity(board.entity_id).template_id, 'df:billboard');
});
test('group 2 definitions: official player/projectile/prop hits apply shared impulses', () => {
    const p = world(), player = p.createEntity({ template: 'df:player_949' });
    const prop = p.createEntity({ template: 'df:prop', position: [100, 0] });
    let hit = null; p.on('projectileHit', event => { if (event.target_entity === prop) hit = event; });
    p.createEntity({ template: 'df:projectile', owner_id: player.entity_id, target: prop, position: [20, 0] }); step(p, 15);
    assert.equal(hit?.target_entity, prop); assert.ok(prop.linear_velocity[0] > 0);
    assert.equal(player.getAsset('appearance').kind, 'appearance');
});
test('group 3 definitions: crowd and companion movement use official character requests', () => {
    const p = world(), player = p.createEntity({ template: 'df:player_949', position: [100, 0] });
    const companion = p.createEntity({ template: 'df:companion', position: [0, 0] });
    const walker = p.createEntity({ template: 'df:crowd_walker', position: [0, 100] });
    companion.followTarget(player, { arrival_distance: 30, personal_space: 25 }); walker.moveTo([100, 100]); step(p, 100);
    assert.ok(companion.position[0] > 50); assert.ok(walker.position[0] > 90);
    assert.ok(companion.awareness.analyzeSurroundings({ near_range: 100 }).some(hit => hit.entity === player));
});
test('group 4 definitions: driven tyre model and bumper contact use native physics', () => {
    const p = world(), driven = p.createEntity({ template: 'df:driven_vehicle', position: [500, 500] });
    driven.accelerateVehicle(1); driven.steerVehicle(0.5);
    const a = p.createEntity({ template: 'df:bumper_car', position: [0, 0], linear_velocity: [90, 0] });
    const b = p.createEntity({ template: 'df:bumper_car', position: [50, 0] });
    let impulse = 0; b.on('contactBegin', e => { impulse += e.normal_impulse; }); step(p, 60);
    assert.ok(impulse > 0); assert.ok(b.position[0] > 50); assert.ok(driven.rotation > 0.1);
    assert.equal(a.getVehicleState().mass, 150);
});
test('group 5 definitions: sliding doors, furniture drag and scene trajectories stay in engine', () => {
    const p = world(), door = p.createEntity({ template: 'df:sliding_door', position: [100, 100] });
    p.setConstraintMotor(p.getBodyConstraints(door)[0], { motor_speed: 20 });
    const furniture = p.createEntity({ template: 'df:furniture', position: [0, -100] });
    p.beginDrag(furniture, { world_target: [30, -100] });
    const scene = p.createEntity({ template: 'df:scene_actor', position: [0, 200] });
    p.motion.moveBodyTo(scene, { position: [50, 200], duration: 1, easing: 'smooth' }); step(p, 90);
    assert.ok(door.position[0] > 110); assert.ok(furniture.position[0] > 15); assert.ok(Math.abs(scene.position[0] - 50) < 0.01);
});
test('group 6 definitions: lamps, orbital scenery and owned cloth use the single spatial service', () => {
    const p = world(), lamp = p.createEntity({ template: 'df:lamp' });
    const gondola = p.createEntity({ template: 'df:gondola', position: [300, 300] });
    p.motion.orbitBody(gondola, { center: [300, 290], angular_speed: 1 });
    const cloth = p.createCloth({ owner: gondola, points: [[0, 0], [0, 10]], anchors: [0], edges: [[0, 1]], wind: [0.1, 0] });
    step(p, 20);
    assert.ok(p.queryEntitiesInBounds({ bounds: { left: 100, right: 110, top: 0, bottom: 10 }, bounds_type: 'light' }).some(hit => hit.entity === lamp));
    assert.equal(p.getStatistics().spatial.instances, 4);
    assert.deepEqual(p.getClothState(cloth)[0].position, gondola.position);
    gondola.destroy(); assert.equal(p.getStatistics().bodies, 1);
});
