// ===== LV3 PENTHOUSE =====
// One way to make anything: a record's fields switch its look, its bounds and its surface on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../../basement/physics/index.mjs';
import { renderSystem, cameraSystem, artScene, drawLook } from '../../basement/rendering/index.mjs';
import { createEngineRegistry } from '../../directory/index.mjs';
import { createObject, objectPacket } from '../index.mjs';

const library = {
    library_id: 'toys',
    resources: {
        lamp: { kind: 'drawing', steps: [
            { shape: 'glow', radius: 60, color: '$light' },
            { shape: 'circle', radius: 10, material: 'brass', solid: true },
            { shape: 'rectangle', x: -2, y: 10, width: 4, height: 30, material: 'brass', solid: true }] },
        crate: { kind: 'drawing', steps: [{ shape: 'rectangle', x: -10, y: -6, width: 20, height: 12, material: 'wood' }, { shape: 'ground_shadow', radius_x: 30, radius_y: 20 }] },
        brass: { kind: 'material', fill: '#b5a642', stroke: '#5a4f1c', line_width: 1 },
        wood: { kind: 'material', fill: '#8a5a2b', surface: { friction: .9, restitution: .1, footstep: 'wood' } }
    },
    templates: {
        lamp: { kind: 'prop', assets: { drawing: 'lamp' }, look: { values: { light: '#ffd27f' }, layer: 2 }, bounds: 'circle', data: { on: true } },
        crate: { kind: 'prop', assets: { drawing: 'crate', material: 'wood' }, bounds: 'box' },
        boxed_lamp: { extends: 'lamp', collision_shape: { shape_type: 'box', dimensions: [4, 4] } }
    }
};
const world = () => new physicsSystem({ asset_library: createEngineRegistry({ libraries: [library] }) });
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('an object is made from a record: its look is a property and its bounds fit the solid steps', () => {
    const p = world(), lamp = createObject(p.elements, 'toys:lamp', [100, 50]);
    assert.equal(lamp.template_id, 'toys:lamp'); assert.deepEqual([...lamp.position], [100, 50]);
    assert.equal(lamp.get('on'), true); assert.deepEqual(lamp.get('look').values, { light: '#ffd27f' });
    const shape = lamp.collision_shape;   // the circle and the post, not the glow
    assert.equal(shape.shape_type, 'circle'); near(shape.local_position[1], 15); near(shape.radius, Math.hypot(2, 25), 1e-3);
    assert.ok(shape.radius < 60, 'the glow never makes it fat');
    assert.ok(p.getBodyBounds(lamp.body, { bounds_type: 'render' }).right - 100 >= 60 - 1e-6, 'the render bounds cover the glow, so the camera keeps drawing it');
});
test('every bounds kind fits, an explicit shape wins, and a material sets the surface', () => {
    const p = world(), crate = createObject(p.elements, 'toys:crate');
    assert.equal(crate.collision_shape.shape_type, 'box'); assert.deepEqual(crate.collision_shape.dimensions, [20, 12], 'unmarked steps are solid except shadows');
    assert.equal(crate.body.getState().friction, .9); assert.equal(crate.body.getState().restitution, .1);
    assert.equal(createObject(p.elements, 'toys:boxed_lamp').collision_shape.shape_type, 'box');
    assert.equal(createObject(p.elements, 'toys:lamp', [0, 0], { bounds: 'capsule' }).collision_shape.shape_type, 'capsule');
    const hull = createObject(p.elements, 'toys:crate', [0, 0], { bounds: 'hull' }).collision_shape;
    assert.equal(hull.shape_type, 'polygon'); assert.equal(hull.points.length, 4);
    assert.throws(() => objectPacket(p.elements.asset_library, { kind: 'prop', bounds: 'circle' }), /need a drawing/);
    assert.throws(() => createObject(p.elements, 'toys:lamp', [0, 0], { bounds: 'blob' }), /Collision bounds/);
});
test('a look draws at the entity pose with its materials, and the record refuses bad data', () => {
    const p = world(), lamp = createObject(p.elements, 'toys:lamp', [100, 50]), scene = new artScene();
    assert.equal(drawLook(scene, lamp, p.elements.asset_library), true);
    const packets = scene.finish(), circle = packets[1];
    assert.equal(packets.length, 3); assert.equal(circle.material.fill, '#b5a642'); assert.equal(circle.material.stroke, '#5a4f1c');
    assert.deepEqual(circle.matrix.slice(4), [100, 50]);
    lamp.set('look', { ...lamp.get('look'), visible: false }); assert.equal(drawLook(new artScene(), lamp, p.elements.asset_library), false);
    assert.throws(() => createEngineRegistry({ libraries: [{ library_id: 'bad', resources: { m: { kind: 'material', fill: '#000', glossy: true } } }] }), /unknown field glossy/);
    assert.throws(() => createEngineRegistry({ libraries: [{ library_id: 'bad', resources: { d: { kind: 'drawing', steps: [{ shape: 'star' }] } } }] }), /unknown shape star/);
});
