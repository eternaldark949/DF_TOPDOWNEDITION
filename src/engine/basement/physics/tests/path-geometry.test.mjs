// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathGeometry } from '../index.mjs';
test('path projection follows accumulated segment length and clips short-path endpoint clearance', () => {
    const points = [[0, 0], [100, 0], [100, 100]], hit = pathGeometry.projectOnPath(points, [120, 80]);
    assert.deepEqual(hit.position, [100, 80]); assert.equal(hit.distance_along, 180); assert.equal(hit.rotation, Math.PI / 2);
    assert.deepEqual(pathGeometry.projectOnPath([[0, 0], [20, 0]], [0, 0], { end_clearance: 50 }).position, [10, 0]);
});
test('nearest authored path obeys range and returns the selected topology packet', () => {
    const path = { id: 'street', points: [[0, 0], [100, 0]] };
    assert.equal(pathGeometry.nearestPath([path], { position: [50, 10], near_range: 20 }).path, path);
    assert.equal(pathGeometry.nearestPath([path], { position: [50, 30], near_range: 20 }), null);
});
test('invalid authored paths and poses fail before returning nonfinite geometry', () => {
    assert.throws(() => pathGeometry.pointOnPath([[0, 0], [0, 0]], 0));
    assert.throws(() => pathGeometry.pointOnPath([[0, 0], [1, 0]], NaN));
    assert.throws(() => pathGeometry.projectOnPath([[0, 0], [1, 0]], [Infinity, 0]));
    assert.throws(() => pathGeometry.transformPose({ position: [0, 0], rotation: Infinity }));
});
