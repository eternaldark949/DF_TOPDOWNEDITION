#!/usr/bin/env node
'use strict';
// People vs cars (legacy/directory/collision-system.js _processPeopleVsCars, legacy/basement/collision-kit.js): a car meets whoever is
// on foot with its real body, every tick and along its path, so nobody ends up inside one and a fast one can't skip past.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { runtime } = require('./test-game-runtime.cjs');
const tests = [];
for (const speed of [6, 16]) {
  const e = runtime(join(__dirname, '..', 'DFAB V8.html'), {});
  const out = e.run(`(() => {
  game._doLoadMap('sdc', null); game.running = true; game.paused = false; game.story.update = () => {}; game.enemies = [];
  for (let i = 0; i < 120 && game.pedestrians.pedestrians.length < 3; i++) game.update();
  game.traffic.clearStreet();   // just this car
  const inside = (v, x, y, r) => { const o = v.getOBB(), c = Math.cos(-o.angle), s = Math.sin(-o.angle), dx = x - o.x, dy = y - o.y, lx = dx * c - dy * s, ly = dx * s + dy * c;
    const ex = lx - Math.max(-o.length / 2, Math.min(o.length / 2, lx)), ey = ly - Math.max(-o.width / 2, Math.min(o.width / 2, ly)); return ex * ex + ey * ey < (r - 0.5) * (r - 0.5); };
  const out = [];
  // a traffic car comes along +x at ${speed} px/tick; she is far away on foot
  const car = new TrafficVehicle(0, 0, 0, null); car.length = car.length || 90;
  for (const who of ['ped-walking', 'ped-waiting', 'cat', 'ganger']) for (const off of [0, 20]) {
    const X = 2000, Y = 1500; let body;
    game.isDriving = false; Object.assign(game.player, { x: X, y: Y - 600 });
    if (who.startsWith('ped')) { body = game.pedestrians.pedestrians[0]; body.state = who === 'ped-waiting' ? 'waiting' : 'walking'; body.speed = 0; body.invincibleTimer = 0; body.vehicleCheckCooldown = 99; body.dodgeTimer = 0; }
    else if (who === 'cat') { body = game.velvetCat || (game.velvetCat = new VelvetCat(0, 0)); body.visible = true; body.inCar = false; body.state = 'idle'; body._leap = null; game.questState.hasVelvetCat = false; }
    else { body = new Ganger(0, 0, { hp: 99999 }); game.enemies = [body]; }
    Object.assign(body, { x: X, y: Y + off }); const hp0 = body.hp; body.active = true;
    let overlapped = 0, reacted = false;
    for (let t = 0; t < 70; t++) {
      Object.assign(car, { x: X - 200 + t * ${speed}, y: Y, angle: 0, speed: ${speed}, active: true, dead: false, _wallProbeTick: _simTick });
      Object.assign(game.camera, { x: X, y: Y });
      CollisionSystem.update(game.camera, game.canvas, game);
      if (who.startsWith('ped')) body.update(game.player, [], [], null); else if (who === 'cat') body.update(game.player, 1, game.activeMap, false);
      if (inside(car, body.x, body.y, body.radius || 10)) overlapped++;
      if (body.state === 'sprawled') reacted = 'sprawled'; else if (body._leap) reacted = reacted || 'leapt'; if (body.hp !== undefined && body.hp < hp0) reacted = reacted || 'hurt';
    }
    out.push(who + ' off ' + off + ': ticks inside ' + overlapped + ', ' + (reacted || 'nothing'));
    if (who === 'ganger') { game.enemies = []; body.destroy && body.destroy(); }
  }
  car.destroy && car.destroy();
  return out;
})()`);
  const want = { 'ped-walking': 'sprawled', 'ped-waiting': 'sprawled', cat: 'leapt', ganger: 'hurt' };
  for (const line of out) {
    const [, who, off, inside, what] = line.match(/^(\S+) off (\d+): ticks inside (\d+), (\w+)$/);
    assert.equal(+inside, 0, `${who} (${off} px off the car's line, ${speed} px/tick) never inside the car: ${line}`);
    assert.equal(what, want[who], `${who} at ${speed} px/tick: ${line}`);
  }
  assert.deepEqual(e.errors, []);
  tests.push(`A car at ${speed} px/tick: pedestrians (walking or waiting) go down, the cat leaps clear, a ganger is hurt; nobody is left inside it`);
}
console.log(JSON.stringify({ passed: tests.length, tests }));
