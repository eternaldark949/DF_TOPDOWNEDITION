// Native level change: maps as runtime levels, exits between them, and the travellers carried
// across (the player first, an adopted cat behind), placed inside the exit leading back.
// Run: node --test tools/test-level-travel.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameRuntime } from '../src/game/boot/game-runtime.mjs';
import { registerMapLevels } from '../src/game/levels/game-map-level.mjs';
import { MAP_IDS } from '../src/game/data/game-maps.mjs';

async function runtime(first = 'hotel_lobby', maps = MAP_IDS) {
    const engine = createGameRuntime({ schedule_frame: null }); registerMapLevels(engine, maps);
    await engine.loadLevel(first); engine.start();
    return { engine, api: engine, player: engine.game.session.player, tick: (n = 1) => { for (let i = 0; i < n; i++) engine.updateState(); } };
}
const inside = (exit, p) => p[0] >= exit.bounds.left && p[0] <= exit.bounds.right && p[1] >= exit.bounds.top && p[1] <= exit.bounds.bottom;

test('every interior with a layout builds as a runtime level and lists its exits', async () => {
    const { engine } = await runtime();
    assert.ok(engine.listLevels().includes('cozy_cafe_interior') && engine.listLevels().includes('apt_949'));
    assert.deepEqual(engine.active_level.getExits().map(e => e.target), ['sdc', 'hotel_suite', 'hotel_suite']);
    engine.dispose();
});

test('standing in an exit offers it; travel carries the player and her cat and lands them just inside the way back', async () => {
    const { engine, api, player, tick } = await runtime('hotel_lobby', MAP_IDS.filter(id => id !== 'sdc'));
    const cat = api.game.actors.spawn({ kind: 'velvet_cat', position: [520, 1000] }); cat.adopt(); tick(2);
    const offers = []; api.game.travel.onExitChanged(exit => offers.push(exit?.target ?? null));
    const elevator = engine.active_level.getExits().find(e => e.target === 'hotel_suite');
    api.basement.physics.updateBody(player, { position: [(elevator.bounds.left + elevator.bounds.right) / 2, (elevator.bounds.top + elevator.bounds.bottom) / 2], linear_velocity: [0, 0] }); tick();
    assert.deepEqual(api.game.travel.exit, { target: 'hotel_suite', label: 'Use Elevator', auto: false, available: true });
    const city = engine.active_level.getExits().find(e => e.target === 'sdc');
    api.basement.physics.updateBody(player, { position: [(city.bounds.left + city.bounds.right) / 2, (city.bounds.top + city.bounds.bottom) / 2] }); tick();
    assert.equal(api.game.travel.exit.available, false, 'an exit to a map that is not registered here is offered as unavailable');
    await assert.rejects(api.game.travel.travel(), /no exit/);
    api.basement.physics.updateBody(player, { position: [(elevator.bounds.left + elevator.bounds.right) / 2, (elevator.bounds.top + elevator.bounds.bottom) / 2] }); tick();
    const suite = await api.game.travel.travel();
    assert.equal(suite.level_id, 'hotel_suite'); assert.equal(engine.active_level, suite); assert.equal(api.game.travel.previous_level, 'hotel_lobby');
    assert.equal(api.game.session.player, player, 'the same player arrives'); assert.ok(!cat.destroyed && api.basement.elements.fetchEntity(cat.entity_id) === cat, 'and the same cat');
    const back = suite.getExits().find(e => e.target === 'hotel_lobby');
    assert.ok(!inside(back, player.position) && Math.hypot(player.position[0] - (back.bounds.left + back.bounds.right) / 2, player.position[1] - (back.bounds.top + back.bounds.bottom) / 2) < 260, `she lands just inside the way back (${player.position})`);
    assert.ok(Math.hypot(cat.position[0] - player.position[0], cat.position[1] - player.position[1]) < 80 && !inside(back, cat.position), `the cat lands beside her, out of the exit (${cat.position})`);
    assert.ok(api.basement.physics.isPlacementClear(player, player.position, { ignore_body: [player, cat], include_ghosts: false }) && api.basement.physics.isPlacementClear(cat, cat.position, { ignore_body: [cat, player], include_ghosts: false }), 'both on clear floor');
    assert.deepEqual(offers.slice(0, 3), ['hotel_suite', 'sdc', 'hotel_suite']);
    tick(5); assert.equal(api.game.travel.exit, null, 'arriving beside an exit does not stand in it');
    assert.deepEqual(api.game.travel.saveState(), { level_id: 'hotel_suite', previous_level: 'hotel_lobby' });
    const lobbyBodies = api.basement.physics.getStatistics().bodies;
    api.basement.physics.updateBody(player, { position: [(back.bounds.left + back.bounds.right) / 2, (back.bounds.top + back.bounds.bottom) / 2] }); tick();
    await api.game.travel.travel(); assert.equal(engine.active_level.level_id, 'hotel_lobby');
    await api.game.travel.travel('hotel_suite'); assert.equal(api.basement.physics.getStatistics().bodies, lobbyBodies, 'nothing is left behind or doubled by a round trip');
    engine.dispose();
});

test('an unknown arrival lands at the map spawn, and a traveller that is not kept by the session is left behind', async () => {
    const { engine, api, player } = await runtime('cozy_cafe_interior');
    const stray = api.game.actors.spawn({ kind: 'velvet_cat', position: [600, 700] });
    await api.game.travel.travel('apt_949');
    assert.deepEqual(player.position.map(Math.round), api.directory.assets.getResource('df:map_definitions').data.apt_949.spawn ? [api.directory.assets.getResource('df:map_definitions').data.apt_949.spawn.x, api.directory.assets.getResource('df:map_definitions').data.apt_949.spawn.y] : null, 'no exit leads back to the cafe, so she lands at the spawn');
    assert.ok(stray.destroyed, 'an unadopted cat stays (and goes) with its level');
    engine.dispose();
});
test('every map loads through the one map level, and its switches say what runs on it', async () => {
    const { mapSwitches, MAP_SWITCHES } = await import('../src/game/data/game-maps.mjs');
    const engine = createGameRuntime({ schedule_frame: null }); registerMapLevels(engine);
    try {
        for (const id of MAP_IDS) {
            const level = await engine.loadLevel(id), on = mapSwitches(id);
            assert.ok(level.map && level.definition.size[0] > 0, id);
            assert.equal(!!level.street, on.traffic || on.walkers, `${id}: street life only where traffic or walkers are on`);
            assert.equal(!!level.scene, on.ground || on.buildings || on.plants || on.lighting, `${id}: drawn only where a drawing switch is on`);
        }
        assert.ok(mapSwitches('sdc').traffic && !mapSwitches('hotel_lobby').traffic, 'the city has traffic, the lobby has none');
        assert.deepEqual(Object.keys(MAP_SWITCHES).sort(), ['buildings', 'ground', 'lighting', 'plants', 'traffic', 'walkers']);
        assert.throws(() => mapSwitches('x', { x: { switches: { trafic: true } } }), /Unknown map switch/);
        assert.throws(() => mapSwitches('x', { x: { switches: { traffic: 'yes' } } }), /true or false/);
    } finally { engine.dispose(); }
});
