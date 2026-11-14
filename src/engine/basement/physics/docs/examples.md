# Practical examples

Import `physicsSystem` and constants from `../index.mjs` (adjust relative paths for your project). These examples supply definitions and intentions; collision calculations stay in the engine.

## Characters and forced movement

```js
const physics = new physicsSystem();
const actor = physics.createCharacter({
    position: [100, 100], mass: 15,
    collision_shape: { shape_type: 'circle', radius: 12 },
    movement: { max_speed: 150, acceleration: 600 }
});
actor.setMovement([1, 0]);
physics.updateState();
actor.moveTo([250, 100]);
actor.followTarget([300, 120], { arrival_distance: 30 });
actor.lookAtTarget([300, 120]);
actor.dashTo([200, 100], { speed: 400 });
actor.teleportTo([400, 100]);
```

For a hit, use `actor.physics_controller.body.applyImpact({source_body, strength:120, world_point})`. The engine computes direction, mass response and torque. Gameplay chooses the configured strength and damage separately. `cancelMovement()` cancels steering; `stopMovement()` also clears current motion.

## Vehicles and a route

```js
const vehicle = physics.createVehicle({
    position: [100, 300], mass: 1000,
    collision_shape: { shape_type: 'box', dimensions: [64, 34] },
    vehicle_template: { max_speed: 180, acceleration: 80, braking: 150 }
});
vehicle.accelerateVehicle(0.7);
vehicle.steerVehicle(0.2);
vehicle.followPath([[100, 300], [300, 300], [300, 450]], {
    speed: 100, following_distance: 8
});
```

The engine derives steering, speed, clearance and braking from this route. Route selection, signals and right-of-way rules will be supplied by the future game adapter. This baseline path follower is not the finished replacement for DFAB's traffic behavior.

## Projectiles and hit events

```js
physics.on('projectileHit', hit => {
    if (hit.sensor_only) return;
    // Tell the game's combat/effects systems using target_body.body_id,
    // world_point and impact_scale. Do not push target positions here.
});
const shot = physics.createProjectile({
    position: actor.physics_controller.body.position,
    target: [500, 100], owner_id: actor.body_id,
    speed: 600, lifetime: 2, impact_strength: 120,
    penetration_count: 1, penetration_loss: 0.25,
    collision_shape: { shape_type: 'circle', radius: 2 }
});
shot.redirectProjectile([0, 1]);
```

The engine calculates the initial direction from `target`. Physical masks, owner exclusion, penetration order, repeat suppression and impulse application all live inside it.

## Queries and furniture

```js
const nearby = physics.peruseNearbyEntities(actor, { near_range: 200 });
const ray = physics.raycast({ from: [100, 100], to: [500, 100] });
const clear = physics.getPathClearance({
    body: actor, from: actor.physics_controller.body.position, to: [300, 100]
});
const crate = physics.createBody({
    position: [300, 200], mass: 10,
    collision_shape: { shape_type: 'box', dimensions: [30, 40] }
});
const drag = physics.beginDrag(crate, { world_target: [320, 200] });
physics.setDragTarget(drag, [340, 200]);
physics.endDrag(drag);
```

Create a door with a box body and `createConstraint({constraint_type:'hinge', body_a:door, local_anchor_a:[-20,0], world_target:[300,200], min_rotation:-1.5, max_rotation:1.5})`. The engine calculates anchor motion, torque and contacts.

## Particles, chain anchors and saving

```js
const pool = physics.createParticlePool({ capacity: 100, lifetime: 1 });
physics.emitParticles(pool, { count: 4, position: [100, 100], linear_velocity: [20, 10] });
const chain = physics.createChain({ points: [[100,100], [100,110], [100,120]] });
physics.setChainAnchors(chain, [[110, 100]]);

const state = physics.savePhysicsState();
const restored = new physicsSystem(state.config);
restored.loadPhysicsState(state);
```

## Executable clients

- [scene.mjs](../examples/scene.mjs): reusable scene factory and request-only game client.
- [headless.mjs](../examples/headless.mjs): runs a character movement and shot without a DOM or game.
- [browser sandbox](../examples/index.html): standalone canvas renderer and keyboard/pointer controls. The renderer may do drawing/input-coordinate arithmetic; it contains no collision response or physics integration. Its simple interval is demonstration scaffolding; the real game will use its Lobby.

The Node example is exercised by the contract tests. An optional Playwright browser smoke test lives in `tests/browser-smoke.py` and starts its own temporary HTTP server.

## A generic rig with a physical load

The executable [crane example](../examples/rig.mjs) defines three lightweight joints and a named hook. Only its base and mounted load are physical bodies. The same `rigDefinition` / `animationClip` / `physics.rigs` API serves a humanoid, machine or creature:

```js
import {createRigExample} from '../examples/rig.mjs';
const {world,base,load} = createRigExample();
world.updateState(); // the existing application clock normally calls this
console.log(world.rigs.getAnchor(base,'hook')); // world-space transform
console.log(load.body_id); // the original mounted body, never a proxy
```

Game-specific proportions, clips and marker meanings stay with game assets/policy. See the [rig API](api-reference.md#rigs-and-animation) for clip channels, blending, root motion and attachment semantics.
