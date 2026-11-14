// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, BODY_GROUP } from '../index.mjs';
const step = (p, n = 1) => { for (let i = 0; i < n; i++) p.updateState(); };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('attachments preserve body identity and use only the existing world grid', () => {
    const p = new physicsSystem(), car = p.createVehicle({ collision_shape: { shape_type: 'box', dimensions: [60, 30] } }), person = p.createCharacter({ position: [100, 0] });
    const id = person.body_id, body = person.body;
    p.attachBody(person, { parent_body: car, local_position: [10, -5] });
    assert.equal(person.body, body); assert.equal(person.body_id, id); assert.deepEqual(person.position, [10, -5]);
    assert.equal(person.getState().body.attached_to, car.body_id);
    assert.equal(p.getStatistics().spatial.instances, 2); assert.equal(p.getStatistics().bodies, 2);
    assert.equal(p.peruseNearbyEntities(car, { include_groups: BODY_GROUP.CHARACTER }).length, 0);
    assert.throws(() => person.body.applyImpulse([10, 0])); assert.throws(() => person.setPosition([500, 0]));
});
test('parent motion, corrections and interpolation keep the mounted local pose inside the engine', () => {
    const p = new physicsSystem(), parent = p.createBody({ collision_mask: 0, angular_velocity: Math.PI, linear_velocity: [10, 0] }), child = p.createCharacter();
    p.attachBody(child, { parent_body: parent, local_position: [10, 0] }); step(p, 30);
    near(child.position[0], parent.position[0]); near(child.position[1], parent.position[1] + 10);
    const pose = child.getRenderState(0.5), expected = p.getBodyPoint(parent, [10, 0], { blend: 0.5 });
    assert.deepEqual(pose.position, expected.position);
    parent.setPosition([100, 100]); const mounted = p.getBodyPoint(parent, [10, 0]); assert.deepEqual(child.position, mounted.position);
    p.setAttachmentPose(child, { local_position: [0, 0], local_rotation: 0.5 }); assert.deepEqual(child.position, parent.position);
    near(child.rotation, parent.rotation + 0.5);
});
test('parent deactivation hides its mounted descendants without changing their configured active state', () => {
    const p = new physicsSystem(), car = p.createVehicle(), child = p.createCharacter(); p.attachBody(child, { parent_body: car });
    car.deactivate(); assert.equal(child.active, false); assert.equal(p.getStatistics().spatial.instances, 0);
    child.updateBody({ mass: 20 }); car.activate(); assert.equal(child.active, true); assert.equal(p.getStatistics().spatial.instances, 2);
    assert.equal(child.mass, 20);
});
test('safe detachment uses configured masks and checks both exit endpoint and route', () => {
    const p = new physicsSystem(), car = p.createVehicle({ collision_shape: { shape_type: 'box', dimensions: [60, 30] } }), child = p.createCharacter({ collision_shape: { shape_type: 'circle', radius: 5 } });
    p.attachBody(child, { parent_body: car, local_position: [0, 0] });
    p.elements.createStatic({ position: [0, -25], collision_shape: { shape_type: 'box', dimensions: [100, 2] } });
    assert.equal(p.detachBody(child, { exit_points: [[0, -50]] }), null);
    assert.ok(p.getAttachmentState(child));
    p.detachBody(child, { exit_points: [[0, -50], [0, 50]] });
    assert.equal(p.getAttachmentState(child), null); assert.deepEqual(child.position, [0, 50]);
    assert.equal(child.collision_group, BODY_GROUP.CHARACTER); assert.equal(child.physics_type, 'character');
    child.setMovement([1, 0]); step(p); assert.ok(child.position[0] > 0);
});
test('attachments reject cycles including pending requests and clean up removed parents', () => {
    const p = new physicsSystem(), a = p.createBody({ collision_mask: 0 }), b = p.createBody({ collision_mask: 0 }), c = p.createBody({ collision_mask: 0 });
    p.attachBody(b, { parent_body: a }); p.attachBody(c, { parent_body: b });
    assert.throws(() => p.attachBody(a, { parent_body: c })); assert.throws(() => p.attachBody(b, { parent_body: c }));
    p.removeBody(a); assert.equal(p.getAttachmentState(b), null); assert.equal(p.getAttachmentState(c).parent_body_id, b.body_id);
    p.clearWorld(); assert.equal(p.getStatistics().bodies, 0);
});
test('save restoration retains attachments and rejects a cyclic exchange before changing a live world', () => {
    const p = new physicsSystem(), car = p.createVehicle({ position: [30, 40] }), child = p.createCharacter();
    p.attachBody(child, { parent_body: car, local_position: [5, 6] }); car.deactivate();
    const saved = p.savePhysicsState(), q = new physicsSystem(); q.loadPhysicsState(saved);
    assert.equal(q.fetchBody(child.body_id).getState().active, false); q.activateBody(car.body_id);
    assert.equal(q.fetchBody(child.body_id).getState().active, true); assert.deepEqual(q.getAttachmentState(child.body_id).local_position, [5, 6]);
    const invalid = structuredClone(saved); invalid.attachments.push({ body_id: car.body_id, parent_body_id: child.body_id, local_position: [0, 0], local_rotation: 0 });
    assert.throws(() => q.loadPhysicsState(invalid)); assert.equal(q.getStatistics().bodies, 2);
});
test('event-time mount reservations cannot assign a body to two parents', () => {
    const p = new physicsSystem(), child = p.createCharacter({ position: [200, 0] }), a = p.createBody(), b = p.createBody();
    const drop = p.on('contactBegin', () => { drop(); p.attachBody(child, { parent_body: a }); assert.throws(() => p.attachBody(child, { parent_body: b })); });
    step(p, 2); assert.equal(p.getAttachmentState(child).parent_body_id, a.body_id);
});
test('pending mounts reject later independent motion and pending body commands cannot publish early', () => {
    const p = new physicsSystem(), a = p.createBody(), b = p.createBody(); let child;
    const drop = p.on('contactBegin', () => { drop(); child = p.elements.createDecoration(); });
    step(p); child.setPosition([200, 0]);
    assert.equal(p.fetchBody(child.body_id), null);
    assert.equal(p.spatial_grid.queryBounds({ left: 199, right: 201, top: -1, bottom: 1 }).includes(child.body), false);
    p.attachBody(child, { parent_body: a });
    assert.equal(p.getAttachmentState(child).pending, true); assert.throws(() => child.body.setPosition([300, 0]));
    step(p); assert.equal(p.fetchBody(child.body_id), child.body); assert.equal(p.getAttachmentState(child).pending, false);
});
test('queued detachment rechecks an exit and keeps ownership mounted when it becomes blocked', () => {
    const p = new physicsSystem(), car = p.createVehicle({ collision_shape: { shape_type: 'box', dimensions: [10, 10] } }), child = p.createCharacter();
    const wall = p.elements.createStatic({ position: [500, 500], collision_shape: { shape_type: 'box', dimensions: [10, 10] } });
    p.attachBody(child, { parent_body: car });
    p.createBody({ position: [100, 100] }); p.createBody({ position: [100, 100] });
    let blocked = 0; child.on('bodyDetachBlocked', () => blocked++);
    const drop = p.on('contactBegin', e => {
        if (e.body_a.body_id === car.body_id || e.body_b.body_id === car.body_id) return;
        drop(); wall.setPosition([0, 30]); assert.ok(p.detachBody(child, { exit_points: [[0, 30]] }));
    });
    step(p, 2); assert.equal(p.getAttachmentState(child).parent_body_id, car.body_id); assert.equal(blocked, 1);
});
test('stopping a mounted character cancels its intention without changing its seat pose', () => {
    const p = new physicsSystem(), parent = p.createBody({ collision_mask: 0 }), child = p.createCharacter();
    p.attachBody(child, { parent_body: parent, local_position: [5, 0] });
    child.setMovement([1, 0]); child.stopMovement(); parent.setPosition([10, 0]); step(p);
    assert.deepEqual(child.position, [15, 0]); assert.equal(child.getMovementState().mode, 'idle');
});
test('attachment depth limits apply when an already-built subtree is mounted from the bottom up', () => {
    const p = new physicsSystem(), bodies = Array.from({ length: 65 }, () => p.createBody({ collision_mask: 0 }));
    for (let i = 0; i < 63; i++) p.attachBody(bodies[i], { parent_body: bodies[i + 1] });
    assert.throws(() => p.attachBody(bodies[63], { parent_body: bodies[64] }), /64 bodies/);
    assert.equal(p.getAttachmentState(bodies[63]), null);
});
test('mounted traffic controllers suspend and release crossing reservations for other cars', () => {
    const p = new physicsSystem();
    const a = p.createVehicle({ position: [-30, 0], vehicle_template: { max_speed: 20, wheel_base: 4, braking: 40 } });
    const b = p.createVehicle({ position: [0, -30], rotation: Math.PI / 2, vehicle_template: { max_speed: 20, wheel_base: 4, braking: 40 } });
    p.traffic.registerRoute('a', { points: [[-30, 0], [30, 0]], speed_limit: 20, stops: [{ distance: 25, conflict_id: 'cross', clearance_distance: 15 }] });
    p.traffic.registerRoute('b', { points: [[0, -30], [0, 30]], speed_limit: 20, stops: [{ distance: 25, conflict_id: 'cross', clearance_distance: 15 }] });
    p.traffic.addVehicle(a, { route_id: 'a', following_distance: 2 }); p.traffic.addVehicle(b, { route_id: 'b', following_distance: 2 }); step(p, 60);
    const carrier = p.createBody({ position: [300, 300], collision_mask: 0, physics_type: 'kinematic' });
    p.attachBody(a, { parent_body: carrier }); step(p, 300);
    assert.equal(p.traffic.getState(a).suspended, true); assert.ok(b.position[1] > 25);
});
test('bicycle steering integrates the canonical yaw used for mounted point velocity', () => {
    const p = new physicsSystem(), car = p.createVehicle(), rider = p.createCharacter({ position: [100, 0] });
    p.attachBody(rider, { parent_body: car, local_position: [10, 0] }); car.accelerateVehicle(1); car.steerVehicle(0.5);
    step(p, 30); const before = car.rotation; step(p);
    near((car.rotation - before) / p.config.fixed_step, car.angular_velocity);
    const offset = [rider.position[0] - car.position[0], rider.position[1] - car.position[1]];
    near(rider.linear_velocity[0], car.linear_velocity[0] - car.angular_velocity * offset[1]);
    near(rider.linear_velocity[1], car.linear_velocity[1] + car.angular_velocity * offset[0]);
});
