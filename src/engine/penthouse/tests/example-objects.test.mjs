// ===== LV3 PENTHOUSE =====
// The example bar cart: one object from one data file, made of components, drawn by the engine with no drawing code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { physicsSystem } from '../../basement/physics/index.mjs';
import { renderSystem, cameraSystem, recordingRenderer } from '../../basement/rendering/index.mjs';
import { createEngineRegistry, validateLibrary } from '../../directory/index.mjs';
import { createObject } from '../index.mjs';

const library = JSON.parse(readFileSync(new URL('../examples/bar-cart.json', import.meta.url), 'utf8'));
const world = () => new physicsSystem({ asset_library: createEngineRegistry({ libraries: [library] }) });

test('the bar cart is data: components at their own heights, fitted bounds, and its behaviour named, not coded', () => {
    validateLibrary(library);
    const p = world(), cart = createObject(p.elements, 'examples:bar_cart', [100, 50]);
    assert.deepEqual(cart.components.map(c => c.name), ['frame', 'red_wine', 'green_bottle', 'whiskey', 'decanter', 'ice_bucket', 'coupe_left', 'coupe_right']);
    assert.equal(cart.getComponent('frame').top, 41.5, 'the tray is 83 cm up (50 units a metre)');
    assert.equal(cart.height, 56.5, 'its tallest part is a bottle 30 cm tall on the tray');
    const [w, h] = cart.collision_shape.dimensions;
    assert.ok(Math.abs(w - 38.2) < 1e-9 && Math.abs(h - 24.4) < 1e-9, `the box fits the tray and the wheels, not the handle (a line): ${w} × ${h}`);
    assert.equal(cart.get('behaviour'), 'refill_drink');
});

test('the bar cart draws its parts lowest first, coloured by its look, and a look change recolours it', async () => {
    const p = world(), camera = new cameraSystem({ position: [0, 0], viewport: { width: 400, height: 300 } }), render = new renderSystem({ physics_system: p, camera });
    render.registerRenderer('recording', recordingRenderer); await render.setRenderer('recording', { surface: null });
    const cart = createObject(p.elements, 'examples:bar_cart', [0, 0]); p.updateState(1 / 60);
    const draw = () => { render.beginFrame(); render.drawLooks(); render.endFrame(); return render.getFrameSnapshot().passes.flatMap(pass => pass.packets); };
    const packets = draw(), fills = packets.map(packet => packet.material.fill);
    assert.ok(fills.indexOf('#1a1416') < fills.indexOf('#6a0c20'), 'the wheels before the wine');
    assert.ok(packets.filter(packet => packet.material.stroke === '#c9a46a').length >= 4, 'a brass frame');
    cart.set('look', { ...cart.get('look'), values: { ...cart.get('look').values, frame: '#c8ccd4' } });
    assert.equal(draw().filter(packet => packet.material.stroke === '#c9a46a').length, 0, 'a chrome cart is the same record with one value changed');
    render.dispose();
});
