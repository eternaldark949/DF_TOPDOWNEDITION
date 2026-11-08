#!/usr/bin/env node
'use strict';
// Physics bodies (basement/entity-base.js GameEntity.body, basement/collision-kit.js collisionWorld): every entity has a
// body whose defaults reproduce the old behaviour; masks keep pairs apart; ghosts are told, not pushed (begin / stay / end);
// a TriggerEntity fires onEnter / onExit with no other code; addPair gives a new kind of thing collisions in one line;
// raycast and overlap find bodies by mask.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { runtime } = require('./test-game-runtime.cjs');
const e = runtime(join(__dirname, '..', 'DFAB V8.html'), {});
const r = JSON.parse(JSON.stringify(e.run(`(() => {
  game._doLoadMap('sdc', null); game.running = true; game.paused = false; game.story.update = () => {};
  const X = 3000, Y = 3000, L = GameEntity.LAYER, out = {};
  for (const x of [...GameEntity.registry.collidable]) if (Math.hypot(x.x - X, x.y - Y) < 1500 && x !== game.player) x.active = false;   // an empty patch
  Object.assign(game.player, { x: X, y: Y - 900 });
  const step = () => { Object.assign(game.camera, { x: X - 400, y: Y - 300 }); _simTick++; CollisionSystem.update(game.camera, game.canvas, game); };
  const actor = (x, y, cfg = {}) => new GameEntity({ x, y, radius: 12, hasCollision: true, collisionShape: GameEntity.SHAPE.CIRCLE, collisionLayer: L.ACTOR, ...cfg });

  // defaults
  const g = new Ganger(X, Y, {}); out.ganger = [g.body.physics_type, g.body.shape, g.body.group, g.body.mask, g.body.ghost];
  out.player = game.player.body.physics_type; g.active = false; g.destroy && g.destroy();
  const off = new GameEntity({ x: 0, y: 0 }); out.empty = off.body.physics_type;
  const setv = actor(0, 0, { body: { mass: 7, ghost: true } }); out.set = [setv.body.mass, setv.body.ghost]; setv.active = false;

  // two overlapping actors are pushed apart; with a mask that drops the other's group, they aren't
  let a = actor(X, Y), b = actor(X + 10, Y); step(); out.pushed = Math.hypot(a.x - b.x, a.y - b.y) > 10.5;
  a.x = X; b.x = X + 10; a.y = b.y = Y; a.body.mask = 0xFFFF & ~L.ACTOR; step(); out.masked = Math.hypot(a.x - b.x, a.y - b.y);
  a.body.mask = 0xFFFF; b.body.physics_type = 'no_collision'; a.x = X; b.x = X + 10; step(); out.none = Math.hypot(a.x - b.x, a.y - b.y);
  b.body.physics_type = undefined;

  // a ghost: told begin, stay, end; nobody moves
  const log = []; a.x = X; b.x = X + 10; b.body.ghost = true;
  b.onCollide = (o, c, phase) => log.push(phase + (o === a ? ':a' : ':?') + (c ? ':' + (c.nx > 0 ? '+' : '-') : ''));
  step(); step(); out.ghostDist = Math.hypot(a.x - b.x, a.y - b.y); a.x = X - 200; step(); step();
  out.ghost = log; a.active = b.active = false;

  // a trigger zone: onEnter / onExit
  const seen = [];
  const zone = new TriggerEntity({ x: X - 50, y: Y - 50, width: 100, height: 100, onEnter: w => seen.push('enter'), onExit: w => seen.push('exit') });
  const walker = actor(X - 300, Y);
  for (let t = 0; t < 60; t++) { walker.x += 10; step(); }
  out.trigger = seen; out.walker = walker.x;
  zone.active = walker.active = false;

  // addPair: a new kind of thing (group 64) and actors, in one line
  const NEW = 64; collisionWorld.addPair(NEW, L.ACTOR);
  const crate = new GameEntity({ x: X, y: Y, radius: 15, hasCollision: true, collisionShape: GameEntity.SHAPE.CIRCLE, collisionLayer: NEW, mass: 1 });
  const p = actor(X + 10, Y);
  step(); out.pair = Math.hypot(crate.x - p.x, crate.y - p.y);
  collisionWorld.PAIRS.pop();

  // queries
  out.ray = CollisionSystem.raycast(X - 100, Y, X + 100, Y, { mask: L.ACTOR }).map(h => [h.e === p || h.e === crate ? (h.e === p ? 'p' : 'crate') : 'other', +h.x.toFixed(1)]);
  out.rayCrate = CollisionSystem.raycast(X - 100, Y, X + 100, Y, { mask: NEW }).map(h => h.e === crate);
  p.body.ray_mask = 0; out.rayHidden = CollisionSystem.raycast(X - 100, Y, X + 100, Y, { mask: L.ACTOR }).length;
  out.overlap = CollisionSystem.overlap(X, Y, 5).map(o => o === crate ? 'crate' : o === p ? 'p' : 'other');
  return out;
})()`)));
assert.deepEqual([...e.errors], []);
assert.deepEqual(r.ganger, ['character', 'circle', 4, 0xFFFF, false]);
assert.equal(r.player, 'character');
assert.equal(r.empty, 'no_collision');
assert.deepEqual(r.set, [7, true]);
assert.ok(r.pushed, 'two actors pushed apart');
assert.equal(r.masked, 10, 'a mask without the other group: no push');
assert.equal(r.none, 10, "'no_collision': no push");
assert.equal(r.ghostDist, 10, 'a ghost is never pushed');
assert.deepEqual(r.ghost, ['begin:a:+', 'stay:a:+', 'end:a']);
assert.deepEqual(r.trigger, ['enter', 'exit']);
assert.ok(r.pair >= 26.5, 'addPair: separated to the radii, got ' + r.pair);
assert.equal(r.ray.length, 1); assert.equal(r.ray[0][0], 'p');
assert.deepEqual(r.rayCrate, [true]);
assert.equal(r.rayHidden, 0, 'ray_mask hides it from that ray');
assert.deepEqual(r.overlap, ['crate']);
console.log('ok physics bodies:', JSON.stringify(r));
