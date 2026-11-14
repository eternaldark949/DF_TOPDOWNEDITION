// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, BODY_GROUP } from '../index.mjs';

const wall = (p, position, dimensions, extra = {}) => p.createBody({ position, physics_type: 'static', collision_group: BODY_GROUP.STATIC, collision_shape: { shape_type: 'box', dimensions }, ...extra });
const tick = (p, n = 1) => { for (let i = 0; i < n; i++) p.updateState(); };
const pathLength = points => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
const assertClear = (p, points, radius) => {
    for (let i = 1; i < points.length; i++) {
        const hit = p.shapeCast({ collision_shape: { shape_type: 'circle', radius }, from: points[i - 1], to: points[i], include_groups: BODY_GROUP.STATIC | BODY_GROUP.PROP, max_results: 1 });
        assert.equal(hit.length, 0, `segment ${i} ${JSON.stringify(points[i - 1])}->${JSON.stringify(points[i])} touches an obstacle`);
    }
};
// Two halves of the world joined only by a door gap in a long wall at x = 0.
const doorway = (p, gap) => { wall(p, [0, -2000 - gap / 2], [10, 4000]); wall(p, [0, 2000 + gap / 2], [10, 4000]); };

test('the clearance field stores exact distances at cell centres and zero inside obstacles', () => {
    const p = new physicsSystem();
    wall(p, [100, 100], [40, 20]);
    p.createBody({ physics_type: 'static', position: [300, 100], collision_shape: { shape_type: 'circle', radius: 10 } });
    const f = p.navigation.field, at = (x, y) => f.clearanceAtCell(f.cellOf(x), f.cellOf(y));
    assert.equal(at(100, 100), 0);
    // Cell centre (100+... ) right of the box: box right edge is x=120.
    const gx = f.cellOf(140), centre = f.cellCenter(gx);
    assert.ok(Math.abs(f.clearanceAtCell(gx, f.cellOf(100)) - (centre - 120)) < 1e-4);
    const cx = f.cellOf(330), cy = f.cellOf(100), expected = Math.hypot(f.cellCenter(cx) - 300, f.cellCenter(cy) - 100) - 10;
    assert.ok(Math.abs(f.clearanceAtCell(cx, cy) - expected) < 1e-4);
    assert.equal(at(1000, 1000), f.max_clearance);
});

test('paths route around walls, keep the agent clear and stay close to optimal', () => {
    const p = new physicsSystem(); doorway(p, 40);
    const path = p.navigation.findPath({ from: [-200, -300], to: [200, -300], radius: 10 });
    assert.ok(path && !path.partial);
    assert.deepEqual(path.points[0], [-200, -300]); assert.deepEqual(path.points.at(-1), [200, -300]);
    assertClear(p, path.points, 10);
    const optimal = 2 * Math.hypot(200, 300);
    assert.ok(path.length < optimal * 1.08, `${path.length} vs ${optimal}`);
    assert.ok(path.points.length <= 5, `string pulling left ${path.points.length} points`);
});

test('door width decides passage for each agent radius', () => {
    const p = new physicsSystem(); doorway(p, 30);
    assert.ok(p.navigation.findPath({ from: [-100, 0], to: [100, 0], radius: 12 }));
    assert.equal(p.navigation.findPath({ from: [-100, 0], to: [100, 0], radius: 16, search_margin: 120 }), null);
    const partial = p.navigation.findPath({ from: [-100, 0], to: [100, 0], radius: 16, search_margin: 120, allow_partial: true });
    assert.equal(partial.partial, true); assert.ok(partial.points.at(-1)[0] < 0);
});

test('blocked destinations fail by default or end at the nearest open point', () => {
    const p = new physicsSystem(); wall(p, [200, 0], [60, 60]);
    assert.equal(p.navigation.findPath({ from: [0, 0], to: [200, 0], radius: 8 }), null);
    const near = p.navigation.findPath({ from: [0, 0], to: [200, 0], radius: 8, allow_partial: true });
    assert.equal(near.partial, true);
    const end = near.points.at(-1);
    assert.ok(Math.hypot(end[0] - 200, end[1]) < 50, JSON.stringify(end));
    assertClear(p, near.points, 8);
});

test('unchanged paths are reused for free and only invalidated by nearby obstacle changes', () => {
    const p = new physicsSystem(); doorway(p, 40);
    const first = p.navigation.findPath({ from: [-200, -300], to: [200, -300], radius: 10 });
    const before = p.navigation.getStatistics();
    const again = p.navigation.findPath({ from: [-190, -300], to: [200, -300], radius: 10, reuse: first });
    assert.equal(again, first); assert.equal(again.reused, true);
    assert.equal(p.navigation.getStatistics().planner.expanded_nodes, before.planner.expanded_nodes);
    // A far-away obstacle does not invalidate the path.
    wall(p, [5000, 5000], [20, 20]);
    assert.equal(p.navigation.findPath({ from: [-190, -300], to: [200, -300], radius: 10, reuse: first }), first);
    // Closing the door does.
    const door = wall(p, [0, 0], [10, 40]);
    assert.notEqual(p.navigation.findPath({ from: [-190, -300], to: [200, -300], radius: 10, reuse: first, search_margin: 400 }), first);
    assert.equal(p.navigation.findPath({ from: [-190, -300], to: [200, -300], radius: 10, search_margin: 400 }), null);
    p.removeBody(door);
    assert.ok(p.navigation.findPath({ from: [-190, -300], to: [200, -300], radius: 10, search_margin: 400 }));
});

test('moving characters never dirty the field; chunk rebuilds stay local to the change', () => {
    const p = new physicsSystem(); doorway(p, 40);
    for (let i = 0; i < 20; i++) p.createCharacter({ position: [-300 + i * 30, 300] }).setMovement([0, -1]);
    p.navigation.findPath({ from: [-200, -300], to: [200, -300], radius: 10 });
    const built = p.navigation.getStatistics().field.chunk_builds;
    tick(p, 30);
    p.navigation.findPath({ from: [-200, -300], to: [200, -300], radius: 10 });
    assert.equal(p.navigation.getStatistics().field.chunk_builds, built);
    wall(p, [-150, -150], [10, 10]);
    p.navigation.findPath({ from: [-200, -300], to: [200, -300], radius: 10 });
    const rebuilt = p.navigation.getStatistics().field.chunk_builds - built;
    assert.ok(rebuilt >= 1 && rebuilt <= 4, `rebuilt ${rebuilt} chunks`);
});

test('a moved goal repairs only the last leg of a reused path', () => {
    const p = new physicsSystem(); doorway(p, 40);
    const first = p.navigation.findPath({ from: [-200, -300], to: [200, -300], radius: 10 });
    const repaired = p.navigation.findPath({ from: [-200, -300], to: [205, -296], radius: 10, reuse: first });
    assert.equal(repaired, first); assert.deepEqual(repaired.points.at(-1), [205, -296]);
    assert.equal(p.navigation.getStatistics().goal_repairs, 1);
    assertClear(p, repaired.points, 10);
});

test('characters walk through a maze to their destination with navigate', () => {
    const p = new physicsSystem();
    wall(p, [100, -60], [10, 280]); wall(p, [200, 60], [10, 280]);
    const actor = p.createCharacter({ position: [0, 0], collision_shape: { shape_type: 'circle', radius: 8 }, movement: { max_speed: 160 } });
    let arrived = 0; p.on('destinationReached', () => arrived++);
    const plan = p.navigation.navigate(actor, [300, 0]);
    assert.equal(plan.layer, 'field'); assert.ok(plan.points.length > 2);
    tick(p, 60 * 8);
    assert.equal(arrived, 1);
    assert.ok(Math.hypot(actor.position[0] - 300, actor.position[1]) < 4, JSON.stringify(actor.position));
    // The motor reused its path instead of re-searching every replan interval.
    const stats = p.navigation.getStatistics();
    assert.ok(stats.path_reuses + stats.path_memo_hits >= 10, JSON.stringify(stats));
    assert.ok(stats.planner.searches <= 4, JSON.stringify(stats.planner));
});

const grid = p => {
    const r = p.navigation.roads;
    for (const [id, x, y] of [['a', 0, 0], ['b', 500, 0], ['c', 1000, 0], ['d', 0, 500], ['e', 500, 500], ['f', 1000, 500]]) r.addNode(id, { position: [x, y] });
    r.addLane('ab', { from: 'a', to: 'b', two_way: true, speed_limit: 100 });
    r.addLane('bc', { from: 'b', to: 'c', two_way: true, speed_limit: 100 });
    r.addLane('de', { from: 'd', to: 'e', two_way: true, speed_limit: 300 });
    r.addLane('ef', { from: 'e', to: 'f', two_way: true, speed_limit: 300 });
    r.addLane('ad', { from: 'a', to: 'd', two_way: true, speed_limit: 300 });
    r.addLane('be', { from: 'b', to: 'e', two_way: true, speed_limit: 100 });
    r.addLane('cf', { from: 'c', to: 'f', two_way: true, speed_limit: 300, points: [[1100, 250]] });
    return r;
};

test('road routes minimise travel time, honour closures and cache node routes', () => {
    const p = new physicsSystem(), r = grid(p);
    // The fast avenue (d-e-f) beats the slow direct street (a-b-c).
    let route = p.navigation.findRoute({ from: [10, 2], to: [990, -2] });
    // Ends snap onto the nearest usable lanes, here the avenue's own side streets.
    assert.deepEqual(route.lanes, ['ad', 'de', 'ef', 'cf:reverse']);
    assert.ok(Math.hypot(route.points[0][0] - 10, route.points[0][1] - 2) <= 10);
    assert.ok(Math.hypot(route.points.at(-1)[0] - 990, route.points.at(-1)[1] + 2) <= 12);
    // Same lane, forward: a direct slice.
    route = p.navigation.findRoute({ from: [100, 3], to: [400, 3] });
    assert.deepEqual(route.lanes, ['ab']); assert.equal(route.length, 300);
    r.setLaneOpen('de', false);
    route = p.navigation.findRoute({ from: [10, 2], to: [990, -2] });
    assert.ok(!route.lanes.includes('de'), route.lanes.join());
    const before = r.getStatistics();
    p.navigation.findRoute({ from: [10, 2], to: [990, -2] });
    assert.ok(r.getStatistics().route_cache_hits > before.route_cache_hits);
    assert.equal(p.navigation.findRoute({ from: [5000, 5000], to: [0, 0] }), null);
    assert.throws(() => r.addLane('bad', { from: 'a', to: 'zzz' }));
});

test('lanes use the shared spatial grid but are not saved as generic spatial instances', () => {
    const p = new physicsSystem(); grid(p);
    assert.ok(p.spatial_grid.queryRadius([250, 0], 5).some(v => v.navigation_lane === 'ab'));
    const saved = p.savePhysicsState();
    assert.equal(saved.spatial_instances.length, 0);
    const copy = new physicsSystem(); copy.loadPhysicsState(saved);
    assert.equal(copy.navigation.roads.getStatistics().lanes, 14);
    assert.deepEqual(copy.navigation.findRoute({ from: [10, 2], to: [990, -2] }).lanes, p.navigation.findRoute({ from: [10, 2], to: [990, -2] }).lanes);
});

test('vehicles drive a navigated lane route to the destination', () => {
    const p = new physicsSystem(); grid(p);
    const car = p.createVehicle({ position: [20, 0], vehicle_template: { max_speed: 400, acceleration: 300, braking: 400 } });
    let arrived = 0; p.on('destinationReached', () => arrived++);
    const plan = p.navigation.navigate(car, [480, 500], { arrival_distance: 12 });
    assert.equal(plan.layer, 'road');
    tick(p, 60 * 20);
    assert.equal(arrived, 1);
    assert.ok(Math.hypot(car.position[0] - 480, car.position[1] - 500) < 30, JSON.stringify(car.position));
});

test('field configuration and profiles are validated and survive saves', () => {
    const p = new physicsSystem({ navigation: { field: { cell_size: 4, max_clearance: 48 } } });
    assert.equal(p.navigation.field.cell_size, 4);
    assert.throws(() => p.navigation.findPath({ from: [0, 0], to: [10, 0], radius: 47 }), RangeError);
    assert.throws(() => p.navigation.registerProfile('boat', { layer: 'sea' }));
    p.navigation.registerProfile('bus', { layer: 'road', near_range: 50 });
    const copy = new physicsSystem(); copy.loadPhysicsState(p.savePhysicsState());
    assert.equal(copy.navigation.field.cell_size, 4); assert.equal(copy.navigation.getProfile('bus').near_range, 50);
});
