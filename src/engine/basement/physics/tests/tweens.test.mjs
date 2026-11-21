// ===== LV0 BASEMENT =====
// Tweens: any value on an entity eased over time, as data; easings shared with scripted motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, EASINGS, readEasing, ease } from '../index.mjs';

const near = (a, b, why = '', eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${why} ${a} != ${b}`);
const run = (p, seconds) => { for (let t = 0; t < seconds - 1e-9; t += .05) p.updateState(.05); };

test('easings are data: names, a bezier, steps; every one starts at 0 and ends at 1', () => {
    for (const [name, f] of Object.entries(EASINGS)) { near(f(0), 0, name); near(f(1), 1, name); }
    near(ease('smooth', .5), .5); near(ease('ease_in', .5), .25); assert.ok(ease('back_out', .5) > .9 && Math.max(...[.6, .7, .8].map(t => ease('back_out', t))) > 1, 'back overshoots');
    near(ease([.25, .1, .25, 1], .5), .8024033877399112, 'CSS ease', 1e-3); near(ease([0, 0, 1, 1], .3), .3, 'a straight bezier is linear', 1e-6);
    assert.equal(ease({ steps: 4 }, .6), .5); assert.equal(ease({ steps: 4 }, 1), 1);
    assert.throws(() => readEasing('wobbly'), /Unknown easing/); assert.throws(() => readEasing([2, 0, 1, 1]), /bezier/); assert.throws(() => readEasing({ steps: 1.5 }), /whole/);
});

test('a tween eases a number, a list or a colour on an entity, then says so', () => {
    const p = new physicsSystem(), e = p.elements.createEntity({ position: [0, 0] }), done = [];
    p.on('tweenFinished', ev => done.push(ev));
    e.set('look', { values: { shirt: '#000000' }, scale: 1 });
    e.tween('look.values.shirt', '#ff8000', { duration: 1, easing: 'linear' });
    e.tween('scale', [2, 2, 3], { duration: 1, easing: 'linear' });
    e.tween('glow', 10, { from: 0, duration: 1, easing: 'linear', delay: .5 });
    run(p, .5);
    const shirt = e.get('look').values.shirt.match(/[0-9a-f]{2}/g).map(h => parseInt(h, 16)); [128, 64, 0].forEach((v, i) => near(shirt[i], v, 'half way to orange', 1.01)); e.scale.forEach((v, i) => near(v, [1.5, 1.5, 2][i], 'scale', 1e-9));
    assert.equal(e.get('glow'), undefined, 'a delayed tween waits');
    run(p, .5); assert.equal(e.get('look').values.shirt, '#ff8000'); assert.equal(e.get('look').scale, 1, 'the rest of the look is untouched');
    near(e.get('glow'), 5);
    assert.deepEqual(done.map(d => d.property).sort(), ['look.values.shirt', 'scale']); assert.equal(done[0].entity, e);
    e.tween('look.values.shirt', 'rgba(255,128,0,0)', { duration: .5, easing: 'linear' }); run(p, .25);
    assert.equal(e.get('look').values.shirt, 'rgba(255,128,0,0.5)', 'colours fade through their alpha');
    assert.throws(() => e.tween('look.values.shirt', 5), /not two numbers/); assert.throws(() => e.tween('position', [1, 1]), /moveBodyTo/);
});

test('it repeats, goes back and forth, turns the short way, is replaced and stopped', () => {
    const p = new physicsSystem(), e = p.elements.createEntity({ position: [0, 0] });
    e.set('pulse', 0); e.tween('pulse', 1, { duration: .5, easing: 'linear', repeat: -1, yoyo: true });
    run(p, .75); near(e.get('pulse'), .5, 'on its way back'); run(p, 1); near(e.get('pulse'), .5, 'and on, for ever');
    e.tween('pulse', 4, { duration: .5, easing: 'linear' }); run(p, .25); near(e.get('pulse'), 2.25, 'a new tween takes over from where the value is');
    assert.ok(e.stopTween('pulse')); run(p, .5); near(e.get('pulse'), 2.25, 'stopped, it stays');
    e.set('heading', 3); e.tween('heading', -3, { duration: 1, easing: 'linear', angle: true }); run(p, .5);
    near(e.get('heading'), 3 + (2 * Math.PI - 6) / 2, 'an angle turns through pi, not back through zero');
    e.tween('pulse', 0, { duration: 1 }); e.destroy(); run(p, .1); assert.ok(true, 'a tween on a destroyed entity just ends');
});

test('elevation tweens rise smoothly and land; tweens save mid-way; scripted motion takes any easing', () => {
    const p = new physicsSystem(), lift = p.elements.createEntity({ kind: 'static', position: [0, 0], height_span: [0, 10] });
    lift.tween('elevation', 100, { duration: 1, easing: 'linear' }); run(p, .5); near(lift.elevation, 50);
    const saved = p.savePhysicsState(), q = new physicsSystem(); q.loadPhysicsState(saved);
    run(q, .5); near(q.elements.fetchEntity(lift.entity_id).elevation, 100, 'the loaded world finishes the tween');
    const box = p.elements.createEntity({ kind: 'prop', position: [0, 0] }); p.motion.moveBodyTo(box.body, { position: [100, 0], duration: 1, easing: 'ease_in' });
    run(p, .5); near(box.position[0], 25, 'half the time, a quarter of the way', 1);
    assert.throws(() => p.motion.moveBodyTo(box.body, { position: [0, 0], duration: 1, easing: 'nope' }), /Unknown easing/);
});
