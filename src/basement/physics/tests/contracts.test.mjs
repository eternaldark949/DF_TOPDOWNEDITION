import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve, dirname } from 'node:path';
import * as api from '../index.mjs';
import { shapeBounds } from '../collision/shape.mjs';
import { createSandbox } from '../examples/scene.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const step = (world, n = 1) => { for (let i = 0; i < n; i++) world.updateState(); };
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]); }

test('runtime is standalone and constructs one spatial index per world', () => {
    const runtime = files(root).filter(p => p.endsWith('.mjs') && !/\/(tests|examples|benchmarks)\//.test(p));
    let grids = 0;
    for (const file of runtime) {
        const code = readFileSync(file, 'utf8');
        grids += [...code.matchAll(/new spatialGrid\(/g)].length;
        for (const [, specifier] of code.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
            assert.ok(specifier.startsWith('.'), `${file} imports external dependency ${specifier}`);
            assert.ok(resolve(dirname(file), specifier).startsWith(root), `${file} imports outside package`);
        }
        assert.doesNotMatch(code, /\b(?:GameEngine|GameEntity|CONFIG|document|window|audioSys|requestAnimationFrame)\b/, file);
    }
    assert.equal(grids, 1);
});
test('documented public method coverage matches the exported classes', () => {
    const reference = readFileSync(join(root, 'docs/api-reference.md'), 'utf8');
    for (const [name, type] of Object.entries(api)) {
        if (typeof type !== 'function') continue;
        assert.ok(reference.includes(name), `Class missing from reference: ${name}`);
        for (const method of [...Object.getOwnPropertyNames(type.prototype), ...Object.getOwnPropertyNames(type)]) {
            if (['constructor', 'length', 'name', 'prototype'].includes(method) || method.startsWith('_')) continue;
            assert.ok(reference.includes(method), `${name}.${method} is missing documentation`);
        }
    }
});
test('all relative documentation links resolve inside the shareable folder', () => {
    for (const p of files(root).filter(p => p.endsWith('.md'))) {
        const doc = readFileSync(p, 'utf8');
        for (const [, link] of doc.matchAll(/\]\(([^)]+)\)/g)) {
            if (/^(https?:|#)/.test(link)) continue;
            assert.doesNotThrow(() => readFileSync(resolve(dirname(p), link.split('#')[0])), `${relative(root, p)} -> ${link}`);
        }
    }
});
test('example client runs using only public engine requests and produces an impact', () => {
    const s = createSandbox(); s.walk([1, 0]); step(s.physics, 30); s.walk([0, 0]);
    s.shoot([540, 150]); step(s.physics, 90);
    assert.ok(s.character.physics_controller.body.position[0] > 120); assert.ok(s.impacts.length > 0);
});
test('seeded rotated/offset geometry grid candidates match an exhaustive test oracle', () => {
    const p = new api.physicsSystem({ cell_size: 13 }), bodies = [], states = [];
    let seed = 103; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 80; i++) {
        const body = p.createBody({ position: [random() * 100 - 50, random() * 100 - 50], rotation: random() * Math.PI * 2,
            collision_shape: { shape_type: 'box', dimensions: [random() * 15 + 2, random() * 15 + 2], local_position: [3, -2] } });
        bodies.push(body); states.push(body.getState());
    }
    let contacts = 0;
    for (let i = 0; i < bodies.length; i++) {
        const a = states[i], shape = new api.collisionShape(a.collision_shape), candidates = p.spatial_grid.queryBounds(shapeBounds(shape, a.position, a.rotation));
        for (let j = i + 1; j < bodies.length; j++) {
            const b = states[j];
            if (api.collisionDetector.contact(shape, a, new api.collisionShape(b.collision_shape), b)) { contacts++; assert.ok(candidates.includes(bodies[j]), `Missed pair ${i},${j}`); }
        }
    }
    assert.ok(contacts > 20);
});
test('touching at step start cannot tunnel forward through the wall or prevent moving away', () => {
    const p = new api.physicsSystem();
    const a = p.createBody({ position: [7.5, 0], linear_velocity: [2000, 0], collision_shape: { shape_type: 'circle', radius: 2 } });
    p.createBody({ position: [10, 0], physics_type: 'static', collision_shape: { shape_type: 'box', dimensions: [1, 100] } });
    step(p); assert.ok(a.position[0] < 8);
    a.setLinearVelocity([-2000, 0]); step(p); assert.ok(a.position[0] < 0);
});
test('sensor hits do not consume projectile penetration and lifetime truncates motion', () => {
    const p = new api.physicsSystem();
    for (const [x, ghost] of [[5, true], [10, false], [15, false]]) p.createBody({ position: [x, 0], ghost, physics_type: 'static' });
    const hits = []; p.on('projectileHit', e => hits.push(e));
    p.createProjectile({ speed: 2000, direction: [1, 0], penetration_count: 1 }); step(p);
    assert.deepEqual(hits.map(h => h.sensor_only), [true, false, false]);
    const q = new api.physicsSystem(); q.createBody({ position: [50, 0], physics_type: 'static' }); let count = 0; q.on('projectileHit', () => count++);
    q.createProjectile({ lifetime: 0.005, speed: 10000 }); step(q); assert.equal(count, 1);
    const r = new api.physicsSystem(); r.createBody({ position: [70, 0], physics_type: 'static' }); r.on('projectileHit', () => count++);
    r.createProjectile({ lifetime: 0.005, speed: 10000 }); step(r); assert.equal(count, 1);
});
test('body clearances honor physical masks while independent sensor queries can still find geometry', () => {
    const p = new api.physicsSystem(), body = p.createBody({ collision_mask: 0 });
    p.createBody({ position: [10, 0], physics_type: 'static' });
    assert.equal(p.getPathClearance({ body, from: [0, 0], to: [20, 0] }).clear, true);
    assert.ok(p.raycast({ from: [2, 0], to: [20, 0], ignore_body: body }));
});
test('force and damping use seconds and rotation torque uses the shared mass/lock rules', () => {
    const p = new api.physicsSystem(), b = p.createBody({ mass: 2, linear_damping: 1 });
    b.applyForce([120, 0], { world_point: [0, 1] }); step(p);
    assert.ok(Math.abs(b.linear_velocity[0] - Math.exp(-1 / 60)) < 1e-7); assert.ok(b.angular_velocity < 0);
});
test('render interpolation is detached from authoritative motion', () => {
    const p = new api.physicsSystem(), b = p.createBody({ linear_velocity: [60, 0] }); step(p);
    const pose = b.getRenderState(0.5); assert.ok(Math.abs(pose.position[0] - 0.5) < 1e-8);
    pose.position[0] = 1000; assert.ok(Math.abs(b.position[0] - 1) < 1e-8);
});
test('facing works by default; removing a follow target cancels safely', () => {
    const p = new api.physicsSystem(), a = p.createCharacter(), b = p.createBody({ position: [0, 100] });
    a.lookAtTarget(b); step(p, 20); assert.ok(a.physics_controller.body.rotation > 1);
    a.followTarget(b); p.removeBody(b); assert.doesNotThrow(() => step(p));
    assert.equal(a.getMovementState().mode, 'idle');
});
test('autonomous vehicle follows an unobstructed route and emits arrival', () => {
    const p = new api.physicsSystem(), v = p.createVehicle({ vehicle_template: { max_speed: 40 } }); let arrived = 0;
    p.on('destinationReached', () => arrived++); v.followPath([[0, 0], [60, 0]], { speed: 40 }); step(p, 300);
    assert.equal(arrived, 1); assert.ok(Math.abs(v.physics_controller.body.position[0] - 60) < 5);
});
test('sleeping is observable and new requests wake bodies without alternate motion paths', () => {
    const p = new api.physicsSystem(), b = p.createBody(); step(p, 40); assert.equal(b.getState().sleeping, true);
    b.applyImpulse([10, 0]); step(p); assert.equal(b.getState().sleeping, false); assert.ok(b.position[0] > 0);
    const a = p.createCharacter({ position: [100, 0] }); a.physics_controller.body.sleepBody(); const before = a.physics_controller.body.position;
    step(p); assert.deepEqual(a.physics_controller.body.position, before); a.setMovement([1, 0]); step(p); assert.ok(a.physics_controller.body.position[0] > before[0]);
});
test('query budgets reject invalid or unbounded work rather than loop indefinitely', () => {
    const p = new api.physicsSystem();
    assert.throws(() => p.spatial_grid.querySegment([NaN, 0], [1, 0]));
    assert.throws(() => p.spatial_grid.querySegment([0, 0], [1e12, 0]));
    assert.throws(() => p.updateState(1)); assert.throws(() => p.simulation_tick = 99);
});
test('dense noncolliding visual particles never generate all-pairs collision work', () => {
    const p = new api.physicsSystem(), pool = p.createParticlePool({ capacity: 1000, lifetime: 10 });
    p.emitParticles(pool, { count: 1000 }); step(p);
    assert.equal(p.getStatistics().candidate_pairs, 0); assert.equal(p.getStatistics().narrow_checks, 0);
});
