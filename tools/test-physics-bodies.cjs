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

  // the street (everywhere on the map, the traffic step's grid): two cars meet with masks and onCollide like anything else
  const grid = { all: [], getNearby(q, buf) { buf.length = 0; for (const c of this.all) buf.push(c); return buf; } };
  const car = (x, cfg = {}) => Object.assign(new GameEntity({ x, y: Y + 400, width: 60, height: 30, hasCollision: true, collisionShape: GameEntity.SHAPE.OBB, collisionLayer: L.VEHICLE, ...cfg }), { length: 60, width: 30, angle: 0, getOBB() { return { x: this.x, y: this.y, length: 60, width: 30, angle: 0, mass: 1000 }; } });
  const c1 = car(X), c2 = car(X + 50); grid.all = [c1, c2]; const hits = [], told = [];
  c2.onCollide = (o, c, phase) => told.push(phase + ':' + (c && c.nx > 0 ? '+' : c ? '-' : ''));
  CollisionSystem.streetCars(grid.all, grid, [], (v1, v2, pk) => hits.push([v1 === c1, v2 === c2]));
  c1.body.mask = 0xFFFF & ~L.VEHICLE; CollisionSystem.streetCars(grid.all, grid, [], () => hits.push('masked'));
  out.street = { hits, told: told.slice() };
  // on foot: her against a car through streetFeet; a ghost car is told, she isn't pushed
  c1.body.mask = 0xFFFF; c1.active = c2.active = false; grid.all = [c2]; c2.body.ghost = true; told.length = 0;
  const P0 = game.player; Object.assign(P0, { x: X + 50, y: Y + 400 - 25 }); game.isDriving = false;
  const y0 = P0.y; CollisionSystem.streetFeet([P0], grid, game); out.feetGhost = [P0.y === y0, told.slice()];
  c2.body.ghost = false; CollisionSystem.streetFeet([P0], grid, game); out.feetPushed = P0.y < y0;

  // the body step: carry (knockback), damping set by hand, locked axes, impulse, integrate
  const k = actor(X, Y + 800); k.knockbackVx = 10; k.knockbackVy = 10; k.knockbackFriction = 0.85;
  k.body.lock = { x: true, y: false, rot: true }; collisionWorld.carry(k); out.carryLock = [k.x === X, k.y === Y + 810, k.knockbackVx];
  k.body.lock = undefined; k.body.linear_damping = 0.5; k.knockbackVx = 8; k.knockbackVy = 0; collisionWorld.carry(k); out.carryDamp = k.knockbackVx;
  const box = new PropEntity({ x: X, y: Y + 900, width: 40, height: 40, mass: 10 });
  collisionWorld.impulse(box, 20, 0); out.imp = [box.vx, box.angularVel];
  collisionWorld.impulse(box, 0, 20, box.getCenter().x + 20, box.getCenter().y); out.impSpin = box.angularVel > 0;
  box.body.lock = { x: false, y: false, rot: true }; box.angularVel = 0; collisionWorld.impulse(box, 0, 20, box.getCenter().x + 20, box.getCenter().y); out.impLocked = box.angularVel;
  box.body.lock = { x: false, y: true, rot: false }; const by = box.y; box.vx = 2; box.vy = 3; collisionWorld.integrate(box); out.intLock = [box.y === by, box.vy, box.vx > 0];
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
assert.deepEqual(r.street.hits, [[true, true]], 'two cars meet once; a mask without VEHICLE: they pass');
assert.deepEqual(r.street.told, ['begin:+']);
assert.equal(r.feetGhost[0], true, 'a ghost car: told, she is not pushed'); assert.equal(r.feetGhost[1].length, 1);
assert.ok(r.feetPushed, 'a solid car pushes her out');
assert.deepEqual(r.carryLock, [true, true, 0], 'a locked axis carries nothing');
assert.equal(r.carryDamp, 4, 'linear_damping 0.5 halves it');
assert.deepEqual(r.imp, [2, 0], 'impulse / mass, no turn without a point');
assert.ok(r.impSpin, 'off-centre: it turns'); assert.equal(r.impLocked, 0, 'a locked turn stays still');
assert.deepEqual(r.intLock, [true, 0, true], 'integrate keeps a locked axis');
console.log('ok physics bodies:', JSON.stringify(r));
