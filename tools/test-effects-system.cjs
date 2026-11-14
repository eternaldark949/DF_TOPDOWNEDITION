#!/usr/bin/env node
'use strict';
// The effects system (legacy/directory/effects-system.js) on the draw list (legacy/basement/draw-list.js): an effect only says what
// it looks like, as shape packets; canvasRenderer is the only thing that touches the canvas. Spawning caps a list,
// update ages it, clear empties every list, and each type's look fills a draw list the renderer turns into canvas calls.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { runtime } = require('./test-game-runtime.cjs');
const e = runtime(join(__dirname, '..', 'DFAB V8.html'), {});
const r = JSON.parse(JSON.stringify(e.run(`(() => {
  const out = {};
  // the draw list keeps its packets between frames and rewinds on clear
  const L = new drawList();
  L.blend('lighter'); L.rect(1, 2, 3, 4, '#fff', 0.5); const o = L.lines(0.5, '#f00', 1); L.seg(o, 0, 0, 5, 0); L.seg(o, 0, 0, 0, 5);
  out.ops = L.ops.slice(0, L.n).map(p => p.slice());
  const first = L.ops[0], kept = L.ops[1]; L.clear(); L.rect(9, 9, 1, 1, '#000', 1); out.reused = L.ops[0] === first && L.n === 1 && L.ops[1] === kept && first[0] === 'rect';

  // the canvas renderer: the only place a context is touched, in packet order, alpha times the context's own
  const calls = [], ctx = new Proxy({ globalAlpha: 0.5, getTransform: () => ({}) }, {
    get: (t, k) => k in t ? t[k] : (...a) => calls.push([k, ...a]),
    set: (t, k, v) => { if (k !== 'globalAlpha') calls.push(['=' + k, v]); else calls.push(['=alpha', v]); t[k] = k === 'globalAlpha' ? 0.5 : v; return true; } });
  const M = new drawList(); M.blend('lighter'); M.rect(1, 2, 3, 4, '#abc', 0.5);
  M.sprite('IMG', 0, 0, 8, 8, -4, -4, 8, 8, 1, 10, 20, 0.5, 2, 3);
  canvasRenderer.flush(ctx, M);
  out.calls = calls;

  // the system
  const E = game.effects;
  E.clear();
  for (let i = 0; i < 70; i++) E.spawn('casing', { x: i, y: 0, vx: 0, vy: 0, a: 0, spin: 0, t: 0, big: false, col: '#ffffff', ph: 0, rate: 0.005 });
  out.cap = [E.of('casing').length, E.of('casing')[0].x];
  E.spawn('muzzle', { x: 0, y: 0, radius: 50, color: '#ffcc88', life: 2, angle: 0 });
  E.update('muzzle'); out.flash1 = E.of('muzzle').length; E.update('muzzle'); out.flash2 = E.of('muzzle').length;
  E.of('casing').forEach(k => k.t = 1500); E.update('casing'); out.aged = E.of('casing').length;
  E.spawn('barrel', { k: 'ember', x: 0, y: 0, vx: 0, vy: 0, t: 1, life: 30, col: '#ff9a3c', ph: 0 });
  _zoomLOD = 0;
  E.types.barrel.look(E.of('barrel'), E.out.clear() || E.out, { left: -9, right: 9, top: -9, bottom: 9 }, game);
  out.look = E.out.ops.slice(0, E.out.n).map(p => p[0]);
  // a floating number: drawn as outlined text, gone after its life (a crit's 1.1 s)
  _gameTimeSec = 5; E.spawn('number', { target: null, x: 0, y: 0, value: 12, color: '#ffd23a', t0: 5, pop: 5, drift: 0, crit: true }, 40);
  const tc = [], tctx = new Proxy({ globalAlpha: 1 }, { get: (t, k) => k in t ? t[k] : (...a) => tc.push([k, ...a]), set: (t, k, v) => { t[k] = v; return true; } });
  E.draw('number', tctx); out.text = tc.filter(c => /Text$/.test(c[0])).map(c => c.slice(0, 2));
  _gameTimeSec = 6; E.update('number'); out.numA = E.of('number').length; _gameTimeSec = 6.2; E.update('number'); out.numB = E.of('number').length;
  E.clear(); out.cleared = Object.values(E.lists).every(l => !l.length);
  return out;
})()`)));

assert.deepEqual(r.ops, [['blend', 'lighter'], ['rect', 1, 2, 3, 4, '#fff', 0.5], ['lines', 0.5, '#f00', 1, 0, 0, 5, 0, 0, 0, 0, 5]], 'shape packets');
assert.ok(r.reused, 'clear rewinds the list and keeps its packets');
const names = r.calls.map(c => c[0]);
assert.deepEqual(names, ['save', '=globalCompositeOperation', '=alpha', '=fillStyle', 'fillRect', 'save', 'translate', 'rotate', 'scale', '=alpha', 'drawImage', 'restore', 'restore'], 'renderer calls in order');
assert.deepEqual(r.calls.filter(c => c[0] === '=alpha').map(c => c[1]), [0.25, 0.5], 'alpha times the context alpha');
assert.deepEqual(r.calls.find(c => c[0] === 'drawImage'), ['drawImage', 'IMG', 0, 0, 8, 8, -4, -4, 8, 8], 'sprite source and destination');
assert.deepEqual(r.cap, [60, 10], 'casings capped at 60, oldest first');
assert.deepEqual([r.flash1, r.flash2], [1, 0], 'a muzzle flash lives its ticks');
assert.equal(r.aged, 0, 'casings go after 25 s');
assert.deepEqual(r.look, ['blend', 'rect', 'rect'], 'an ember looks like a fleck and its streak');
assert.deepEqual(r.text, [['strokeText', '12!'], ['fillText', '12!']], 'a crit number: outlined, then filled');
assert.deepEqual([r.numA, r.numB], [1, 0], 'a crit number lives 1.1 s');
assert.ok(r.cleared, 'clear empties every list');
console.log('effects system: ok');
