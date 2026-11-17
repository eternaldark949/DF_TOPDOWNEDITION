// ===== LV0 BASEMENT =====
// One vertical axis: entities stand at an elevation, rigs stand up with height and pitch, and what is
// held stands where it is held. Collision and queries read z.
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, rigPose, animationClip, animationController } from '../index.mjs';

const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-6, `${why ?? ''} ${a} != ${b}`);
const leg = { rig_id: 'leg', joints: [{ name: 'hip', height: 40, pitch: -Math.PI / 2 }, { name: 'knee', parent: 'hip', position: [20, 0] }, { name: 'foot', parent: 'knee', position: [18, 0], pitch: Math.PI / 2 }],
    anchors: { toe: { joint: 'foot', position: [4, 0] } } };

test('a rig stands up: a bone pitched down hangs below its joint, and from above it is shorter by the cosine', () => {
    const pose = new rigPose(leg);
    let knee = pose.getJoint('knee'), foot = pose.getJoint('foot');
    near(knee.height, 20, 'the knee hangs a thigh below the hip'); near(foot.height, 2); near(knee.position[0], 0); near(foot.position[0], 0);
    near(foot.pitch, 0, 'the foot lies flat'); near(pose.getAnchor('toe').position[0], 4, 'an anchor on a flat foot reaches forward');
    near(knee.rotation, 0); assert.deepEqual(knee.scale, [1, 1], 'the ground frame never folds flat: it keeps its turn and scale');
    pose.setJoint('hip', { pitch: -Math.PI / 3 });   // swung forward 30 degrees
    knee = pose.getJoint('knee'); near(knee.position[0], 20 * Math.cos(Math.PI / 3)); near(knee.height, 40 - 20 * Math.sin(Math.PI / 3));
    near(pose.getJoint('foot').position[0], 38 * Math.cos(Math.PI / 3), 'the foot reaches forward without moving: the pitch did it');
    pose.setJoint('hip', { height: 30 }); near(pose.getJoint('knee').height, 30 - 20 * Math.sin(Math.PI / 3), 'height lifts a joint straight up');
    pose.setJoint('hip', { scale: [2, 2] }); near(pose.getJoint('knee').height, 30 - 40 * Math.sin(Math.PI / 3), 'a bigger rig is taller too');
    const world = pose.getJoint('knee', { root: { position: [100, 0], rotation: 0 }, elevation: 50, height_scale: 2 });
    near(world.height, 50 + 2 * (30 - 40 * Math.sin(Math.PI / 3)), 'in the world: the base elevation plus the rig height times the height scale');
    assert.deepEqual(new rigPose(pose.getSnapshot().rig_id === 'leg' ? leg : null).load(pose.getSnapshot()).getLocalJoint('hip'), pose.getLocalJoint('hip'), 'height and pitch save and load');
});

test('clips animate height and pitch like any channel', () => {
    const swing = new animationClip({ clip_id: 'swing', duration: 1, tracks: [{ joint: 'hip', channel: 'pitch', keys: [{ time: 0, value: -1.2 }, { time: 1, value: -2 }] }, { joint: 'hip', channel: 'height', keys: [{ time: 0, value: 40 }, { time: 1, value: 30 }] }] });
    const sample = swing.sample(.5); near(sample.hip.pitch, -1.6); near(sample.hip.height, 35);
    const c = new animationController({ definition: leg, clips: [swing] }); c.play('swing'); for (let i = 0; i < 5; i++) c.advance(.1);
    near(c.getJoint('hip').pitch, -1.6); near(c.getJoint('knee').height, 35 + 20 * Math.sin(-1.6));
    assert.throws(() => new animationClip({ clip_id: 'bad', duration: 1, tracks: [{ joint: 'hip', channel: 'pitch', keys: [{ time: 0, value: [1, 2] }] }] }), 'pitch is one number');
});

test('an entity stands at an elevation: collision and queries meet it only up there', () => {
    const p = new physicsSystem();
    const wall = p.elements.createEntity({ kind: 'static', position: [0, 0], collision_shape: { shape_type: 'box', dimensions: [20, 200] }, height_span: [0, 50] });
    const ledge = p.elements.createEntity({ kind: 'static', position: [0, 0], collision_shape: { shape_type: 'box', dimensions: [20, 200] }, height_span: [0, 10], elevation: 200 });
    assert.equal(ledge.elevation, 200); assert.deepEqual([...ledge.body.getState().height_span], [0, 10], 'its own span counts from its base');
    assert.ok(p.raycast({ from: [-50, 0], to: [50, 0], at_height: 205, ignore_body: wall.body }), 'a ray up there meets the ledge');
    assert.ok(!p.raycast({ from: [-50, 0], to: [50, 0], at_height: 100 }), 'between the wall and the ledge, nothing');
    wall.setElevation(80); p.updateState();
    assert.ok(p.raycast({ from: [-50, 0], to: [50, 0], at_height: 100 }), 'raise the wall and the same ray meets it');
    assert.equal(wall.world_elevation, 80);
    const walker = elevationWalker(p, 0), climber = elevationWalker(p, 205);
    for (let i = 0; i < 40; i++) p.updateState(1 / 60);
    assert.ok(walker.position[0] > 30, 'a walker on the ground passes under the raised wall');
    assert.ok(climber.position[0] < 0, 'one up on the ledge is stopped by it');
});
function elevationWalker(p, z) { const e = p.elements.createEntity({ kind: 'character', position: [-40, 0], collision_shape: { shape_type: 'circle', radius: 5 }, height_span: [0, 60], elevation: z }); e.motor.setMovement([1, 0], { speed: 200 }); return e; }

test('a held thing stands where it is held: its parent\'s elevation, the anchor\'s height and the mount\'s lift', () => {
    const p = new physicsSystem(), body = p.elements.createEntity({ kind: 'character', position: [0, 0], elevation: 100 });
    p.rigs.createRig(body, { definition: { rig_id: 'arm', joints: [{ name: 'shoulder', height: 60, pitch: -1 }, { name: 'hand', parent: 'shoulder', position: [20, 0] }], anchors: { grip: { joint: 'hand' } } } });
    const cup = p.elements.createEntity({ position: [0, 0], height_span: [0, 4] }), hat = p.elements.createEntity({ position: [0, 0], height_span: [0, 4] });
    body.attach(cup, { rig_anchor: 'grip' }); body.attach(hat, { elevation: 90 }); p.updateState();
    const hand = 60 + 20 * Math.sin(-1);
    near(cup.world_elevation, 100 + hand, 'the cup is at the hand'); near(hat.world_elevation, 190, 'the hat sits 90 above the base');
    near(cup.getRenderState(1).elevation, 100 + hand, 'and is drawn there');
    body.setElevation(0); p.updateState(); near(cup.world_elevation, hand, 'it follows its holder down');
    body.scaleTo([1, 1, 2]); p.updateState(); near(cup.world_elevation, 2 * hand, 'and up again when its holder grows taller');
    body.setElevation(30); p.updateState(); body.detach(hat, { exit_points: [[30, 0]] }); p.updateState();
    assert.equal(hat.world_elevation, 30, 'let go, it stands where its holder stands');
    const saved = p.savePhysicsState(), q = new physicsSystem(); q.loadPhysicsState(saved);
    near(q.elements.fetchEntity(cup.entity_id).world_elevation, 30 + 2 * hand, 'and it all saves');
});

test('walkers path under what is above their headroom and over what is under their step', () => {
    const p = new physicsSystem(), wall = (y, span) => p.elements.createEntity({ kind: 'static', position: [0, y], collision_shape: { shape_type: 'box', dimensions: [20, 400] }, height_span: span });
    wall(0, [150, 160]);   // an awning, 3 m up
    const route = () => p.navigation.findPath({ from: [-100, 0], to: [100, 0], radius: 8 });
    const straight = path => path && path.points.every(q => Math.abs(q[1]) < 1);
    assert.ok(!straight(route()), 'with no headroom set, everything in the way blocks: the path goes round');
    p.navigation.configureField({ headroom: 100 });
    assert.ok(straight(route()), 'with 2 m of headroom, the path walks straight under the awning');
    const kerb = wall(0, [0, 5]); assert.ok(!straight(route()), 'a kerb blocks with no step');
    p.navigation.configureField({ step_height: 10 }); assert.ok(straight(route()), 'and is stepped over with a 20 cm step');
    kerb.setElevation(120); p.updateState(); assert.ok(straight(route()), 'raised above the headroom, it no longer blocks');
    kerb.setElevation(40); p.updateState(); assert.ok(!straight(route()), 'lowered into the band, it blocks again');
    assert.deepEqual([p.navigation.configureField({}).headroom, p.navigation.configureField({}).step_height], [100, 10], 'the band is part of the saved field');
});

test('a shot leaves at its source\'s height and flies there; lights and particles stand at a height too', () => {
    const p = new physicsSystem(), low = p.elements.createEntity({ kind: 'static', position: [100, 0], collision_shape: { shape_type: 'box', dimensions: [10, 200] }, height_span: [0, 50] });
    const shooter = p.elements.createEntity({ kind: 'character', position: [0, 0], height_span: [0, 87] });
    const high = p.createProjectileFrom(shooter, { direction: [1, 0], local_elevation: 70, speed: 600 }), under = p.createProjectileFrom(shooter, { direction: [1, 0], local_elevation: 20, speed: 600 });
    assert.equal(high.world_elevation, 70); assert.deepEqual([...high.body.getState().height_span], [0, 0], 'a projectile is a point at its height');
    for (let i = 0; i < 30; i++) p.updateState(1 / 60);
    assert.ok(high.body.position[0] > 150, 'a shot at chest height flies over the low wall');
    assert.ok(!p.fetchBody(under.body_id) || under.body.position[0] < 110, 'one at knee height meets it');
    shooter.setElevation(200); p.updateState();
    assert.equal(p.createProjectileFrom(shooter, { direction: [1, 0], local_elevation: 70 }).world_elevation, 270, 'from up on a roof, it leaves from up there');
    const reach = at_height => Math.max(...p.getVisibilityPolygon({ origin: [0, 0], radius: 300, ...(at_height === undefined ? {} : { at_height }) }).points.filter(q => Math.abs(q[1]) < 5).map(q => q[0]));
    assert.ok(reach() < 100, 'a light on the ground is stopped by the low wall');
    assert.ok(reach(150) > 290, 'a lamp at 3 m shines over it');
    const pool = p.createParticlePool({ capacity: 4 }), [id] = p.emitParticles(pool, { position: [0, 0], elevation: 60, height_span: [0, 1] });
    assert.equal(p.fetchBody(id).getState().world_elevation, 60, 'a spark is born at its height');
});

// ----- Z motion: things rise and fall under gravity's z and land on what is under them. -----
const G = -980;   // 9.8 m/s² at 50 units a metre is -490; a heavier pull keeps the tests short
const fallWorld = () => new physicsSystem({ gravity: [0, 0, G] });
const run = (p, seconds) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) p.updateState(1 / 60); };
const box = (p, at, z = 0, span = [0, 20]) => p.elements.createEntity({ kind: 'prop', position: at, collision_shape: { shape_type: 'box', dimensions: [20, 20] }, height_span: span, elevation: z, physics_type: 'rigid' });

test('a thing in the air falls under gravity\'s z and lands on the floor, once', () => {
    const p = fallWorld(), b = box(p, [0, 0], 300), landed = [];
    p.on('bodyLanded', e => landed.push(e));
    p.updateState(1 / 60); assert.ok(b.elevation < 300 && b.vertical_velocity < 0 && !b.grounded, 'it starts to fall');
    const mid = b.getRenderState(.5).elevation; assert.ok(mid < 300 && mid > b.elevation, 'and is drawn between steps');
    run(p, 1.5);
    assert.equal(b.elevation, 0); assert.equal(b.vertical_velocity, 0); assert.ok(b.grounded);
    assert.equal(landed.length, 1, 'one landing'); assert.ok(landed[0].speed > 500 && landed[0].on_entity === null, 'with its speed, on the floor');
    assert.equal(new physicsSystem().config.gravity[2], 0, 'by default nothing falls: a flat world stays flat');
});

test('it lands on the top of a solid under it, and falls again when it walks off or that is taken away', () => {
    const p = fallWorld(), crate = box(p, [0, 0], 0, [0, 40]), b = box(p, [0, 0], 200), landed = [];
    p.on('bodyLanded', e => landed.push(e));
    run(p, 1); near(b.elevation, 40, 'on the crate'); assert.equal(landed[0].on_entity, crate, 'and knows what it stands on');
    assert.ok(!p.raycast({ from: [-50, 0], to: [50, 0], at_height: 30, ignore_body: crate.body }), 'standing on it is not in it: nothing pushes it off');
    b.moveTo([60, 0]); run(p, .6); assert.equal(b.elevation, 0, 'moved off, it drops to the floor');
    const c = box(p, [0, 0], 200); run(p, 1); near(c.elevation, 40);
    run(p, 2); p.elements.destroyEntity?.(crate) ?? p.removeBody(crate.body); run(p, .6);
    assert.equal(c.elevation, 0, 'take the crate away, even from under a sleeper, and it falls');
});

test('a jump is a vertical speed: it rises, arcs and comes down where it started, over a low wall', () => {
    const p = fallWorld(), j = p.elements.createEntity({ kind: 'character', position: [0, 0], collision_shape: { shape_type: 'circle', radius: 5 }, height_span: [0, 60] });
    run(p, .1); assert.ok(j.grounded);
    j.setVerticalVelocity(500); let top = 0;
    for (let i = 0; i < 90; i++) { p.updateState(1 / 60); top = Math.max(top, j.elevation); }
    assert.ok(Math.abs(top - 500 * 500 / (2 * -G)) < 10, `up to v²/2g: ${top}`); assert.equal(j.elevation, 0); assert.ok(j.grounded);
    const floaty = box(p, [100, 0], 100); floaty.updateBody({ gravity_scale: 0 }); run(p, .5);
    assert.equal(floaty.elevation, 100, 'gravity_scale 0 floats');
    const p2 = fallWorld(); p2.elements.createEntity({ kind: 'static', position: [60, 0], collision_shape: { shape_type: 'box', dimensions: [10, 200] }, height_span: [0, 30] });
    const runner = p2.elements.createEntity({ kind: 'character', position: [0, 0], collision_shape: { shape_type: 'circle', radius: 5 }, height_span: [0, 60] });
    runner.motor.setMovement([1, 0], { speed: 200 }); run(p2, .05); runner.setVerticalVelocity(450); run(p2, .8);
    assert.ok(runner.position[0] > 100, `jumping, it clears the wall: ${runner.position[0]}`);
});

test('a toss arcs: a shot with a vertical speed comes down, and something let go drops from the hand', () => {
    const p = fallWorld(), thrower = p.elements.createEntity({ kind: 'character', position: [0, 0], height_span: [0, 87] });
    const shot = p.createProjectileFrom(thrower, { direction: [1, 0], local_elevation: 70, speed: 300, vertical_velocity: 300 }), heights = [];
    for (let i = 0; i < 30; i++) { p.updateState(1 / 60); if (p.fetchBody(shot.body_id)) heights.push(shot.world_elevation); }
    assert.ok(Math.max(...heights) > 70 && heights.at(-1) < Math.max(...heights), 'up, then down');
    const p2 = fallWorld(), holder = p2.elements.createEntity({ kind: 'character', position: [0, 0], height_span: [0, 87] }), cup = box(p2, [0, 0], 0, [0, 4]);
    holder.attach(cup, { elevation: 60 }); run(p2, .1); assert.equal(cup.world_elevation, 60, 'held, it does not fall');
    holder.detach(cup, { exit_points: [[20, 0]] }); p2.updateState(1 / 60); assert.ok(cup.elevation > 50 && cup.elevation < 60, 'let go, it drops from the hand');
    run(p2, .6); assert.equal(cup.elevation, 0);
    const saved = (() => { const q = fallWorld(), b = box(q, [0, 0], 300); q.updateState(1 / 60); return [q.savePhysicsState(), b.entity_id, b.vertical_velocity, b.elevation]; })();
    const q = fallWorld(); q.loadPhysicsState(saved[0]); const b = q.elements.fetchEntity(saved[1]);
    assert.equal(b.vertical_velocity, saved[2]); assert.equal(b.elevation, saved[3], 'a fall saves mid-air');
});

test('falling is cheap: a crowd standing on the floor asks nothing of the grid', () => {
    const p = fallWorld();
    for (let i = 0; i < 400; i++) p.elements.createEntity({ kind: 'character', position: [(i % 20) * 30, Math.floor(i / 20) * 30], collision_shape: { shape_type: 'circle', radius: 5 }, height_span: [0, 60] }).motor.setMovement([1, 0], { speed: 50 });
    const flat = new physicsSystem();
    for (let i = 0; i < 400; i++) flat.elements.createEntity({ kind: 'character', position: [(i % 20) * 30, Math.floor(i / 20) * 30], collision_shape: { shape_type: 'circle', radius: 5 }, height_span: [0, 60] }).motor.setMovement([1, 0], { speed: 50 });
    const time = w => { run(w, .1); const t = performance.now(); run(w, .5); return performance.now() - t; };
    const a = time(flat), b = time(p); assert.ok(b < a * 1.5 + 20, `gravity's z costs little: ${b.toFixed(1)} ms vs ${a.toFixed(1)} ms`);
});
