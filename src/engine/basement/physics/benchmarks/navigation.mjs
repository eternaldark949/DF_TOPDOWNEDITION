// ===== LV0 BASEMENT =====
import { performance } from 'node:perf_hooks';
import { physicsSystem, BODY_GROUP } from '../index.mjs';

/**
 * Navigation measurements on a seeded city-block layout.
 * `legacy` is the previous findPath (bounded A* testing every edge with a
 * shared-grid shape cast), kept here only as a reference point.
 */
let seed = 7; const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
function city(world, blocks = 12, block = 220, street = 60) {
    const pitch = block + street;
    for (let i = 0; i < blocks; i++) for (let j = 0; j < blocks; j++) {
        const x = i * pitch + block / 2, y = j * pitch + block / 2;
        // Each block is a building with a courtyard gap, plus a few props on the pavement.
        world.createBody({ physics_type: 'static', collision_group: BODY_GROUP.STATIC, position: [x - block / 4 - 10, y], collision_shape: { shape_type: 'box', dimensions: [block / 2 - 20, block] } });
        world.createBody({ physics_type: 'static', collision_group: BODY_GROUP.STATIC, position: [x + block / 4 + 10, y], collision_shape: { shape_type: 'box', dimensions: [block / 2 - 20, block - 80] } });
        for (let k = 0; k < 3; k++) world.createBody({ physics_type: 'static', position: [x + (random() - 0.5) * pitch, y + block / 2 + street / 2 + (random() - 0.5) * 20], collision_shape: { shape_type: 'circle', radius: 4 + random() * 4 } });
    }
    return blocks * pitch;
}
function legacyFindPath(world, { from, to, radius, node_spacing = Math.max(8, radius), max_nodes = 2048, search_margin = node_spacing * 16 }) {
    const shape = { shape_type: 'circle', radius }, clear = (a, b) => world.getPathClearance({ collision_shape: shape, from: a, to: b, include_ghosts: false }).clear;
    if (clear(from, to)) return { points: [from, to] };
    const size = node_spacing, bounds = { left: Math.min(from[0], to[0]) - search_margin, right: Math.max(from[0], to[0]) + search_margin, top: Math.min(from[1], to[1]) - search_margin, bottom: Math.max(from[1], to[1]) + search_margin };
    const heap = [], nodes = new Map(), point = (x, y) => [from[0] + x * size, from[1] + y * size], d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const push = n => { heap.push(n); heap.sort((a, b) => a.f - b.f); };
    const first = { x: 0, y: 0, g: 0, f: d(from, to), parent: null }; nodes.set('0,0', first); push(first);
    let visited = 0;
    while (heap.length && visited < max_nodes) {
        const n = heap.shift(); if (n.closed) continue; n.closed = true; visited++;
        const at = point(n.x, n.y);
        if (d(at, to) <= size * 1.5 && clear(at, to)) { const path = [to]; for (let c = n; c; c = c.parent) path.push(point(c.x, c.y)); return { points: path.reverse() }; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const x = n.x + dx, y = n.y + dy, p = point(x, y);
            if (p[0] < bounds.left || p[0] > bounds.right || p[1] < bounds.top || p[1] > bounds.bottom) continue;
            const k = `${x},${y}`, old = nodes.get(k), g = n.g + size * Math.hypot(dx, dy);
            if ((old && old.g <= g) || !clear(at, p)) continue;
            const next = { x, y, g, f: g + d(p, to), parent: n }; nodes.set(k, next); push(next);
        }
    }
    return null;
}
const world = new physicsSystem(), extent = city(world);
const pickOpen = () => { for (;;) { const p = [random() * extent, random() * extent]; if (world.navigation.field.exactSegmentClearance(p, p, 12) >= 12) return p; } };
const trips = (count, maxDistance) => Array.from({ length: count }, () => { const a = pickOpen(); let b; do b = pickOpen(); while (Math.hypot(b[0] - a[0], b[1] - a[1]) > maxDistance); return [a, b]; });
const rows = [];
const time = (label, list, fn) => {
    const start = performance.now(); let found = 0, points = 0, length = 0;
    for (const [a, b] of list) { const r = fn(a, b); if (r) { found++; points += r.points.length; length += r.points.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - r.points[i][0], p[1] - r.points[i][1]), 0); } }
    const ms = performance.now() - start;
    rows.push({ case: label, queries: list.length, found, mean_ms: +(ms / list.length).toFixed(3), mean_points: +(points / Math.max(1, found)).toFixed(1), mean_length: +(length / Math.max(1, found)).toFixed(1) });
};
const short = trips(200, 500), long = trips(60, 3000);
time('field, cold chunks (short trips)', short, (a, b) => world.navigation.findPath({ from: a, to: b, radius: 10 }));
time('field, warm chunks (short trips, new starts)', short.map(([a, b]) => [[a[0] + 17, a[1] + 9], b]), (a, b) => world.navigation.findPath({ from: a, to: b, radius: 10 }));
time('field, warm chunks (long trips)', long, (a, b) => world.navigation.findPath({ from: a, to: b, radius: 10, max_nodes: 200000 }));
time('field, long trips, optimal weight 1', long.map(([a, b]) => [[a[0] + 17, a[1] + 9], b]), (a, b) => world.navigation.findPath({ from: a, to: b, radius: 10, max_nodes: 200000, heuristic_weight: 1 }));
const previous = short.map(([a, b]) => world.navigation.findPath({ from: a, to: b, radius: 10 }));
const reuseList = short.map((trip, i) => [trip[0], trip[1], previous[i]]);
{
    const start = performance.now(); let reused = 0;
    for (const [a, b, prior] of reuseList) if (world.navigation.findPath({ from: a, to: b, radius: 10, reuse: prior }) === prior && prior) reused++;
    rows.push({ case: 'field, unchanged path reuse', queries: reuseList.length, found: reused, mean_ms: +((performance.now() - start) / reuseList.length).toFixed(4), mean_points: null });
}
time('legacy shape-cast A* (short trips, 40 sampled)', short.slice(0, 40), (a, b) => legacyFindPath(world, { from: a, to: b, radius: 10 }));
console.log(JSON.stringify({ world_extent: extent, bodies: world.getStatistics().bodies, rows, navigation: world.navigation.getStatistics() }, null, 2));
