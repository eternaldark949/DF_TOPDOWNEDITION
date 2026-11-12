import { performance } from 'node:perf_hooks';
import { physicsSystem, BODY_GROUP } from '../index.mjs';
// Line-of-sight workload: static boxes the size of walls and building footprints, rays the length of a sight check.
// "exact" is raycast; "thin_sweep" is the swept thin circle it replaced, still used for predict_seconds casts.
let seed = 1; const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const world = new physicsSystem(), BODIES = 4000, SIZE = 12000, REACH = 400;
for (let i = 0; i < BODIES; i++) world.createBody({ physics_type: 'static', collision_group: BODY_GROUP.STATIC,
    position: [random() * SIZE, random() * SIZE], collision_shape: { shape_type: 'box', dimensions: [40 + random() * 200, 40 + random() * 200] } });
const rays = Array.from({ length: 20000 }, () => {
    const from = [random() * SIZE, random() * SIZE], angle = random() * Math.PI * 2;
    return { from, to: [from[0] + Math.cos(angle) * REACH, from[1] + Math.sin(angle) * REACH] };
});
function measure(cast) {
    let met = 0; const start = performance.now();
    for (const ray of rays) if (cast(ray)) met++;
    return { microseconds_per_ray: (performance.now() - start) / rays.length * 1000, met_share: met / rays.length };
}
const THIN = { shape_type: 'circle', radius: 1e-7 };
measure(ray => world.raycast(ray));                                            // warm-up
console.log(JSON.stringify({ bodies: BODIES, rays: rays.length, reach: REACH,
    exact: measure(ray => world.raycast(ray)),
    thin_sweep: measure(ray => world.shapeCast({ ...ray, collision_shape: THIN, max_results: 1 })[0]) }, null, 2));
