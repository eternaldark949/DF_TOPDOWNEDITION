// The city's plants, drawn natively from the exported foliage: valid packets and canopy pictures, the
// same every time, painted lowest first and kept behind the taller roofs that lean over them.
// Run: node --test tools/test-city-foliage.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import places from '../src/game/data/game-db/places.json' with { type: 'json' };
import LOOK from '../src/game/data/city-foliage.json' with { type: 'json' };
import { cityMapDefinition } from '../src/game/levels/city-definition.mjs';
import { cityBuildings } from '../src/game/presentation/city-buildings.mjs';
import { cityFoliage, canopyPicture } from '../src/game/presentation/city-foliage.mjs';
import { renderFrame, cameraSystem } from '../src/engine/basement/rendering/index.mjs';

const { city, definition } = cityMapDefinition({ map: places.maps.sdc });
const foliage = new cityFoliage(city), buildings = new cityBuildings(city);
const camera = [1920, 5400], view = { left: 1280, top: 5040, right: 2560, bottom: 5760 };
const submit = packets => {
    const frame = new renderFrame(), at = new cameraSystem({ position: camera, viewport: { width: 1280, height: 720 } }).getView();
    frame.begin(at, { clear_color: false }); for (const p of packets) frame.submit(p); return frame.finish();
};

test('every plant of the exported city is a kind with a look', () => {
    assert.equal(foliage.plants.length, city.foliage.length);
    for (const p of foliage.plants) assert.ok(Object.hasOwn(LOOK.kinds, p.type), p.type);
});

test('a park of plants is packets and canopy pictures, the same every time', () => {
    const a = foliage.createDraws({ view, camera, time: 3 }), b = foliage.createDraws({ view, camera, time: 3 });
    assert.ok(foliage.visible(view, camera, 700).length >= 20);
    assert.deepEqual(a.filter(e => !e.picture), b.filter(e => !e.picture));
    assert.deepEqual(a.filter(e => e.picture).map(e => [e.picture.key, e.picture.matrix]), b.filter(e => e.picture).map(e => [e.picture.key, e.picture.matrix]));
    submit(a.filter(e => !e.picture));
    const keys = new Set(a.filter(e => e.picture).map(e => e.picture.key));
    assert.ok(keys.size < a.filter(e => e.picture).length, 'plants of a kind and size share their canopy pictures');
    for (const e of a.filter(e => e.picture)) { const p = e.picture.build(); assert.ok(p.length > 0); assert.ok(p.every(x => (x.blend ?? 'normal') === 'normal'), 'a canopy can be kept as a picture'); }
});

test('the wind moves the canopies, and the shadows are left to the sun by day', () => {
    const still = foliage.createDraws({ view, camera, time: 3 }), later = foliage.createDraws({ view, camera, time: 3.5 });
    assert.notDeepEqual(still.filter(e => e.picture).map(e => e.picture.matrix), later.filter(e => e.picture).map(e => e.picture.matrix));
    const shade = draws => draws.filter(e => !e.picture && e.material.fill === LOOK.shadow).length;
    assert.ok(shade(still) > 0); assert.equal(shade(foliage.createDraws({ view, camera, time: 3, sun: true })), 0);
});

test('a canopy picture is centred on its plant and sized by its bucket', () => {
    const c = canopyPicture('tree', 1.01, 2), d = canopyPicture('tree', .99, 2);
    assert.equal(c.key, d.key);
    assert.equal(c.bounds[0], -c.bounds[2] / 2);
});

test('a roof taller than a tree keeps the tree behind it, and a lower one does not', () => {
    const tree = foliage.visible(view, camera, 700).find(p => p.type !== 'bush'), [x, y] = [tree.x, tree.y];
    const roof = [[x - 20, y - 200], [x + 200, y - 200], [x + 200, y + 200], [x - 20, y + 200]];
    const clipped = draws => draws.filter(e => e.picture ? e.clips?.length : e.clips.some(c => c.rule === 'evenodd')).length;
    assert.ok(clipped(foliage.createDraws({ view, camera, time: 3, covers: [{ z: 400, polygon: roof }] })) > 0);
    assert.equal(clipped(foliage.createDraws({ view, camera, time: 3, covers: [{ z: 20, polygon: roof }] })), 0);
    submit(foliage.createDraws({ view, camera, time: 3, covers: [{ z: 400, polygon: roof }] }).filter(e => !e.picture));
});

test('every plant on the map draws', () => {
    const [w, h] = definition.size;
    for (let y = 0; y < h; y += 1200) for (let x = 0; x < w; x += 2000) {
        const v = { left: x, top: y, right: x + 2000, bottom: y + 1200 }, c = [x + 1000, y + 600];
        submit(foliage.createDraws({ view: v, camera: c, time: 1, covers: buildings.covers([x, y, x + 2000, y + 1200], c) }).filter(e => !e.picture));
    }
});
