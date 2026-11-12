'use strict';
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { readFileSync, readdirSync } = require('node:fs');
const { runtime } = require('./test-game-runtime.cjs');
const root = join(__dirname, '..'), env = runtime(join(root, 'DFAB V8.html'));
const result = structuredClone(env.run(`(() => {
    const owned = gameVehicles.create({ purpose: 'owned', position: [900, 800], rotation: 1 });
    const mission = gameVehicles.create({ purpose: 'mission', mission_id: 'amber_delivery' });
    const lane = { start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, angle: 0, length: 400, ux: 1, uy: 0 };
    const manager = new TrafficManager(); manager.network = { allLanes: [lane], laneHasExit: () => true };
    const service = new ZibSystem(), request = service.summonNearest(manager, [200, 20]);
    const counts = [manager.vehicles.length, service.activeZibs.length];
    manager.network.allLanes = [{ ...lane, end: { x: 20, y: 0 }, length: 20 }];
    const short = service.summonNearest(manager, [0, 0]);
    const failed = service.summonNearest(manager, [1000, 1000]);
    return { owned: [owned.brand, owned.model, owned.x, owned.y, owned.angle, owned.isOwnedCar, owned.data.purpose],
        mission: [mission.isDeliveryVehicle, mission.hasDriver, mission.data.persistent],
        taxi: [request.vehicle.x, request.vehicle.y, request.vehicle.isZib, request.vehicle.hasDriver, request.vehicle.color], counts,
        short: [short.vehicle.x, short.vehicle.y], failed: failed.reason };
})()`));
assert.deepEqual(result.owned, ['LADY','suv',900,800,1,true,'owned']);
assert.deepEqual(result.mission, [true,false,true]);
assert.deepEqual(result.taxi, [200,0,true,false,'#1a0a2e']);
assert.deepEqual(result.counts, [1,1]); assert.deepEqual(result.short,[10,0]); assert.equal(result.failed,'out_of_range');
assert.deepEqual(env.errors, []);
function files(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]); }
const constructors = files(join(root,'src')).filter(p=>p.endsWith('.js')).filter(p=>/new TrafficVehicle\(/.test(readFileSync(p,'utf8')));
assert.deepEqual(constructors,[join(root,'src/legacy/directory/game-vehicles.js')]);
const phone = readFileSync(join(root,'src/legacy/ui/phone.js'),'utf8').split('zibMe() {')[1].split('showCarMe() {')[0];
assert.doesNotMatch(phone,/new TrafficVehicle|Math\.|\.vehicles\.push|\.activeZibs\.push/);
console.log('Vehicle construction, taxi service, short-lane placement and live caller retirement passed.');
