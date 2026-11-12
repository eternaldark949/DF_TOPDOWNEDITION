// ===== LV2 DIRECTORY =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_LIBRARIES, createEngineRegistry, validateSkeleton, validateClipSet, validateLocomotion, validateFigure, validateLibrary } from '../index.mjs';

test('the engine registry holds the base entity kinds and a default humanoid', () => {
    const registry = createEngineRegistry();
    for (const kind of ['entity', 'character', 'prop', 'static', 'trigger', 'decoration', 'humanoid']) assert.ok(registry.hasTemplate('engine:' + kind), kind);
    const person = registry.resolveTemplate('engine:humanoid');
    assert.equal(person.entity_type, 'character');
    assert.deepEqual(Object.keys(person.assets).sort(), ['clips', 'figure', 'locomotion', 'skeleton']);
    assert.equal(registry.getResource(person.assets.skeleton).kind, 'skeleton');
    assert.ok(Object.isFrozen(ENGINE_LIBRARIES[0].resources.humanoid_skeleton.joints[0]));
});

test('a game library registers beside the defaults and may extend them', () => {
    const registry = createEngineRegistry({ libraries: [{ library_id: 'mine', templates: { guard: { extends: 'engine:humanoid', mass: 20 } } }] });
    const guard = registry.resolveTemplate('mine:guard');
    assert.equal(guard.mass, 20); assert.equal(guard.assets.skeleton, 'engine:humanoid_skeleton');
    assert.throws(() => createEngineRegistry({ libraries: [{ library_id: 'bad', resources: { s: { kind: 'skeleton', rig_id: 'x', joints: [{ name: 'a', parent: 'missing' }] } } }] }), /unknown parent/);
});

test('the structures refuse malformed skeletons, clip sets, locomotion and figures', () => {
    assert.throws(() => validateSkeleton({ rig_id: 'x', joints: [{ name: 'a' }, { name: 'a' }] }), /unique/);
    assert.throws(() => validateSkeleton({ rig_id: 'x', joints: [{ name: 'a' }], anchors: { hand: { joint: 'b' } } }), /anchor/);
    assert.throws(() => validateClipSet({ clips: [{ clip_id: 'a', duration: 0, tracks: [] }] }), /duration/);
    assert.throws(() => validateLocomotion({ idle: 'idle', walk: 'walk', stride: 0, moving_speed: 1 }), /stride/);
    assert.throws(() => validateFigure({ parts: [{ part: 'arm', shape: 'capsule', joint: 'a', radius: 2 }] }), /sizes/);
    assert.deepEqual(validateLibrary({ library_id: 'x', resources: { y: { kind: 'unknown_kind' } } }).resources.y.kind, 'unknown_kind', 'kinds without a structure pass through');
});
