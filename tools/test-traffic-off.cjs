#!/usr/bin/env node
'use strict';
// Traffic: OFF — no street cars spawn, the driving ones fade out (in view or not), her cars, Zibs and parked cars stay,
// and the setting survives the device preset and the menus' cycles.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { runtime } = require('./test-game-runtime.cjs');
const env = runtime(join(__dirname, '..', 'DFAB V8.html'));
const r = structuredClone(env.run(`(() => {
  const was = GameSettings.trafficDensity;
  game._doLoadMap('sdc', null);
  const T = game.traffic, p = game.player;
  GameSettings.trafficDensity = 'high';
  for (let i = 0; i < 400 && T.vehicles.length < 6; i++) { _simTick++; T.update(p, game.activeMap, game.car, game.weather, [], game.decals, [], []); }
  const before = T.vehicles.length;
  const mine = T.vehicles[0];                                   // stands in for her car
  const zib = T.vehicles[1]; zib.isZib = true;
  const parked = T.vehicles[2]; parked.hasDriver = false; parked.controlMode = 'PARKED';
  GameSettings.trafficDensity = 'off';
  for (let i = 0; i < 90; i++) { _simTick++; T.update(p, game.activeMap, mine, game.weather, [], game.decals, [], []); }
  const left = T.vehicles.filter(v => !v.dead);
  const max = GameSettings.getMaxTraffic();
  GameSettings.applyPreset('low'); const afterLow = GameSettings.trafficDensity;
  GameSettings.applyPreset('medium'); const afterMedium = GameSettings.trafficDensity;
  GameSettings.trafficDensity = 'high'; GameSettings.applyPreset('low'); const highToLow = GameSettings.trafficDensity;
  GameSettings.trafficDensity = was;
  return { before, max, kept: [left.includes(mine), left.includes(zib), left.includes(parked)], others: left.filter(v => v !== mine && v !== zib && v !== parked).length,
    afterLow, afterMedium, highToLow };
})()`));
assert.ok(r.before >= 4, `traffic spawned first (${r.before})`);
assert.equal(r.max, 0);
assert.deepEqual(r.kept, [true, true, true]);
assert.equal(r.others, 0, 'every self-driving street car faded out');
assert.equal(r.afterLow, 'off'); assert.equal(r.afterMedium, 'off'); assert.equal(r.highToLow, 'low');
assert.deepEqual(env.errors, []);
console.log(`Traffic OFF passed: ${r.before} cars cleared to her car, a Zib and a parked car; the device preset keeps it off.`);
