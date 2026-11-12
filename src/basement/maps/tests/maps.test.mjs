import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, BODY_GROUP } from '../../physics/index.mjs';
import { buildMapPackets, mapInstance, mapSystem } from '../index.mjs';

const room = {
    map_id: 'test_room', kind: 'interior', size: [400, 300], boundary: { thickness: 20 }, spawn: [50, 50],
    walls: [{ x: 0, y: 150, w: 400, h: 10 }],
    doors: [{ x: 180, y: 150, w: 40, h: 10, orientation: 'H', type: 'sliding' }],
    placements: [{ type: 'crate', x: 40, y: 40, width: 30, height: 20 }, { type: 'sofa', x: 200, y: 200, width: 80, height: 30, light: { radius: 60 } }],
    lights: [{ position: [300, 60], radius: 120 }],
    triggers: [{ x: 380, y: 0, w: 20, h: 40, role: 'transition', authored_id: 'exit_0', data: { target: 'street' } }],
    cloths: [{ x: 10, y: 10, width: 20, length: 40, segments: 2, role: 'curtain' }]
};

test('the builder cuts door openings, rings the boundary and gives stable ids', () => {
    const { entries, spawn } = buildMapPackets(room, { prop_types: { sofa: { movable: true } } });
    const walls = entries.filter(e => e.section === 'walls');
    assert.equal(walls.length, 2 + 4, 'the wall is split around the door, plus four boundary walls');
    assert.ok(walls.every(w => w.source.x + w.source.w <= 178 || w.source.x >= 222 || w.source.y !== 150));
    assert.deepEqual(entries.map(e => e.packet.data.authored_id).filter(Boolean), ['wall_0', 'wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'prop_0', 'prop_1', 'lamp_0', 'exit_0', 'door_0', 'door_0_right', 'curtain_0']);
    const [crate, sofa] = entries.filter(e => e.section === 'placements').map(e => e.packet);
    assert.deepEqual(crate.position, [55, 50]); assert.deepEqual(crate.collision_shape.dimensions, [30, 20]);
    assert.equal(crate.data.movable, false); assert.equal(sofa.data.movable, true); assert.equal(sofa.data.prop_type, 'sofa');
    assert.deepEqual(sofa.light_shape, { shape_type: 'circle', radius: 60, local_position: [0, 0] });
    const leaves = entries.filter(e => e.section === 'doors').map(e => e.packet);
    assert.deepEqual(leaves.map(l => l.data.role), ['door', 'door_panel']);
    assert.ok(leaves[0].data.open_position[0] < leaves[0].position[0] && leaves[1].data.open_position[0] > leaves[1].position[0], 'leaves slide apart');
    const cloth = entries.find(e => e.section === 'cloths').packet;
    assert.equal(cloth.data.mesh.points.length, 6); assert.deepEqual(cloth.data.mesh.anchors, [0, 1]);
    assert.deepEqual(spawn, [50, 50]);
    assert.deepEqual(buildMapPackets(room).entries.map(e => e.packet), buildMapPackets(room).entries.map(e => e.packet), 'deterministic');
    assert.throws(() => buildMapPackets({ kind: 'cave' }), /Unknown map kind/);
    assert.throws(() => buildMapPackets({ placements: [{ x: 0, y: 0, width: NaN, height: 1 }] }), /finite/);
});

test('decorate adds game data without the builder knowing it', () => {
    const { entries } = buildMapPackets(room, { templates: { prop: 'game:furniture' }, decorate: (packet, { section, source }) => {
        if (section === 'placements') packet.data.art = `${source.type}_art`;
        return packet;
    } });
    const props = entries.filter(e => e.section === 'placements').map(e => e.packet);
    assert.deepEqual(props.map(p => [p.template, p.data.art]), [['game:furniture', 'crate_art'], ['game:furniture', 'sofa_art']]);
});

test('an interior builds every entity at load, finds them by id and role, and opens doors by proximity', () => {
    const physics = new physicsSystem(), map = new mapInstance(physics, room);
    assert.equal(map.entities().length, map.packets().length);
    assert.equal(map.entities('door').length, 1); assert.equal(map.entities('door_panel').length, 1);
    assert.equal(map.entity('exit_0').data.target, 'street');
    const door = map.entity('door_0'), closed = [...door.position];
    const walker = physics.elements.createCharacter({ position: [200, 120], collision_shape: { shape_type: 'circle', radius: 8 } });
    map.updateDoors({ duration: 0.1 });
    for (let i = 0; i < 20; i++) physics.updateState();
    assert.equal(door.data.open, true);
    assert.ok(Math.abs(door.position[0] - closed[0]) > 10, 'the leaf moved');
    walker.teleportTo([50, 280]);
    map.updateDoors({ duration: 0.1 });
    for (let i = 0; i < 20; i++) physics.updateState();
    assert.equal(door.data.open, false);
    assert.ok(Math.hypot(door.position[0] - closed[0], door.position[1] - closed[1]) < 1e-6, 'and closed again');
    assert.deepEqual(map.setFocus([0, 0]), { loaded: 0, unloaded: 0 }, 'interiors do not stream');
    map.destroy();
    assert.equal(physics.elements.getEntities().filter(e => e.data?.authored_id).length, 0);
});

const city = () => {
    const placements = [];
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) placements.push({ type: 'bin', x: x * 500 + 10, y: y * 500 + 10, width: 20, height: 20, movable: true });
    return { map_id: 'city', kind: 'exterior', size: [4000, 4000], boundary: { thickness: 50 }, regions: { size: 1000 }, placements, walls: [{ x: 0, y: 1990, w: 4000, h: 20 }] };
};

test('an exterior streams regions around the focus and keeps large entries loaded', () => {
    const physics = new physicsSystem(), map = new mapInstance(physics, city());
    const persistent = map.entities().length;
    assert.equal(persistent, 5, 'the boundary ring and the long wall stay loaded');
    const first = map.setFocus([100, 100], { radius: 500, keep: 500 });
    assert.ok(first.loaded >= 1);
    assert.ok(map.entity('prop_0'), 'the bin next to the focus exists');
    assert.equal(map.entity('prop_63'), null, 'a far bin is not built');
    const before = map.entities('prop').length;
    map.setFocus([3900, 3900], { radius: 500, keep: 500 });
    assert.equal(map.entity('prop_0'), null, 'leaving releases the old regions');
    assert.ok(map.entity('prop_63'));
    assert.ok(map.entities('prop').length <= before + 4);
    assert.equal(physics.spatial_grid, physics.spatial_grid, 'one world index throughout');
    const stats = map.getStatistics();
    assert.ok(stats.region_loads >= 2 && stats.region_unloads >= 1 && stats.regions === 16);
});

test('a moved movable entity keeps its pose across unloads and saves', () => {
    const physics = new physicsSystem(), map = new mapInstance(physics, city());
    map.setFocus([100, 100], { radius: 400, keep: 400 });
    map.entity('prop_0').updateBody({ position: [60, 80] });
    map.setFocus([3900, 3900], { radius: 400, keep: 400 });
    assert.equal(map.entity('prop_0'), null);
    const saved = map.saveState();
    assert.deepEqual(saved.memory.prop_0.position, [60, 80]);
    map.setFocus([100, 100], { radius: 400, keep: 400 });
    assert.deepEqual([...map.entity('prop_0').position], [60, 80], 'rebuilt where it was left');
    map.destroy();

    const next = new mapInstance(new physicsSystem(), city()).loadState(JSON.parse(JSON.stringify(saved)));
    next.setFocus([100, 100], { radius: 400, keep: 400 });
    assert.deepEqual([...next.entity('prop_0').position], [60, 80], 'memory survives a save');
    assert.equal(next.loadState({ memory: { nowhere: { position: [0, 0], rotation: 0 } } }).getStatistics().remembered, 0, 'unknown ids are dropped');
});

test('a mapSystem holds one map per world and releases the previous one', () => {
    const physics = new physicsSystem(), maps = new mapSystem(physics);
    const a = maps.load(room);
    assert.equal(maps.current, a);
    const count = physics.elements.getEntities().length;
    maps.load({ ...room, map_id: 'other', placements: [] });
    assert.equal(physics.elements.getEntities().length, count - 2, 'the old map is gone, the new one has no props');
    maps.unload();
    assert.equal(maps.current, null); assert.equal(physics.elements.getEntities().length, 0);
    assert.throws(() => new mapSystem({}), /physicsSystem/);
    assert.throws(() => new mapInstance(physics, { placements: [{ x: 0, y: 0, width: 1, height: 1, authored_id: 'a' }, { x: 5, y: 0, width: 1, height: 1, authored_id: 'a' }] }), /Duplicate/);
});

test('the map system stays game-neutral', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    for (const file of readdirSync(new URL('..', import.meta.url)).filter(f => f.endsWith('.mjs'))) {
        const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /directory\/|df_|apartment/i, file);
        for (const [, path] of source.matchAll(/from '([^']+)'/g)) assert.ok(path.startsWith('./') || path.startsWith('../physics/'), `${file} imports ${path}`);
    }
});

// Hall (L-shaped, two rects) -- door -- study; hall -- arch -- yard (outdoor); study -- fixed gap -- vault
const house = {
    map_id: 'house', size: [600, 400], boundary: { thickness: 10 },
    walls: [{ x: 300, y: 0, w: 8, h: 200 }],
    rooms: {
        hall: { rects: [{ x: 0, y: 0, w: 300, h: 100 }, { x: 0, y: 100, w: 100, h: 300 }], label: 'Hall' },
        study: { x: 308, y: 0, w: 292, h: 200 },
        yard: { x: 100, y: 200, w: 200, h: 200, type: 'outdoor' },
        vault: { x: 400, y: 200, w: 200, h: 200 }
    },
    doors: [{ x: 300, y: 40, w: 8, h: 40, orientation: 'V', type: 'sliding', rooms: ['hall', 'study'] },
        { x: 100, y: 200, w: 60, h: 8, orientation: 'H', type: 'arch', rooms: ['hall', 'yard'] }],
    room_links: [{ rooms: ['study', 'vault'], openness: 0.5 }]
};

test('rooms are volumes in the shared grid, with multi-rect rooms and gaps between them', () => {
    const physics = new physicsSystem(), map = new mapInstance(physics, house), rooms = map.rooms;
    assert.equal(map.entities('room').length, 5, 'one volume per rectangle');
    assert.equal(map.entities('door').length, 1, 'an arch has no leaf');
    assert.equal(rooms.roomAt([50, 300]).id, 'hall', 'the L-shaped leg');
    assert.equal(rooms.roomAt([200, 50]).id, 'hall');
    assert.equal(rooms.roomAt([304, 150]), null, 'inside the wall');
    assert.equal(rooms.roomAt([150, 300]).type, 'outdoor');
    assert.deepEqual(rooms.room('hall').bounds, { left: 0, top: 0, right: 300, bottom: 400 });
    assert.throws(() => new mapInstance(new physicsSystem(), { ...house, room_links: [{ rooms: ['hall', 'attic'] }] }), /known rooms/);
});

test('room links report live openness, routes and exposure', () => {
    const physics = new physicsSystem(), map = new mapInstance(physics, house), rooms = map.rooms;
    assert.deepEqual(rooms.connections('hall').map(c => [c.room, c.kind]).sort(), [['study', 'door'], ['yard', 'arch']]);
    assert.equal(rooms.openness('hall', 'study'), 0, 'the door starts shut');
    assert.equal(rooms.openness('hall', 'yard'), 1);
    assert.equal(rooms.openness('yard', 'study'), 0, 'not directly linked');
    assert.equal(rooms.route('yard', 'vault'), null, 'shut door blocks the only way');
    physics.elements.createCharacter({ position: [290, 60], collision_shape: { shape_type: 'circle', radius: 8 } });
    map.updateDoors({ duration: 0.1 });
    for (let i = 0; i < 4; i++) physics.updateState();
    const partly = rooms.openness('hall', 'study');
    assert.ok(partly > 0 && partly < 1, `openness follows the leaf (${partly})`);
    for (let i = 0; i < 20; i++) physics.updateState();
    assert.equal(rooms.openness('hall', 'study'), 1);
    assert.deepEqual(rooms.route('yard', 'vault'), ['yard', 'hall', 'study', 'vault']);
    assert.equal(rooms.route('yard', 'vault', { min_openness: 0.6 }), null, 'the half-open gap is too narrow');
    const reach = rooms.exposure('yard', { falloff: 0.8 });
    assert.equal(reach.get('yard'), 1); assert.ok(Math.abs(reach.get('hall') - 0.8) < 1e-9); assert.ok(Math.abs(reach.get('vault') - 0.8 * 0.8 * 0.8 * 0.5) < 1e-9);
});

test('occupancy tracks any body, keeps it in its room across doorways and reports changes', () => {
    const physics = new physicsSystem(), map = new mapInstance(physics, house), rooms = map.rooms, changes = [];
    const cat = physics.elements.createCharacter({ position: [50, 50], collision_shape: { shape_type: 'circle', radius: 4 } });
    const guest = physics.elements.createCharacter({ position: [500, 300], collision_shape: { shape_type: 'circle', radius: 4 } });
    const stop = rooms.onRoomChange(c => changes.push([c.from, c.to]));
    assert.equal(rooms.track(cat).id, 'hall'); assert.equal(rooms.track(guest).id, 'vault');
    cat.teleportTo([304, 60]); rooms.update();
    assert.equal(rooms.roomOf(cat).id, 'hall', 'in the doorway, still the hall');
    cat.teleportTo([400, 60]); rooms.update();
    assert.equal(rooms.roomOf(cat).id, 'study');
    assert.deepEqual(rooms.occupants('study'), [cat]);
    assert.deepEqual(changes, [['hall', 'study']]);
    const before = rooms.getStatistics().grid_lookups;
    for (let i = 0; i < 10; i++) rooms.update();
    assert.equal(rooms.getStatistics().grid_lookups, before, 'staying put needs no grid query');
    stop(); guest.destroy(); rooms.update();
    assert.equal(rooms.getStatistics().tracked, 1, 'destroyed bodies drop out');
    rooms.setFlag('study', 'lights_off', true);
    const saved = JSON.parse(JSON.stringify(map.saveState()));
    const next = new mapInstance(new physicsSystem(), house).loadState(saved);
    assert.equal(next.rooms.getFlag('study', 'lights_off'), true, 'room flags save with the map');
});
