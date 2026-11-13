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
        lights: [{ position: [100, 150], radius: 200, source: { color: '#ff8899' } }],
        placements: [{ type: 'lamp', x: 300, y: 140, width: 20, height: 20, light: { radius: 80, color: '#ffd2a8' } }] },
        { decorate: (packet, { section, source }) => { if (section === 'lights') packet.data.appearance = source.source; if (section === 'placements') { packet.data.appearance = { light: { color: '#ffd2a8', intensity: .85 } }; packet.data.emission = source.light; } return packet; } });
    const level = { physics, lamps: map.entities('lamp'), props: map.entities('prop'), definition: { soft_lights: [{ x: 50, y: 20, w: 100, h: 40, round: 20, soft: true, color: '#ffe2b8', intensity: .75 }] } };
    return { physics, map, level };
}
const layerOf = (packets, blend) => packets.filter(p => p.blend === blend);

test('a level gives its lamps, light-carrying props and soft lights, each with the switch of its room', () => {
    const { level } = scene(), lights = levelLights(level, { lightAt: x => x < 200 ? 1 : 0 });
    assert.deepEqual(lights.map(l => [l.kind, l.lit, !!l.size]), [['lamp', 1, false], ['soft', 0, false], ['soft', 1, true]]);
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
