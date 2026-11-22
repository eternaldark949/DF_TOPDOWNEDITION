// ===== LV3 PENTHOUSE =====
// A record made of components: its bounds fit every solid layer, and its layers draw by height.
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../../basement/physics/index.mjs';
import { renderSystem, cameraSystem, recordingRenderer } from '../../basement/rendering/index.mjs';
import { createEngineRegistry } from '../../directory/index.mjs';
import { createObject } from '../index.mjs';

const slab = (w, fill) => [{ shape: 'rectangle', x: -w / 2, y: -w / 2, width: w, height: w, fill }];
const library = {
    library_id: 'town',
    resources: { roof: { kind: 'drawing', steps: slab(80, '#733') } },
    templates: {
        shop: { kind: 'static', bounds: 'box', components: [
            { name: 'hall', layers: [
                { layer: 0, height: 0, thickness: '20 cm', steps: slab(100, '#999') },
                { layer: 1, height: '3 m', thickness: '30 cm', drawing: 'roof' }] },
            { name: 'sign', at: [70, 0], layers: [{ layer: 0, height: '2 m', thickness: '1 m', steps: slab(40, '#ff0'), solid: false }] }] }
    }
};
const world = () => new physicsSystem({ asset_library: createEngineRegistry({ libraries: [library] }) });

test('a record made of components: bounds fit its solid layers, and it stands as tall as its roof', () => {
    const p = world(), shop = createObject(p.elements, 'town:shop', [200, 100]);
    assert.deepEqual(shop.components.map(c => c.name), ['hall', 'sign']);
    assert.equal(shop.collision_shape.shape_type, 'box'); assert.deepEqual(shop.collision_shape.dimensions, [100, 100], 'the sign is not solid');
    assert.equal(shop.height, 165);
    assert.ok(p.getBodyBounds(shop.body, { bounds_type: 'render' }).right >= 200 + 90 - 1e-6, 'the camera sees the sign');
});

test('component layers draw by height, over each other, and a component on a joint follows it', async () => {
    const p = world(), camera = new cameraSystem({ position: [200, 100], viewport: { width: 400, height: 400 } }), render = new renderSystem({ physics_system: p, camera });
    render.registerRenderer('recording', recordingRenderer); await render.setRenderer('recording', { surface: null }); render.setStillPictures(false);   // (these read each shape's packets)
    const shop = createObject(p.elements, 'town:shop', [200, 100]);
    const walker = p.elements.createEntity({ kind: 'character', position: [50, 100], components: [{ name: 'hat', joint: 'head', at: [0, 0], layers: [{ layer: 0, height: 85, thickness: 5, steps: slab(10, '#000') }] }] });
    p.rigs.createRig(walker, { definition: { rig_id: 'tiny', joints: [{ name: 'root' }, { name: 'head', parent: 'root', position: [8, 0] }] } });
    p.updateState(1 / 60);
    render.beginFrame(); assert.equal(render.drawLooks(), 2); render.endFrame();
    const packets = render.getFrameSnapshot().passes.flatMap(pass => pass.packets);
    const fills = packets.map(packet => packet.material.fill), depths = packets.map(packet => packet.depth);
    assert.deepEqual(fills, ['#999', '#000', '#ff0', '#733'], 'by height across entities: the floor, the hat at 1.7 m, the sign at 2 m, the roof at 3 m');
    assert.deepEqual(depths, [0, 85, 100, 150], 'a layer\'s depth is its height');
    const hat = packets.find(packet => packet.material.fill === '#000');
    assert.deepEqual(hat.transform.slice(4).map(Math.round), [58, 100], 'the hat sits on the head joint, not the body origin');
    shop.getComponent('hall').setLayerVisible(1, false); p.updateState(1 / 60);
    render.beginFrame(); render.drawLooks(); render.endFrame();
    assert.equal(render.getFrameSnapshot().passes.flatMap(pass => pass.packets).length, 3, 'a hidden layer is not drawn');
    render.dispose();
});
