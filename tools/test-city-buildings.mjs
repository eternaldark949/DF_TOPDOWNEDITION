// The city's street buildings, drawn natively from their exported looks: farthest first, every packet a
// frame takes, the same every time, with the roofs shared as pictures and the glow erased behind nearer walls.
// Run: node --test tools/test-city-buildings.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import places from '../src/game/data/game-db/places.json' with { type: 'json' };
import { cityMapDefinition } from '../src/game/levels/city-definition.mjs';
import { cityBuildings } from '../src/game/presentation/city-buildings.mjs';
import { renderFrame, cameraSystem, heightView } from '../src/engine/basement/rendering/index.mjs';

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
    assert.equal(buildings.visible({ left: -900, top: -900, right: -100, bottom: -100 }, [-500, -500]).length, 0, 'nothing off the map');   // (seen from far off, a landmark as tall as Double Nights leans a long way)
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

test('the glow is erased behind each nearer building and is valid packets', () => {
    const glow = buildings.createGlow({ view, camera, time: 3, dark: .9 });
    assert.ok(glow.length > 0);
    const erase = glow.map((p, i) => p.blend === 'destination-out' ? i : -1).filter(i => i >= 0);
    assert.ok(erase.length > 1, 'each building erases what shines behind its silhouette');
    assert.ok(glow.slice(erase[0] + 1).some(p => p.blend !== 'destination-out'), 'then adds its own light');
    submit(glow.filter(e => !e.picture));
});

test('every street building on the map draws', () => {
    const [w, h] = definition.size;
    for (let y = 0; y < h; y += 1200) for (let x = 0; x < w; x += 2000) {
        const v = { left: x, top: y, right: x + 2000, bottom: y + 1200 }, c = [x + 1000, y + 600];
        submit(buildings.createDraws({ view: v, camera: c, time: 1 }).filter(e => !e.picture));
        submit(buildings.createGlow({ view: v, camera: c, time: 1, dark: 1 }).filter(e => !e.picture));
    }
});

test('a landmark lays its painted walls on its faces in tiles, and its light by night', () => {
    const cafe = buildings.houses.find(h => h.id === 'cozy_cafe');
    assert.ok(cafe, 'the Cozy Cafe is drawn natively');
    const at = [4560, 2250], v = { left: at[0] - 640, top: at[1] - 360, right: at[0] + 640, bottom: at[1] + 360 };
    const draws = buildings.createDraws({ view: v, camera: at, time: 3 }), stamps = draws.filter(e => e.picture?.key.startsWith('city_tier:cozy_cafe'));
    assert.ok(stamps.length > 4 && stamps.every(e => e.picture.source.length === 4), 'its walls are tiles of its strips');
    for (const key of new Set(stamps.map(e => e.picture.key))) { const p = stamps.find(e => e.picture.key === key).picture.build(); assert.ok(p.length > 10); submit(p); }
    submit(draws.filter(e => !e.picture));
    const glow = buildings.createGlow({ view: v, camera: at, time: 3, dark: .9 });
    assert.ok(glow.some(e => /:lit:\d+$/.test(e.picture?.key ?? '') && e.blend === 'add'), 'its windows shine by night');
});

test('a tall landmark keeps its walls in chunks, and stamps none off the screen', () => {
    const queen = buildings.houses.find(h => h.id === 'silver_queen');
    assert.ok(queen, 'the Silver Queen is drawn natively');
    const at = [347, 1050], v = { left: at[0] - 640, top: at[1] - 360, right: at[0] + 640, bottom: at[1] + 360 };
    const stamps = buildings.createDraws({ view: v, camera: at, time: 3 }).filter(e => e.picture?.key.startsWith('city_tier:silver_queen'));
    assert.ok(stamps.length > 4, 'its walls are drawn');
    for (const { picture: p } of stamps) {
        const [bx, , bw] = p.bounds, [sx, , sw] = p.source;
        assert.ok(bw <= 256 + 48, 'a chunk is short');
        assert.ok(sx >= bx - 1e-6 && sx + sw <= bx + bw + 1e-6, 'a tile lies whole in its chunk');
    }
    const all = buildings.houses.find(h => h.id === 'silver_queen').draws(new heightView({ camera: at, eye: buildings.eye(1) }), { time: 3 }).filter(e => e.picture?.key.startsWith('city_tier:silver_queen'));
    assert.ok(all.length > stamps.length, 'the tiles off the screen are left out');
});

test('the landmarks light their entrances with lamps of their own kind', () => {
    const kinds = new Map(buildings.houses.filter(h => h.lamps?.length).map(h => [h.id, new Set(h.lamps.map(s => s.kind))]));
    assert.deepEqual([...kinds.get('cozy_cafe')], ['lantern']);
    assert.deepEqual([...kinds.get('torque_auto')].sort(), ['gooseneck', 'sconce']);
    const cafe = buildings.houses.find(h => h.id === 'cozy_cafe'), at = [4890, 2260], base = new heightView({ camera: at, eye: buildings.eye(1) });
    const day = cafe.draws(base, { time: 3 }), night = cafe.glowDraws(base, { time: 3, dark: .9 });
    const lamps = cafe.lamps; cafe.lamps = [];
    const bare = [cafe.draws(base, { time: 3 }).length, cafe.glowDraws(base, { time: 3, dark: .9 }).length]; cafe.lamps = lamps;
    assert.ok(day.length > bare[0], 'their pieces stand in front of the walls');
    assert.ok(night.length > bare[1], 'and their glass shines by night');
    submit(day.filter(e => !e.picture)); submit(night.filter(e => !e.picture));
});
