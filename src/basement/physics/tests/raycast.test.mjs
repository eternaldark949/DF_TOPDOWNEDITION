import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, BODY_GROUP } from '../index.mjs';

// The exact raycast is checked against the engine's own swept thin circle, which it replaced for bodies at rest.
const THIN = { shape_type: 'circle', radius: 1e-7 };
const thinCast = (world, packet) => world.shapeCast({ ...packet, collision_shape: THIN, max_results: 1 })[0] ?? null;
const seeded = seed => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const wall = (world, position, dimensions = [20, 20], extra = {}) =>
    world.createBody({ physics_type: 'static', collision_group: BODY_GROUP.STATIC, position, collision_shape: { shape_type: 'box', dimensions }, ...extra });

test('raycast meets every shape type where the thin swept circle did', () => {
    const world = new physicsSystem(), random = seeded(7), SIZE = 3000;
    const shapes = [
        () => ({ shape_type: 'circle', radius: 20 + random() * 60 }),
        () => ({ shape_type: 'box', dimensions: [40 + random() * 200, 40 + random() * 200] }),
        () => ({ shape_type: 'box', dimensions: [40 + random() * 200, 20 + random() * 60], local_position: [random() * 30, random() * 30], local_rotation: random() }),
        () => ({ shape_type: 'capsule', points: [[-40, 0], [40, 10]], radius: 12 }),
        () => ({ shape_type: 'polygon', points: [[0, 0], [50, 10], [20, 60]] }),
        () => ({ shape_type: 'compound', children: [{ shape_type: 'box', dimensions: [80, 30] }, { shape_type: 'circle', radius: 25, local_position: [60, 0] },
            { shape_type: 'polygon', points: [[0, 0], [50, 10], [20, 60]], local_position: [-70, 0] }] }),
    ];
    for (let i = 0; i < 400; i++) world.createBody({ physics_type: 'static', position: [random() * SIZE, random() * SIZE],
        rotation: i % 6 === 1 ? 0 : random() * Math.PI * 2, collision_shape: shapes[i % 6]() });
    let met = 0;
    for (let i = 0; i < 3000; i++) {
        const from = [random() * SIZE, random() * SIZE], angle = random() * Math.PI * 2, reach = 50 + random() * 600;
        const packet = { from, to: [from[0] + Math.cos(angle) * reach, from[1] + Math.sin(angle) * reach] };
        const exact = world.raycast(packet), thin = thinCast(world, packet);
        assert.equal(!!exact, !!thin, `ray ${i} agrees on meeting anything`);
        if (!exact) continue;
        met++;
        assert.equal(exact.body_id, thin.body_id, `ray ${i} meets the same body`);
        assert.ok(Math.abs(exact.distance - thin.distance) < 1e-4, `ray ${i} meets it at the same distance`);
        if (exact.fraction > 0) assert.ok(Math.hypot(exact.normal[0] - thin.normal[0], exact.normal[1] - thin.normal[1]) < 1e-3, `ray ${i} reports the same normal`);
    }
    assert.ok(met > 500, 'the scene is dense enough to exercise hits');
});

test('raycast reports the nearest surface, its point and a normal pointing into the body', () => {
    const world = new physicsSystem(); wall(world, [100, 0]); const near = wall(world, [50, 0]);
    const hit = world.raycast({ from: [0, 0], to: [200, 0] });
    assert.equal(hit.body, near);
    assert.ok(Math.abs(hit.distance - 40) < 1e-5 && Math.abs(hit.fraction - 0.2) < 1e-7);
    assert.ok(Math.abs(hit.world_point[0] - 40) < 1e-5 && Math.abs(hit.world_point[1]) < 1e-9);
    assert.deepEqual(hit.normal.map(v => Math.round(v)), [1, 0]);
    assert.equal(world.raycast({ from: [0, 30], to: [200, 30] }), null);
    assert.equal(world.raycast({ from: [0, 0], to: [39, 0] }), null);
});

test('a ray starting inside or exactly on a body meets it at once; a zero-length ray outside meets nothing', () => {
    const world = new physicsSystem(), box = wall(world, [0, 0], [40, 20]);
    assert.equal(world.raycast({ from: [5, 5], to: [300, 5] }).fraction, 0);
    assert.equal(world.raycast({ from: [-20, -10], to: [-300, -200] }).body, box);          // from its very corner
    assert.equal(world.raycast({ from: [5, 5], to: [5, 5] }).body, box);
    assert.equal(world.raycast({ from: [50, 50], to: [50, 50] }), null);
});

test('raycast keeps the query filters and the moving-body prediction path', () => {
    const world = new physicsSystem(), solid = wall(world, [60, 0]);
    const ghost = wall(world, [30, 0], [10, 10], { ghost: true, collision_group: BODY_GROUP.PROP });
    const packet = { from: [0, 0], to: [100, 0] };
    assert.equal(world.raycast(packet).body, ghost);
    assert.equal(world.raycast({ ...packet, include_ghosts: false }).body, solid);
    assert.equal(world.raycast({ ...packet, include_groups: BODY_GROUP.STATIC }).body, solid);
    assert.equal(world.raycast({ ...packet, ignore_body: [ghost, solid] }), null);
    const mover = world.createBody({ physics_type: 'kinematic', position: [50, 40], collision_shape: { shape_type: 'circle', radius: 5 }, linear_velocity: [0, -40] });
    world.commitCommands();
    assert.equal(world.raycast({ from: [0, 0], to: [55, 0], ignore_body: [ghost, solid] }), null);
    assert.equal(world.raycast({ from: [0, 0], to: [55, 0], ignore_body: [ghost, solid], predict_seconds: 1 })?.body, mover);
});
