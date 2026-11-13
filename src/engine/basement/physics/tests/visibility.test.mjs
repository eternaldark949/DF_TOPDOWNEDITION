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
