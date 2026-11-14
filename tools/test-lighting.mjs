// The game's lighting look over the Basement light layer: lamps shadowed by walls (polygons kept
// until a lamp moves), soft and strip lights, room switches and the sky over outdoor rooms.
// Run: node --test tools/test-lighting.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../src/engine/basement/physics/index.mjs';
import { mapInstance } from '../src/engine/basement/maps/index.mjs';
import { sceneLighting, levelLights, LIGHTING } from '../src/game/presentation/lighting.mjs';

function scene() {
    const physics = new physicsSystem(), map = new mapInstance(physics, { map_id: 'lit', size: [400, 300], boundary: { thickness: 20 }, walls: [{ x: 200, y: 0, w: 10, h: 300 }],
        lights: [{ position: [100, 150], radius: 200, color: '#ff8899' }],
        placements: [{ type: 'lamp', x: 300, y: 140, width: 20, height: 20, light: { radius: 80, color: '#ffd2a8', intensity: .85, shadows: 'none' } }] },
        { decorate: (packet, { section, source }) => { if (section === 'lights') packet.data.appearance = source.source; return packet; } });
    const level = { physics, lamps: map.entities('lamp'), props: map.entities('prop'), definition: { soft_lights: [{ x: 50, y: 20, w: 100, h: 40, round: 20, soft: true, color: '#ffe2b8', intensity: .75 }] } };
    return { physics, map, level };
}
const layerOf = (packets, blend) => packets.filter(p => p.blend === blend);

test('a level gives its lamps, light-carrying props and soft lights, each with the switch of its room', () => {
    const { level } = scene(), lights = levelLights(level, { lightAt: x => x < 200 ? 1 : 0 });
    assert.deepEqual(lights.map(l => [l.shadows, l.lit, l.shape]), [['dynamic', 1, 'point'], ['none', 0, 'point'], ['none', 1, 'strip']]);
    assert.equal(lights[0].radius, 200, 'a lamp reaches as far as its light shape'); assert.equal(lights[0].color, '#ff8899');
});

test('lamps are shadowed by walls, keep their polygon until they move, and a switched-off room loses its lights', () => {
    const { physics, level } = scene(), lighting = new sceneLighting(physics);
    let calls = 0; const real = physics.getVisibilityPolygon.bind(physics); physics.getVisibilityPolygon = p => { calls++; return real(p); };
    const bounds = { left: 0, top: 0, right: 400, bottom: 300 };
    const first = lighting.createLayer({ bounds, lights: levelLights(level) });
    assert.equal(first.opacity, LIGHTING.indoor.darkness);
    const lampCut = layerOf(first.packets, 'destination-out')[0];
    const xs = lampCut.geometry.commands.map(c => c[1]).filter(Number.isFinite);
    assert.ok(Math.max(...xs) <= 200 + 1e-6, `the wall stops the lamp's light (${Math.max(...xs)})`);
    lighting.createLayer({ bounds, lights: levelLights(level) }); assert.equal(calls, 1, 'the polygon is kept');
    level.lamps[0].updateBody({ position: [120, 150] }); lighting.createLayer({ bounds, lights: levelLights(level) }); assert.equal(calls, 2, 'and rebuilt when the lamp moves');
    const off = lighting.createLayer({ bounds, lights: levelLights(level, { lightAt: () => 0 }) });
    assert.equal(layerOf(off.packets, 'destination-out').length, 0, 'no light in a switched-off room'); assert.equal(layerOf(off.packets, 'add').length, 0);
});

test('rooms thin the dark: the sky over an outdoor room, a lit room to its fill', () => {
    const { physics } = scene(), lighting = new sceneLighting(physics), bounds = { left: 0, top: 0, right: 400, bottom: 300 };
    const rooms = [{ rects: [{ x: 0, y: 0, w: 400, h: 50 }], type: 'outdoor' }, { rects: [{ x: 0, y: 50, w: 200, h: 250 }], type: 'indoor', fill: .5, lit: 1 }, { rects: [{ x: 210, y: 50, w: 190, h: 250 }], type: 'indoor', fill: .5, lit: 0 }];
    const cuts = layerOf(lighting.createLayer({ bounds, rooms, sky_darkness: 0 }).packets, 'destination-out').map(p => +p.opacity.toFixed(4));
    assert.deepEqual(cuts, [1, +(1 - .5 / .95).toFixed(4)], 'a daylit sky clears the dark; a lit room thins it; a dark room keeps it');
    const night = layerOf(lighting.createLayer({ bounds, rooms, sky_darkness: .6 }).packets, 'destination-out')[0].opacity;
    assert.ok(Math.abs(night - (1 - .6 / .95)) < 1e-9, 'at night the sky is darker');
});

test('given the map extent, lamps and steady lights are kept as pictures, and a flickering light is stamped from its own picture', () => {
    const { physics, level } = scene(), lighting = new sceneLighting(physics), extent = { left: 0, top: 0, right: 400, bottom: 300 };
    level.definition.soft_lights.push({ x: 120, y: 260, radius: 30, color: '#ffcc88', intensity: .7, flicker: 6 });
    const parts = lighting.createLayer({ extent, lights: levelLights(level), time: 1 }).packets;
    assert.deepEqual(parts.filter(p => p.picture).map(p => p.blend ?? 'normal'), ['normal', 'destination-out', 'add', 'add'], 'the dark with the still cuts, the candle\'s cut, their colour and the candle\'s');
    const candle = parts.filter(p => p.picture?.key.includes(':stamp:'));
    assert.equal(candle.length, 2, 'the candle is stamped: its cut and its colour'); assert.equal(parts.filter(p => !p.picture).length, 0, 'nothing is drawn live');
    const flick = lighting.createLayer({ extent, lights: levelLights(level), time: 1.37 }).packets.filter(p => p.picture?.key.includes(':stamp:'));
    assert.deepEqual(flick.map(p => p.picture.key), candle.map(p => p.picture.key), 'its pictures hold as it flickers'); assert.notEqual(flick[0].opacity, candle[0].opacity, 'its strength changes');
    const later = lighting.createLayer({ extent, lights: levelLights(level), time: 2 }).packets, key = p => p.filter(e => e.picture).map(e => e.picture.key).join();
    assert.equal(key(later), key(parts), 'the candle flickering keeps the pictures');
    assert.notEqual(key(lighting.createLayer({ extent, lights: levelLights(level, { lightAt: x => x < 200 ? 1 : 0 }) }).packets), key(parts), 'a room switched off repaints them');
});

test('gate: a closed door shadows a lamp, the shadow moves as the leaf swings, and the lamp is a still picture again once it rests', () => {
    const physics = new physicsSystem(), map = new mapInstance(physics, { map_id: 'door', size: [400, 300], walls: [{ x: 0, y: 150, w: 400, h: 10 }],
        rooms: { north: { x: 0, y: 0, w: 400, h: 150 }, south: { x: 0, y: 160, w: 400, h: 140 } },
        doors: [{ x: 180, y: 150, w: 40, h: 10, orientation: 'H', type: 'hinged', rooms: ['north', 'south'] }],
        lights: [{ position: [200, 60], radius: 220, color: '#ffd2a8' }] });
    const level = { physics, lamps: map.entities('lamp'), props: [], definition: {} }, lighting = new sceneLighting(physics), extent = { left: 0, top: 0, right: 400, bottom: 300 };
    const lamp = layer => layer.packets.find(p => p.picture === undefined && p.geometry && p.blend === 'destination-out');
    const down = () => { let best = 0; const at = [200, 60]; for (const [x, y] of physics.getVisibilityPolygon({ origin: at, radius: 220 }).points) if (Math.abs(x - 200) < 2 && y > at[1]) best = Math.max(best, y - at[1]); return best; };
    const reachDown = layer => Math.max(...layer.packets.flatMap(p => p.geometry?.commands ?? []).filter(c => Math.abs(c[1] - 200) < 2 && c[2] > 60).map(c => c[2] - 60), 0);
    const closed = lighting.createLayer({ extent, lights: levelLights(level), time: 0 });
    assert.equal(lamp(closed), undefined, 'at rest, the lamp is in the still picture');
    assert.ok(down() < 92, `the closed leaf stops the light at the doorway (${down().toFixed(1)})`);
    const door = map.entity('door_0'); door.updateBody({ rotation: 1.2 });
    const swinging = lighting.createLayer({ extent, lights: levelLights(level), time: .1 });
    assert.ok(lamp(swinging), 'while the leaf moves, the lamp is drawn live');
    assert.ok(reachDown(swinging) > 150, `and its light passes the open doorway (${reachDown(swinging).toFixed(1)})`);
    door.updateBody({ rotation: 0 });
    const shut = lighting.createLayer({ extent, lights: levelLights(level), time: .2 });
    assert.ok(reachDown(shut) < 92, 'shut again, the shadow is back');
    assert.equal(lamp(lighting.createLayer({ extent, lights: levelLights(level), time: .6 })), undefined, 'and once the leaf rests the lamp is still again');
});

test('gate: vending machines and health stations glow and pulse from their catalog light in the cafe and the clinic', async () => {
    const { interiorMapDefinition, APARTMENT_MAP_OPTIONS } = await import('../src/game/levels/apartment-definition.mjs');
    const places = (await import('../src/game/data/game-db/places.json', { with: { type: 'json' } })).default;
    for (const [map_id, type, color] of [['cozy_cafe_interior', 'vending_machine', '#00f3ff'], ['medbay_sw', 'medbay_refill', '#00ff00']]) {
        const physics = new physicsSystem(), { definition } = interiorMapDefinition({ map_id, map: places.maps[map_id], rooms: places.rooms[map_id] });
        const map = new mapInstance(physics, definition, { ...APARTMENT_MAP_OPTIONS, templates: {} }), level = { physics, lamps: map.entities('lamp'), props: map.entities('prop'), definition };
        const emitters = map.entities('prop').filter(p => p.data.prop_type === type);
        assert.ok(emitters.length, `${map_id} has a ${type}`);
        const lights = levelLights(level), glow = lights.filter(l => emitters.some(e => e.data.authored_id === l.id));
        assert.equal(glow.length, emitters.length, `every ${type} in ${map_id} glows`);
        for (const l of glow) assert.deepEqual([l.color, l.shadows, l.animation.kind], [color, 'none', 'pulse']);
        const lighting = new sceneLighting(physics), bounds = { left: 0, top: 0, right: definition.size[0], bottom: definition.size[1] };
        const a = lighting.createLayer({ bounds, lights: glow, time: 0 }), b = lighting.createLayer({ bounds, lights: glow, time: .3 });
        assert.notDeepEqual(a.packets.map(p => p.opacity), b.packets.map(p => p.opacity), `${map_id}: the glow pulses`);
        assert.ok(lighting.createLayer({ extent: bounds, lights: glow, time: 0 }).packets.some(p => p.blend === 'destination-out' && p.picture?.key.includes(':stamp:')), 'a pulsing light is stamped at its strength');
    }
});

test('shadow rebuilds share a budget a frame, nearest the view first; a light past it keeps its last shape a frame', () => {
    const physics = new physicsSystem(), lamps = Array.from({ length: 6 }, (_, i) => ({ position: [100 + i * 150, 100], radius: 120 }));
    const map = new mapInstance(physics, { map_id: 'row', size: [1000, 200], lights: lamps,
        doors: lamps.map((l, i) => ({ x: 80 + i * 150, y: 140, w: 40, h: 8, orientation: 'H', type: 'sliding' })) });
    let clock = 0; const lighting = new sceneLighting(physics, { now: () => clock, look: { ...LIGHTING, lamp: { ...LIGHTING.lamp, shadow_budget_ms: 1 } } });
    let built = []; const real = physics.getVisibilityPolygon.bind(physics); physics.getVisibilityPolygon = p => { built.push(p.origin[0]); clock += .4; return real(p); };
    const level = { physics, lamps: map.entities('lamp'), props: [], definition: {} }, bounds = { left: 0, top: 0, right: 1000, bottom: 200 };
    lighting.createLayer({ bounds, lights: levelLights(level), time: 0 });
    assert.equal(built.length, 6, 'every light gets a first shadow, budget or not');
    for (const leaf of map.entities('door')) leaf.updateBody({ position: [leaf.position[0] + 5, leaf.position[1]] });
    built = []; lighting.createLayer({ bounds, lights: levelLights(level), time: .1 });
    assert.deepEqual(built, [550, 400, 700], 'three fit in the budget, the nearest the view\'s centre');
    built = []; lighting.createLayer({ bounds, lights: levelLights(level), time: .2 });
    assert.deepEqual(built, [250, 850, 100], 'and the rest the next frame');
    for (const leaf of map.entities('door')) leaf.updateBody({ position: [leaf.position[0] + 5, leaf.position[1]] });
    built = []; lighting.createLayer({ bounds: { left: 0, top: 0, right: 300, bottom: 200 }, lights: levelLights(level), time: .3 });
    assert.deepEqual(built, [100, 250, 400], 'lights out of view are left alone');
});

test('the city at night: street lamps light a pool, signs colour without lifting the dark, the faulty ones stutter, and the dark goes deeper', async () => {
    const places = (await import('../src/game/data/game-db/places.json', { with: { type: 'json' } })).default;
    const { cityMapDefinition, cityRooms } = await import('../src/game/levels/city-definition.mjs');
    const { definition } = cityMapDefinition({ map: places.maps.sdc });
    const lamps = definition.lights.filter(l => l.role !== 'neon'), signs = definition.lights.filter(l => l.role === 'neon');
    assert.ok(lamps.filter(l => l.look === 'street').length > 1000 && signs.length > 1000, 'standing lamps take the street pool; every sign is a light');
    const faulty = definition.lights.filter(l => l.animation?.kind === 'stutter').length / definition.lights.length;
    assert.ok(faulty > .05 && faulty < .15, `about one in ten stutters (${faulty.toFixed(3)})`);
    const physics = new physicsSystem(), lighting = new sceneLighting(physics), rooms = cityRooms(places.maps.sdc);
    const lamp = { id: 'l', position: [500, 500], radius: 300, color: '#ff9944', look: 'street', shadows: 'static', animation: { kind: 'steady' } };
    const sign = { id: 's', position: [900, 500], radius: 150, color: '#ff00aa', intensity: 0, glow: 1.5, shadows: 'none', animation: { kind: 'steady' } };
    const layer = lighting.createLayer({ bounds: { left: 0, top: 0, right: 1200, bottom: 1000 }, kind: 'outdoor', rooms, sky_darkness: .6, lights: [lamp, sign] }).packets;
    const cuts = layerOf(layer, 'destination-out'), glows = layerOf(layer, 'add');
    assert.equal(cuts.filter(p => p.material?.fill?.stops).length, 1, 'only the lamp lifts the dark: the sign does not');
    assert.deepEqual(cuts.find(p => p.material?.fill?.stops).material.fill.stops.map(s => s[0]), LIGHTING.profiles.street.cut.map(s => s[0]), 'the lamp cuts the street pool');
    assert.equal(glows.length, 2, 'both add their colour');
    const sky = cuts.find(p => !p.material?.fill?.stops).opacity, plain = lighting.createLayer({ bounds: { left: 0, top: 0, right: 10, bottom: 10 }, kind: 'outdoor', rooms, sky_darkness: .25 }).packets;
    assert.ok(sky < layerOf(plain, 'destination-out')[0].opacity, 'at night the sky shows less through the dark: it goes deeper');
    const flick = { ...lamp, id: 'f', animation: { kind: 'stutter', period: 8, burst: .9, depth: .7, offset: 0 } };
    const strengths = Array.from({ length: 90 }, (_, i) => lighting.createLayer({ bounds: { left: 0, top: 0, right: 1200, bottom: 1000 }, kind: 'outdoor', lights: [flick], time: i * .01 }).packets.find(p => p.blend === 'destination-out' && p.material?.fill?.stops).opacity);
    assert.ok(strengths.some(k => k < .5) && strengths.some(k => k > .99), 'a faulty lamp drops and comes back in its burst');
    const later = lighting.createLayer({ bounds: { left: 0, top: 0, right: 1200, bottom: 1000 }, kind: 'outdoor', lights: [flick], time: 3 }).packets.find(p => p.blend === 'destination-out' && p.material?.fill?.stops).opacity;
    assert.equal(later, 1, 'and holds steady the rest of its period');
});

test('headlights are beams cut by walls, shots and lasers are stamped as they move, and the wet street mirrors lamps and signs', async () => {
    const { headlightLights, shotLights, laserLights, wetLights } = await import('../src/game/presentation/dynamic-lights.mjs');
    const physics = new physicsSystem();
    new mapInstance(physics, { map_id: 'street', size: [1000, 600], walls: [{ x: 600, y: 200, w: 20, h: 200 }] });
    const lighting = new sceneLighting(physics), extent = { left: 0, top: 0, right: 1000, bottom: 600 }, bounds = { left: 0, top: 0, right: 1000, bottom: 600 };
    const cars = headlightLights([{ id: 'car', position: [300, 300], angle: 0, length: 90, width: 44, haze: 1 }]);
    assert.deepEqual(cars.map(l => l.shape ?? 'point'), ['beam', 'point', 'point'], 'a beam and a glow at each headlamp');
    const beam = cars[0], polygon = physics.getVisibilityPolygon({ origin: beam.position, radius: beam.length }).points;
    assert.ok(Math.max(...polygon.filter(([, y]) => Math.abs(y - 300) < 5).map(([x]) => x)) <= 601, 'the wall stops the beam');
    const shots = shotLights({ projectiles: [{ id: 'p', position: [100, 100], color: '#ff0000' }], muzzles: [{ id: 'm', position: [120, 100], radius: 10, life: 1.5 }] });
    const laser = laserLights({ from: [100, 500], to: [400, 450] });
    const layer = lighting.createLayer({ extent, bounds, kind: 'outdoor', lights: [...cars, ...shots, ...laser], time: 0 });
    const live = layer.packets.filter(p => !p.picture), stamps = layer.packets.filter(p => p.picture?.key.includes(':stamp:'));
    assert.ok(live.some(p => p.blend === 'destination-out'), 'the beam, cut by walls, is drawn live');
    assert.ok(stamps.filter(p => p.blend === 'destination-out').length >= 4, 'shots, the muzzle flash and the laser are stamped');
    const moved = lighting.createLayer({ extent, bounds, kind: 'outdoor', lights: [...shotLights({ projectiles: [{ id: 'p', position: [300, 140], color: '#ff0000' }] })], time: .1 });
    const key = l => l.packets.filter(p => p.picture && !p.picture.key.includes(':stamp:')).map(p => p.picture.key).join();
    assert.equal(key(moved), key(lighting.createLayer({ extent, bounds, kind: 'outdoor', lights: [], time: .2 })), 'a shot in flight never touches the baked tiles');
    const lamps = [{ id: 'a', position: [200, 100], radius: 300, color: '#ffaa55', look: 'street', shadows: 'static' }, { id: 'b', position: [500, 80], radius: 150, color: '#ff00aa', intensity: 0, glow: 1.5, shadows: 'none' }, { id: 'c', position: [0, 0], radius: 100, shadows: 'none' }];
    const wet = wetLights(lamps, .66);
    assert.deepEqual(wet.map(l => l.id), ['a:wet', 'b:wet'], 'street lamps and signs are mirrored, other lights not');
    assert.ok(wet[0].position[1] > 100 + LIGHTING.wet.head_height && wet[0].shape === 'strip', 'a streak down the street below the lamp\'s head');
    assert.equal(wetLights(lamps, .69)[0].intensity, wet[0].intensity, 'wetness is taken in steps, so the baked reflections hold');
    assert.equal(wetLights(lamps, 0).length, 0);
});
