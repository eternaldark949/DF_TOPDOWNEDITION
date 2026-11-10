import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, collisionShape, collisionDetector, spatialGrid, BODY_GROUP } from '../index.mjs';
const ball = (p, position, extra = {}) => p.createBody({ position, collision_shape: { shape_type: 'circle', radius: 2 }, ...extra });
const wall = (p, position, dimensions = [1, 100], extra = {}) => p.createBody({ position, physics_type: 'static', collision_shape: { shape_type: 'box', dimensions }, ...extra });
const tick = (p, n = 1) => { for (let i = 0; i < n; i++) p.updateState(); };
const near = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('body state is authoritative, immutable to callers, and mass updates affect impulses', () => {
    const p = new physicsSystem(), a = ball(p, [0, 0], { mass: 10 });
    assert.throws(() => a.position[0] = 8); assert.throws(() => a.position = [8, 0]);
    const state = a.getState(); state.position[0] = 99; near(a.position[0], 0);
    p.updateBody(a, { mass: 100 }); a.applyImpulse([20, 0]); near(a.linear_velocity[0], 0.2);
    assert.throws(() => p.updateBody(a, { mass: 0 })); near(a.getState().mass, 100);
});
test('static bodies resist all impulses and motion commands; explicit placement reindexes', () => {
    const p = new physicsSystem(), a = ball(p, [0, 0], { physics_type: 'static' });
    a.applyImpulse([100, 0]); a.applyAngularImpulse(100); a.setLinearVelocity([10, 0]); tick(p);
    assert.deepEqual(a.position, [0, 0]); assert.equal(a.angular_velocity, 0);
    a.setPosition([1000, 0]); assert.equal(p.findNearestEntity([1000, 0], { near_range: 1 }).body, a);
});
test('axis locks hold through integration, impulses and contact correction', () => {
    const p = new physicsSystem(), a = ball(p, [0, 0], { axis_lock: { x: true, y: true, rotation: true } });
    ball(p, [1, 0]); a.applyImpulse([100, 50], { world_point: [1, 2] }); a.setLinearVelocity([50, 20]);
    tick(p, 3); assert.deepEqual(a.position, [0, 0]); assert.deepEqual(a.linear_velocity, [0, 0]); assert.equal(a.angular_velocity, 0);
});
test('reciprocal masks and no_collision prevent contacts across the ordinary solver', () => {
    for (const extra of [{ collision_mask: 0 }, { physics_type: 'no_collision' }]) {
        const p = new physicsSystem(), a = ball(p, [0, 0], extra); ball(p, [1, 0]); let count = 0;
        p.on('contactBegin', () => count++); tick(p); assert.equal(count, 0); near(a.position[0], 0);
    }
});
test('ghosts report begin/stay/end without separation or impulses', () => {
    const p = new physicsSystem(), a = ball(p, [0, 0], { ghost: true }), b = ball(p, [1, 0]); const phases = [];
    for (const event of ['contactBegin', 'contactStay', 'contactEnd']) p.on(event, e => { phases.push(event); assert.equal(e.sensor_only, true); });
    tick(p, 2); b.setPosition([100, 0]); tick(p);
    assert.deepEqual(phases, ['contactBegin', 'contactStay', 'contactEnd']); assert.deepEqual(a.position, [0, 0]);
});
test('collision impulse conserves momentum and respects restitution', () => {
    const p = new physicsSystem(), a = ball(p, [-3, 0], { mass: 2, restitution: 1, friction: 0, linear_velocity: [120, 0] });
    const b = ball(p, [3, 0], { mass: 1, restitution: 1, friction: 0, linear_velocity: [-60, 0] });
    tick(p); near(a.linear_velocity[0], 0); near(b.linear_velocity[0], 180); near(2 * a.linear_velocity[0] + b.linear_velocity[0], 180);
});
test('off-centre impulse spins rigid bodies, respecting rotational lock', () => {
    const p = new physicsSystem(), a = wall(p, [0, 0], [4, 4], { physics_type: 'rigid', mass: 2 });
    a.applyImpulse([0, 10], { world_point: [2, 0] }); assert.ok(a.angular_velocity > 0);
    p.updateBody(a, { axis_lock: { rotation: true } }); a.applyImpulse([0, 10], { world_point: [2, 0] }); near(a.angular_velocity, 0);
});
test('swept collision catches a thin wall far outside any rendering view', () => {
    const p = new physicsSystem(), a = ball(p, [10000, 10000], { linear_velocity: [10000, 0] }); wall(p, [10050, 10000]);
    tick(p); assert.ok(a.position[0] < 10050); near(a.linear_velocity[0], 0);
});
test('sweeps account for both moving bodies', () => {
    const p = new physicsSystem(), a = ball(p, [-50, 0], { linear_velocity: [6000, 0] }), b = ball(p, [50, 0], { linear_velocity: [-6000, 0] });
    tick(p); assert.ok(a.position[0] <= b.position[0]); near(a.linear_velocity[0], 0); near(b.linear_velocity[0], 0);
});
test('rotating-box sweeps catch a target crossed between endpoints', () => {
    const box = new collisionShape({ shape_type: 'box', dimensions: [80, 4] }), circle = new collisionShape({ shape_type: 'circle', radius: 2 });
    const c = collisionDetector.sweep(box, { position: [0, 0], rotation: 0 }, { position: [0, 0], rotation: Math.PI }, circle, { position: [0, 30], rotation: 0 });
    assert.ok(c && c.fraction > 0 && c.fraction < 0.5);
});
test('circle-box corners are rounded correctly rather than expanded square hits', () => {
    const p = new physicsSystem(); wall(p, [0, 0], [10, 10]);
    const hits = p.overlapShape({ collision_shape: { shape_type: 'circle', radius: 1 }, position: [5.9, 5.9] }); assert.equal(hits.length, 0);
});
test('capsules, convex polygons, segments and compounds share detection', () => {
    const p = new physicsSystem();
    for (const shape of [
        { shape_type: 'capsule', points: [[-5, 0], [5, 0]], radius: 1 },
        { shape_type: 'polygon', points: [[-5, -5], [5, -5], [0, 5]] },
        { shape_type: 'segment', points: [[-5, 0], [5, 0]], radius: 0.1 },
        { shape_type: 'compound', children: [{ shape_type: 'circle', radius: 3, local_position: [2, 0] }] }
    ]) {
        const a = p.createBody({ collision_shape: shape, position: [0, 0], physics_type: 'static' });
        assert.ok(p.overlapShape({ collision_shape: { shape_type: 'circle', radius: 1 }, position: [0, 0] }).length); p.removeBody(a);
    }
    assert.throws(() => new collisionShape({ shape_type: 'polygon', points: [[0, 0], [1, 0], [0.5, 0.2], [0, 1]] }));
});
test('one index captures the audited 78x46 rotated-car overlap', () => {
    const p = new physicsSystem({ cell_size: 150 });
    const a = wall(p, [102, 120], [78, 46], { physics_type: 'rigid', rotation: Math.PI / 4 });
    const b = wall(p, [189, 120], [78, 46], { physics_type: 'rigid', rotation: -Math.PI / 4 });
    let hits = 0; p.on('contactBegin', () => hits++); tick(p); assert.equal(hits, 1);
    assert.ok(lengthOf(subtract(a.position, b.position)) > 87);
});
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]], lengthOf = a => Math.hypot(...a);
test('spatial updates replace old membership and deduplicate multi-cell results', () => {
    const g = new spatialGrid({ cell_size: 10 }), obj = { name: 'large' };
    g.registerInstance('a', { left: -20, right: 20, top: -20, bottom: 20 }, obj);
    assert.equal(g.queryRadius([0, 0], 30).length, 1);
    g.updateInstance('a', { left: 100, right: 101, top: 100, bottom: 101 });
    assert.equal(g.queryRadius([0, 0], 30).length, 0); assert.equal(g.querySegment([0, 0], [101, 101]).length, 1);
    g.removeInstance('a'); assert.equal(g.getStatistics().instances, 0);
});
test('sparse broadphase scales with nearby candidates rather than all pairs', () => {
    const p = new physicsSystem({ cell_size: 16 });
    for (let i = 0; i < 1000; i++) ball(p, [i * 100, 0], { continuous_collision: false });
    tick(p); assert.equal(p.getStatistics().candidate_pairs, 0); assert.equal(p.getStatistics().narrow_checks, 0);
    assert.ok(p.getStatistics().spatial.candidate_visits < 20000);
});
test('stationary geometry is not reinserted during an unrelated simulation step', () => {
    const p = new physicsSystem(); for (let i = 0; i < 100; i++) wall(p, [i * 100, 100]);
    const before = p.getStatistics().spatial.updates; ball(p, [0, 0]); tick(p);
    assert.ok(p.getStatistics().spatial.updates - before < 10);
});
test('ray/shape queries are ordered and honor query bits, masks and ghosts', () => {
    const p = new physicsSystem(); const far = ball(p, [20, 0]), nearBody = ball(p, [10, 0], { ghost: true, query_mask: 2 });
    assert.equal(p.raycast({ from: [0, 0], to: [30, 0], query_bit: 1 }).body, far);
    assert.equal(p.raycast({ from: [0, 0], to: [30, 0], query_bit: 2 }).body, nearBody);
    assert.equal(p.raycast({ from: [0, 0], to: [30, 0], include_ghosts: false }).body, far);
    assert.equal(p.findNearestEntity([0, 0], { near_range: 100 }).body, nearBody);
});
test('cleared geometry is immediately absent from every query', () => {
    const p = new physicsSystem(), b = wall(p, [10, 0]); p.removeBody(b);
    assert.equal(p.raycast({ from: [0, 0], to: [20, 0] }), null); assert.throws(() => b.getState());
});
test('projectiles honor reciprocal masks and no_collision, not legacy fields', () => {
    for (const extra of [{ collision_mask: 0 }, { physics_type: 'no_collision' }]) {
        const p = new physicsSystem(); ball(p, [10, 0], extra); const shot = p.createProjectile({ direction: [1, 0], speed: 1200, lifetime: 1, collision_shape: { shape_type: 'circle', radius: 0.5 } });
        let hits = 0; p.on('projectileHit', () => hits++); tick(p); assert.equal(hits, 0); assert.ok(shot.body.position[0] > 10);
    }
});
test('projectile penetration is front-to-back, ignores owner and applies mass/lock-aware impacts', () => {
    const p = new physicsSystem(), far = ball(p, [20, 0], { mass: 10 }), close = ball(p, [10, 0], { axis_lock: { x: true, y: true, rotation: true } });
    const owner = ball(p, [0, 0]); const ids = [];
    const shot = p.createProjectile({ owner_id: owner.body_id, direction: [1, 0], speed: 2400, penetration_count: 1, impact_strength: 100, penetration_loss: 0.5, lifetime: 1 });
    p.on('projectileHit', hit => ids.push(hit.target_body.body_id)); tick(p);
    assert.deepEqual(ids, [close.body_id, far.body_id]); near(close.linear_velocity[0], 0); near(far.linear_velocity[0], 5);
});
test('projectile ghost contacts notify without impulses or stopping the projectile', () => {
    const p = new physicsSystem(), ghost = ball(p, [10, 0], { ghost: true }); const hit = [];
    const shot = p.createProjectile({ direction: [1, 0], speed: 1200, impact_strength: 100 });
    p.on('projectileHit', e => hit.push(e)); tick(p); assert.equal(hit.length, 1); assert.equal(hit[0].sensor_only, true);
    assert.ok(shot.body.position[0] > 10); near(ghost.linear_velocity[0], 0);
});
test('event requests are applied next step, immutable event vectors cannot corrupt another listener', () => {
    const p = new physicsSystem(), a = ball(p, [0, 0], { ghost: true }); ball(p, [1, 0]);
    p.on('contactBegin', e => { assert.throws(() => e.normal[0] = 99); a.setPosition([100, 0]); assert.equal(a.position[0], 0); });
    tick(p); near(a.position[0], 0); tick(p); near(a.position[0], 100);
});
test('events can create a new character safely for the following tick', () => {
    const p = new physicsSystem(); ball(p, [0, 0], { ghost: true }); ball(p, [1, 0]); let actor;
    p.on('contactBegin', () => { actor = p.createCharacter({ position: [500, 0] }); actor.setMovement([1, 0]); });
    tick(p); assert.equal(p.fetchBody(actor.body_id), null); tick(p); assert.ok(actor.physics_controller.body.position[0] > 500);
});
test('path search routes a circle around geometry through shared-index clearance queries', () => {
    const p = new physicsSystem(); wall(p, [20, 0], [4, 20]); const a = ball(p, [0, 0]);
    const path = p.findPath({ body: a, to: [40, 0], node_spacing: 5, search_margin: 30 }); assert.ok(path?.points.length > 2);
    for (let i = 1; i < path.points.length; i++) assert.equal(p.getPathClearance({ body: a, from: path.points[i - 1], to: path.points[i] }).clear, true);
});
test('character requests move and stop without gameplay calculating movement', () => {
    const p = new physicsSystem(), a = p.createCharacter({ movement: { max_speed: 60, acceleration: 600, braking: 600 } });
    a.setMovement([1, 0]); tick(p, 60); assert.ok(a.physics_controller.body.position[0] > 50);
    a.stopMovement(); tick(p, 2); near(a.physics_controller.body.linear_velocity[0], 0);
});
test('character moveTo completes and emits a destination event', () => {
    const p = new physicsSystem(), a = p.createCharacter({ movement: { max_speed: 60 } }); let arrived = 0;
    p.on('destinationReached', () => arrived++); a.moveTo([30, 0]); tick(p, 90); assert.equal(arrived, 1); assert.ok(Math.abs(a.physics_controller.body.position[0] - 30) < 3);
});
test('teleport landing can cross a wall but only ends in clear space', () => {
    const p = new physicsSystem(), a = p.createCharacter(); wall(p, [10, 0]); wall(p, [20, 0], [4, 10]);
    assert.ok(a.teleportTo([20, 0])); assert.equal(p.isPlacementClear(a.physics_controller.body, a.physics_controller.body.position), true);
});
test('vehicle controls drive, turn, brake and share body locks', () => {
    const p = new physicsSystem(), v = p.createVehicle({ vehicle_template: { max_speed: 60, acceleration: 100 } });
    v.accelerateVehicle(1); tick(p, 60); assert.ok(v.getSpeed() > 50);
    v.steerVehicle(0.5); tick(p, 30); assert.ok(v.physics_controller.body.rotation > 0);
    v.accelerateVehicle(0); v.brakeVehicle(1); tick(p, 60); near(v.getSpeed(), 0, 0.1);
    p.updateBody(v.body_id, { axis_lock: { x: true, y: true, rotation: true } }); const before = v.physics_controller.body.position;
    v.brakeVehicle(0); v.accelerateVehicle(1); tick(p, 10); assert.deepEqual(v.physics_controller.body.position, before);
});
test('distance constraints and drag use locked-axis-aware shared mass rules', () => {
    const p = new physicsSystem(), a = ball(p, [0, 0], { physics_type: 'static' }), b = ball(p, [20, 0], { ghost: true });
    p.createConstraint({ body_a: a, body_b: b, rest_length: 10 }); tick(p, 30); near(a.position[0], 0); near(b.position[0], 10, 0.1);
    const drag = p.beginDrag(b, { world_target: [40, 0] }); tick(p, 30); assert.ok(b.position[0] > 10); p.endDrag(drag);
});
test('hinge angular limits and break notifications run in the constraint solver', () => {
    const p = new physicsSystem(), b = wall(p, [0, 0], [10, 2], { physics_type: 'rigid', rotation: 1 });
    p.createConstraint({ constraint_type: 'hinge', body_a: b, min_rotation: -0.2, max_rotation: 0.2, stiffness: 10 });
    tick(p, 60); assert.ok(Math.abs(b.rotation) < 0.5);
    let broken = 0; p.on('constraintBroken', () => broken++);
    p.createConstraint({ body_a: b, world_target: [100, 0], break_impulse: 0.001 }); tick(p); assert.ok(broken >= 1);
});
test('particles and chains have no private spatial index and expire cleanly', () => {
    const p = new physicsSystem({ gravity: [0, 10] }), pool = p.createParticlePool({ capacity: 2, lifetime: 0.05, linear_velocity: [10, 0] });
    assert.equal(p.emitParticles(pool, { count: 2 }).length, 2); assert.equal(p.emitParticles(pool).length, 0);
    tick(p); assert.ok(p.getParticleState(pool)[0].position[0] > 0); tick(p, 4); tick(p); assert.equal(p.getParticleState(pool).length, 0);
    const chain = p.createChain({ points: [[0, 0], [0, 10], [0, 20]] }); tick(p, 10);
    assert.deepEqual(p.getChainState(chain)[0].position, [0, 0]); p.setChainAnchors(chain, [[5, 0]]); tick(p); near(p.getChainState(chain)[0].position[0], 5);
    p.removeChain(chain); assert.equal(p.getStatistics().constraints, 0);
});
test('save/load retains bodies, controllers, joints, particles and external spatial instances', () => {
    const p = new physicsSystem(), a = p.createCharacter(); a.setMovement([1, 0]);
    const pool = p.createParticlePool({ lifetime: 2 }); p.emitParticles(pool);
    p.createConstraint({ body_a: a, world_target: [10, 0], constraint_type: 'spring' });
    p.registerSpatialInstance('lamp', { left: 0, right: 1, top: 0, bottom: 1 }, { kind: 'lamp' }); tick(p);
    const saved = p.savePhysicsState(), copy = new physicsSystem(saved.config); copy.loadPhysicsState(saved);
    assert.deepEqual(copy.fetchBody(a.body_id).getState(), p.fetchBody(a.body_id).getState());
    tick(p); tick(copy); near(copy.fetchBody(a.body_id).position[0], p.fetchBody(a.body_id).position[0]);
    assert.equal(copy.getParticleState(pool).length, 1); assert.equal(copy.getStatistics().constraints, 1);
    assert.ok(copy.spatial_grid.queryRadius([0, 0], 1).some(v => v.instance_id === 'lamp'));
});
test('invalid loads leave the current world unchanged and stale handles cannot alter a replacement body', () => {
    const p = new physicsSystem(), a = ball(p, [0, 0]); const saved = p.savePhysicsState(); saved.bodies.push(saved.bodies[0]);
    assert.throws(() => p.loadPhysicsState(saved)); assert.equal(p.fetchBody(a.body_id), a);
    p.clearWorld(); const b = ball(p, [100, 0]); assert.throws(() => a.setPosition([50, 0])); near(b.position[0], 100);
});
test('invalid motor configuration is rejected before registering an orphan body', () => {
    const p = new physicsSystem(); assert.throws(() => p.createCharacter({ movement: { max_speed: -1 } }));
    assert.throws(() => p.createVehicle({ vehicle_template: { acceleration: -1 } })); assert.throws(() => p.createProjectile({ speed: -1 }));
    assert.equal(p.getStatistics().bodies, 0);
});
