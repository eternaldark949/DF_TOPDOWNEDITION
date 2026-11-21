// ===== LV0 BASEMENT =====
// Particle systems as data: born, moved, landed and bursting into other systems inside the physics step,
// as plain numbers or (collide: true) as bodies that land on what stands there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, PARTICLE_SYSTEM, readParticleSystem } from '../index.mjs';

const steps = (w, n) => { for (let i = 0; i < n; i++) w.updateState(); };
const system = (w, id) => w.readParticleSystems().find(s => s.id === id);

test('a record: defaults filled in, fields checked, unknown fields refused', () => {
    const r = readParticleSystem({ rate: 10 });
    assert.equal(r.capacity, PARTICLE_SYSTEM.capacity); assert.equal(r.land, 'die'); assert.equal(r.collide, false);
    assert.throws(() => readParticleSystem({ speed: 3 }), /Unknown particle system field/);
    assert.throws(() => readParticleSystem({ life: [2, 1] }), /highest is under the lowest/);
    assert.throws(() => readParticleSystem({ land: 'explode' }), /land is/);
    assert.throws(() => readParticleSystem({ velocity: [[0, 0]] }), /velocity/);
    assert.throws(() => readParticleSystem({ on_land: { count: 1 } }), /on_land/);
    assert.doesNotThrow(() => readParticleSystem({ kind: 'particle_system' }), 'a resource\'s kind is allowed');
});

test('births follow rate and density over the area, die at the end of their life, and stop at capacity', () => {
    const w = new physicsSystem(), id = w.createParticleSystem({ rate: 60, life: [0.5, 0.5] });
    steps(w, 60); const s = system(w, id); assert.ok(Math.abs(s.count - 30) <= 1, `half a second of births alive (${s.count})`);
    const d = w.createParticleSystem({ density: 10, area: [0, 0, 200, 100], life: [10, 10] }); steps(w, 60);
    assert.ok(Math.abs(system(w, d).count - 20) <= 1, '10 a second per 100 x 100, over 200 x 100, for a second');
    const capped = w.createParticleSystem({ rate: 600, capacity: 50, life: [10, 10] }); steps(w, 30); assert.equal(system(w, capped).count, 50);
    w.setParticleRate(id, { rate: 0 }); steps(w, 60); assert.equal(system(w, id).count, 0, 'no births, and the last ones die');
    w.removeParticleSystem(d); assert.equal(system(w, d), undefined);
});

test('they move by velocity, gravity, wind and drag, in three axes, and land on the ground', () => {
    const w = new physicsSystem(), id = w.createParticleSystem({ at: [0, 0], height: [100, 100], velocity: [[10, 10], [0, 0], [0, 0]], gravity: [0, 0, -100], wind: [5, 0], life: [10, 10], land: 'stop' });
    w.burstParticles(id, 1); steps(w, 30);
    let s = system(w, id); assert.ok(Math.abs(s.x[0] - 7.5) < 0.01, `x by velocity and wind (${s.x[0]})`); assert.ok(s.z[0] < 100 - 10 && s.z[0] > 0, 'falling');
    assert.ok(s.pz[0] > s.z[0], 'the step before is kept for drawing');
    steps(w, 60); s = system(w, id); assert.equal(s.z[0], 0, 'stopped on the ground'); assert.equal(s.vx[0], 0);
    const b = w.createParticleSystem({ height: [10, 10], velocity: [[0, 0], [0, 0], [-60, -60]], life: [10, 10], land: 'bounce', bounce: 0.5 });
    w.burstParticles(b, 1); steps(w, 12); assert.ok(system(w, b).vz[0] > 0, 'a bounce sends it back up');
    const drag = w.createParticleSystem({ velocity: [[100, 100], [0, 0], [0, 0]], drag: 2, life: [10, 10], land: 'none' }); w.burstParticles(drag, 1); steps(w, 60);
    assert.ok(system(w, drag).vx[0] < 100 * Math.exp(-2) * 1.01, 'drag fades their speed');
});

test('landing bursts into another system, made once and removed with its maker', () => {
    const w = new physicsSystem(), id = w.createParticleSystem({ rate: 120, area: [0, 0, 100, 100], height: [5, 5], velocity: [[0, 0], [0, 0], [-60, -60]], life: [5, 5], on_land: { system: { life: [1, 1] }, count: 2 } });
    steps(w, 30); const all = w.readParticleSystems(); assert.equal(all.length, 2, 'one splash system');
    const splash = all.find(s => s.id !== id); assert.ok(splash.count > 0 && splash.count % 2 === 0, `two a landing (${splash.count})`);
    assert.ok([...splash.z.slice(0, splash.count)].every(z => z === 0), 'born where they landed');
    w.removeParticleSystem(id); assert.equal(w.readParticleSystems().length, 0);
});

test('the same seed and steps give the same particles', () => {
    const run = () => { const w = new physicsSystem(); w.createParticleSystem({ seed: 7, rate: 100, area: [0, 0, 50, 50], velocity: [[-5, 5], [-5, 5], [0, 0]] }); steps(w, 20); return [...w.readParticleSystems()[0].x.slice(0, 20)]; };
    assert.deepEqual(run(), run());
});

test('collide: true makes each particle a body: it lands on the roof under it, or on the ground', () => {
    const w = new physicsSystem();
    w.createBody({ position: [50, 50], physics_type: 'static', collision_shape: { shape_type: 'box', dimensions: [60, 60] }, height_span: [0, 20] });
    const roof = w.createParticleSystem({ rate: 30, at: [50, 50], radius: 10, height: [40, 40], gravity: [0, 0, -200], life: [3, 3], land: 'stop', collide: true, on_land: { system: { life: [0.5, 0.5] } } });
    const street = w.createParticleSystem({ rate: 30, at: [300, 50], height: [40, 40], gravity: [0, 0, -200], life: [3, 3], land: 'stop', collide: true });
    steps(w, 60);
    const r = system(w, roof), g = system(w, street);
    assert.ok(r.count > 20 && w.getBodies?.().length !== 0);
    const landedOn = s => [...s.z.slice(0, s.count)].filter(z => z === 0 || z === 20);
    assert.ok(landedOn(r).filter(z => z === 20).length > 10, 'on the roof, 20 up');
    assert.ok(landedOn(g).every(z => z === 0) && landedOn(g).length > 10, 'on the ground');
    const splash = w.readParticleSystems().find(s => s.id !== roof && s.id !== street);
    assert.ok(splash.count > 0 && [...splash.z.slice(0, splash.count)].every(z => z === 20), 'the burst is born on the roof');
    w.removeParticleSystem(roof); w.removeParticleSystem(street); assert.equal(w.readParticleSystems().length, 0);
});
