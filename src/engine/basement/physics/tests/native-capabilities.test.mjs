// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, BODY_GROUP } from '../index.mjs';
const step = (p, count = 1) => { for (let i = 0; i < count; i++) p.updateState(); };
const close = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);

test('collision, render and light extents share registration but retain their distinct geometry', () => {
    const p = new physicsSystem({ cell_size: 10 });
    const lamp = p.elements.createEntity({ kind: 'decoration',  position: [100, 100], render_shape: { shape_type: 'box', dimensions: [10, 60] }, light_shape: { shape_type: 'circle', radius: 100 } });
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
    for (let i = 0; i < 60; i++) p.elements.createEntity({ kind: 'prop',  position: [i * 10, 0], light_shape: { shape_type: 'circle', radius: 1000 } });
    step(p); assert.equal(p.getStatistics().candidate_pairs, 0); assert.equal(p.getStatistics().narrow_checks, 0);
});
test('contact priority makes companions yield and never overrules static scenery', () => {
    const p = new physicsSystem();
    const hero = p.createEntity({ kind: 'character',  contact_priority: 10 }), friend = p.createEntity({ kind: 'character',  position: [1, 0] });
    step(p); close(hero.position[0], 0); assert.ok(friend.position[0] >= 1.99);
    const q = new physicsSystem(), actor = q.createEntity({ kind: 'character',  contact_priority: 100 });
    q.elements.createEntity({ kind: 'static',  position: [1, 0] }); step(q); assert.ok(actor.position[0] < -0.99);
});
test('body exclusions apply consistently to contacts, projectile impacts and body clearance', () => {
    const p = new physicsSystem(), target = p.elements.createEntity({ kind: 'static',  position: [10, 0] });
    const b = p.createBody({ collision_exclusions: [target.body_id] });
    assert.equal(p.getPathClearance({ body: b, from: [0, 0], to: [20, 0] }).clear, true);
    let hits = 0; p.on('projectileHit', () => hits++);
    p.createEntity({ kind: 'projectile',  position: [3, 0], speed: 1000, collision_exclusions: [target.body_id], collision_shape: { shape_type: 'circle', radius: 0.1 } }); step(p);
    assert.equal(hits, 0); assert.throws(() => b.body_id = 123);
});
test('sliding door holds its rail and rotation, drives to limits and reverses', () => {
    const p = new physicsSystem(), door = p.elements.createEntity({ kind: 'prop',  position: [0, 4], rotation: 0.4, collision_mask: 0 });
    const c = door.createConstraint({ constraint_type: 'slider', local_axis: [1, 0], min_translation: 0, max_translation: 20, motor_speed: 10, max_force: 100 });
    step(p, 180); close(door.position[1], 0, 0.01); close(door.rotation, 0, 0.01); close(door.position[0], 20, 0.1);
    p.setConstraintMotor(c, { motor_speed: -10 }); step(p, 180); close(door.position[0], 0, 0.1);
    assert.throws(() => door.createConstraint({ constraint_type: 'slider', local_axis: [0, 0] }));
});
test('slider motor observes mass, axis locks and the shared break lifecycle', () => {
    const p = new physicsSystem(), b = p.elements.createEntity({ kind: 'prop',  axis_lock: { x: true }, collision_mask: 0 });
    b.createConstraint({ constraint_type: 'slider', motor_speed: 100, max_force: 100 }); step(p, 30); close(b.position[0], 0);
    const c = p.elements.createEntity({ kind: 'prop',  position: [0, 10], collision_mask: 0 }); let broken = 0;
    c.on('constraintBroken', () => broken++); c.createConstraint({ constraint_type: 'slider', break_impulse: 0.01 }); step(p);
    assert.equal(broken, 1);
});
test('scripted scenes use normal body CCD, not a second collision route', () => {
    const p = new physicsSystem(), actor = p.createEntity({ kind: 'character' });
    p.elements.createEntity({ kind: 'static',  position: [10, 0], collision_shape: { shape_type: 'box', dimensions: [1, 100] } });
    p.motion.moveBodyTo(actor, { position: [30, 0], duration: 0.1, easing: 'smooth' });
    step(p, 8); assert.ok(actor.position[0] <= 8.51); assert.equal(p.motion.getMotionState(actor), null);
});
test('orbit and scripted interpolation live in Basement, stop and save without replaying a client calculation', () => {
    const p = new physicsSystem(), gondola = p.elements.createEntity({ kind: 'decoration',  physics_type: 'kinematic', position: [10, 0] });
    p.motion.orbitBody(gondola, { center: [0, 0], angular_speed: Math.PI, rotate_body: false }); step(p, 30);
    close(gondola.position[0], 0); close(gondola.position[1], 10); close(gondola.rotation, 0);
    const state = p.savePhysicsState(), q = new physicsSystem(); q.loadPhysicsState(state); step(p, 10); step(q, 10);
    assert.deepEqual(q.fetchBody(gondola.body_id).position, gondola.position);
    p.motion.stopBodyMotion(gondola); const before = gondola.position; step(p, 3); assert.deepEqual(gondola.position, before);
});
test('cloth anchors follow their registered owner, use shared contacts, and clean up with the owner', () => {
    const p = new physicsSystem({ gravity: [0, 10] }), actor = p.createEntity({ kind: 'character',  position: [50, 50] });
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
    const p = new physicsSystem(), car = p.createEntity({ kind: 'vehicle',  mass: 1200, collision_shape: { shape_type: 'box', dimensions: [60, 30] }, vehicle_template: { tyre_model: 'two_axle' } });
    car.motor.accelerateVehicle(1); car.motor.steerVehicle(0.5); step(p, 120);
    assert.ok(car.rotation > 0.1); assert.ok(car.motor.getVehicleState().axles.front_slip !== 0);
    car.motor.setSurface({ grip: 0, wetness: 1 }); car.body.setAngularVelocity(0); const angle = car.rotation; step(p, 10); close(car.rotation, angle);
    car.updateBody({ axis_lock: { rotation: true } }); car.motor.setSurface({ grip: 1 }); step(p, 10); close(car.rotation, angle);
});
test('traffic stops at a red signal and continues on a green without a traffic spatial index', () => {
    const p = new physicsSystem(), v = p.createEntity({ kind: 'vehicle',  vehicle_template: { max_speed: 40, wheel_base: 4, braking: 40 } });
    p.traffic.registerRoute('a', { points: [[0, 0], [100, 0]], speed_limit: 40, stops: [{ distance: 50, signal_id: 'light', clearance_distance: 5 }] });
    p.traffic.setSignal('light', 'stop'); p.traffic.addVehicle(v, { route_id: 'a', following_distance: 2 }); step(p, 180);
    assert.ok(v.position[0] < 49); assert.ok(v.position[0] > 30);
    p.traffic.setSignal('light', 'go'); step(p, 240); assert.ok(v.position[0] > 95);
    assert.equal(p.getStatistics().spatial.instances, 1);
});
test('crossing reservations serialize conflicting routes and survive save/load', () => {
    const p = new physicsSystem();
    const a = p.createEntity({ kind: 'vehicle',  position: [-30, 0], vehicle_template: { max_speed: 20, wheel_base: 4, braking: 40 } });
    const b = p.createEntity({ kind: 'vehicle',  position: [0, -30], rotation: Math.PI / 2, vehicle_template: { max_speed: 20, wheel_base: 4, braking: 40 } });
    for (const [id, points] of [['a', [[-30, 0], [30, 0]]], ['b', [[0, -30], [0, 30]]]]) p.traffic.registerRoute(id, { points, speed_limit: 20, stops: [{ distance: 25, conflict_id: 'crossing', clearance_distance: 15 }] });
    p.traffic.addVehicle(a, { route_id: 'a', following_distance: 2 }); p.traffic.addVehicle(b, { route_id: 'b', following_distance: 2 });
    step(p, 70); const state = p.savePhysicsState(), q = new physicsSystem(); q.loadPhysicsState(state);
    step(p, 250); step(q, 250); assert.deepEqual(q.fetchBody(a.body_id).position, a.position); assert.deepEqual(q.fetchBody(b.body_id).position, b.position);
    assert.ok(a.position[0] > 25); assert.ok(b.position[1] > 25);
});
test('drivers on the lanes are filed by lane, and follow the one ahead without a sweep', () => {
    const p = new physicsSystem(), r = p.navigation.roads;
    r.addNode('a', { position: [0, 0] }); r.addNode('b', { position: [200, 0] }); r.addNode('c', { position: [400, 0] });
    r.addLane('ab', { from: 'a', to: 'b' }); r.addLane('bc', { from: 'b', to: 'c' });
    const route = p.navigation.findRoute({ from: 'a', to: 'c' });
    assert.deepEqual(route.spans.map(s => [s.lane_id, s.from, Math.round(s.to)]), [['ab', 0, 200], ['bc', 0, 200]]);
    const template = { max_speed: 60, wheel_base: 10, braking: 80 };
    const car = position => p.createEntity({ kind: 'vehicle',  position, vehicle_template: template, collision_shape: { shape_type: 'box', dimensions: [30, 14] } });
    const lead = car([60, 0]), back = car([0, 0]);
    p.traffic.registerRoute('lead', { points: [[60, 0], [200, 0], [400, 0]], lanes: [{ lane_id: 'ab', from: 60, to: 200 }, { lane_id: 'bc', from: 0, to: 200 }], speed_limit: 60,
        stops: [{ distance: 200, signal_id: 'light', conflict_id: 'box', clearance_distance: 20 }] });
    p.traffic.registerRoute('back', { points: route.points, lanes: route.spans, speed_limit: 60 });
    p.traffic.setSignal('light', 'stop'); p.traffic.addVehicle(lead, { route_id: 'lead' }); p.traffic.addVehicle(back, { route_id: 'back' });
    step(p, 2);
    const filed = p.traffic.getLaneOccupancy('ab');
    assert.deepEqual(filed.map(o => o.body_id), [back.body_id, lead.body_id]); assert.ok(filed[1].along > 59);
    step(p, 600);
    assert.ok(lead.position[0] < 255 && lead.position[0] > 200, 'the lead waits at its light');
    assert.ok(back.position[0] < lead.position[0] - 35 && back.position[0] > lead.position[0] - 70, `the one behind queues behind it (${back.position[0]}, ${lead.position[0]})`);
    assert.throws(() => p.traffic.registerRoute('bad', { points: [[0, 0], [1, 0]], lanes: [] }), /lanes/);
    assert.throws(() => p.traffic.registerRoute('bad', { points: [[0, 0], [1, 0]], lanes: [{ from: 0, to: 1 }] }), /lane_id/);
});
test('cars stop before a walkway while anyone is on it, and take a crossing only when the walkways in it are clear', () => {
    const p = new physicsSystem(), template = { max_speed: 60, wheel_base: 10, braking: 80 };
    const car = position => p.createEntity({ kind: 'vehicle',  position, vehicle_template: template, collision_shape: { shape_type: 'box', dimensions: [30, 14] } });
    const walker = p.createEntity({ kind: 'character',  position: [150, 200], collision_shape: { shape_type: 'circle', radius: 4 } });
    const lane = { lane_id: 'ab', from: 0, to: 400 };
    p.traffic.registerRoute('walk', { points: [[0, 0], [400, 0]], lanes: [lane], speed_limit: 60, stops: [{ distance: 150, walkway_id: 'zebra', clearance_distance: 40 }] });
    p.traffic.registerRoute('box', { points: [[0, 60], [400, 60]], lanes: [{ ...lane, lane_id: 'cd' }], speed_limit: 60,
        stops: [{ distance: 150, signal_id: 'light', conflict_id: 'box', clearance_distance: 80 }, { distance: 200, walkway_id: 'past', clearance_distance: 40 }] });
    const a = car([0, 0]), b = car([0, 60]);
    p.traffic.setSignal('light', 'go'); p.traffic.addVehicle(a, { route_id: 'walk' }); p.traffic.addVehicle(b, { route_id: 'box' });
    p.traffic.enterWalkway('zebra', walker); p.traffic.enterWalkway('past', walker);
    assert.deepEqual(p.traffic.getWalkway('zebra'), [walker.body_id]);
    step(p, 600);
    assert.ok(a.position[0] < 150 && a.position[0] > 100, `it waits before the walkway (${a.position[0]})`);
    assert.ok(b.position[0] < 150 && b.position[0] > 100, `it waits before the crossing, not in it (${b.position[0]})`);
    assert.ok(!p.traffic._saveState().reservations.length, 'and does not hold the crossing');
    p.traffic.leaveWalkway('zebra', walker); p.traffic.leaveWalkway('past', walker);
    assert.deepEqual(p.traffic.getWalkway('zebra'), []);
    step(p, 600);
    assert.ok(a.position[0] > 300 && b.position[0] > 300, `both go on once it is clear (${a.position[0]}, ${b.position[0]})`);
    assert.throws(() => p.traffic.registerRoute('bad', { points: [[0, 0], [1, 0]], stops: [{ distance: 0, walkway_id: '' }] }), /walkway_id|Stop/);
});
test('Flit finds the furthest free interval even when a fixed sample scan would miss it', () => {
    const p = new physicsSystem(), actor = p.createEntity({ kind: 'character',  collision_shape: { shape_type: 'circle', radius: 0.01 } });
    p.elements.createEntity({ kind: 'static',  position: [99.95, 0], collision_shape: { shape_type: 'box', dimensions: [0.1, 1] } });
    p.elements.createEntity({ kind: 'static',  position: [49.93, 0], collision_shape: { shape_type: 'box', dimensions: [99.86, 1] } });
    const landing = p.findClearPlacement({ body: actor, to: [100, 0] });
    assert.ok(landing); assert.ok(landing.position[0] > 99.88 && landing.position[0] < 99.89, JSON.stringify(landing));
    assert.equal(p.isPlacementClear(actor, landing.position), true);
});
test('Flit unions compound blocker intervals and returns no occupied fallback', () => {
    const p = new physicsSystem(), actor = p.createEntity({ kind: 'character',  collision_shape: { shape_type: 'circle', radius: 0.1 } });
    p.elements.createEntity({ kind: 'static',  collision_shape: { shape_type: 'compound', children: [
        { shape_type: 'box', dimensions: [10, 2], local_position: [5, 0] },
        { shape_type: 'box', dimensions: [10, 2], local_position: [15, 0] },
    ] } });
    assert.equal(p.findClearPlacement({ body: actor, to: [20, 0] }), null);
});
test('passing routes are checked in the engine and manual control releases their reservation', () => {
    const p = new physicsSystem(), car = p.createEntity({ kind: 'vehicle',  vehicle_template: { wheel_base: 4 } });
    p.elements.createEntity({ kind: 'static',  position: [15, 0], collision_shape: { shape_type: 'box', dimensions: [4, 4] } });
    p.traffic.registerRoute('blocked', { points: [[0, 0], [30, 0]] });
    p.traffic.registerRoute('passing', { points: [[0, 0], [8, 10], [25, 10], [35, 0]] });
    assert.equal(p.traffic.requestPassingRoute(car, { route_id: 'blocked' }), false);
    assert.equal(p.traffic.requestPassingRoute(car, { route_id: 'passing' }), true);
    assert.equal(p.traffic.getState(car).route_id, 'passing');
    car.motor.steerVehicle(0.1); assert.equal(p.traffic.getState(car), null);
});
test('entity template joints use the spawn origin and roll back an invalid component atomically', () => {
    const p = new physicsSystem();
    const door = p.elements.createEntity({ kind: 'prop',  position: [100, 50], constraints: [{ constraint_type: 'slider', max_translation: 10, motor_speed: 10, max_force: 100 }] });
    step(p, 90); assert.ok(door.position[0] > 108); close(door.position[1], 50);
    assert.equal(p.getBodyConstraints(door).length, 1);
    const before = p.getStatistics();
    assert.throws(() => p.elements.createEntity({ kind: 'prop',  constraints: [{ constraint_type: 'slider' }, { constraint_type: 'unknown' }] }));
    assert.equal(p.getStatistics().bodies, before.bodies); assert.equal(p.getStatistics().constraints, before.constraints);
});
test('grazing circle sweeps resolve analytically instead of exhausting advancement iterations', () => {
    const p = new physicsSystem(), obstacle = p.elements.createEntity({ kind: 'static',  position: [50, 24.001], collision_shape: { shape_type: 'circle', radius: 12 } });
    const actor = p.createEntity({ kind: 'character',  collision_shape: { shape_type: 'circle', radius: 12 } });
    assert.equal(p.getPathClearance({ body: actor, from: [0, 0], to: [100, 0] }).clear, true);
    obstacle.setPosition([50, 24]);
    assert.equal(p.getPathClearance({ body: actor, from: [0, 0], to: [100, 0] }).clear, false);
});
test('following a physical target plans an approach outside its collision shape', () => {
    const p = new physicsSystem(), a = p.createEntity({ kind: 'character',  collision_shape: { shape_type: 'circle', radius: 12 } }), b = p.createEntity({ kind: 'character',  position: [100, 0], collision_shape: { shape_type: 'circle', radius: 12 } });
    a.motor.followTarget(b); step(p, 120); assert.ok(a.position[0] > 70 && a.position[0] < 76.01);
});
test('noncolliding cloth anchors do not become accidental static walls', () => {
    const p = new physicsSystem(); p.createCloth({ points: [[0, 0], [0, 1]], anchors: [0], edges: [[0, 1]] });
    const actor = p.createEntity({ kind: 'character',  position: [-3, 0] }); actor.motor.setMovement([1, 0]); step(p, 4);
    assert.equal(p.getStatistics().candidate_pairs, 0);
});
test('street pedestrian circle/car-corner sweep cannot stall on a near miss', () => {
    const p = new physicsSystem();
    p.elements.createEntity({ kind: 'static',  position: [680.7051690164839, 330], rotation: Math.PI, collision_shape: { shape_type: 'box', dimensions: [95, 44] } });
    assert.doesNotThrow(() => p.getPathClearance({ collision_shape: { shape_type: 'circle', radius: 12 }, from: [615.7645019878171, 351.5290039756343], to: [632.7350647362942, 368.49956672411145] }));
});
test('motor requests against an existing wall contact preserve tangential walking', () => {
    const p = new physicsSystem(), actor = p.createEntity({ kind: 'character',  friction: 0 });
    p.elements.createEntity({ kind: 'static',  position: [2, 0], friction: 0, collision_shape: { shape_type: 'box', dimensions: [2, 100] } });
    actor.motor.setMovement([1, 1], { speed: 60 }); step(p, 30);
    assert.ok(actor.position[0] <= 1e-5); assert.ok(actor.position[1] > 5);
});
test('a one-trip route is released once no driver follows it', () => {
    const p = new physicsSystem(), v = p.createEntity({ kind: 'vehicle',  vehicle_template: { max_speed: 40, wheel_base: 4, braking: 40 } });
    p.traffic.registerRoute('trip', { points: [[0, 0], [100, 0]] }); p.traffic.addVehicle(v, { route_id: 'trip' });
    assert.equal(p.traffic.releaseRoute('trip'), false, 'a driver still follows it'); assert.equal(p.traffic.releaseRoute('nowhere'), false);
    p.traffic.removeVehicle(v); assert.equal(p.traffic.releaseRoute('trip'), true); assert.throws(() => p.traffic.getRouteStart('trip'), /Unknown route/);
});
test('a driver waits short of a crossing while the road past it is queued, then goes', () => {
    const p = new physicsSystem(), v = p.createEntity({ kind: 'vehicle',  vehicle_template: { max_speed: 40, wheel_base: 4, braking: 40 } });
    const queued = p.createEntity({ kind: 'vehicle',  position: [80, 0], vehicle_template: { wheel_base: 4 } });
    p.traffic.registerRoute('a', { points: [[0, 0], [120, 0]], speed_limit: 40, stops: [{ distance: 40, conflict_id: 'box', clearance_distance: 40 }] });
    p.traffic.addVehicle(v, { route_id: 'a', following_distance: 2 }); step(p, 240);
    assert.ok(v.position[0] < 40, `stopped short of the box at ${v.position[0]}`);
    p.removeBody(queued); step(p, 240); assert.ok(v.position[0] > 90, 'the box cleared, it went');
});
test('a sweep of two close shapes, one turning fast, ends in a contact or a clear path and never throws', () => {
    const p = new physicsSystem(), box = { shape_type: 'box', dimensions: [95, 44] };
    const a = p.createEntity({ kind: 'vehicle',  position: [0, 0], collision_shape: box, angular_velocity: 40, vehicle_template: { wheel_base: 40 } });
    const b = p.createEntity({ kind: 'vehicle',  position: [0, 44.02], collision_shape: box, linear_velocity: [300, 0], vehicle_template: { wheel_base: 40 } });
    let contact; assert.doesNotThrow(() => { contact = p.predictCollision({ body_a: a, body_b: b, seconds: 2 }); });
    assert.ok(contact && contact.seconds < .1, 'touching (a hair apart) counts from the start');
});
