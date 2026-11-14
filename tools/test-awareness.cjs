#!/usr/bin/env node
'use strict';
// The awareness matrix (legacy/basement/awareness-kit.js), and the gangers who now see through it.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { runtime } = require('./test-game-runtime.cjs');
const e = runtime(join(__dirname, '..', 'DFAB V8.html'), {});
const r = structuredClone(e.run(`(() => {
  // the kit on its own: a watcher at the origin facing +x, a 90° cone, a wall at x = 50 for y > 0
  const me = { x: 0, y: 0, angle: 0 };
  const A = new awarenessMatrix(me, { evaluation_radius: 200, fov: Math.PI / 2, sight: (x, y) => !(y > 0 && x > 50) });
  const front = A.observe({ id: 'a', x: 100, y: 0 }, 'her'), back = A.observe({ id: 'b', x: -100, y: 0 }), near = A.observe({ id: 'c', x: 5, y: 0 });
  const kit = {
    front: [front[AWARE.DIST], front[AWARE.BEARING], front[AWARE.CLOSE], front[AWARE.BEHIND], A.look(front)],
    back: [back[AWARE.BEHIND], A.look(back)], near: near[AWARE.CLOSE], space: A.space,
    walled: A.canSee(100, 10), far: A.canSee(250, 0), cone: A.canSee(100, 100),
    surroundings: [...A.analyzeSurroundings([{ id: 'a', x: 100, y: 0 }, { id: 'z', x: 900, y: 0 }]).keys()],
    ahead: A.forwards_point, behindPt: A.backwards_point,
  };
  // a ganger: she's in his cone, then behind him, then behind a wall
  game._doLoadMap('ollo_test'); game.story.update = () => {};
  const walls = [{ x: 1100, y: 900, w: 20, h: 300 }], P = game.player; P.visible = true; P.isHidden = false; P.visibility = 1;   // in the light (slow and in the dark counts as sneaking)
  const g = new Ganger(1000, 1000, {}); g.angle = 0; game.enemies = [g];
  const see = (x, y) => g.canSeePoint(x, y, walls, []);
  const sense = (x, y, sneak, ticks = 1) => { Object.assign(P, { x, y }); game.sneaking = sneak; g.suspicion = 0; g.state = 'IDLE'; g.x = 1000; g.y = 1000; g.angle = 0;
    for (let i = 0; i < ticks; i++) g.update(P, walls, [], [], [], null, [g]); return g.suspicion; };
  const ganger = { inCone: see(1080, 1000), behind: see(900, 1000), walled: see(1200, 1000), same: see(1080, 1000) === g.awareness.canSee(1080, 1000, walls, []),
    closeFront: sense(1040, 1000, true), closeBehindSneaking: sense(960, 1000, true), closeBehindWalking: sense(960, 1000, false), farInCone: sense(1090, 1010, false) };
  // bumping into him in the dark, sneaking up from behind: he feels it and turns round; just short of touching, he doesn't
  P.visibility = 0.1; ganger.nearlyBumped = sense(965, 1000, true);
  ganger.bumped = sense(975, 1000, true); ganger.turned = Math.abs(normalizeAngle(g.angle - Math.PI)) < 0.6;   // round toward her (then he looks about, searching)
  ganger.sawHerNext = (g.update(P, walls, [], [], [], null, [g]), g.suspicion);
  ganger.heard = g.awareness.heard && [g.awareness.heard[AWARE.KIND], g.awareness.heard[AWARE.HEARD] > 0];
  // the debug view draws it: rings, the cone, a line to her, the sound heard
  const calls = {}; const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : (...a) => { calls[k] = (calls[k] || 0) + 1; }, set: (t, k, v) => (t[k] = v, true) });
  g.awareness.drawDebug(ctx, { now: _gameTimeSec, label: () => { calls.label = (calls.label || 0) + 1; } });
  ganger.drawn = [calls.arc >= 3, calls.lineTo >= 2, calls.label >= 1];
  return { kit, ganger };
})()`));
const { kit, ganger } = r;
assert.deepEqual(kit.front, [100, 0, false, false, true], 'in front: seen');
assert.deepEqual(kit.back, [true, false], 'behind: not in the cone');
assert.equal(kit.near, true, 'inside personal space');
assert.equal(kit.space, 10, 'personal space defaults to 5% of the evaluation radius');
assert.deepEqual([kit.walled, kit.far, kit.cone], [false, false, false], 'a wall, too far, out of the cone');
assert.deepEqual(kit.surroundings, ['a'], 'only what is within the evaluation radius is kept');
assert.deepEqual([kit.ahead, kit.behindPt], [[10, 0], [-10, 0]], 'a personal space ahead and behind');
assert.deepEqual([ganger.inCone, ganger.behind, ganger.walled, ganger.same], [true, false, false, true], 'a ganger sees through his matrix: ' + JSON.stringify(ganger));
assert.ok(ganger.closeFront >= 5, 'up close in front, he senses her even sneaking');
assert.equal(ganger.closeBehindSneaking, 0, 'sneaking up behind him, she goes unnoticed');
assert.ok(ganger.closeBehindWalking >= 5, 'walking up behind him, he senses her');
assert.ok(ganger.farInCone > 0 && ganger.farInCone < 5, 'further off in the cone, suspicion builds slowly');
assert.equal(ganger.nearlyBumped, 0, 'sneaking up close behind him in the dark, not touching: unnoticed');
assert.ok(ganger.bumped >= 70 && ganger.turned, 'bumping into him: he startles round to face her: ' + JSON.stringify(ganger));
assert.ok(ganger.sawHerNext > ganger.bumped, 'and then he sees her, up close in front of him');
assert.deepEqual(ganger.heard, ['sound', true], 'the matrix keeps what he heard');
assert.deepEqual(ganger.drawn, [true, true, true], 'the debug view draws the matrix');
// passers-by: a bump, gunfire, and a weapon only when it's in front of them
const q = structuredClone(e.run(`(() => {
  game._doLoadMap('sdc', null); game.running = true; game.paused = false; game.enemies = []; for (let i = 0; i < 120 && !game.pedestrians.pedestrians.length; i++) game.update();
  const P = game.player, ped = game.pedestrians.pedestrians[0]; if (!ped) return { none: true };
  game.isDriving = false; const r0 = Math.random; Math.random = () => 0;   // every roll says yes
  const say = () => ped.quipText; const reset = () => { ped.quipText = null; ped.quipCooldown = 0; ped._bumped = false; };
  const out = {};
  reset(); ped.facingAngle = 0; Object.assign(P, { x: ped.x + 100, y: ped.y }); ped.tryQuip(P, true, []); out.weaponAhead = PEDESTRIAN_QUIPS.seesWeapon.includes(say());
  reset(); ped.facingAngle = Math.PI; ped.tryQuip(P, true, []); out.weaponBehind = PEDESTRIAN_QUIPS.seesWeapon.includes(say());
  reset(); Object.assign(P, { x: ped.x - 20, y: ped.y }); ped.tryQuip(P, false, []); out.bumped = PEDESTRIAN_QUIPS.bumpedOnFoot.includes(say());
  const again = (ped.quipText = null, ped.tryQuip(P, false, []), say()); out.onceAPush = PEDESTRIAN_QUIPS.bumpedOnFoot.includes(again) ? 'again' : 'once';
  reset(); Object.assign(P, { x: ped.x + 1000, y: ped.y }); game.emitNoise(ped.x + 80, ped.y, 600, 'shot');
  out.shot = [ped.startled, PEDESTRIAN_QUIPS.danger.includes(say()), ped.awareness.heard && ped.awareness.heard[AWARE.KIND]];
  reset(); ped._startleUntil = 0; game.emitNoise(ped.x + 80, ped.y, 600, 'step'); out.step = ped.startled;
  Math.random = r0; return out;
})()`));
assert.ok(!q.none, 'a pedestrian on sdc');
assert.equal(q.weaponAhead, true, 'her weapon, in front of them: they mention it');
assert.equal(q.weaponBehind, false, 'behind them: they don\'t see it');
assert.equal(q.bumped, true, 'bumped into: they say so');
assert.equal(q.onceAPush, 'once', 'once a bump, not every tick she leans on them');
assert.deepEqual(q.shot, [true, true, 'sound'], 'a shot: they flinch, cry out, and the matrix keeps it');
assert.equal(q.step, false, 'a footstep is no alarm');
assert.deepEqual(e.errors, []);
console.log(JSON.stringify({ passed: 4, tests: ['The awareness matrix observes, looks and keeps its surroundings', 'Gangers see and sense her through it', 'Bumping into a ganger in the dark gives her away', 'Passers-by feel a bump, hear gunfire and see a weapon only in front of them'] }));
