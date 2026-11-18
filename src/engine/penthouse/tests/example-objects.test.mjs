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
    assert.deepEqual(cart.components.map(c => c.name), ['frame', 'bottle_left', 'bottle_right', 'bottle_middle', 'decanter', 'ice_bucket', 'coupe_left', 'coupe_right']);
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
    cart.set('look', { ...cart.get('look'), values: { ...cart.get('look').values, frame: 'chrome' } });
    assert.equal(draw().filter(packet => packet.material.stroke === '#c9a46a').length, 0, 'a chrome cart is the same record with one value changed');
    render.dispose();
});

test('leaning, each thing on the tray draws whole, farthest from the camera first, so a near bottle covers the foot of a far glass', async () => {
    const p = world(), camera = new cameraSystem({ position: [0, 0], viewport: { width: 400, height: 300 } }), render = new renderSystem({ physics_system: p, camera });
    render.registerRenderer('recording', recordingRenderer); await render.setRenderer('recording', { surface: null });
    createObject(p.elements, 'examples:bar_cart', [0, 0]); p.updateState(1 / 60);
    const order = x => { camera.setView({ position: [x, 0] }); render.setHeightView({ eye: 400 }); render.beginFrame(); render.drawLooks(); render.endFrame();
        const fills = render.getFrameSnapshot().passes.flatMap(pass => pass.packets).map(packet => packet.material.fill);
        return { wine: fills.lastIndexOf('#6a0c20'), cork: fills.indexOf('#c8a27a'), coupe: fills.indexOf('rgba(220,240,255,0.2)'), tray: fills.lastIndexOf('rgba(40,30,36,0.92)') }; };
    const left = order(-150), right = order(150);
    assert.ok(left.tray < left.coupe && right.tray < right.wine, 'the frame and its tray first');
    assert.ok(left.coupe < left.wine, 'camera on the left: the coupe (right end) is far, so drawn before the wine');
    assert.ok(right.wine < right.coupe, 'camera on the right: the wine is far');
    render.dispose();
});

test('the cart is painted in materials its look picks: a chrome cart extends it and names other materials', async () => {
    const p = world(), camera = new cameraSystem({ position: [0, 0], viewport: { width: 400, height: 300 } }), render = new renderSystem({ physics_system: p, camera });
    render.registerRenderer('recording', recordingRenderer); await render.setRenderer('recording', { surface: null });
    const chrome = createObject(p.elements, 'examples:bar_cart_chrome', [0, 0]); p.updateState(1 / 60);
    assert.equal(chrome.get('behaviour'), 'refill_drink', 'everything else comes from the cart it extends');
    render.setHeightView({ eye: 400 }); render.beginFrame(); render.drawLooks(); render.endFrame();
    const packets = render.getFrameSnapshot().passes.flatMap(pass => pass.packets), fills = packets.map(packet => packet.material.fill);
    assert.ok(fills.includes('#c8ccd4') && !fills.includes('#c9a46a'), 'chrome posts and sides, no brass');
    assert.ok(fills.includes('#3a1a4a') && !fills.includes('#6a0c20'), 'port in the first bottle, and its sides');
    for (const template of Object.values(library.templates)) assert.ok(!JSON.stringify(template).match(/#[0-9a-f]{3,6}|rgba?\(/i), 'no colour is written in a template');
    render.dispose();
});
