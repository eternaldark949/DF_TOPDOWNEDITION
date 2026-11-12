import { performance } from 'node:perf_hooks';
import { spatialGrid as defaultGrid } from '../index.mjs';

/**
 * spatialGrid micro-benchmark: moving crowds, scenery of mixed sizes and the
 * query mix the engine issues each step. Pass another module path to compare:
 *   node benchmarks/grid.mjs [path/to/grid.mjs]
 */
const spatialGrid = process.argv[2] ? (await import(new URL(process.argv[2], `file://${process.cwd()}/`).href)).spatialGrid : defaultGrid;
let seed = 3; const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const box = (x, y, w, h) => ({ left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 });
function scene({ movers, buildings, cell_size = 128, extent = 6000 }) {
    const grid = new spatialGrid({ cell_size }), bodies = [];
    let id = 1;
    for (let i = 0; i < buildings; i++) { const w = 200 + random() * 900, h = 200 + random() * 900; grid.registerInstance(id, box(random() * extent, random() * extent, w, h), { body_id: id }); id++; }
    for (let i = 0; i < movers; i++) {
        const b = { id, x: random() * extent, y: random() * extent, vx: (random() - 0.5) * 6, vy: (random() - 0.5) * 6, r: 6 + random() * 10 };
        grid.registerInstance(id, box(b.x, b.y, b.r * 2, b.r * 2), { body_id: id }); bodies.push(b); id++;
    }
    return { grid, bodies, extent };
}
function run(label, options, steps = 120) {
    const { grid, bodies, extent } = scene(options), out = [], pairs = [];
    let checksum = 0;
    const start = performance.now();
    for (let s = 0; s < steps; s++) {
        for (const b of bodies) { b.x += b.vx; b.y += b.vy; grid.updateInstance(b.id, box(b.x, b.y, b.r * 2, b.r * 2)); }
        const moving = bodies.map(b => ({ id: b.id }));
        checksum += grid.collectCandidatePairs(moving, pairs).length;
        for (let q = 0; q < 200; q++) {
            const x = random() * extent, y = random() * extent;
            checksum += grid.queryRadius([x, y], 150, out).length;
            checksum += grid.querySegment([x, y], [x + 400, y + 300], out).length;
            checksum += grid.querySweep({ from: [x, y], to: [x - 300, y + 200], radius: 24 }, out).length;
        }
    }
    const ms = performance.now() - start;
    return { case: label, movers: options.movers, buildings: options.buildings, ms_per_step: +(ms / steps).toFixed(3), checksum };
}
const rows = [];
for (let warm = 0; warm < 2; warm++) rows.length = 0, rows.push(
    run('crowd, sparse scenery', { movers: 2000, buildings: 50 }),
    run('crowd, dense city blocks', { movers: 2000, buildings: 600 }),
    run('busy club (small area)', { movers: 1500, buildings: 20, extent: 1500 }),
);
console.log(JSON.stringify(rows, null, 2));
