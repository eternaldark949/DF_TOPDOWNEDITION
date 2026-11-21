// ===== LV3 PENTHOUSE =====
// A building is one entity made of components: a component per wing, a layer per floor, walls that lean.
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../../basement/physics/index.mjs';
import { renderSystem, cameraSystem, recordingRenderer } from '../../basement/rendering/index.mjs';
import { createEngineRegistry } from '../../directory/index.mjs';
import { createObject } from '../index.mjs';

const block = (w, h, fill) => [{ shape: 'rectangle', x: -w / 2, y: -h / 2, width: w, height: h, fill }];
const floors = (n, w, h) => Array.from({ length: n }, (_, i) => ({ layer: i, height: `${3 * i} m`, thickness: '3 m', steps: block(w, h, '$roof'), sides: '$wall' }));
const library = { library_id: 'city', templates: {
    hotel: { extends: 'engine:building', look: { values: { wall: '#c9b79c', roof: '#6b6158' } }, components: [
        { name: 'tower', layers: floors(4, 200, 200) },
        { name: 'lobby', at: [200, 0], layers: [...floors(1, 200, 120), { layer: 1, height: '3 m', thickness: '20 cm', steps: block(220, 140, '#444') }] }] } } };
const world = () => new physicsSystem({ asset_library: createEngineRegistry({ libraries: [library] }) });

test('a building is one entity: a component per wing and a layer per floor, as tall as its top floor', () => {
    const p = world(), hotel = createObject(p.elements, 'city:hotel', [0, 0]);
    assert.ok(hotel.tags.includes('building')); assert.equal(hotel.kind, 'static');
    assert.deepEqual(hotel.components.map(c => c.name), ['tower', 'lobby']);
    assert.equal(hotel.height, 600, 'four 3 m floors'); assert.equal(hotel.getComponent('lobby').top, 160);
    const wings = hotel.collision_shape.children, edge = (i, k, f) => f(...wings.map(b => b.local_position[i] + k * b.dimensions[i] / 2));
    assert.equal(hotel.collision_shape.shape_type, 'compound', 'a building collides as its parts (bounds: parts)');
    assert.ok(wings.length >= 2, 'a box per wing (and per floor where a floor steps in)'); assert.deepEqual([edge(0, 1, Math.max) - edge(0, -1, Math.min), edge(1, 1, Math.max) - edge(1, -1, Math.min)], [410, 200], 'together they cover its footprint');
    assert.deepEqual([...hotel.body.getState().height_span], [0, 600]);
    hotel.getComponent('tower').removeLayer(3); p.updateState(1 / 60);
    assert.equal(hotel.height, 450, 'take a floor off and it is a floor shorter');
});

test('walls lean toward the camera: the roof draws in its own raised plane and the seen sides fill in', async () => {
    const p = world(), camera = new cameraSystem({ position: [-300, 0], viewport: { width: 1200, height: 800 } }), render = new renderSystem({ physics_system: p, camera });
    render.registerRenderer('recording', recordingRenderer); await render.setRenderer('recording', { surface: null }); render.setStillPictures(false);   // (these read each shape's packets)
    createObject(p.elements, 'city:hotel', [0, 0]); p.updateState(1 / 60);
    const draw = () => { render.beginFrame(); render.drawLooks(); render.endFrame(); return render.getFrameSnapshot().passes.flatMap(pass => pass.packets); };
    const flat = draw(), walls = flat.filter(packet => packet.material.fill === '#c9b79c');
    assert.equal(walls.length, 0, 'flat: no walls');
    render.setHeightView({ eye: 1500 }); assert.deepEqual(render.getHeightView(), { eye: 1500, lean: 1 });
    const leaning = draw(), sides = leaning.filter(packet => packet.material.fill === '#c9b79c');
    assert.ok(sides.length >= 5, 'each floor shows the walls that face the camera');
    const roof = leaning.filter(packet => packet.material.fill === '#6b6158').at(-1), k = 1500 / (1500 - 600);
    assert.ok(Math.abs(roof.transform[0] - k) < 1e-9, 'the top floor draws scaled about the camera by its height');
    assert.ok(Math.abs(roof.transform[4] - (-300) * (1 - k)) < 1e-6, 'about the camera position');
    assert.throws(() => render.setHeightView({ eye: 0 }), /eye/);
    render.setHeightView(null); assert.equal(draw().filter(packet => packet.material.fill === '#c9b79c').length, 0);
    render.dispose();
});
