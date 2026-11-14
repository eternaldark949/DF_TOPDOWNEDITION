// The city's street buildings, drawn natively from their exported looks: farthest first, every packet a
// frame takes, the same every time, with the roofs shared as pictures and the glow kept off nearer walls.
// Run: node --test tools/test-city-buildings.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import places from '../src/game/data/game-db/places.json' with { type: 'json' };
import { cityMapDefinition } from '../src/game/levels/city-definition.mjs';
import { cityBuildings } from '../src/game/presentation/city-buildings.mjs';
import { renderFrame, cameraSystem } from '../src/engine/basement/rendering/index.mjs';

const { city, definition } = cityMapDefinition({ map: places.maps.sdc });
const buildings = new cityBuildings(city);
const view = { left: 3010, top: 890, right: 4290, bottom: 1610 }, camera = [3650, 1250];
const submit = packets => {
    const frame = new renderFrame(), at = new cameraSystem({ position: camera, viewport: { width: 1280, height: 720 } }).getView();
    frame.begin(at, { clear_color: false }); for (const p of packets) frame.submit(p); return frame.finish();
};

test('the street buildings in view come farthest first', () => {
    const shown = buildings.visible(view, camera);
    assert.ok(shown.length >= 4, 'a street of buildings is in view');
    const far = h => { const dx = Math.max(h.bounds[0] - camera[0], 0, camera[0] - h.bounds[2]), dy = Math.max(h.bounds[1] - camera[1], 0, camera[1] - h.bounds[3]); return dx * dx + dy * dy; };
    for (let i = 1; i < shown.length; i++) assert.ok(far(shown[i - 1]) >= far(shown[i]), 'nearer buildings paint later');
    assert.equal(buildings.visible({ left: -900, top: -900, right: -100, bottom: -100 }, camera).length, 0, 'nothing off the map');
});

test('the walls are frame packets, the same every time, with each roof a picture', () => {
    const a = buildings.createDraws({ view, camera, time: 3 }), b = buildings.createDraws({ view, camera, time: 3 });
    const packets = a.filter(e => !e.picture), roofs = a.filter(e => e.picture);
    assert.equal(roofs.length, buildings.visible(view, camera).length, 'one roof picture per building');
    assert.deepEqual(packets, b.filter(e => !e.picture));
    assert.deepEqual(roofs.map(r => [r.picture.key, r.picture.matrix]), b.filter(e => e.picture).map(r => [r.picture.key, r.picture.matrix]));
    submit(packets);
    for (const { picture } of roofs) { const p = picture.build(); assert.ok(p.length > 0, `${picture.key} paints`); submit(p); }
    assert.ok(packets.some(p => p.type === 'text'), 'the fronts carry their names');
});

test('a building leans away from the camera as the camera moves', () => {
    const near = buildings.createDraws({ view, camera, time: 3 }).find(e => e.picture), moved = buildings.createDraws({ view, camera: [camera[0] + 200, camera[1]], time: 3 }).find(e => e.picture?.key === near.picture.key);
    assert.notDeepEqual(near.picture.matrix, moved.picture.matrix);
});

test('the glow is kept off nearer buildings and is valid packets', () => {
    const glow = buildings.createGlow({ view, camera, time: 3, dark: .9 });
    assert.ok(glow.length > 0);
    assert.ok(glow.some(p => p.clips.some(c => c.rule === 'evenodd')), 'nearer silhouettes clip the glow');
    submit(glow);
});

test('every street building on the map draws', () => {
    const [w, h] = definition.size;
    for (let y = 0; y < h; y += 1200) for (let x = 0; x < w; x += 2000) {
        const v = { left: x, top: y, right: x + 2000, bottom: y + 1200 }, c = [x + 1000, y + 600];
        submit(buildings.createDraws({ view: v, camera: c, time: 1 }).filter(e => !e.picture));
        submit(buildings.createGlow({ view: v, camera: c, time: 1, dark: 1 }));
    }
});
