// The Directory's prop catalog and map layout files: complete, consistent and loadable by the
// Basement map builder. Run: node --test tools/test-map-layouts.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import places from '../src/game/data/game-db/places.json' with { type: 'json' };
import { PROP_TYPES, MAP_IDS, resolveMapLayout, resolvePlacement, mapHost, createMapLibraries } from '../src/game/data/game-maps.mjs';
import { createGameAssetLibrary } from '../src/game/data/game-assets.mjs';
import { buildMapPackets } from '../src/engine/basement/maps/index.mjs';
import { validatePropCatalog, validateMapLayout } from '../src/engine/directory/index.mjs';
import { physicsSystem } from '../src/engine/basement/physics/index.mjs';

test('every map in GAME_DB has a layout file, and every placement names a catalog type', () => {
    assert.deepEqual([...MAP_IDS].sort(), Object.keys(places.maps).sort());
    for (const id of MAP_IDS) for (const p of resolveMapLayout(id).props) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${id} placement position`);
    const layouts = Object.fromEntries(Object.entries(createMapLibraries()[1].resources).map(([id, resource]) => [id, resource.data]));
    for (const [id, layout] of Object.entries(layouts)) for (const p of layout.props) assert.ok(PROP_TYPES[p.type], `${id}: unknown prop type ${p.type}`);
});

test('the catalog and every layout match the Directory\'s data structures', () => {
    const [catalog, maps] = createMapLibraries();
    validatePropCatalog(catalog.resources.catalog.data, 'df_props:catalog');
    for (const [id, resource] of Object.entries(maps.resources)) validateMapLayout(resource.data, PROP_TYPES, `df_maps:${id}`);
});

test('placements resolve over their type defaults, and null removes a default', () => {
    const [type] = Object.entries(PROP_TYPES).find(([, t]) => t.defaults.color);
    assert.equal(resolvePlacement({ type, x: 1, y: 2 }).color, PROP_TYPES[type].defaults.color);
    assert.equal(resolvePlacement({ type, x: 1, y: 2, color: '#123456' }).color, '#123456');
    assert.equal('color' in resolvePlacement({ type, x: 1, y: 2, color: null }), false);
    assert.throws(() => resolvePlacement({ type: 'no_such_prop', x: 0, y: 0 }), /Unknown prop type/);
    const a = resolveMapLayout('cozy_cafe_interior'); a.props[0].color = 'changed';
    assert.notEqual(resolveMapLayout('cozy_cafe_interior').props[0].color, 'changed', 'layouts are detached copies');
});

test('the apartment is hosted natively and the rest still load through the classic host', () => {
    assert.equal(mapHost('apt_949'), 'native');
    for (const id of MAP_IDS.filter(id => id !== 'apt_949')) assert.equal(mapHost(id), 'classic', id);
});

test('the cafe tables and booths stay where the classic cafe code expects them', () => {
    const source = readFileSync(new URL('../src/legacy/world/map-entities.js', import.meta.url), 'utf8');
    const tables = JSON.parse(source.match(/const CAFE_TABLES = (\[.*?\]);/)[1]), booths = JSON.parse(source.match(/const CAFE_BOOTHS = (\[.*?\]);/)[1]);
    const layout = resolveMapLayout('cozy_cafe_interior'), of = type => layout.props.filter((_, i) => layout.prop_types[i] === type);
    assert.deepEqual(of('cc_round_table').map(p => [p.x + p.width / 2, p.y + p.height / 2]), tables);
    assert.deepEqual([...new Set(of('cc_booth').map(p => p.y + p.height / 2))], booths, 'a bench pair per booth row');
});

test('every map layout builds into a native world through the Basement map builder', () => {
    const library = createGameAssetLibrary();
    assert.ok(library.getResource('df_props:catalog').data.types.cc_counter, 'the catalog is in the shared asset library');
    for (const id of MAP_IDS) {
        const map = places.maps[id], layout = resolveMapLayout(id);
        const definition = { map_id: id, kind: id === 'sdc' ? 'exterior' : 'interior', size: [map.width, map.height], boundary: { thickness: 20 }, walls: map.walls ?? [],
            placements: layout.props.map((p, i) => ({ type: layout.prop_types[i], x: p.x, y: p.y, width: p.width ?? 20, height: p.height ?? 20 })),
            lights: layout.lamps.map(l => ({ position: [l.x, l.y], radius: l.lightRadius ?? 100 })) };
        const physics = new physicsSystem({ asset_library: library }), built = buildMapPackets(definition, { prop_types: PROP_TYPES });
        for (const { packet } of built.entries) physics.createEntity(packet);
        assert.equal(physics.elements.getEntities().length, built.entries.length, id);
    }
});

test('every map loads through the one streaming loader: a map inside its radius whole at once, the city round its focus', async () => {
    const { mapInstance } = await import('../src/engine/basement/maps/index.mjs');
    const library = createGameAssetLibrary();
    for (const id of MAP_IDS) {
        const map = places.maps[id], layout = resolveMapLayout(id), spawn = map.spawn ? [map.spawn.x, map.spawn.y] : undefined;
        const definition = { map_id: id, size: [map.width, map.height], spawn, boundary: { thickness: 20 }, walls: map.walls ?? [],
            placements: layout.props.map((p, i) => ({ type: layout.prop_types[i], x: p.x, y: p.y, width: p.width ?? 20, height: p.height ?? 20 })),
            lights: layout.lamps.map(l => ({ position: [l.x, l.y], radius: l.lightRadius ?? 100 })) };
        const instance = new mapInstance(new physicsSystem({ asset_library: library }), definition, { prop_types: PROP_TYPES }), entries = instance.packets().length;
        if (Math.max(map.width, map.height) <= 4096) assert.equal(instance.entities().length, entries, `${id} is whole from the start`);
        else {                                                         // (the city's layout file holds no streets: they stream from its exported map file, below)
            const far = [map.width - 100, map.height - 100], step = instance.setFocus([far], { budget_ms: Infinity });
            assert.equal(step.pending, 0, `${id}: the focus can cross the whole map`);
            const back = instance.setFocus([spawn ?? [0, 0]], { budget_ms: Infinity });
            assert.equal(back.pending, 0);
        }
        instance.destroy();
    }
});

test('the city from its exported map file streams through the one loader: its buildings, lamps and doors near the focus, the rest as it moves', async () => {
    const { mapInstance } = await import('../src/engine/basement/maps/index.mjs');
    const { cityMapDefinition } = await import('../src/game/levels/city-definition.mjs');
    const { definition, city } = cityMapDefinition({ map: places.maps.sdc });
    assert.ok(definition.walls.length > 600 && definition.lights.length > 1800 && city.buildings.length > 600, 'the whole city is in the file');
    for (const w of definition.walls) assert.ok(w.w > 0 && w.h > 0, 'every wall has an area');
    assert.ok(definition.triggers.some(t => t.data.target === 'apt_949'), 'her apartment door is an exit');
    const physics = new physicsSystem(), map = new mapInstance(physics, definition, { prop_types: PROP_TYPES });
    const near = ([x, y]) => map.entities('lamp').filter(l => Math.hypot(l.position[0] - x, l.position[1] - y) < 1000).length;
    assert.ok(near(definition.spawn) > 0 && map.entities('lamp').length < definition.lights.length / 4, 'only the lamps round the spawn are built');
    assert.equal(map.setFocus([9000, 9000], { budget_ms: Infinity }).pending, 0);
    assert.ok(near([9000, 9000]) > 0 && near(definition.spawn) === 0, 'moving the focus builds what is ahead and releases what is behind');
    const lamp = map.entities('lamp').find(l => Math.hypot(l.position[0] - 9000, l.position[1] - 9000) < 1000);
    const shadow = physics.getVisibilityPolygon({ origin: lamp.position, radius: lamp.data.emission.radius });
    assert.ok(shadow.points.length >= 3, 'a streamed lamp casts its shadow against the streamed buildings');
    map.destroy();
});

test('every map with rooms builds a room graph whose doors join known rooms', async () => {
    const { mapInstance } = await import('../src/engine/basement/maps/index.mjs');
    for (const [id, def] of Object.entries(places.rooms)) {
        const map = places.maps[id], instance = new mapInstance(new physicsSystem(), { map_id: id, size: [map.width, map.height], rooms: def.rooms, doors: def.doors ?? [] });
        assert.equal(instance.rooms.rooms.length, Object.keys(def.rooms).length, id);
        for (const room of instance.rooms.rooms) for (const r of room.rects) assert.equal(instance.rooms.roomAt([r.x + r.w / 2, r.y + r.h / 2])?.id, room.id, `${id}: ${room.id} centre`);
    }
});
