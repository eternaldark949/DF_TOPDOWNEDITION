// ===== LV0 BASEMENT =====
// Components: the parts an entity is made of, each with integer layers at their own heights.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readComponent, readComponents, componentSpan, layersByHeight, physicsSystem } from '../index.mjs';
const metres = n => n * 50;   // world units, as the Directory reads "n m"

const tower = { name: 'tower', at: [metres(2), 0], layers: [
    { layer: 1, height: metres(3), thickness: metres(3), steps: [{ shape: 'rectangle', x: -50, y: -50, width: 100, height: 100 }] },
    { layer: 0, height: 0, thickness: metres(0.2), steps: [{ shape: 'rectangle', x: -60, y: -60, width: 120, height: 120 }] },
    { layer: 2, height: metres(7), thickness: metres(0.5), steps: [], solid: false }] };

test('a component is checked data: layers sorted, lengths in world units, a base and a top', () => {
    const c = readComponent(tower);
    assert.deepEqual(c.at, [metres(2), 0]); assert.equal(c.joint, null);
    assert.deepEqual(c.layers.map(l => l.layer), [0, 1, 2]);
    assert.equal(c.layers[1].height, metres(3)); assert.equal(c.layers[0].thickness, 10);
    assert.deepEqual(componentSpan(c), { base: 0, top: metres(7.5) });
    assert.equal(c.layers[0].solid, true); assert.equal(c.layers[2].solid, false); assert.equal(c.layers[0].visible, true);
    assert.throws(() => readComponent({ name: 'x', layers: [] }), /one layer or more/);
    assert.throws(() => readComponent({ name: 'x', layers: [{ layer: 0, steps: [] }, { layer: 0, steps: [] }] }), /layer 0 twice/);
    assert.throws(() => readComponent({ name: 'x', layers: [{ layer: 1.5, steps: [] }] }), /integer layer/);
    assert.throws(() => readComponent({ name: 'x', layers: [{ layer: 0, steps: [], drawing: 'd' }] }), /one of the two/);
    assert.throws(() => readComponent({ name: 'x', layers: [{ layer: 0, steps: [], thickness: -1 }] }), /at least 0/);
    assert.throws(() => readComponent({ name: 'x', colour: 'red', layers: [{ layer: 0, steps: [] }] }), /no field colour/);
    assert.throws(() => readComponents([{ name: 'a', layers: [{ layer: 0, steps: [] }] }, { name: 'a', layers: [{ layer: 0, steps: [] }] }]), /Two components/);
});

test('layers draw lowest first: by height, then layer number, then component order', () => {
    const list = readComponents([tower, { name: 'awning', layers: [{ layer: 0, height: metres(3), steps: [] }] }]);
    assert.deepEqual(layersByHeight(list).map(({ component, layer }) => `${component.name}:${layer.layer}`), ['tower:0', 'awning:0', 'tower:1', 'tower:2']);
    list[0].layers[1].visible = false;
    assert.equal(layersByHeight(list).length, 3); assert.equal(layersByHeight(list, { visible_only: false }).length, 4);
});

test('an entity is made of components: it reads, adds, edits and removes them, and stands as tall as its highest top', () => {
    const p = new physicsSystem(), e = p.elements.createEntity({ kind: 'static', position: [0, 0], components: [tower] });
    assert.equal(e.height, metres(7.5)); assert.deepEqual(e.components.map(c => c.name), ['tower']);
    const t = e.getComponent('tower'); assert.equal(t.base, 0); assert.equal(t.top, metres(7.5)); assert.equal(t.getLayer(1).height, metres(3));
    const heard = []; e.on('propertyChanged', event => heard.push(event.key));
    t.setLayerVisible(2, false); assert.equal(t.getLayer(2).visible, false);
    t.setLayerHeight(2, metres(10), metres(1)); assert.equal(e.height, metres(11));
    t.moveTo(5, 6); assert.deepEqual(t.at, [5, 6]); t.rotateTo(Math.PI / 2);
    const p2 = t.toEntity([1, 0]); assert.ok(Math.abs(p2[0] - 5) < 1e-9 && Math.abs(p2[1] - 7) < 1e-9);
    t.setLayer({ layer: 3, height: metres(12), thickness: metres(1), steps: [] }); assert.equal(e.height, metres(13));
    t.removeLayer(3); assert.equal(t.hasLayer(3), false);
    const arm = e.addComponent({ name: 'arm', joint: 'hand', layers: [{ layer: 0, height: metres(1), thickness: metres(0.1), steps: [] }] });
    assert.equal(arm.joint, 'hand'); assert.equal(e.hasComponent('arm'), true);
    assert.throws(() => e.addComponent({ name: 'arm', layers: [{ layer: 0, steps: [] }] }), /already a component/);
    assert.equal(e.removeComponent('arm'), true); assert.equal(e.removeComponent('arm'), false); assert.equal(e.getComponent('arm'), null);
    assert.throws(() => arm.top, /has been removed/);
    p.updateState(1 / 60);
    assert.ok(heard.length >= 7 && heard.every(key => key === 'components'), 'every change is a property change');
    const plain = p.elements.createEntity({ position: [50, 0] }); assert.equal(plain.height, 0); assert.deepEqual(plain.components, []);
});

test('components save and load with their entity', () => {
    const p = new physicsSystem(), e = p.elements.createEntity({ kind: 'static', position: [0, 0], components: [tower] });
    p.updateState(1 / 60); e.getComponent('tower').setLayerVisible(0, false); p.updateState(1 / 60);
    const q = new physicsSystem(); q.loadPhysicsState(structuredClone(p.savePhysicsState()));
    const back = q.elements.fetchEntity(e.entity_id);
    assert.equal(back.height, metres(7.5)); assert.equal(back.getComponent('tower').getLayer(0).visible, false);
});

test('collision knows heights: a shot flies over a low wall, a high shot misses, rays ask at a height', () => {
    const wall = () => ({ kind: 'static', position: [60, 0], collision_shape: { shape_type: 'box', dimensions: [10, 100] },
        components: [{ name: 'wall', layers: [{ layer: 0, height: 0, thickness: metres(1), steps: [] }, { layer: 1, height: metres(1), thickness: metres(2), steps: [], solid: false }] }] });
    const shoot = height => {
        const p = new physicsSystem(), w = p.elements.createEntity(wall()), hits = [];
        p.on('projectileHit', e => hits.push(e.target_body?.body_id ?? e.body_b?.body_id));
        p.elements.createEntity({ kind: 'projectile', position: [0, 0], speed: 2000, direction: [1, 0], height_span: [height, height] });
        for (let i = 0; i < 6; i++) p.updateState(1 / 60);
        return { p, w, hits };
    };
    const { w } = shoot(0); assert.deepEqual([...w.body.getState().height_span], [0, metres(1)], 'the body reaches as high as its solid layers');
    assert.ok(shoot(metres(0.5)).hits.length >= 1, 'a shot at 50 cm hits a 1 m wall');
    assert.equal(shoot(metres(1.5)).hits.length, 0, 'a shot at 1.5 m flies over it: the non-solid layer above does not block');
    const p = new physicsSystem(); p.elements.createEntity(wall()); p.updateState(1 / 60);
    assert.ok(p.raycast({ from: [0, 0], to: [120, 0] }), 'a ray with no height meets it');
    assert.ok(p.raycast({ from: [0, 0], to: [120, 0], at_height: metres(0.5) }));
    assert.equal(p.raycast({ from: [0, 0], to: [120, 0], at_height: metres(1.5) }), null);
    assert.equal(p.raycast({ from: [0, 0], to: [120, 0], height_span: [metres(1.2), metres(3)] }), null);
    assert.throws(() => p.raycast({ from: [0, 0], to: [120, 0], height_span: [3, 1] }), /base no higher/);
});

test('bodies at different heights pass each other; a span follows its components unless the packet set one', () => {
    const p = new physicsSystem(), E = p.elements;
    const bridge = E.createEntity({ kind: 'static', position: [0, 0], collision_shape: { shape_type: 'box', dimensions: [40, 40] }, components: [{ name: 'deck', layers: [{ layer: 0, height: metres(4), thickness: metres(0.5), steps: [] }] }] });
    const car = E.createEntity({ kind: 'prop', position: [-60, 0], linear_velocity: [300, 0], collision_shape: { shape_type: 'circle', radius: 10 }, height_span: [0, metres(1.5)] });
    for (let i = 0; i < 30; i++) p.updateState(1 / 60);
    assert.ok(car.position[0] > 40, 'the car drives under the bridge');
    bridge.getComponent('deck').setLayerHeight(0, 0, metres(4.5)); p.updateState(1 / 60);
    assert.deepEqual([...bridge.body.getState().height_span], [0, metres(4.5)], 'changing a layer moves the span');
    const fixed = E.createEntity({ kind: 'static', position: [300, 0], height_span: [0, 10], components: [{ name: 'c', layers: [{ layer: 0, height: 0, thickness: 500, steps: [] }] }] });
    fixed.getComponent('c').setLayerHeight(0, 0, 900); p.updateState(1 / 60);
    assert.deepEqual([...fixed.body.getState().height_span], [0, 10], 'an explicit span is kept');
    const plain = E.createEntity({ kind: 'static', position: [500, 0] }); assert.equal(plain.body.getState().height_span, null, 'no components: every height');
    plain.addComponent({ name: 'post', layers: [{ layer: 0, height: 0, thickness: 100, steps: [] }] }); p.updateState(1 / 60);
    assert.deepEqual([...plain.body.getState().height_span], [0, 100]);
    const q = new physicsSystem(); q.loadPhysicsState(structuredClone(p.savePhysicsState()));
    const back = q.elements.fetchEntity(bridge.entity_id); back.getComponent('deck').setLayerHeight(0, metres(5), metres(0.5)); q.updateState(1 / 60);
    assert.deepEqual([...back.body.getState().height_span], [metres(5), metres(5.5)], 'a loaded entity still follows its components');
});
