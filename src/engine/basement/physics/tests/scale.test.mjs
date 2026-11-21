// ===== LV0 BASEMENT =====
// Entity scale: one call makes an entity bigger or smaller, body, height and children with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../index.mjs';
import { scaleShape, readScale, massFactor } from '../elements/scale.mjs';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const crate = extra => ({ kind: 'prop', position: [0, 0], mass: 10, collision_shape: { shape_type: 'box', dimensions: [20, 10] },
    components: [{ name: 'box', layers: [{ layer: 0, height: 0, thickness: 40, steps: [] }] }], ...extra });

test('a scale is a number or [x, y, height], and shapes scale by kind, or become the polygon they stretch into', () => {
    assert.deepEqual(readScale(2), [2, 2, 2]); assert.deepEqual(readScale([1, 2, 3]), [1, 2, 3]);
    for (const bad of [0, -1, [1, 2], 'big', [1, 0, 1]]) assert.throws(() => readScale(bad), /positive number/);
    assert.equal(scaleShape({ shape_type: 'circle', radius: 5, local_position: [1, 2] }, [3, 3]).radius, 15);
    assert.deepEqual(scaleShape({ shape_type: 'circle', radius: 5, local_position: [1, 2] }, [3, 3]).local_position, [3, 6]);
    assert.deepEqual(scaleShape({ shape_type: 'box', dimensions: [4, 2] }, [2, 5]).dimensions, [8, 10]);
    const oval = scaleShape({ shape_type: 'circle', radius: 10 }, [2, 1]);
    assert.equal(oval.shape_type, 'polygon'); near(Math.max(...oval.points.map(p => p[0])), 20); near(Math.max(...oval.points.map(p => p[1])), 10);
    const turned = scaleShape({ shape_type: 'box', dimensions: [10, 2], local_rotation: Math.PI / 2 }, [3, 1]);
    assert.equal(turned.shape_type, 'polygon'); near(Math.max(...turned.points.map(p => p[0])), 3); near(Math.max(...turned.points.map(p => p[1])), 5);
    const both = scaleShape({ shape_type: 'compound', children: [{ shape_type: 'circle', radius: 1, local_position: [4, 0] }] }, [2, 2]);
    assert.deepEqual(both.children[0].local_position, [8, 0]); assert.equal(both.children[0].radius, 2);
    assert.equal(massFactor([2, 3, 4], 'area'), 6); assert.equal(massFactor([2, 3, 4], 'volume'), 24); assert.equal(massFactor([2, 3, 4], false), 1);
    assert.throws(() => massFactor([1, 1, 1], 'weight'), /mass_scales/);
});

test('an entity scales whole: its collision, height and span follow, and mass only under the record\'s switch', () => {
    const p = new physicsSystem(), big = p.elements.createEntity(crate({ scale: 3 })), plain = p.elements.createEntity(crate({ position: [200, 0] }));
    assert.deepEqual(big.scale, [3, 3, 3]); assert.deepEqual(plain.scale, [1, 1, 1]);
    assert.deepEqual(big.collision_shape.dimensions, [60, 30]); assert.equal(big.height, 120); assert.deepEqual([...big.body.getState().height_span], [0, 120]);
    assert.equal(big.mass, 10, 'mass stays unless the record says how it scales');
    const heard = []; big.on('entityScaled', e => heard.push(e.scale));
    big.scaleTo(0.5); p.updateState(1 / 60);
    assert.deepEqual(big.collision_shape.dimensions, [10, 5]); assert.equal(big.height, 20); assert.deepEqual(heard, [[0.5, 0.5, 0.5]]);
    big.scaleBy([2, 1, 4]); assert.deepEqual(big.scale, [1, 0.5, 2]); assert.deepEqual(big.collision_shape.dimensions, [20, 5]); assert.equal(big.height, 80);
    const heavy = p.elements.createEntity(crate({ position: [400, 0], scale: 2, mass_scales: 'volume' }));
    assert.equal(heavy.mass, 80); heavy.scaleTo(1); assert.equal(heavy.mass, 10, 'scaled back, it weighs what the record says');
    const flat = p.elements.createEntity(crate({ position: [600, 0], scale: 2, mass_scales: 'area' })); assert.equal(flat.mass, 40);
    big.getComponent('box').setLayerHeight(0, 0, 100); p.updateState(1 / 60);
    assert.equal(big.height, 200, 'a component change is measured at its scale'); assert.deepEqual([...big.body.getState().height_span], [0, 200]);
    const spanned = p.elements.createEntity({ kind: 'static', position: [800, 0], height_span: [10, 20], scale: [1, 1, 3] }); assert.deepEqual([...spanned.body.getState().height_span], [30, 60]);
    assert.throws(() => p.elements.createEntity(crate({ mass_scales: 'weight' })), /mass_scales/);
});

test('attached children take their parent\'s scale, ride at stretched offsets, and keep their own when they leave', () => {
    const p = new physicsSystem(), E = p.elements;
    const cart = E.createEntity({ kind: 'prop', position: [0, 0], collision_shape: { shape_type: 'box', dimensions: [40, 20] } });
    const lamp = E.createEntity({ kind: 'prop', position: [0, 0], collision_shape: { shape_type: 'circle', radius: 4 }, scale: 2 });
    cart.attach(lamp, { at: [10, 0] }); p.updateState(1 / 60);
    cart.scaleTo(3); p.updateState(1 / 60);
    assert.deepEqual(lamp.scale, [2, 2, 2]); assert.deepEqual(lamp.world_scale, [6, 6, 6]); assert.equal(lamp.collision_shape.radius, 24);
    near(lamp.position[0], 30, 1e-6, 'its offset stretches with the cart');
    lamp.detach(null, { exit_points: [[200, 0]] }); p.updateState(1 / 60);
    assert.equal(lamp.parent, null); assert.deepEqual(lamp.world_scale, [2, 2, 2]); assert.equal(lamp.collision_shape.radius, 8);
});

test('scale is saved and loaded with its entity', () => {
    const p = new physicsSystem(), e = p.elements.createEntity(crate({ scale: [2, 1, 3], mass_scales: 'area' })); p.updateState(1 / 60);
    const q = new physicsSystem(); q.loadPhysicsState(structuredClone(p.savePhysicsState()));
    const back = q.elements.fetchEntity(e.entity_id);
    assert.deepEqual(back.scale, [2, 1, 3]); assert.equal(back.height, 120); assert.equal(back.mass, 20);
    back.scaleTo(1); assert.deepEqual(back.collision_shape.dimensions, [20, 10], 'it still knows its rest size'); assert.equal(back.mass, 10);
});
