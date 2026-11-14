// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../index.mjs';
const area = points => Math.abs(points.reduce((s, [x, y], i) => { const [u, v] = points[(i + 1) % points.length]; return s + x * v - u * y; }, 0)) / 2;
test('a light with nothing near reaches a full circle', () => {
    const p = new physicsSystem(), { points } = p.getVisibilityPolygon({ origin: [0, 0], radius: 100, resolution: 128 });
    assert.equal(points.length, 128); assert.ok(Math.abs(area(points) - Math.PI * 1e4) / (Math.PI * 1e4) < 0.002);
});
test('a wall casts an exact shadow; ghosts, moving bodies and a wall holding the light do not', () => {
    const p = new physicsSystem();
    p.createEntity({ entity_type: 'static', position: [50, 0], collision_shape: { shape_type: 'box', dimensions: [10, 40] } });
    p.createEntity({ entity_type: 'static', position: [-50, 0], ghost: true, collision_shape: { shape_type: 'box', dimensions: [10, 200] } });
    p.createEntity({ entity_type: 'static', position: [0, 0], collision_shape: { shape_type: 'box', dimensions: [4, 4] } });
    p.createEntity({ entity_type: 'prop', physics_type: 'rigid', position: [0, -50], collision_shape: { shape_type: 'circle', radius: 10 } });
    const { points } = p.getVisibilityPolygon({ origin: [0, 0], radius: 100 });
    const reach = angle => { let best = null, d = Infinity; for (const q of points) { const e = Math.abs(Math.atan2(q[1], q[0]) - angle); if (e < d) { d = e; best = q; } } return Math.hypot(...best); };
    assert.ok(Math.abs(reach(0) - 45) < 1e-6, 'the wall stops the light at its face');
    assert.ok(Math.abs(reach(Math.atan2(19.9, 45)) - Math.hypot(19.9, 45)) < 0.2, 'up to its corner');
    assert.ok(Math.abs(reach(Math.atan2(21, 45)) - 100) < 1e-6, 'and not past it');
    assert.ok(Math.abs(reach(Math.PI) - 100) < 1e-6, 'a ghost casts no shadow');
    assert.ok(Math.abs(reach(-Math.PI / 2) - 100) < 1e-6, 'nor does a moving prop, unless asked');
    const withProps = p.getVisibilityPolygon({ origin: [0, 0], radius: 100, include_groups: 1 | 8 }).points;
    assert.ok(withProps.some(q => Math.abs(q[0]) < 1 && Math.abs(q[1] + 40) < .5), 'asked, it does');
});
test('blocks_light: a moving body that blocks casts a shadow, glass never blocks', () => {
    const p = new physicsSystem();
    p.createEntity({ entity_type: 'prop', physics_type: 'kinematic', blocks_light: true, position: [50, 0], collision_shape: { shape_type: 'box', dimensions: [10, 40] } });
    p.createEntity({ entity_type: 'static', blocks_light: false, position: [-50, 0], collision_shape: { shape_type: 'box', dimensions: [10, 40] } });
    const reach = (points, angle) => { let best = null, d = Infinity; for (const q of points) { const e = Math.abs(Math.atan2(q[1], q[0]) - angle); if (e < d) { d = e; best = q; } } return Math.hypot(...best); };
    const cast = p.getVisibilityPolygon({ origin: [0, 0], radius: 100 });
    assert.ok(Math.abs(reach(cast.points, 0) - 45) < 1e-6, 'the leaf stops the light');
    assert.ok(Math.abs(reach(cast.points, Math.PI) - 100) < 1e-6, 'glass does not');
    assert.ok(Math.abs(reach(p.getVisibilityPolygon({ origin: [0, 0], radius: 100, include_moving: false }).points, 0) - 100) < 1e-6, 'static only, it does not');
});
test('the light revision under a reach moves on only when a light blocker there moves, changes or goes', () => {
    const p = new physicsSystem(), rev = () => p.getLightRevision({ origin: [0, 0], radius: 100 });
    const leaf = p.createEntity({ entity_type: 'prop', physics_type: 'kinematic', blocks_light: true, position: [50, 0], collision_shape: { shape_type: 'box', dimensions: [10, 40] } });
    const walker = p.createEntity({ entity_type: 'prop', physics_type: 'rigid', position: [20, 20], collision_shape: { shape_type: 'circle', radius: 5 } });
    const far = p.createEntity({ entity_type: 'static', position: [2000, 0], collision_shape: { shape_type: 'box', dimensions: [10, 40] } });
    let r = rev(); assert.ok(r > 0, 'a blocker arriving counts');
    walker.updateBody({ position: [30, 20] }); assert.equal(rev(), r, 'a body that does not block light changes nothing');
    far.updateBody({ position: [2100, 0] }); assert.equal(rev(), r, 'nor does a blocker out of reach');
    leaf.updateBody({ rotation: .5 }); assert.ok(rev() > r, 'the leaf swinging does'); r = rev();
    leaf.updateBody({ blocks_light: false }); assert.ok(rev() > r, 'so does it ceasing to block'); r = rev();
    walker.updateBody({ position: [40, 20] }); assert.equal(rev(), r);
    const wall = p.createEntity({ entity_type: 'static', position: [-50, 0], collision_shape: { shape_type: 'box', dimensions: [10, 40] } }); assert.ok(rev() > r, 'a wall built'); r = rev();
    p.removeBody(wall.body ?? wall); assert.ok(rev() > r, 'and removed');
});
test('the sweep leaves nothing standing before its polygon, round a cluttered room of turned boxes', () => {
    const p = new physicsSystem(), rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
    for (let i = 0; i < 40; i++) p.createEntity({ entity_type: 'static', position: [rnd() * 400 - 200, rnd() * 400 - 200], rotation: rnd() * 3, collision_shape: { shape_type: 'box', dimensions: [10 + rnd() * 40, 5 + rnd() * 20] } });
    const { points } = p.getVisibilityPolygon({ origin: [0, 0], radius: 220, resolution: 128 });
    let open = 0;
    for (const [x, y] of points) {
        const hit = p.raycast({ from: [0, 0], to: [x * .999, y * .999], include_groups: 1, include_ghosts: false });
        assert.ok(!hit?.body, `nothing stands before the polygon at ${x.toFixed(1)}, ${y.toFixed(1)}`);
        if (Math.hypot(x, y) > 219.9) open++;
    }
    assert.ok(open > 10 && open < points.length, 'some rays run out to the reach, some are stopped');
});
