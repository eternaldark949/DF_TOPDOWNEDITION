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

test('every map with rooms builds a room graph whose doors join known rooms', async () => {
    const { mapInstance } = await import('../src/engine/basement/maps/index.mjs');
    for (const [id, def] of Object.entries(places.rooms)) {
        const map = places.maps[id], instance = new mapInstance(new physicsSystem(), { map_id: id, size: [map.width, map.height], rooms: def.rooms, doors: def.doors ?? [] });
        assert.equal(instance.rooms.rooms.length, Object.keys(def.rooms).length, id);
        for (const room of instance.rooms.rooms) for (const r of room.rects) assert.equal(instance.rooms.roomAt([r.x + r.w / 2, r.y + r.h / 2])?.id, room.id, `${id}: ${room.id} centre`);
    }
});
