// The city as a runtime level: it loads, streams round the player and draws itself into the frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameRuntime } from '../src/game/boot/game-runtime.mjs';
import { CityLevel } from '../src/game/levels/city-level.mjs';

test('the city level draws the ground, the people, the buildings and its light and glow layers', async () => {
    const engine = createGameRuntime({ player: { template: 'df:player_949', entity_type: 'df_player', position: [1200, 550] }, schedule_frame: null, cancel_frame: null });
    try {
        engine.api.render.resize({ width: 1280, height: 720 }); engine.registerLevel('sdc', CityLevel); await engine.loadLevel('sdc');
        const player = engine.api.session.player; engine.api.camera.follow(player, { snap: true });
        engine.start(); for (let i = 0; i < 3; i++) engine.updateState();
        assert.ok(engine.active_level.map.entities('lamp').length > 0, 'the lamps round the player streamed in');
        engine.render(1);
        const passes = engine.api.render.getFrameSnapshot().passes, [main, light, , glow] = passes;
        assert.deepEqual(passes.map(p => p.layer && [p.layer.blend, p.layer.scale]), [null, ['normal', .5], null, ['add', 1], null]);
        assert.ok(main.packets.some(p => p.type === 'picture' && p.picture.key.startsWith('city_ground:')), 'the ground is tiles of pictures');
        assert.ok(main.packets.some(p => p.type === 'picture' && !p.picture.key.startsWith('city_ground:')), 'the buildings and plants are stamped');
        assert.ok(main.packets.some(p => p.type === 'shape' && p.transform[4] === player.position[0] && p.transform[5] === player.position[1]), 'the player is drawn');
        assert.ok(light.packets.length > 0 && light.layer.opacity > 0, 'the night is dark');
        assert.ok(glow.packets.length > 0, 'windows and signs shine');
        assert.ok(main.packets.every(p => p.build === undefined), 'the snapshot holds no code');
    } finally { engine.dispose(); }
});

test('the player takes the wheel, drives, brakes into reverse and steps out to park', async () => {
    const { drivingSystem } = await import('../src/game/mechanics/driving-system.mjs'), { createGameVehicle } = await import('../src/game/boot/game-vehicle-factory.mjs');
    const engine = createGameRuntime({ player: { template: 'df:player_949', entity_type: 'df_player', position: [1200, 700] }, schedule_frame: null, cancel_frame: null });
    try {
        engine.registerLevel('sdc', CityLevel); await engine.loadLevel('sdc'); engine.start();
        const player = engine.api.session.player, driving = new drivingSystem({ get_player: () => engine.api.session.player });
        const car = createGameVehicle(engine.api.physics, { purpose: 'owned', control_mode: 'PARKED', position: [1200, 800], rotation: -Math.PI / 2 });
        let move = [0, 0], interact = false;
        const context = { api: { physics: engine.api.physics, controls: { justActivated: a => a === 'interact' && interact, direction: () => move, active: () => false } } };
        const press = () => { interact = true; driving.beforePhysics(context); interact = false; };
        const drive = (to, steps) => { move = to; for (let i = 0; i < steps; i++) { driving.beforePhysics(context); engine.updateState(); } };
        assert.equal(driving.nearestVehicle(context), car, 'the parked car is within reach');
        press(); assert.equal(driving.vehicle, car); assert.equal(car.data.control_mode, 'PLAYER');
        drive([0, -1], 40); assert.ok(car.position[1] < 760 && car.getSpeed() > 100, 'forward drives it north');
        drive([0, 1], 120); assert.ok(car.getSpeed() < 0, 'back brakes, then reverses');
        drive([0, 0], 60); press(); assert.equal(driving.vehicle, null, 'stepped out');
        assert.equal(engine.api.physics.getAttachmentState(player), null); assert.equal(car.data.control_mode, 'PARKED');
    } finally { engine.dispose(); }
});
