import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { physicsSystem, railGeometry } from '../index.mjs';

const DT = 1 / 60;
const car = (world, position = [0, 0], extra = {}) => world.createBody({ physics_type: 'kinematic', position, collision_shape: { shape_type: 'box', dimensions: [40, 20] }, ...extra });
const tick = (world, count = 1) => { for (let i = 0; i < count; i++) world.updateState(DT); };
const near = (actual, expected, tolerance = 1e-6, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? 'value'}: ${actual} vs ${expected}`);

test('rail geometry reads position, heading and bend from the distance along', () => {
    const table = railGeometry.sampleRail({ points: [[0, 0], [100, 0], [100, 100]] });
    assert.equal(table.length, 200);
    const point = railGeometry.pointOnRail(table, 150);
    near(point.x, 100); near(point.y, 50);
    const off = railGeometry.projectOnRail(table, [40, 7]);
    near(off.distance, 40); near(off.lateral, 7);
    assert.equal(railGeometry.sharpestBend(railGeometry.sampleRail({ points: [[0, 0], [50, 0], [100, 0]] }), 0, 100), 0);
    assert.ok(railGeometry.sharpestBend(table, 0, 200) > 0);
    assert.throws(() => railGeometry.sampleRail({ points: [[0, 0], [0, 0]] }));
    assert.throws(() => railGeometry.sampleRail({ points: [[0, 0], [1, 0]], rotations: [0] }));
});

test('a rider pulls away, settles at its top speed and stays on the line', () => {
    const world = new physicsSystem(), body = car(world);
    world.rails.registerRail('lane', { points: [[0, 0], [100000, 0]] });
    world.rails.rideRail(body, { rail_id: 'lane', profile: { top_speed: 300, acceleration: 600 } });
    tick(world, 600);
    const state = world.rails.getRiderState(body);
    assert.ok(state.speed > 200 && state.speed <= 300, `cruising under its top speed: ${state.speed}`);
    tick(world); near(world.rails.getRiderState(body).speed, state.speed, 0.01, 'steady'); near(body.position[1], 0); near(body.position[0], world.rails.getRiderState(body).distance, 1e-6, 'body is where the rail says');
    near(body.linear_velocity[0], world.rails.getRiderState(body).speed, 1e-6, 'the step moved it at rail speed');
});

test('a stop line holds a rider and clearing it lets the rider go', () => {
    const world = new physicsSystem(), body = car(world);
    world.rails.registerRail('lane', { points: [[0, 0], [5000, 0]] });
    world.rails.rideRail(body, { rail_id: 'lane', speed: 300 });
    world.rails.setRiderLimits(body, { stop_distance: 900 });
    tick(world, 600);
    let state = world.rails.getRiderState(body);
    assert.equal(state.speed, 0); assert.ok(state.distance < 902 && state.distance > 880, `stopped at the line: ${state.distance}`);
    world.rails.setRiderLimits(body, { stop_distance: null, speed_cap: 120 });
    tick(world, 300);
    state = world.rails.getRiderState(body);
    assert.ok(state.speed > 60 && state.speed <= 120, `under the cap: ${state.speed}`); assert.ok(state.distance > 900);
});

test('a follower never reaches a stopped leader and keeps its gap', () => {
    const world = new physicsSystem(), leader = car(world, [600, 0]), follower = car(world);
    world.rails.registerRail('lane', { points: [[0, 0], [5000, 0]] });
    world.rails.rideRail(leader, { rail_id: 'lane', speed: 0 }); world.rails.setRiderLimits(leader, { speed_cap: 0 });
    world.rails.rideRail(follower, { rail_id: 'lane', speed: 300 });
    let smallest = Infinity;
    for (let i = 0; i < 600; i++) { tick(world); smallest = Math.min(smallest, world.rails.getRiderState(follower).gap ?? Infinity); }
    const state = world.rails.getRiderState(follower);
    assert.equal(state.speed, 0); assert.equal(state.leader_body_id, leader.body_id);
    assert.ok(smallest > 0, `never touched: ${smallest}`); assert.ok(state.gap < 60, `queued up close: ${state.gap}`);
});

test('riders run from rail to rail, take the planned rail, and wait at a dead end', () => {
    const world = new physicsSystem(), body = car(world), events = [];
    for (const type of ['railChanged', 'railEnded']) world.on(type, event => events.push([type, event.rail_id]));
    world.rails.registerRail('a', { points: [[0, 0], [200, 0]], next_rail_id: 'b' });
    world.rails.registerRail('b', { points: [[200, 0], [200, 200]] });
    world.rails.registerRail('c', { points: [[200, 0], [400, 0]] });
    world.rails.rideRail(body, { rail_id: 'a', speed: 200 });
    world.rails.setRiderLimits(body, { next_rail_id: 'c' });
    tick(world, 400);
    assert.deepEqual(events, [['railChanged', 'c'], ['railEnded', 'c']]);
    near(body.position[0], 400); near(body.position[1], 0);
    assert.equal(world.rails.getRiderState(body).ended, true);
    world.rails.setNextRail('c', 'b', 0);
    tick(world, 2);
    assert.equal(world.rails.getRiderState(body).rail_id, 'b');
    assert.deepEqual(world.rails.getRailRiders('b').map(handle => handle.body_id), [body.body_id]);
});

test('a bend slows a rider that minds it and turns the nose in on one that slides', () => {
    const points = [], rotations = [];
    for (let i = 0; i <= 24; i++) { const angle = i / 24 * Math.PI / 2; points.push([300 * Math.sin(angle), 300 * (1 - Math.cos(angle))]); rotations.push(angle); }
    const world = new physicsSystem(), careful = car(world), loose = car(world, [0, 2000]);
    world.rails.registerRail('lead-in', { points: [[-2000, 0], [0, 0]], next_rail_id: 'bend' });
    world.rails.registerRail('bend', { points, rotations });
    world.rails.registerRail('bend-2', { points: points.map(([x, y]) => [x, y + 2000]), rotations });
    world.rails.rideRail(careful, { rail_id: 'lead-in', distance: 1500, speed: 220, profile: { bend_lateral_acceleration: 20, bend_min_speed: 50 } });
    world.rails.rideRail(loose, { rail_id: 'bend-2', distance: 0, speed: 300, profile: { slide_per_acceleration: 14 / 60 } });
    let slowest = Infinity, slip = 0;
    for (let i = 0; i < 240; i++) {
        tick(world);
        const state = world.rails.getRiderState(careful);
        if (state.rail_id === 'bend') slowest = Math.min(slowest, state.speed);
        const sliding = world.rails.getRiderState(loose);
        if (sliding.distance > 100 && sliding.distance < 400) slip = Math.max(slip, Math.abs(Math.atan2(Math.sin(loose.rotation - world.rails.getRailPoint('bend-2', sliding.distance).rotation), 1)));
    }
    assert.ok(slowest < 120, `slowed for the bend: ${slowest}`);
    assert.ok(slip > 0.05, `the nose turned in: ${slip}`);
});

test('joining off the line eases onto it, and a body moved by something else leaves the rail', () => {
    const world = new physicsSystem(), body = car(world, [50, 3], { rotation: 0.05 }), events = [];
    world.on('railDisplaced', event => events.push(event.rail_id));
    world.rails.registerRail('lane', { points: [[0, 0], [5000, 0]] });
    world.rails.rideRail(body, { rail_id: 'lane', speed: 100 });
    tick(world, 1); assert.ok(Math.abs(body.position[1] - 3) < 0.5, 'not snapped');
    tick(world, 120); near(body.position[1], 0, 0.06); near(body.rotation, 0, 0.003);
    world.updateBody(body, { position: [body.position[0], 40] });
    tick(world, 1);
    assert.deepEqual(events, ['lane']); assert.equal(world.rails.isRiding(body), false);
});

test('rails and riders survive a save, and bad requests fail early', () => {
    const world = new physicsSystem(), body = car(world);
    world.rails.registerRail('a', { points: [[0, 0], [300, 0]], next_rail_id: 'b' });
    world.rails.registerRail('b', { points: [[300, 0], [300, 3000]] });
    world.rails.rideRail(body, { rail_id: 'a', speed: 150, profile: { top_speed: 250 } });
    tick(world, 30);
    const copy = new physicsSystem(); copy.loadPhysicsState(world.savePhysicsState());
    tick(world, 200); tick(copy, 200);
    const original = world.rails.getRiderState(body), restored = copy.rails.getRiderState(body.body_id);
    assert.equal(restored.rail_id, original.rail_id); near(restored.distance, original.distance, 1e-9); near(restored.speed, original.speed, 1e-9);
    assert.throws(() => world.rails.registerRail('a', { points: [[0, 0], [1, 0]] }));
    assert.throws(() => world.rails.rideRail(body, { rail_id: 'nowhere' }));
    assert.throws(() => world.rails.rideRail(body, { rail_id: 'a', profile: { grip: 1 } }));
    assert.throws(() => world.rails.removeRail(original.rail_id));
    world.removeBody(body); tick(world, 1);
    assert.deepEqual(world.rails.getRailRiders(original.rail_id), []);
});

// The lane runners the city drives today, tick for tick: the same two cars, the same lane, curve and stop line, run
// through the old rail kit in its own units (per tick) and through the engine in seconds. This check goes when the kit does.
const KIT = fileURLToPath(new URL('../../lane-rail-kit.js', import.meta.url));
test('the engine drives a lane exactly as the lane runners do', { skip: !existsSync(KIT) }, () => {
    const railKit = new Function(`${readFileSync(KIT, 'utf8')}\nreturn railKit;`)();
    const RUN = { LOOK_BASE: 60, LOOK_PER_SPEED: 8, SLIDE_PER_ACC: 14, SLIDE_MAX: 2.6, SLIDE_EASE: 0.2, SLIP_MAX: 0.7 };
    // lane A (straight, 1500) -> a quarter turn of radius 220 -> lane B (straight, 3000)
    const RADIUS = 220, curvePoint = t => ({ x: 1500 + RADIUS * Math.sin(t * Math.PI / 2), y: RADIUS * (1 - Math.cos(t * Math.PI / 2)) }), curveAngle = t => t * Math.PI / 2;
    const curve = railKit.table(curvePoint, curveAngle, 24);
    const lanes = [{ length: 1500, at: s => ({ x: s, y: 0, a: 0, k: 0 }) }, { length: curve.length, at: s => railKit.at(curve, s, {}) },
        { length: 3000, at: s => ({ x: 1500 + RADIUS, y: RADIUS + s, a: Math.PI / 2, k: 0 }) }];
    const cars = [   // per tick, as vehicles.json holds them
        { rail: 0, s: 400, v: 0, top: 5.2, acc: 0.11, brake: 0.3, length: 44, slide: 0 },
        { rail: 0, s: 60, v: 3, top: 6.4, acc: 0.16, brake: 0.34, length: 38, slide: 0 },
    ];
    // the game's policy over time, the same for both: a red light on lane A, then a slow zone, then clear
    const policy = (tickNumber, index) => index === 0
        ? { stop: tickNumber < 420 ? 1300 : null, cap: tickNumber > 600 && tickNumber < 800 ? 1.5 : null }
        : { stop: null, cap: null };

    const world = new physicsSystem(), bodies = cars.map(entry => car(world, [entry.s, 0]));
    world.rails.registerRail('0', { points: [[0, 0], [1500, 0]], next_rail_id: '1' });
    world.rails.registerRail('1', { points: Array.from(curve.x, (x, i) => [x, curve.y[i]]), rotations: [...curve.a], next_rail_id: '2' });
    world.rails.registerRail('2', { points: [[1500 + RADIUS, RADIUS], [1500 + RADIUS, RADIUS + 3000]] });
    cars.forEach((entry, i) => world.rails.rideRail(bodies[i], { rail_id: '0', distance: entry.s, speed: entry.v * 60, profile: {
        top_speed: entry.top * 60, acceleration: entry.acc * 3600, braking: entry.brake * 3600, body_length: entry.length, min_gap: 12 + entry.length * 0.18,
        look_base: RUN.LOOK_BASE, look_seconds: RUN.LOOK_PER_SPEED / 60, slide_per_acceleration: RUN.SLIDE_PER_ACC / 60, slide_max: RUN.SLIDE_MAX * 60,
        slide_ease_rate: -Math.log(1 - RUN.SLIDE_EASE) * 60, slip_max: RUN.SLIP_MAX } }));

    const ahead = (me, other) => {          // distance from me to other along the rails, or null when it is behind
        let total = -me.s;
        for (let rail = me.rail; rail < lanes.length; rail++) { if (rail === other.rail) { total += other.s; return total > 0 ? total : null; } total += lanes[rail].length; }
        return null;
    };
    let worst = { distance: 0, speed: 0, slide: 0, position: 0, rotation: 0 }, slid = 0, queued = false;
    for (let tickNumber = 0; tickNumber < 1300; tickNumber++) {
        cars.forEach((me, index) => {
            const { stop, cap } = policy(tickNumber, index), v = me.v, b = me.brake;
            const look = RUN.LOOK_BASE + me.length + v * v / (2 * b) + v * RUN.LOOK_PER_SPEED;
            let target = me.top;
            if (cap !== null) target = Math.min(target, cap);
            for (const other of cars) {
                if (other === me) continue;
                const centres = ahead(me, other); if (centres === null) continue;
                const gap = centres - me.length / 2 - other.length / 2;
                if (gap < look) target = Math.min(target, railKit.followCap(gap, v, other.v, b, other.brake, 12 + me.length * 0.18));
            }
            if (stop !== null && me.rail === 0) { const room = stop - me.s; target = Math.min(target, room < 2 ? 0 : Math.sqrt(2 * b * 0.8 * room)); }
            let next = Math.max(0, railKit.roll(v, railKit.throttle(v, target, b, 0.6), me.acc, b, me.top));
            if (Math.abs(next) < 0.0005) next = 0;
            me.v = next; me.s += next;
            while (me.s >= lanes[me.rail].length && me.rail < lanes.length - 1) { me.s -= lanes[me.rail].length; me.rail++; }
            const P = lanes[me.rail].at(me.s);
            const want = Math.max(-RUN.SLIDE_MAX, Math.min(RUN.SLIDE_MAX, -RUN.SLIDE_PER_ACC * next * next * P.k));
            me.slide += (want - me.slide) * RUN.SLIDE_EASE;
            me.x = P.x; me.y = P.y; me.angle = P.a - Math.asin(Math.max(-RUN.SLIP_MAX, Math.min(RUN.SLIP_MAX, me.slide / Math.max(0.5, Math.abs(next)))));
        });
        cars.forEach((_, index) => { const { stop, cap } = policy(tickNumber, index); world.rails.setRiderLimits(bodies[index], { stop_distance: stop, speed_cap: cap === null ? null : cap * 60 }); });
        tick(world);
        cars.forEach((me, index) => {
            const state = world.rails.getRiderState(bodies[index]), body = bodies[index];
            assert.equal(state.rail_id, String(me.rail), `tick ${tickNumber}: car ${index} is on the same rail`);
            worst.distance = Math.max(worst.distance, Math.abs(state.distance - me.s)); worst.speed = Math.max(worst.speed, Math.abs(state.speed / 60 - me.v));
            worst.slide = Math.max(worst.slide, Math.abs(state.slide / 60 - me.slide));
            worst.position = Math.max(worst.position, Math.hypot(body.position[0] - me.x, body.position[1] - me.y));
            worst.rotation = Math.max(worst.rotation, Math.abs(Math.atan2(Math.sin(body.rotation - me.angle), Math.cos(body.rotation - me.angle))));
            slid = Math.max(slid, Math.abs(me.slide));
        });
        if (tickNumber === 410 && cars[0].v < 0.05 && cars[1].v < 0.05) queued = true;
    }
    assert.ok(queued, 'both waited at the red light'); assert.ok(slid > 0.5, `the curve made them slide: ${slid}`); assert.equal(cars[0].rail, 2);
    for (const [key, value] of Object.entries(worst)) assert.ok(value < 1e-9, `${key} differs by ${value}`);
});
