import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../index.mjs';
const near = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const body = (p, extra = {}) => p.createBody({ mass: 10, collision_mask: 0, sleep_enabled: false, collision_shape: { shape_type: 'circle', radius: 2 }, ...extra });
const step = (p, count = 1) => { for (let i = 0; i < count; i++) p.updateState(); };
const momentum = bodies => bodies.reduce((out, b) => {
    const s = b.getState(); out[0] += s.mass * s.linear_velocity[0]; out[1] += s.mass * s.linear_velocity[1];
    out[2] += s.mass * (s.position[0] * s.linear_velocity[1] - s.position[1] * s.linear_velocity[0]) + s.mass * 2 * s.angular_velocity;
    return out;
}, [0, 0, 0]);

test('mass combination is opt-in and leaves configured body masses and identities intact', () => {
    const p = new physicsSystem(), a = body(p), b = body(p); p.attachBody(b, { parent_body: a, local_position: [10, 0] });
    assert.equal(p.getMassProperties(a).mass, 10); assert.equal(p.getAttachmentState(b).combine_mass, false);
    const q = new physicsSystem(), c = body(q), d = body(q);
    q.attachBody(d, { parent_body: c, local_position: [10, 0], combine_mass: true });
    const mass = q.getMassProperties(c); assert.equal(mass.mass, 20); assert.deepEqual(mass.local_center, [5, 0]); near(mass.inertia, 540);
    assert.equal(c.getState().mass, 10); assert.equal(d.getState().mass, 10); assert.equal(q.fetchBody(d.body_id), d);
    assert.equal(q.getStatistics().spatial.instances, 2);
    mass.local_center[0] = 999; assert.deepEqual(q.getMassProperties(c).local_center, [5, 0]);
});
test('nested mass contributes once and a noncombining link isolates its subtree', () => {
    const p = new physicsSystem(), a = body(p), b = body(p), c = body(p), decoration = body(p, { mass: 200 });
    p.attachBody(c, { parent_body: b, local_position: [10, 0], combine_mass: true });
    p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true });
    p.attachBody(decoration, { parent_body: a });
    const m = p.getMassProperties(a); assert.equal(m.mass, 30); assert.equal(m.body_count, 3); near(m.local_center[0], 10); near(m.inertia, 2060);
});
test('mass cache responds to body tuning, local poses, activation and removal', () => {
    const p = new physicsSystem(), a = body(p), b = body(p);
    p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true });
    p.updateBody(b, { mass: 30 }); assert.equal(p.getMassProperties(a).mass, 40); near(p.getMassProperties(a).local_center[0], 7.5);
    p.setAttachmentPose(b, { local_position: [20, 0] }); near(p.getMassProperties(a).local_center[0], 15);
    p.updateBody(b, { active: false }); assert.equal(p.getMassProperties(a).mass, 10);
    p.updateBody(b, { active: true }); assert.equal(p.getMassProperties(a).mass, 40);
    p.removeBody(b); assert.equal(p.getMassProperties(a).mass, 10);
});
test('combined impulse uses total mass and the center-of-mass lever arm', () => {
    const p = new physicsSystem(), a = body(p), b = body(p);
    p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true });
    a.applyImpulse([0, 20], { world_point: [5, 0] }); near(a.angular_velocity, 0); near(a.linear_velocity[1], 1);
    a.applyImpulse([0, 20], { world_point: [10, 0] }); near(a.angular_velocity, 100 / 540);
    // Child requests route into the same root at the child's actual point.
    b.applyImpulse([0, 20]); near(a.angular_velocity, 200 / 540);
    assert.throws(() => b.setPosition([0, 0]), /mounted/);
});
test('off-center free assemblies rotate around a uniformly translating mass center', () => {
    const p = new physicsSystem(), a = body(p), b = body(p);
    p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true });
    a.applyImpulse([0, 20], { world_point: [10, 0] });
    const before = momentum([a, b]), center = p.getMassProperties(a).center;
    step(p, 120); const after = momentum([a, b]), next = p.getMassProperties(a).center;
    near(next[0], center[0]); near(next[1], center[1] + 2); before.forEach((v, i) => near(after[i], v));
});
test('capture conserves momentum and combined release inherits velocity', () => {
    const p = new physicsSystem(), a = body(p, { linear_velocity: [0, 2] }), b = body(p, { position: [10, 0], linear_velocity: [0, -1], angular_velocity: 0.5 });
    const before = momentum([a, b]); p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true });
    momentum([a, b]).forEach((v, i) => near(v, before[i]));
    // Exit repositions the body. With no spin, a checked release needs no stopping impulse.
    a.stopMovement(); a.setLinearVelocity([2, 0]);
    const linear = momentum([a, b]); assert.ok(p.detachBody(b, { exit_points: [[40, 0]] }));
    near(b.linear_velocity[0], 2); near(p.getMassProperties(a).mass, 10);
    momentum([a, b]).slice(0, 2).forEach((v, i) => near(v, linear[i]));
});
test('combined forces and angular impulses use composite mass and inertia', () => {
    const p = new physicsSystem(), a = body(p), b = body(p);
    p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true });
    b.applyForce([0, 120]); step(p);
    near(a.angular_velocity, 10 / 540);
    a.applyAngularImpulse(540); near(a.angular_velocity, 1 + 10 / 540);
});
test('combined snapshots restore derived properties and motion without replaying capture', () => {
    const p = new physicsSystem(), a = body(p), b = body(p);
    p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true }); a.applyImpulse([0, 20], { world_point: [10, 0] }); step(p, 5);
    const q = new physicsSystem(); q.loadPhysicsState(p.savePhysicsState());
    assert.deepEqual(q.getAttachmentState(b.body_id), p.getAttachmentState(b));
    assert.deepEqual(q.getMassProperties(a.body_id), p.getMassProperties(a));
    step(p, 20); step(q, 20); assert.deepEqual(q.fetchBody(a.body_id).getState(), a.getState());
});
test('event-time combination remains reserved until commit and validates its flag before mutation', () => {
    const p = new physicsSystem(), a = body(p), b = body(p);
    assert.throws(() => p.attachBody(b, { parent_body: a, combine_mass: 'true' }), /boolean/); assert.equal(p.getAttachmentState(b), null);
    p.createBody(); p.createBody(); const drop = p.on('contactBegin', () => { drop(); p.attachBody(b, { parent_body: a, combine_mass: true }); });
    step(p); assert.equal(p.getMassProperties(a).mass, 10); step(p); assert.equal(p.getMassProperties(a).mass, 20);
});
test('vehicle and character motors accelerate loaded assemblies more slowly with the same tuning', () => {
    for (const role of ['Vehicle', 'Character']) {
        const p = new physicsSystem(), a = p[`create${role}`]({ mass: 10, position: [0, -100], collision_mask: 0 }), b = p[`create${role}`]({ mass: 10, position: [0, 100], collision_mask: 0 });
        const weight = body(p, { position: [0, 100] }); p.attachBody(weight, { parent_body: b, combine_mass: true });
        if (role === 'Vehicle') { a.accelerateVehicle(1); b.accelerateVehicle(1); } else { a.setMovement([1, 0]); b.setMovement([1, 0]); }
        step(p); near(a.linear_velocity[0], b.linear_velocity[0] * 2);
    }
});
test('elastic contacts against an off-center assembly conserve momentum and kinetic energy', () => {
    const p = new physicsSystem(), a = body(p, { collision_mask: 0x7fffffff, restitution: 1, friction: 0 }), load = body(p);
    p.attachBody(load, { parent_body: a, local_position: [10, 0], combine_mass: true });
    const impactor = body(p, { position: [0, 4], linear_velocity: [0, -4], collision_mask: 0x7fffffff, restitution: 1, friction: 0 });
    const energy = () => [a, load, impactor].reduce((sum, b) => { const s = b.getState(); return sum + s.mass * (s.linear_velocity[0] ** 2 + s.linear_velocity[1] ** 2) / 2 + s.mass * s.angular_velocity ** 2; }, 0);
    const initial = momentum([a, load, impactor]), beforeEnergy = energy(); step(p);
    momentum([a, load, impactor]).forEach((v, i) => near(v, initial[i], 1e-5)); near(energy(), beforeEnergy, 1e-5);
    assert.ok(Math.abs(a.angular_velocity) > 0.01);
});
test('kinematic assemblies retain prescribed origin motion despite an offset load', () => {
    const p = new physicsSystem(), a = body(p, { physics_type: 'kinematic', linear_velocity: [1, 0], angular_velocity: 1 }), b = body(p);
    p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true }); step(p, 60);
    near(a.position[0], 1); near(a.position[1], 0); near(a.rotation, 1);
});
test('a hinge acts on a loaded body using the aggregate center and preserves its anchor', () => {
    const p = new physicsSystem(), a = body(p), b = body(p);
    p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true });
    p.createConstraint({ constraint_type: 'hinge', body_a: a, world_target: [0, 0], min_rotation: -Math.PI, max_rotation: Math.PI });
    b.applyImpulse([0, 20]); step(p, 120);
    assert.ok(Math.hypot(...a.position) < 0.15); assert.ok(a.position.every(Number.isFinite));
});

test('inactive mounted weight neither contributes mass nor routes forces into an active root', () => {
    const p = new physicsSystem(), a = body(p), b = body(p, { active: false, linear_velocity: [100, 0] });
    p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true });
    assert.equal(p.getMassProperties(a).mass, 10); assert.deepEqual(a.linear_velocity, [0, 0]);
    b.applyImpulse([0, 20]); b.applyForce([0, 20]); step(p); assert.deepEqual(a.linear_velocity, [0, 0]);
});
test('physical character turning uses a torque budget and an offset backpack resists rapid turns', () => {
    const p = new physicsSystem(), plain = p.createCharacter({ position: [0, -100], mass: 10, collision_mask: 0, movement: { physical_turning: true } });
    const loaded = p.createCharacter({ position: [0, 100], mass: 10, collision_mask: 0, movement: { physical_turning: true } });
    const backpack = body(p, { mass: 100, position: [-20, 100] });
    p.attachBody(backpack, { parent_body: loaded, local_position: [-20, 0], combine_mass: true });
    const center = p.getMassProperties(loaded).center;
    plain.lookAtTarget([0, 0]); loaded.lookAtTarget([0, 200]); step(p);
    assert.ok(plain.angular_velocity > loaded.angular_velocity); assert.ok(loaded.angular_velocity > 0);
    near(p.getMassProperties(loaded).center[0], center[0]); near(p.getMassProperties(loaded).center[1], center[1]);
    assert.notEqual(loaded.position[1], 100);
    const q = new physicsSystem(); q.loadPhysicsState(p.savePhysicsState()); step(p); step(q);
    assert.deepEqual(q.fetchBody(loaded.body_id).getState(), loaded.body.getState());
});
test('offset assemblies preserve locked origin axes while rotating', () => {
    const p = new physicsSystem(), a = body(p, { axis_lock: { x: true, y: true } }), b = body(p);
    p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true });
    a.applyAngularImpulse(1040); step(p, 60);
    assert.deepEqual(a.position, [0, 0]); assert.deepEqual(a.linear_velocity, [0, 0]); near(a.rotation, 1);
});
test('gravity and point impulses respect the support inertia of a pinned loaded body', () => {
    const p = new physicsSystem({ gravity: [0, 6] }), a = body(p, { axis_lock: { x: true, y: true } }), b = body(p);
    p.attachBody(b, { parent_body: a, local_position: [10, 0], combine_mass: true });
    a.applyImpulse([0, 20], { world_point: [0, 0] }); near(a.angular_velocity, 0);
    step(p); near(a.angular_velocity, 10 / 1040); assert.deepEqual(a.position, [0, 0]);
});
test('capture respects a pinned assembly and the default upright character response', () => {
    const p = new physicsSystem(), pinned = body(p, { axis_lock: { x: true, y: true } }), weight = body(p, { position: [10, 0], linear_velocity: [0, 2] });
    p.attachBody(weight, { parent_body: pinned, local_position: [10, 0], combine_mass: true }); near(pinned.angular_velocity, 200 / 1040);
    const person = p.createCharacter({ position: [100, 0], collision_mask: 0 }), bag = body(p, { position: [110, 0], linear_velocity: [0, 2] });
    p.attachBody(bag, { parent_body: person, local_position: [10, 0], combine_mass: true }); near(person.angular_velocity, 0);
});
