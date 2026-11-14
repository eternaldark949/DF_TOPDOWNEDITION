import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { physicsSystem, gameCharacter, gameVehicle, BODY_GROUP } from '../src/engine/basement/physics/index.mjs';
import { createGameAssetLibrary } from '../src/game/data/game-assets.mjs';
import { resolveStreetVehicle } from '../src/game/data/street-definitions.mjs';
import { StreetPopulation, Pedestrian, TrafficVehicle } from '../src/game/boot/game-street.mjs';
const setup = () => { const world = new physicsSystem({ asset_library: createGameAssetLibrary() }); return { world, street: new StreetPopulation(world, { pedestrians: { random: () => 0 } }) }; };
const walk = { nodes: [{ id: 0, position: [-100, 0], connections: [1], crosswalk_id: 'cross', signal_id: 'walk' }, { id: 1, position: [100, 0], connections: [0], crosswalk_id: 'cross', signal_id: 'walk' }] };
const step = (s, n = 1) => { for (let i = 0; i < n; i++) { s.updateState(); s.physics.updateState(); } };

test('official street classes register directly into the supplied world with no physical mirrors', () => {
    const { world, street } = setup(); street.pedestrians.setNetwork(walk);
    const p = street.pedestrians.spawnAtNode(0), car = street.traffic.spawn({ control_mode: 'PLAYER', position: [200, 200] });
    assert.ok(p instanceof Pedestrian && p instanceof gameCharacter); assert.ok(car instanceof TrafficVehicle && car instanceof gameVehicle);
    assert.equal(p.physics_system, world); assert.equal(car.physics_system, world);
    assert.equal(world.getStatistics().entities, 2); assert.equal(world.getStatistics().spatial.instances, 2);
    assert.throws(() => p.x = 10); assert.throws(() => car.vx = 10); assert.throws(() => p.physics_system = new physicsSystem());
    street.clearStreet(); assert.equal(world.getStatistics().bodies, 0); assert.equal(world.getStatistics().spatial.instances, 0);
});
test('Directory resolves actual brand/model dimensions and converts per-tick catalog tuning once', () => {
    const { world } = setup(), library = world.elements.asset_library, catalog = library.getResource('df:vehicle_brands').data;
    const brand = Object.keys(catalog)[0], model = Object.keys(catalog[brand].models)[0], spec = catalog[brand].models[model];
    const definition = resolveStreetVehicle(library, { brand, model });
    assert.deepEqual(definition.collision_shape.dimensions, [spec.length, spec.width]);
    assert.equal(definition.vehicle_template.max_speed, catalog[brand].baseStats.maxSpeed * spec.speedMod * 60);
    definition.data.brand = 'changed'; assert.equal(resolveStreetVehicle(library, { brand, model }).data.brand, brand);
    assert.throws(() => resolveStreetVehicle(library, { brand: 'missing' }));
});
test('traffic manager delegates route driving and endpoint cleanup to engine events', () => {
    const { world, street } = setup(); street.traffic.registerRoute('a', { points: [[0, 0], [300, 0]], speed_limit: 120 });
    const car = street.traffic.spawn({ route_id: 'a' }); assert.equal(world.traffic.getState(car).route_id, 'a');
    step(street, 300); assert.equal(car.destroyed, true); assert.equal(street.traffic.getVehicles().length, 0);
});
test('manual driving releases AI ownership and accepts only motor controls', () => {
    const { world, street } = setup(); street.traffic.registerRoute('a', { points: [[0, 0], [1000, 0]] });
    const car = street.traffic.spawn({ route_id: 'a' }); assert.throws(() => car.setControls({ accelerator: 1 }));
    car.setControlMode('PLAYER'); assert.equal(world.traffic.getState(car), null);
    car.setControls({ accelerator: 1 }); step(street, 10); assert.ok(car.position[0] > 0);
    car.setControlMode('PARKED'); const before = car.position; step(street, 10); assert.deepEqual(car.position, before);
});
test('pedestrians obey walk signals and engine moving-vehicle crossing prediction', () => {
    const { street } = setup(); street.pedestrians.setNetwork(walk);
    const p = street.pedestrians.spawnAtNode(0), car = street.traffic.spawn({ control_mode: 'PLAYER', position: [0, -100], rotation: Math.PI / 2 });
    step(street); assert.equal(p.data.state, 'waiting');
    street.pedestrians.setSignal('walk', 'go'); car.body.setLinearVelocity([0, 200]); step(street);
    assert.equal(p.data.state, 'waiting');
    car.setControlMode('PARKED'); step(street); assert.equal(p.data.state, 'crossing');
    step(street, 20); assert.ok(p.position[0] > -100);
});
test('engine forecasts a fast crossing car whose current bounds are outside the pedestrian corridor', () => {
    const { world, street } = setup(); street.pedestrians.setNetwork(walk); const p = street.pedestrians.spawnAtNode(0);
    const car = street.traffic.spawn({ control_mode: 'PLAYER', position: [0, -400], rotation: Math.PI / 2 }); car.body.setLinearVelocity([0, 800]);
    const hits = world.predictMovementContacts({ body: p, to: [100, 0], speed: 240, seconds: 1, include_groups: BODY_GROUP.VEHICLE });
    assert.equal(hits[0]?.entity, car);
});
test('vehicle contact drives civilian damage/sprawl while impulse response remains in the engine', () => {
    const { world, street } = setup(); street.pedestrians.setNetwork({ nodes: [{ id: 0, position: [0, 0], connections: [] }] });
    const p = street.pedestrians.spawnAtNode(0), car = street.traffic.spawn({ control_mode: 'PLAYER', position: [-150, 0] });
    car.body.setLinearVelocity([0, 0]); world.motion.moveBodyTo(car, { position: [80, 0], duration: 0.5 });
    step(street, 30); assert.equal(p.data.health, 80); assert.equal(p.data.state, 'sprawled'); assert.ok(p.position[0] > 0);
    assert.ok(p.getMovementState().suspended_for > 0);
});
test('official class identities, driving and pedestrian waypoint state survive saves', () => {
    const a = setup(); a.street.pedestrians.setNetwork(walk); a.street.pedestrians.setSignal('walk', 'go');
    const p = a.street.pedestrians.spawnAtNode(0); a.street.traffic.registerRoute('a', { points: [[0, 300], [1000, 300]], speed_limit: 100 });
    const car = a.street.traffic.spawn({ route_id: 'a' }); step(a.street, 15); const saved = a.world.savePhysicsState();
    const b = setup(); b.street.pedestrians.setNetwork(walk); b.world.loadPhysicsState(saved); b.street.reconnectGameplay();
    assert.ok(b.world.elements.fetchEntity(p.entity_id) instanceof Pedestrian); assert.ok(b.world.elements.fetchEntity(car.entity_id) instanceof TrafficVehicle);
    step(a.street, 120); step(b.street, 120);
    assert.deepEqual(b.world.fetchBody(car.body_id).getState(), car.body.getState()); assert.deepEqual(b.world.elements.fetchEntity(p.entity_id).getState(), p.getState());
});
test('rejected spawns never leave anonymous bodies and visibility uses the shared grid', () => {
    const { world, street } = setup(); const car = street.traffic.spawn({ control_mode: 'PARKED' });
    assert.equal(street.traffic.spawn({ control_mode: 'PARKED' }), null); assert.equal(world.getStatistics().bodies, 1);
    assert.throws(() => street.traffic.spawn({ brand: 'missing', control_mode: 'PARKED' })); assert.equal(world.getStatistics().bodies, 1);
    assert.deepEqual(street.traffic.getVisibleVehicles({ left: -100, right: 100, top: -100, bottom: 100 }), [car]);
});
test('new game street modules contain no old solvers, spatial indexes or physical integration', () => {
    for (const file of ['src/game/entities/traffic-vehicle.mjs', 'src/game/mechanics/traffic-manager.mjs', 'src/game/entities/pedestrians.mjs', 'src/game/entities/pedestrian-manager.mjs', 'src/game/boot/game-street.mjs']) {
        const code = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
        assert.doesNotMatch(code, /\b(?:shapeKit|vehicleKit|collisionWorld|SpatialGrid|SpatialHashGrid|OrderedCrowdPointGrid)\b/, file);
        assert.doesNotMatch(code, /Math\.(?:hypot|sqrt|sin|cos|atan2)\s*\(/, file);
        assert.doesNotMatch(code, /\.(?:x|y|vx|vy|angularVel)\s*(?:\+\+|--|[+*\/-]?=)/, file);
    }
});
test('opposing authored walkers keep circulating with bounded local queries', () => {
    const { world, street } = setup();
    street.pedestrians.setNetwork({ nodes: [{ id: 0, position: [0, -100], connections: [1] }, { id: 1, position: [0, 100], connections: [0] }] });
    const a = street.pedestrians.spawnAtNode(0), b = street.pedestrians.spawnAtNode(1);
    step(street, 300);
    assert.notEqual(a.data.previous_node_id, null); assert.notEqual(b.data.previous_node_id, null);
    assert.ok(world.getStatistics().spatial.queries < 10000, world.getStatistics().spatial.queries);
});
test('ambient cap and cleanup do not prevent or destroy owned and mission vehicles', async () => {
    const { createGameVehicle } = await import('../src/game/boot/game-vehicle-factory.mjs');
    const { world, street } = setup(); const cap = world.elements.asset_library.getResource('df_street:rules').data.max_vehicles;
    for (let i = 0; i < cap; i++) assert.ok(street.traffic.spawn({ control_mode: 'PARKED', position: [i * 200, 0] }));
    assert.equal(street.traffic.spawn({ control_mode: 'PARKED', position: [0, 400] }), null);
    const owned = createGameVehicle(world, { purpose: 'owned', position: [0, 400] });
    const mission = createGameVehicle(world, { purpose: 'mission', position: [400, 400], glow_color: null });
    assert.ok(owned && mission); assert.equal(mission.data.glow_color, null);
    assert.equal(owned.data.persistent, true); assert.equal(street.traffic.getAmbientVehicles().length, cap);
    street.clearStreet(); assert.equal(owned.destroyed, false); assert.equal(mission.destroyed, false); assert.equal(world.getStatistics().bodies, 2);
});
test('street policy updates never advance the owner world clock', () => {
    const { world, street } = setup(); const before = world.simulation_tick;
    street.updateState(); assert.equal(world.simulation_tick, before);
    world.updateState(); assert.equal(world.simulation_tick, before + 1);
});
test('owned replacement uses engine clearance and retires the old identity without adopting its body', async () => {
    const { createGameVehicle } = await import('../src/game/boot/game-vehicle-factory.mjs');
    const { world } = setup(); const old = createGameVehicle(world, { purpose: 'owned', position: [100, 100] });
    assert.throws(() => createGameVehicle(world, { purpose: 'owned', brand: 'missing', replaces: old }));
    assert.equal(old.destroyed, false); assert.equal(world.getStatistics().bodies, 1);
    const replacement = createGameVehicle(world, { purpose: 'owned', replaces: old });
    assert.ok(replacement); assert.notEqual(replacement.body_id, old.body_id); assert.equal(old.destroyed, true);
    assert.deepEqual(replacement.position, [100, 100]); assert.equal(world.getStatistics().bodies, 1);
});
test('delivery presets resolve their authored local spawn pose through Basement', async () => {
    const { createGameVehicle } = await import('../src/game/boot/game-vehicle-factory.mjs');
    const { world } = setup(); const van = createGameVehicle(world, { purpose: 'mission', mission_id: 'amber_delivery', anchor: { position: [100, 100], rotation: Math.PI / 2 } });
    assert.ok(Math.abs(van.position[0] - 80) < 1e-6); assert.ok(Math.abs(van.position[1] - 20) < 1e-6);
    assert.equal(van.data.color, '#58391C'); assert.equal(van.data.mission_id, 'amber_delivery');
    assert.throws(() => createGameVehicle(world, { purpose: 'mission', mission_id: 'missing' }));
    assert.equal(world.getStatistics().bodies, 1);
});
test('event-time spawning reserves ambient capacity until engine registration commits', () => {
    const { world, street } = setup(); world.elements.createProp(); world.elements.createStatic();
    let accepted = 0; const cap = world.elements.asset_library.getResource('df_street:rules').data.max_vehicles;
    const drop = world.on('contactBegin', () => {
        drop();
        for (let i = 0; i < cap + 2; i++) if (street.traffic.spawn({ control_mode: 'PARKED', position: [i * 200, 500] })) accepted++;
    });
    world.updateState(); assert.equal(accepted, cap); world.updateState(); assert.equal(street.traffic.getAmbientVehicles().length, cap);
});
test('pedestrian appearances are selected from the shared Directory catalog', () => {
    const { world, street } = setup(); street.pedestrians.setNetwork(walk);
    const person = street.pedestrians.spawnAtNode(0);
    const appearances = world.elements.asset_library.getResource('df:pedestrian_appearances').data;
    assert.equal(person.data.appearance_id, appearances[0].name);
    assert.deepEqual(person.getAsset('appearance_catalog').data, appearances);
});
test('vehicle seating mounts registered passengers without game-side pose copying', async () => {
    const { createGameVehicle } = await import('../src/game/boot/game-vehicle-factory.mjs');
    const { world, street } = setup(); const car = createGameVehicle(world, { purpose: 'owned', position: [200, 200] });
    street.pedestrians.setNetwork({ nodes: [{ id: 0, position: [0, 0], connections: [] }] });
    const person = street.pedestrians.spawnAtNode(0), id = person.body_id;
    assert.equal(car.assignPassenger(person), 1); assert.deepEqual(car.getPassengers(), [person]);
    assert.deepEqual(person.position, car.getSeatWorldPose(1).position); assert.equal(person.body_id, id);
    car.setControlMode('PLAYER'); car.setControls({ accelerator: 1, steering: 0.3 }); step(street, 30);
    assert.deepEqual(person.position, car.getSeatWorldPose(1).position); assert.equal(person.data.health, 100);
    assert.deepEqual(person.getRenderState(0.4).position, car.getSeatWorldPose(1, { blend: 0.4 }).position);
    assert.ok(car.releasePassenger(person)); assert.equal(world.getAttachmentState(person), null); assert.deepEqual(car.getPassengers(), []);
    assert.equal(person.body_id, id); assert.equal(world.getStatistics().bodies, 2);
});
test('a passenger and seat cannot be assigned twice, including before event-time attachment commit', async () => {
    const { createGameVehicle } = await import('../src/game/boot/game-vehicle-factory.mjs');
    const { world } = setup(); const a = createGameVehicle(world, { purpose: 'owned', position: [100, 100] });
    const b = createGameVehicle(world, { purpose: 'owned', position: [500, 100] });
    const person = world.createCharacter({ position: [800, 100] }), other = world.createCharacter({ position: [900, 100] });
    assert.equal(a.assignDriver(person), 0); assert.equal(a.assignDriver(other), -1); assert.equal(b.assignPassenger(person), -1);
    assert.throws(() => a.assignSeat(other, 100)); assert.equal(world.getStatistics().bodies, 4);
});
test('restored seat ownership uses engine attachments and parent removal releases the passenger', async () => {
    const { createGameVehicle } = await import('../src/game/boot/game-vehicle-factory.mjs');
    const a = setup(), car = createGameVehicle(a.world, { purpose: 'owned', position: [200, 200] });
    a.street.pedestrians.setNetwork({ nodes: [{ id: 0, position: [0, 0], connections: [] }] });
    const person = a.street.pedestrians.spawnAtNode(0); car.assignPassenger(person); step(a.street);
    const saved = a.world.savePhysicsState(), b = setup(); b.world.loadPhysicsState(saved); b.street.reconnectGameplay();
    const restored = b.world.elements.fetchEntity(car.entity_id), rider = b.world.elements.fetchEntity(person.entity_id);
    assert.deepEqual(restored.getPassengers(), [rider]); assert.deepEqual(rider.position, restored.getSeatWorldPose(1).position);
    restored.destroy(); assert.equal(b.world.getAttachmentState(rider), null); assert.equal(b.world.getStatistics().bodies, 1);
    b.world.updateState(); assert.equal(rider.data.state, 'idle');
});
test('vehicle replacement refuses an occupied body before changing any identity or attachment', async () => {
    const { createGameVehicle } = await import('../src/game/boot/game-vehicle-factory.mjs');
    const { world } = setup(), car = createGameVehicle(world, { purpose: 'owned' }), person = world.createCharacter({ position: [200, 0] });
    car.assignPassenger(person); assert.throws(() => createGameVehicle(world, { purpose: 'owned', replaces: car }), /Release passengers/);
    assert.equal(car.destroyed, false); assert.equal(world.getStatistics().bodies, 2); assert.equal(world.getAttachmentState(person).parent_body_id, car.body_id);
});
test('official seats pass optional mass combination through to Basement and preserve inherited release velocity', async () => {
    const { createGameVehicle } = await import('../src/game/boot/game-vehicle-factory.mjs');
    const { world } = setup(), car = createGameVehicle(world, { purpose: 'owned' });
    const person = world.createCharacter({ position: [200, 0], mass: 200 });
    const originalMass = world.getMassProperties(car).mass;
    car.assignPassenger(person, { combine_mass: true });
    assert.equal(world.getMassProperties(car).mass, originalMass + 200);
    car.body.setLinearVelocity([10, 0]); assert.ok(car.releasePassenger(person));
    assert.equal(world.getMassProperties(car).mass, originalMass); assert.deepEqual(person.linear_velocity, [10, 0]);
});
