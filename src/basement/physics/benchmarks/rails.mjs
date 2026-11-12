import { performance } from 'node:perf_hooks';
import { physicsSystem } from '../index.mjs';
// Lane traffic workload: queues of colliding kinematic bodies riding straight rails, each following the rider ahead.
// "riding" steps them through physics.rails; "moving" steps the same bodies at a plain velocity, so the difference
// between the two is what the rails themselves cost (it sits inside the run-to-run noise).
const RIDERS = Number(process.argv[2]) || 1000, PER_RAIL = 10, RAILS = RIDERS / PER_RAIL, STEPS = 600;
const shape = { shape_type: 'box', dimensions: [40, 20] };
function build(ride) {
    const world = new physicsSystem();
    for (let rail = 0; rail < RAILS; rail++) world.rails.registerRail(`lane-${rail}`, { points: [[0, rail * 60], [20000, rail * 60]] });
    for (let i = 0; i < RIDERS; i++) {
        const rail = i % RAILS, distance = Math.floor(i / RAILS) * 380 + 20;
        const body = world.createBody({ physics_type: 'kinematic', position: [distance, rail * 60], linear_velocity: ride ? [0, 0] : [200, 0], collision_shape: shape });
        if (ride) world.rails.rideRail(body, { rail_id: `lane-${rail}`, distance, speed: 150 });
    }
    return world;
}
function measure(world) {
    for (let i = 0; i < 120; i++) world.updateState(1 / 60);
    const start = performance.now();
    for (let i = 0; i < STEPS; i++) world.updateState(1 / 60);
    return (performance.now() - start) / STEPS;
}
const riding = measure(build(true)), moving = measure(build(false));
console.log(JSON.stringify({ riders: RIDERS, rails: RAILS, riding_ms_per_step: riding, moving_ms_per_step: moving }, null, 2));
