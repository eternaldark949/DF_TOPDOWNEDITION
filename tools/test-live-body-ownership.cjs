'use strict';
// Cutover gate against the actual generated playable game, not the ESM demonstration.
// A nonzero result is expected until every live physical actor uses the session world.
const { join } = require('node:path');
const { runtime } = require('./test-game-runtime.cjs');
const env = runtime(join(__dirname, '..', 'DFAB V8.html'));
const report = structuredClone(env.run(`(() => {
    game.story.update = () => {}; game._doLoadMap('apt_949'); game.running = true; game.paused = false;
    const failures = [], check = (condition, message) => { if (!condition) failures.push(message); };
    const world = game.physics_system;
    check(!!world && typeof world.fetchBody === 'function' && typeof world.attachBody === 'function', 'GameEngine has no official physics_system session world');
    const subjects = [ ['player', game.player], ['owned car', game.ownedCar],
        ...(game.props || []).map((e, i) => ['prop ' + i, e]),
        ...(game.enemies || []).map((e, i) => ['enemy ' + i, e]),
        ...(game.projectiles || []).map((e, i) => ['projectile ' + i, e]),
        ...(game.traffic?.vehicles || []).map((e, i) => ['traffic ' + i, e]),
        ...(game.pedestrians?.pedestrians || []).map((e, i) => ['pedestrian ' + i, e]) ];
    let examined = 0;
    for (const [label, entity] of subjects) {
        if (!entity || (label !== 'player' && label !== 'owned car' && !entity.hasCollision && !entity.body_id)) continue;
        examined++;
        check(!!world && entity.physics_system === world && world.fetchBody(entity.body_id) === entity.body, label + ' does not own an official body in the session world');
        for (const field of ['x', 'y', 'vx', 'vy', 'angularVel']) {
            const d = Object.getOwnPropertyDescriptor(entity, field);
            check(!d || !Object.hasOwn(d, 'value'), label + ' stores legacy physical field ' + field);
        }
    }
    check(typeof CollisionSystem === 'undefined', 'Legacy CollisionSystem is still loaded');
    check(typeof collisionWorld === 'undefined', 'Legacy collisionWorld is still loaded');
    check(typeof GameEntity === 'undefined', 'Legacy GameEntity base is still loaded');
    if (world && typeof world.fetchBody === 'function' && game.player?.physics_system === world) {
        const tick = world.simulation_tick; game.stepWorld();
        check(world.simulation_tick === tick + 1, 'One playable simulation step must advance the official world exactly once');
        const command = world._command, writes = [];
        world._command = function(body, action, packet) { writes.push(action); return command.call(this, body, action, packet); };
        try { game.draw(); } finally { world._command = command; }
        check(writes.length === 0, 'Rendering issued physical commands: ' + writes.join(', '));
    }
    return { passed: !failures.length, examined_entities: examined, failures };
})()`));
if (env.errors.length) { report.passed = false; report.failures.push(...env.errors.map(e => 'Game runtime: ' + String(e))); }
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
