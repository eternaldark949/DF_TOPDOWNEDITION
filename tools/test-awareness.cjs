#!/usr/bin/env node
'use strict';
// The awareness matrix (basement/awareness-kit.js), and the gangers who now see through it.
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
  const g = new Ganger(1000, 1000, {}); g.angle = 0;
  const see = (x, y) => g.canSeePoint(x, y, walls, []);
  const sense = (x, y, sneak, ticks = 1) => { Object.assign(P, { x, y }); game.sneaking = sneak; g.suspicion = 0; g.state = 'IDLE'; g.x = 1000; g.y = 1000; g.angle = 0;
    for (let i = 0; i < ticks; i++) g.update(P, walls, [], [], [], null, [g]); return g.suspicion; };
  const ganger = { inCone: see(1080, 1000), behind: see(900, 1000), walled: see(1200, 1000), same: see(1080, 1000) === g.awareness.canSee(1080, 1000, walls, []),
    closeFront: sense(1030, 1000, true), closeBehindSneaking: sense(970, 1000, true), closeBehindWalking: sense(970, 1000, false), farInCone: sense(1090, 1010, false) };
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
assert.deepEqual(e.errors, []);
console.log(JSON.stringify({ passed: 2, tests: ['The awareness matrix observes, looks and keeps its surroundings', 'Gangers see and sense her through it'] }));
