import { performance } from 'node:perf_hooks';
import { physicsSystem } from '../index.mjs';
const rows = [];
for (const count of [100, 1000, 5000]) {
    const p = new physicsSystem({ cell_size: 32 });
    for (let i = 0; i < count; i++) p.createBody({ position: [i * 100, 0], continuous_collision: false });
    p.updateState();
    const before = p.getStatistics(), start = performance.now();
    for (let i = 0; i < 10; i++) p.updateState();
    const elapsed = performance.now() - start, after = p.getStatistics();
    rows.push({ bodies: count, mean_ms: elapsed / 10, candidate_pairs_per_step: (after.candidate_pairs - before.candidate_pairs) / 10,
        candidate_visits_per_step: (after.spatial.candidate_visits - before.spatial.candidate_visits) / 10, hypothetical_all_pairs: count * (count - 1) / 2 });
}
console.log(JSON.stringify({ note: 'Sparse-scene broadphase measurement, not a DFAB/device FPS claim. Run on the same machine for comparisons.', rows }, null, 2));
