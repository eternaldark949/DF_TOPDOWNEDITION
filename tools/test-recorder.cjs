#!/usr/bin/env node
'use strict';
// The recorder (legacy/basement/recorder-kit.js): a recording played back through the controls walks the same path.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { runtime } = require('./test-game-runtime.cjs');
const e = runtime(join(__dirname, '..', 'DFAB V8.html'), { events: true, timers: true });
const r = structuredClone(e.run(`(() => {
  game._doLoadMap('ollo_test'); game.running = true; game.paused = false; game.isDriving = false; game.player.visible = true;
  hudInputBlocked = () => false; game.hud = { has: () => true };   // the probe has no HUD on screen
  game.story.update = () => {};   // no opening scene
  for (let i = 0; i < 5; i++) game.update();   // settle in
  const P = game.player, home = [P.x, P.y, P.angle], K = controls.keyboard;
  game_recorder.startRecording();
  for (let i = 0; i < 60; i++) {
    K.setInputs(i < 25 ? ['d'] : i < 45 ? ['s', 'd'] : []);
    if (i === 10) controls.fire('sneak', PRESS, { device: 'keyboard', input: 'c', time: 0, typing: false, preventDefault() {}, stop() {} });
    if (i === 30) Object.assign(game.joystick, { active: true, dx: -0.5, dy: 0 }); if (i === 40) Object.assign(game.joystick, { active: false, dx: 0, dy: 0 });
    game.update();
  }
  const rec = JSON.parse(JSON.stringify(game_recorder.stopRecording())); K.setInputs([]);
  const first = { end: [P.x, P.y], sneak: !!game.sneaking };
  if (game.sneaking) game.toggleSneak();
  Object.assign(P, { x: home[0], y: home[1], angle: home[2] });
  let ended = false; game_recorder.startPlayback(rec, () => ended = true);
  const muted = controls.muted;
  for (let i = 0; i < 70 && !ended; i++) game.update();
  return { frames: rec.frames.length, actions: rec.actions, first, second: { end: [P.x, P.y], sneak: !!game.sneaking }, moved: Math.hypot(first.end[0] - home[0], first.end[1] - home[1]), muted, ended, after: controls.muted };
})()`));
assert.equal(r.frames, 61, 'a frame at the start and one per tick');
assert.deepEqual(r.actions, [[10, 'sneak', 3, 'keyboard', 'c', false]], 'the fired action, after its frame');
assert.ok(r.moved > 50, 'she walked (' + r.moved + ' px)');
assert.ok(Math.hypot(r.first.end[0] - r.second.end[0], r.first.end[1] - r.second.end[1]) < 0.01, 'the replay ends where the recording did: ' + JSON.stringify(r));
assert.equal(r.second.sneak, r.first.sneak, 'the action played back');
assert.deepEqual([r.muted, r.ended, r.after], [true, true, false], 'devices muted while playing, back after');
assert.deepEqual(e.errors, []);

// The whole scene: with a setup (a map load) on the recording's dice, the crowd and the traffic repeat too, tick for tick
const w = structuredClone(e.run(`(() => {
  game._doLoadMap('sdc', null); for (let i = 0; i < 90; i++) game.update();   // the street fills, the clocks move
  const P = game.player, K = controls.keyboard, setup = () => game._doLoadMap('sdc', null);
  const H = () => JSON.stringify([[P.x, P.y], game.pedestrians.pedestrians.map(p => [p.x, p.y]), game.traffic.vehicles.map(v => [v.x, v.y])]);
  const run = rec => { const hs = []; for (let i = 0; i < 90; i++) { if (rec) K.setInputs(i < 40 ? ['d'] : i < 70 ? ['s', 'd'] : []); game.update(); hs.push(H()); } return hs; };
  game_recorder.startRecording(setup); const a = run(true); const rec = JSON.parse(JSON.stringify(game_recorder.stopRecording())); K.setInputs([]);
  for (let i = 0; i < 40; i++) game.update();   // the world moves on
  game_recorder.startPlayback(rec, null, setup); const b = run(false);
  const last = JSON.parse(a[89]);
  return { first: a.findIndex((h, i) => h !== b[i]), crowd: last[1].length, cars: last[2].length };
})()`));
assert.ok(w.crowd > 0 && w.cars > 0, 'a street with people and cars on it: ' + JSON.stringify(w));
assert.equal(w.first, -1, 'every pedestrian and car where they were, every tick: ' + JSON.stringify(w));
assert.deepEqual(e.errors, []);
console.log(JSON.stringify({ passed: 2, tests: ['A recording plays back through the controls along the same path', 'With a setup, the crowd and the traffic repeat tick for tick'] }));
