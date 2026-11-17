// ===== LV3 PENTHOUSE =====
// The humanoid boots on the engine alone: a world, the engine's default registry, nothing from a game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../../basement/physics/index.mjs';
import { createEngineRegistry } from '../../directory/index.mjs';
import { drawComponents } from '../../basement/rendering/index.mjs';
import { humanoid } from '../index.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const world = () => new physicsSystem({ asset_library: createEngineRegistry() });
const steps = (p, person, n) => { for (let i = 0; i < n; i++) { person?.updateState(); p.updateState(); } };
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('a humanoid boots on the engine defaults with a body, a rig and an idle pose', () => {
    const p = world(), person = new humanoid(p, { position: [100, 100], name: 'test' });
    assert.equal(person.entity.template_id, 'engine:humanoid');
    assert.deepEqual(person.rig.getState().layer_order, ['base']);
    assert.equal(person.rig.getState().layers.base.clip_id, 'idle');
    p.updateState();
    assert.equal(person.entity.height, 87.5, 'it stands 1.75 m: the top of its hair');
    assert.deepEqual([...person.entity.body.getState().height_span], [0, 87.5], 'and its body reaches that high');
    const drawn = drawComponents(person.entity, p.elements.asset_library, 1, { joints: name => p.rigs.getPose(person.entity, { world_space: true }).joints[name] });
    assert.deepEqual(drawn.map(part => part.component).slice(0, 2), ['foot_l', 'foot_r'], 'drawn lowest first');
    assert.deepEqual(drawn.map(part => part.component).slice(-3), ['torso', 'head', 'head'], 'the torso, the head, then the hair over it');
    const head = drawn.find(part => part.component === 'head'), headJoint = p.rigs.getPose(person.entity, { world_space: true }).joints.head;
    assert.deepEqual(head.packets[0].matrix.slice(4), headJoint.position, 'the head rides its joint');
    const tall = new humanoid(p, { position: [300, 100], height: 2 });
    const big = drawComponents(tall.entity, p.elements.asset_library, 1, { joints: name => p.rigs.getPose(tall.entity, { world_space: true }).joints[name] }).find(part => part.component === 'head');
    const scale = m => Math.hypot(m[0], m[1]);
    assert.ok(Math.abs(scale(big.packets[0].matrix) - 2 * scale(head.packets[0].matrix)) < 1e-9, 'a taller rig draws its parts bigger');
    assert.throws(() => new humanoid(new physicsSystem(), {}), 'a world without the template refuses');
});

test('it walks when its body moves, stepping on distance, and stands again when it stops', () => {
    const p = world(), person = new humanoid(p, { position: [100, 100] }), steps_heard = [];
    p.on('animationMarker', e => steps_heard.push(e.name));
    person.entity.motor.setMovement([1, 0]); steps(p, person, 90);
    assert.equal(person.rig.getState().layers.base.clip_id, 'walk');
    assert.ok(steps_heard.includes('footstep_l') && steps_heard.includes('footstep_r'), `footsteps (${steps_heard})`);
    person.entity.motor.setMovement([0, 0]); steps(p, person, 90);
    assert.equal(person.rig.getState().layers.base.clip_id, 'idle');
});

test('it reaches a world point with either hand, looks at one, and lets go', () => {
    const p = world(), person = new humanoid(p, { position: [100, 100] });
    person.reachFor('r', [110, 108]).lookAt([100, 140]); steps(p, person, 1);
    const pose = p.rigs.getPose(person.entity, { world_space: true }).joints;
    assert.ok(gap(pose.hand_r.position, [110, 108]) < 1e-6, 'the hand is on the point');
    assert.ok(Math.abs(pose.head.rotation - 1.2) < .02, `the head turns as far as it may (${pose.head.rotation.toFixed(3)}; the breathing torso's scale skews it a little)`);
    person.release('r').stopLooking(); assert.deepEqual(person.rig.getIkGoals(), {});
    assert.throws(() => person.reachFor('x', [0, 0]));
});

test('a physical arm swings behind a turn, takes a hit, restores from a save, and goes with the body', () => {
    const p = world(), person = new humanoid(p, { position: [100, 100] }).setPhysicalArm('r', true);
    assert.deepEqual(person.physical_arms, ['r']);
    steps(p, person, 30); const rest = p.rigs.getPose(person.entity, { world_space: true }).joints.hand_r.position;
    const chain = p.rigs.getPhysicalChains(person.entity)[0];
    p.fetchBody(chain.segments[1]).applyImpulse([0, 80]); steps(p, person, 2);
    const hit = p.rigs.getPose(person.entity, { world_space: true }).joints.hand_r.position;
    assert.ok(gap(hit, rest) > 1, `the hit moved the hand (${gap(hit, rest).toFixed(2)})`);
    steps(p, person, 120); const settled = p.rigs.getPose(person.entity, { world_space: true }).joints.hand_r.position;
    assert.ok(gap(settled, rest) < .5, 'and the arm comes back to its pose');
    const copy = world(); copy.loadPhysicsState(p.savePhysicsState());
    const again = new humanoid(copy, { entity: copy.elements.fetchEntity(person.entity.entity_id) });
    assert.deepEqual(again.physical_arms, ['r']);
    person.remove(); for (const id of chain.segments) assert.equal(p.fetchBody(id), null);
});

test('the Penthouse imports only the Basement and the Directory', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.mjs') ? [join(dir, e.name)] : []);
    for (const file of files(root)) for (const [, path] of readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g))
        if (path.startsWith('.')) assert.ok(!/(lobby|game|legacy)\//.test(path), `${file} imports ${path}`);
});

test('a humanoid scales whole, Alice-style: its rig, its parts, its height and its hitbox grow together', () => {
    const p = world(), alice = new humanoid(p, { position: [0, 0] }), radius = alice.entity.collision_shape.radius;
    p.updateState();
    const joints = () => p.rigs.getPose(alice.entity, { world_space: true }).joints;
    const head = () => drawComponents(alice.entity, p.elements.asset_library, 1, { joints: name => joints()[name] }).find(part => part.component === 'head').packets[0].matrix;
    const span = () => { const j = joints(); return Math.hypot(j.shoulder_l.position[0] - j.shoulder_r.position[0], j.shoulder_l.position[1] - j.shoulder_r.position[1]); };
    const before = { head: head(), shoulders: span() };
    alice.entity.scaleTo(4); p.updateState();
    assert.equal(alice.entity.height, 350, 'she stands 7 m'); assert.deepEqual([...alice.entity.body.getState().height_span], [0, 350]);
    assert.equal(alice.entity.collision_shape.radius, radius * 4);
    const after = { head: head(), shoulders: span() };
    assert.ok(Math.abs(Math.hypot(after.head[0], after.head[1]) / Math.hypot(before.head[0], before.head[1]) - 4) < 0.01, 'her head draws four times the size');
    assert.ok(Math.abs(after.shoulders / before.shoulders - 4) < 0.01, 'her shoulders are four times as wide (give or take her breathing)');
    alice.entity.scaleTo(0.25); p.updateState(); assert.equal(alice.entity.height, 87.5 / 4, 'and shrinks as well');
});

test('a physical arm is rebuilt at the new size when its humanoid scales', () => {
    const p = world(), person = new humanoid(p, { position: [0, 0] }).setPhysicalArm('r', true); steps(p, person, 5);
    const bones = () => p.rigs.getPhysicalChains(person.entity)[0].segments.map(id => p.fetchBody(id).getState().collision_shape);
    const before = bones(), length = shape => shape.points[1][0] - shape.points[0][0];
    person.entity.scaleTo(3); steps(p, person, 5);
    const after = bones();
    assert.deepEqual(person.physical_arms, ['r'], 'still the same arm');
    after.forEach((shape, i) => { assert.ok(Math.abs(shape.radius - 3 * before[i].radius) < 1e-9, 'three times as thick'); assert.ok(Math.abs(length(shape) / length(before[i]) - 3) < 0.02, 'and three times as long'); });
    const hand = p.rigs.getPose(person.entity, { world_space: true }).joints.hand_r.position, shoulder = p.rigs.getPose(person.entity, { world_space: true }).joints.shoulder_r.position;
    assert.ok(Math.hypot(hand[0] - shoulder[0], hand[1] - shoulder[1]) > 2 * 8, 'the arm reaches as far as a big arm does');
    person.setPhysicalArm('r', false); assert.deepEqual(person.physical_arms, []);
});
