// ===== LV3 PENTHOUSE =====
// The humanoid boots on the engine alone: a world, the engine's default registry, nothing from a game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../../basement/physics/index.mjs';
import { createEngineRegistry } from '../../directory/index.mjs';
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
    const packet = person.getRenderPacket();
    assert.deepEqual(packet.parts.map(part => part.part).slice(-2), ['torso', 'head'], 'drawn back to front');
    for (const part of packet.parts) assert.ok((part.center ?? part.from).every(Number.isFinite));
    assert.throws(() => new humanoid(new physicsSystem(), {}), 'a world without the template refuses');
});

test('it walks when its body moves, stepping on distance, and stands again when it stops', () => {
    const p = world(), person = new humanoid(p, { position: [100, 100] }), steps_heard = [];
    p.on('animationMarker', e => steps_heard.push(e.name));
    person.entity.setMovement([1, 0]); steps(p, person, 90);
    assert.equal(person.rig.getState().layers.base.clip_id, 'walk');
    assert.ok(steps_heard.includes('footstep_l') && steps_heard.includes('footstep_r'), `footsteps (${steps_heard})`);
    person.entity.setMovement([0, 0]); steps(p, person, 90);
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
