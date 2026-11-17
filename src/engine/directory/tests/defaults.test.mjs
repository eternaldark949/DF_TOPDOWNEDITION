// ===== LV2 DIRECTORY =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_LIBRARIES, createEngineRegistry, validateSkeleton, validateClipSet, validateLocomotion, validateLibrary } from '../index.mjs';

test('the engine registry holds the base entity kinds and a default humanoid', () => {
    const registry = createEngineRegistry();
    for (const kind of ['entity', 'character', 'prop', 'static', 'trigger', 'decoration', 'humanoid']) assert.ok(registry.hasTemplate('engine:' + kind), kind);
    const person = registry.resolveTemplate('engine:humanoid');
    assert.equal(person.kind, 'character');
    assert.deepEqual(Object.keys(person.assets).sort(), ['clips', 'locomotion', 'skeleton']);
    assert.equal(registry.getResource(person.assets.skeleton).kind, 'skeleton');
    assert.ok(Object.isFrozen(ENGINE_LIBRARIES[0].resources.humanoid_skeleton.joints[0]));
});

test('a game library registers beside the defaults and may extend them', () => {
    const registry = createEngineRegistry({ libraries: [{ library_id: 'mine', templates: { guard: { extends: 'engine:humanoid', mass: 20 } } }] });
    const guard = registry.resolveTemplate('mine:guard');
    assert.equal(guard.mass, 20); assert.equal(guard.assets.skeleton, 'engine:humanoid_skeleton');
    assert.throws(() => createEngineRegistry({ libraries: [{ library_id: 'bad', resources: { s: { kind: 'skeleton', rig_id: 'x', joints: [{ name: 'a', parent: 'missing' }] } } }] }), /unknown parent/);
});

test('the structures refuse malformed skeletons, clip sets and locomotion', () => {
    assert.throws(() => validateSkeleton({ rig_id: 'x', joints: [{ name: 'a' }, { name: 'a' }] }), /unique/);
    assert.throws(() => validateSkeleton({ rig_id: 'x', joints: [{ name: 'a' }], anchors: { hand: { joint: 'b' } } }), /anchor/);
    assert.throws(() => validateClipSet({ clips: [{ clip_id: 'a', duration: 0, tracks: [] }] }), /duration/);
    assert.throws(() => validateLocomotion({ idle: 'idle', walk: 'walk', stride: 0, moving_speed: 1 }), /stride/);
    assert.deepEqual(validateLibrary({ library_id: 'x', resources: { y: { kind: 'unknown_kind' } } }).resources.y.kind, 'unknown_kind', 'kinds without a structure pass through');
});

test('door kinds are library data the map builder reads', async () => {
    const { doorKindsOf, validateDoorKind } = await import('../index.mjs');
    const { buildMapPackets } = await import('../../basement/maps/index.mjs');
    const kinds = doorKindsOf(createEngineRegistry());
    assert.deepEqual(Object.keys(kinds).sort(), ['double', 'saloon']);
    const leaves = buildMapPackets({ doors: [{ x: 0, y: 0, w: 60, h: 8, orientation: 'H', type: 'saloon' }] }, { door_kinds: kinds }).entries;
    assert.equal(leaves.length, 2); assert.ok(leaves.every(e => e.joints?.[0].constraint_type === 'hinge'));
    assert.throws(() => validateDoorKind({ name: 'x', leaves: [{ from: [0, 0], to: [1, 0], motion: 'hinge' }] }), /pivot/);
});

test('the engine library ships effect presets a world reads by id, with changes by type', async () => {
    const { physicsSystem } = await import('../../basement/physics/index.mjs'), { renderSystem, cameraSystem } = await import('../../basement/rendering/index.mjs');
    const registry = createEngineRegistry();
    for (const id of ['engine:film', 'engine:neon_night', 'engine:foggy_dawn']) assert.equal(registry.getResource(id).kind, 'effects');
    const render = new renderSystem({ physics_system: new physicsSystem({ asset_library: registry }), camera: new cameraSystem({ viewport: { width: 10, height: 10 } }) });
    render.setEffects({ preset: 'engine:film', grain: { amount: .2 } });
    assert.deepEqual(render.getEffects().frame.map(e => e.type), ['grade', 'vignette', 'grain']); assert.equal(render.getEffects().frame[2].amount, .2);
    assert.throws(() => validateLibrary({ library_id: 'bad', resources: { x: { kind: 'effects', effects: [{ type: 'grain', amount: 3 }] } } }), /bad:x\.effects\[0\]/);
    render.dispose();
});
