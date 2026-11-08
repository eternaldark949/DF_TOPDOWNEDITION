#!/usr/bin/env node
'use strict';
// The recorder (basement/recorder-kit.js): a recording played back through the controls walks the same path.
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
console.log(JSON.stringify({ passed: 1, tests: ['A recording plays back through the controls along the same path'] }));
