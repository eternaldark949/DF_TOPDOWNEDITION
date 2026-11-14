// The city's ground, drawn natively from its exported map file: tiles in view first, then those ahead,
// each built the same every time, with nothing a picture cache could not keep.
// Run: node --test tools/test-city-ground.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import places from '../src/game/data/game-db/places.json' with { type: 'json' };
import GROUND from '../src/game/data/city-ground.json' with { type: 'json' };
import { cityMapDefinition } from '../src/game/levels/city-definition.mjs';
import { cityGround } from '../src/game/presentation/city-ground.mjs';

const { city, definition } = cityMapDefinition({ map: places.maps.sdc });
const ground = new cityGround(city, { size: definition.size });
const colours = packets => new Set(packets.flatMap(p => [p.material?.fill, p.material?.stroke]).filter(c => typeof c === 'string'));

test('the tiles in view come first, then those ahead, each keyed by where it is', () => {
    const view = { left: 1000, top: 1000, right: 2000, bottom: 1600 }, draws = ground.createDraws({ view, ahead: 256, tile_size: 512 });
    const shown = draws.filter(d => !d.prepare), ahead = draws.filter(d => d.prepare);
    assert.deepEqual(shown.map(d => d.bounds), [[512, 512, 512, 512], [512, 1024, 512, 512], [512, 1536, 512, 512], [1024, 512, 512, 512], [1024, 1024, 512, 512], [1024, 1536, 512, 512], [1536, 512, 512, 512], [1536, 1024, 512, 512], [1536, 1536, 512, 512]]);
    assert.ok(ahead.length > 0 && draws.indexOf(ahead[0]) === shown.length, 'the tiles ahead follow');
    assert.equal(new Set(draws.map(d => d.key)).size, draws.length);
    assert.equal(ground.createDraws({ view: { left: -900, top: -900, right: -100, bottom: -100 }, ahead: 0, tile_size: 512 }).length, 0, 'nothing off the map');
});

test('a junction tile is the same every time it is built, with only normal blends so it can be kept as a picture', () => {
    const tile = [1024, 1024, 512, 512], a = ground.tileArt(tile), b = ground.tileArt(tile);
    assert.deepEqual(a, b);
    assert.ok(a.every(p => (p.blend ?? 'normal') === 'normal'));
    const used = colours(a);
    for (const look of ['lot', 'asphalt', 'pave_a', 'kerb', 'stripe', 'dash', 'centre', 'manhole']) assert.ok(used.has(GROUND[look]), `the junction tile paints ${look}`);
    assert.ok(a.some(p => p.type === 'text' && p.text === 'HOTEL DR.'), 'the road carries its name');
});

test('every tile along Crimson Blvd and round the curved roads builds', () => {
    for (let x = 0; x < 13200; x += 512) assert.ok(ground.tileArt([x, 2048, 512, 512]).length > 2);
    for (const road of city.streets.roads.filter(r => r.stops.length > 2)) {
        const art = ground.tileArt([Math.floor(road.x / 512) * 512, Math.floor(road.y / 512) * 512, 512, 512]);
        assert.ok(colours(art).has(GROUND.asphalt), `${road.name} is drawn`);
    }
});
