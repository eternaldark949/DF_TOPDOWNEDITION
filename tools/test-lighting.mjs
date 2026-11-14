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

test('given the map extent, lamps and steady lights are kept as pictures and only flickering lights stay live', () => {
    const { physics, level } = scene(), lighting = new sceneLighting(physics), extent = { left: 0, top: 0, right: 400, bottom: 300 };
    level.definition.soft_lights.push({ x: 120, y: 260, radius: 30, color: '#ffcc88', intensity: .7, flicker: 6 });
    const parts = lighting.createLayer({ extent, lights: levelLights(level), time: 1 }).packets;
    assert.deepEqual(parts.filter(p => p.picture).map(p => p.blend ?? 'normal'), ['normal', 'add'], 'the dark with the still cuts, then their colour added');
    assert.equal(layerOf(parts, 'destination-out').length, 1, 'only the candle cuts live'); assert.equal(layerOf(parts.filter(p => !p.picture), 'add').length, 1, 'and adds its colour live');
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
        assert.ok(lighting.createLayer({ extent: bounds, lights: glow, time: 0 }).packets.some(p => p.blend === 'destination-out' && !p.picture), 'a pulsing light stays live');
    }
});
