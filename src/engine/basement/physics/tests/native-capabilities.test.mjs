// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, BODY_GROUP } from '../index.mjs';
const step = (p, count = 1) => { for (let i = 0; i < count; i++) p.updateState(); };
const close = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);

test('collision, render and light extents share registration but retain their distinct geometry', () => {
    const p = new physicsSystem({ cell_size: 10 });
    const lamp = p.elements.createDecoration({ position: [100, 100], render_shape: { shape_type: 'box', dimensions: [10, 60] }, light_shape: { shape_type: 'circle', radius: 100 } });
    assert.equal(p.spatial_grid.getStatistics().instances, 1);
    const bounds = { left: 15, right: 20, top: 90, bottom: 110 };
    assert.equal(p.queryEntitiesInBounds({ bounds, bounds_type: 'light' })[0].entity, lamp);
    assert.equal(p.queryEntitiesInBounds({ bounds, bounds_type: 'render' }).length, 0);
    assert.equal(p.containsPoint(lamp, [100, 125], { bounds_type: 'render' }), true);
    assert.equal(p.containsPoint(lamp, [100, 125]), false);
    lamp.setPosition([300, 300]);
    assert.equal(p.queryEntitiesInBounds({ bounds, bounds_type: 'light' }).length, 0);
    assert.throws(() => p.getBodyBounds(lamp, { bounds_type: 'unknown' }));
});
test('large light extents never turn distant physical bodies into narrowphase pairs', () => {
    const p = new physicsSystem({ cell_size: 100 });
    for (let i = 0; i < 60; i++) p.elements.createProp({ position: [i * 10, 0], light_shape: { shape_type: 'circle', radius: 1000 } });
    step(p); assert.equal(p.getStatistics().candidate_pairs, 0); assert.equal(p.getStatistics().narrow_checks, 0);
});
test('contact priority makes companions yield and never overrules static scenery', () => {
    const p = new physicsSystem();
    const hero = p.createCharacter({ contact_priority: 10 }), friend = p.createCharacter({ position: [1, 0] });
    step(p); close(hero.position[0], 0); assert.ok(friend.position[0] >= 1.99);
    const q = new physicsSystem(), actor = q.createCharacter({ contact_priority: 100 });
    q.elements.createStatic({ position: [1, 0] }); step(q); assert.ok(actor.position[0] < -0.99);
});
test('body exclusions apply consistently to contacts, projectile impacts and body clearance', () => {
    const p = new physicsSystem(), target = p.elements.createStatic({ position: [10, 0] });
    const b = p.createBody({ collision_exclusions: [target.body_id] });
    assert.equal(p.getPathClearance({ body: b, from: [0, 0], to: [20, 0] }).clear, true);
    let hits = 0; p.on('projectileHit', () => hits++);
    p.createProjectile({ position: [3, 0], speed: 1000, collision_exclusions: [target.body_id], collision_shape: { shape_type: 'circle', radius: 0.1 } }); step(p);
    assert.equal(hits, 0); assert.throws(() => b.body_id = 123);
});
test('sliding door holds its rail and rotation, drives to limits and reverses', () => {
    const p = new physicsSystem(), door = p.elements.createProp({ position: [0, 4], rotation: 0.4, collision_mask: 0 });
    const c = door.createConstraint({ constraint_type: 'slider', local_axis: [1, 0], min_translation: 0, max_translation: 20, motor_speed: 10, max_force: 100 });
    step(p, 180); close(door.position[1], 0, 0.01); close(door.rotation, 0, 0.01); close(door.position[0], 20, 0.1);
    p.setConstraintMotor(c, { motor_speed: -10 }); step(p, 180); close(door.position[0], 0, 0.1);
    assert.throws(() => door.createConstraint({ constraint_type: 'slider', local_axis: [0, 0] }));
});
test('slider motor observes mass, axis locks and the shared break lifecycle', () => {
    const p = new physicsSystem(), b = p.elements.createProp({ axis_lock: { x: true }, collision_mask: 0 });
    b.createConstraint({ constraint_type: 'slider', motor_speed: 100, max_force: 100 }); step(p, 30); close(b.position[0], 0);
    const c = p.elements.createProp({ position: [0, 10], collision_mask: 0 }); let broken = 0;
    c.on('constraintBroken', () => broken++); c.createConstraint({ constraint_type: 'slider', break_impulse: 0.01 }); step(p);
    assert.equal(broken, 1);
});
test('scripted scenes use normal body CCD, not a second collision route', () => {
    const p = new physicsSystem(), actor = p.createCharacter();
    p.elements.createStatic({ position: [10, 0], collision_shape: { shape_type: 'box', dimensions: [1, 100] } });
    p.motion.moveBodyTo(actor, { position: [30, 0], duration: 0.1, easing: 'smooth' });
    step(p, 8); assert.ok(actor.position[0] <= 8.51); assert.equal(p.motion.getMotionState(actor), null);
});
test('orbit and scripted interpolation live in Basement, stop and save without replaying a client calculation', () => {
    const p = new physicsSystem(), gondola = p.elements.createDecoration({ physics_type: 'kinematic', position: [10, 0] });
    p.motion.orbitBody(gondola, { center: [0, 0], angular_speed: Math.PI, rotate_body: false }); step(p, 30);
    close(gondola.position[0], 0); close(gondola.position[1], 10); close(gondola.rotation, 0);
    const state = p.savePhysicsState(), q = new physicsSystem(); q.loadPhysicsState(state); step(p, 10); step(q, 10);
    assert.deepEqual(q.fetchBody(gondola.body_id).position, gondola.position);
    p.motion.stopBodyMotion(gondola); const before = gondola.position; step(p, 3); assert.deepEqual(gondola.position, before);
});
test('cloth anchors follow their registered owner, use shared contacts, and clean up with the owner', () => {
    const p = new physicsSystem({ gravity: [0, 10] }), actor = p.createCharacter({ position: [50, 50] });
    const cloth = p.createCloth({ owner: actor, points: [[0, 0], [0, 3], [3, 3]], anchors: [0], edges: [[0, 1], [1, 2], [0, 2]], collide: true, wind: [1, 0] });
    assert.equal(p.getStatistics().spatial.instances, 4);
    actor.setPosition([70, 80]); step(p); assert.deepEqual(p.getClothState(cloth)[0].position, actor.position);
    assert.equal(p.getClothState(cloth)[1].collision_group, BODY_GROUP.PARTICLE);
    const saved = p.savePhysicsState(), q = new physicsSystem({ gravity: [0, 10] }); q.loadPhysicsState(saved);
    step(p, 10); step(q, 10); assert.deepEqual(q.getClothState(cloth), p.getClothState(cloth));
    actor.destroy(); step(p, 2); assert.equal(p.getStatistics().bodies, 0); assert.equal(p.getStatistics().constraints, 0);
});
test('invalid cloth meshes leave no orphan bodies or constraints', () => {
    const p = new physicsSystem();
    for (const packet of [{ points: [[0, 0]], edges: [[0, 2]] }, { points: [[0, 0]], anchors: [0, 0] }, { points: [[0, 0]], mass: -1 }]) assert.throws(() => p.createCloth(packet));
    assert.equal(p.getStatistics().bodies, 0); assert.equal(p.getStatistics().constraints, 0);
});
test('two-axle tyre impulses turn a car and respect rotation locks and zero surface grip', () => {
    const p = new physicsSystem(), car = p.createVehicle({ mass: 1200, collision_shape: { shape_type: 'box', dimensions: [60, 30] }, vehicle_template: { tyre_model: 'two_axle' } });
    car.accelerateVehicle(1); car.steerVehicle(0.5); step(p, 120);
    assert.ok(car.rotation > 0.1); assert.ok(car.getVehicleState().axles.front_slip !== 0);
    car.setSurface({ grip: 0, wetness: 1 }); car.body.setAngularVelocity(0); const angle = car.rotation; step(p, 10); close(car.rotation, angle);
    car.updateBody({ axis_lock: { rotation: true } }); car.setSurface({ grip: 1 }); step(p, 10); close(car.rotation, angle);
});
test('traffic stops at a red signal and continues on a green without a traffic spatial index', () => {
    const p = new physicsSystem(), v = p.createVehicle({ vehicle_template: { max_speed: 40, wheel_base: 4, braking: 40 } });
    p.traffic.registerRoute('a', { points: [[0, 0], [100, 0]], speed_limit: 40, stops: [{ distance: 50, signal_id: 'light', clearance_distance: 5 }] });
    p.traffic.setSignal('light', 'stop'); p.traffic.addVehicle(v, { route_id: 'a', following_distance: 2 }); step(p, 180);
    assert.ok(v.position[0] < 49); assert.ok(v.position[0] > 30);
    p.traffic.setSignal('light', 'go'); step(p, 240); assert.ok(v.position[0] > 95);
    assert.equal(p.getStatistics().spatial.instances, 1);
});
test('crossing reservations serialize conflicting routes and survive save/load', () => {
    const p = new physicsSystem();
    const a = p.createVehicle({ position: [-30, 0], vehicle_template: { max_speed: 20, wheel_base: 4, braking: 40 } });
    const b = p.createVehicle({ position: [0, -30], rotation: Math.PI / 2, vehicle_template: { max_speed: 20, wheel_base: 4, braking: 40 } });
    for (const [id, points] of [['a', [[-30, 0], [30, 0]]], ['b', [[0, -30], [0, 30]]]]) p.traffic.registerRoute(id, { points, speed_limit: 20, stops: [{ distance: 25, conflict_id: 'crossing', clearance_distance: 15 }] });
    p.traffic.addVehicle(a, { route_id: 'a', following_distance: 2 }); p.traffic.addVehicle(b, { route_id: 'b', following_distance: 2 });
    step(p, 70); const state = p.savePhysicsState(), q = new physicsSystem(); q.loadPhysicsState(state);
    step(p, 250); step(q, 250); assert.deepEqual(q.fetchBody(a.body_id).position, a.position); assert.deepEqual(q.fetchBody(b.body_id).position, b.position);
    assert.ok(a.position[0] > 25); assert.ok(b.position[1] > 25);
});
test('Flit finds the furthest free interval even when a fixed sample scan would miss it', () => {
    const p = new physicsSystem(), actor = p.createCharacter({ collision_shape: { shape_type: 'circle', radius: 0.01 } });
    p.elements.createStatic({ position: [99.95, 0], collision_shape: { shape_type: 'box', dimensions: [0.1, 1] } });
    p.elements.createStatic({ position: [49.93, 0], collision_shape: { shape_type: 'box', dimensions: [99.86, 1] } });
    const landing = p.findClearPlacement({ body: actor, to: [100, 0] });
    assert.ok(landing); assert.ok(landing.position[0] > 99.88 && landing.position[0] < 99.89, JSON.stringify(landing));
    assert.equal(p.isPlacementClear(actor, landing.position), true);
});
test('Flit unions compound blocker intervals and returns no occupied fallback', () => {
    const p = new physicsSystem(), actor = p.createCharacter({ collision_shape: { shape_type: 'circle', radius: 0.1 } });
    p.elements.createStatic({ collision_shape: { shape_type: 'compound', children: [
        { shape_type: 'box', dimensions: [10, 2], local_position: [5, 0] },
        { shape_type: 'box', dimensions: [10, 2], local_position: [15, 0] },
    ] } });
    assert.equal(p.findClearPlacement({ body: actor, to: [20, 0] }), null);
});
test('passing routes are checked in the engine and manual control releases their reservation', () => {
    const p = new physicsSystem(), car = p.createVehicle({ vehicle_template: { wheel_base: 4 } });
    p.elements.createStatic({ position: [15, 0], collision_shape: { shape_type: 'box', dimensions: [4, 4] } });
    p.traffic.registerRoute('blocked', { points: [[0, 0], [30, 0]] });
    p.traffic.registerRoute('passing', { points: [[0, 0], [8, 10], [25, 10], [35, 0]] });
    assert.equal(p.traffic.requestPassingRoute(car, { route_id: 'blocked' }), false);
    assert.equal(p.traffic.requestPassingRoute(car, { route_id: 'passing' }), true);
    assert.equal(p.traffic.getState(car).route_id, 'passing');
    car.steerVehicle(0.1); assert.equal(p.traffic.getState(car), null);
});
test('entity template joints use the spawn origin and roll back an invalid component atomically', () => {
    const p = new physicsSystem();
    const door = p.elements.createProp({ position: [100, 50], constraints: [{ constraint_type: 'slider', max_translation: 10, motor_speed: 10, max_force: 100 }] });
    step(p, 90); assert.ok(door.position[0] > 108); close(door.position[1], 50);
    assert.equal(p.getBodyConstraints(door).length, 1);
    const before = p.getStatistics();
    assert.throws(() => p.elements.createProp({ constraints: [{ constraint_type: 'slider' }, { constraint_type: 'unknown' }] }));
    assert.equal(p.getStatistics().bodies, before.bodies); assert.equal(p.getStatistics().constraints, before.constraints);
});
test('grazing circle sweeps resolve analytically instead of exhausting advancement iterations', () => {
    const p = new physicsSystem(), obstacle = p.elements.createStatic({ position: [50, 24.001], collision_shape: { shape_type: 'circle', radius: 12 } });
    const actor = p.createCharacter({ collision_shape: { shape_type: 'circle', radius: 12 } });
    assert.equal(p.getPathClearance({ body: actor, from: [0, 0], to: [100, 0] }).clear, true);
    obstacle.setPosition([50, 24]);
    assert.equal(p.getPathClearance({ body: actor, from: [0, 0], to: [100, 0] }).clear, false);
});
test('following a physical target plans an approach outside its collision shape', () => {
    const p = new physicsSystem(), a = p.createCharacter({ collision_shape: { shape_type: 'circle', radius: 12 } }), b = p.createCharacter({ position: [100, 0], collision_shape: { shape_type: 'circle', radius: 12 } });
    a.followTarget(b); step(p, 120); assert.ok(a.position[0] > 70 && a.position[0] < 76.01);
});
test('noncolliding cloth anchors do not become accidental static walls', () => {
    const p = new physicsSystem(); p.createCloth({ points: [[0, 0], [0, 1]], anchors: [0], edges: [[0, 1]] });
    const actor = p.createCharacter({ position: [-3, 0] }); actor.setMovement([1, 0]); step(p, 4);
    assert.equal(p.getStatistics().candidate_pairs, 0);
});
test('street pedestrian circle/car-corner sweep cannot stall on a near miss', () => {
    const p = new physicsSystem();
    p.elements.createStatic({ position: [680.7051690164839, 330], rotation: Math.PI, collision_shape: { shape_type: 'box', dimensions: [95, 44] } });
    assert.doesNotThrow(() => p.getPathClearance({ collision_shape: { shape_type: 'circle', radius: 12 }, from: [615.7645019878171, 351.5290039756343], to: [632.7350647362942, 368.49956672411145] }));
});
test('motor requests against an existing wall contact preserve tangential walking', () => {
    const p = new physicsSystem(), actor = p.createCharacter({ friction: 0 });
    p.elements.createStatic({ position: [2, 0], friction: 0, collision_shape: { shape_type: 'box', dimensions: [2, 100] } });
    actor.setMovement([1, 1], { speed: 60 }); step(p, 30);
    assert.ok(actor.position[0] <= 1e-5); assert.ok(actor.position[1] > 5);
});
