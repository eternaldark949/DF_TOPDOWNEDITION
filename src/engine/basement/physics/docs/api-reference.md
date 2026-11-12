# API reference — 0.3.0

All methods below exist in the independent package. Their **baseline behavior** and the features still proposed are separated in [status](status.md). Exported implementation classes identify concerns; create registered components through `physicsSystem` factories, not by constructing a second controller for a body.

## Types and constants

`physicsSystem`, `physicsBody`, `collisionShape`, `collisionDetector`, `contactSolver`, `spatialGrid`, `physicsConstraint`, `constraintSolver`, `characterMotor`, `vehicleMotor`, `pathMotor`, `projectileMotor`, `particlePhysics`, `trafficController`, `motionController`, `gameEntity`, `gameElements`, `EMPTY_DATA_SOURCE`, `isDataSource`, `gameCharacter`, `gameVehicle`, `gameProjectile`, `gameProp`, `gameStatic`, `gameTrigger`, `gameDecoration`, `awarenessMatrix`.

`BODY_GROUP`: `STATIC=1`, `CHARACTER=2`, `VEHICLE=4`, `PROP=8`, `PROJECTILE=16`, `SENSOR=32`, `ALL=2147483647`. Combine bits with `|`; user-defined bits are allowed through bit 30. `QUERY_GROUP.ALL` has the same value. `PHYSICS_TYPES` lists `static`, `rigid`, `kinematic`, `character`, `no_collision`.

Vectors are `[x, y]`; rotations are scalar radians. A body reference accepts a `physicsBody`, `gameCharacter`, `gameVehicle`, a controller exposing `.body`, or, on world methods, a numeric body ID. References cannot cross worlds. Spatial reference points can also be vectors.

## physicsSystem

Constructor options:

| Keyword | Default | Meaning |
|---|---|---|
| `cell_size` | `128` | Positive shared-index cell width. |
| `fixed_step` | `1/60` | Default seconds per `updateState`. |
| `gravity` | `[0,0]` | World acceleration for movable bodies. |
| `solver_iterations` | `6` | Maximum contact/joint iterations, integer 1–32. |
| `sleep_speed`, `sleep_delay` | `0.05`, `0.5` | Automatic sleeping threshold and seconds. |
| `asset_library` | `EMPTY_DATA_SOURCE` | The world's data source: any object with `resolveTemplate()` and `getResource()`, normally the Directory's registry (`engine/directory/registry.mjs`). Not part of numerical world config. |

`config` is frozen; `spatial_grid` and `elements` are non-replaceable references; `simulation_tick` is read-only. `elements` is the world's `gameElements` owner.

| Method | Returns / contract |
|---|---|
| `createBody(body_packet)` | Registered `physicsBody`. |
| `createEntity(entity_packet)` | Registered official `gameEntity` subclass selected by `entity_type` or template. |
| `createCharacter(character_packet)` | `gameCharacter` with character motor and awareness. |
| `createVehicle(vehicle_packet)` | `gameVehicle` with vehicle/path motors. |
| `createProjectile(projectile_packet)` | `gameProjectile` inheriting `gameEntity`, with `.body` and `.physics_controller`. |
| `fetchBody(body_id)` | Handle, or `null`. Pending event-created bodies appear next step. |
| `updateBody(body, changes)` | Handle. Validates and atomically replaces changed configuration/state fields. Unknown changes throw. |
| `activateBody(body)`, `deactivateBody(body)` | Handle. Inactive bodies leave simulation and index. |
| `removeBody(body)` | Removes body, spatial membership and attached constraints. Old handle requests throw after removal. |
| `updateState(step_seconds = fixed_step)` | Statistics. One step, positive seconds ≤0.1; not reentrant. |
| `clearWorld()` | Removes bodies, joints, metadata and particles; retains event subscriptions and world config. |
| `getStatistics()` | Cumulative step, pair, narrow-phase and index counters; current body/joint counts. |
| `on(event_name, handler)` | Unsubscribe function. See event packets below. |
| `savePhysicsState()` | Detached, JSON-compatible versioned snapshot between steps. Rejects pending commands. |
| `loadPhysicsState(state_packet)` | Validates in a disposable world before replacing current state. Construct destination with saved config. |

## Body packet

| Keyword | Default / values |
|---|---|
| `name`, `owner_id`, `tags` | `""`, `null`, `[]`; metadata. Projectile `owner_id` identifies an owner **body ID** to ignore. |
| `position`, `rotation` | `[0,0]`, `0`; body centre and orientation. |
| `physics_type` | `rigid` for a generic body/vehicle/projectile; `character` for characters. |
| `linear_velocity`, `angular_velocity` | `[0,0]`, `0`; units/s and radians/s. |
| `mass` | `1`, strictly positive and finite. Static/kinematic effective inverse mass is zero. |
| `friction`, `restitution` | `0.5`, `0`; nonnegative friction, restitution in 0–1. |
| `linear_damping`, `angular_damping` | `0`, `0`; nonnegative exponential decay rates per second. |
| `collision_group`, `collision_mask`, `query_mask` | Default role group, `BODY_GROUP.ALL`, `BODY_GROUP.ALL`. |
| `ghost`, `continuous_collision`, `sleep_enabled`, `active` | `false`, `true`, `true`, `true`. |
| `axis_lock` | `{ x:false, y:false, rotation:false }`. Character contacts do not impart spin, independently of heading control. |
| `render_shape`, `light_shape` | Optional independent shape packets; absent values fall back to collision bounds. All extents use the same index. |
| `contact_priority` | `0`; higher-priority movable bodies make lower-priority movable bodies yield. Static scenery always remains immovable. |
| `collision_exclusions` | `[]`; body IDs excluded symmetrically from physical contact and body clearance/impact queries. |
| `collision_shape` | `{ shape_type:'circle', radius:1 }`. |

Shape packets may include `local_position:[0,0]` and `local_rotation:0`:

- `circle`: `radius > 0`.
- `box`: `dimensions:[full_width, full_height]`, both positive; rotates with body.
- `polygon`: `points:[[x,y], ...]`, strictly convex, ordered, nonintersecting.
- `capsule`: `points:[endpoint_a, endpoint_b]`, positive `radius`.
- `segment`: two distinct `points`, optional `radius=0`. Zero-width segments use numerical thickness internally.
- `compound`: nonempty `children:[shape_packet, ...]` with child-local transforms.

There is one authoritative mass, transform and filter set. There are no `collisionMask`, `vx`, `body.mass` mirrors to keep synchronized.

## physicsBody

Properties: immutable `body_id`; frozen-copy `position`, `linear_velocity`; read-only `rotation`, `angular_velocity`.

| Method | Meaning |
|---|---|
| `getState(result = {})` | Detached full body snapshot; supplied object is populated and returned. |
| `getRenderState(blend, result = {})` | Interpolated `position`, `rotation`, `body_id`; blend in 0–1. |
| `setPosition(position, options = {})`, `setRotation(angle, options = {})` | Explicit placement. `placement_mode:'exact'` default, or `'clear'`; `preserve_velocity:false` default. Occupied clear placement emits `movementBlocked`. |
| `setLinearVelocity(velocity, {space='world'})`, `setAngularVelocity(value)` | Command motion; locks and static type are enforced. |
| `applyForce(force, {space='world',world_point})`, `applyTorque(torque)` | Accumulate for the next step; a force at a point also produces torque. |
| `applyImpulse(impulse, {space='world',world_point})`, `applyAngularImpulse(value)` | Mass/inertia-aware instantaneous velocity change, respecting locks. |
| `applyImpact({source_body,strength,world_point})` | Momentum impulse away from source; calculates direction, mass response and torque inside engine. Physical masks and ghosts apply. |
| `stopMovement()` | Clears velocity, angular velocity and accumulated force/torque. A motor can resume its current intention next step. |
| `wakeBody()`, `sleepBody()` | Wake or suspend motion; new motion requests wake the body. |

Body mutators return the handle. Commands from event callbacks are queued, so a return is not a promise that state has already changed. Explicit placement can reposition locked/static bodies; locks govern physical motion and correction.

## Character interface

Both `gameCharacter` and `characterMotor` expose these methods; body access is `character.physics_controller.body`.

| Method | Meaning / result |
|---|---|
| `setMovement(direction, options={})` | Input vector of magnitude ≤1, normalized if larger. Options: `speed`, `space:'world'|'local'`, `face_movement`, `personal_space`, `avoid_groups`. |
| `setRotation(angle, options={})` | Explicit facing placement; preserves velocity by default. |
| `moveTo(position, options={})` | Engine pathfinding and arrival; options: `speed`, `arrival_distance`, `direct`, plus path-search options. |
| `followTarget(target, options={})` | Replans toward a moving target. |
| `fleeTarget(target, options={})` | Moves away until `safety_distance` (default 200). |
| `lookAtTarget(target, {turn_speed=12})` | Engine-calculated facing, radians/s. Respects rotational lock. |
| `teleportToward(target, {stop_distance=0,min_distance=0,...options}={})` | Resolve a target-relative landing, require a clear swept path and checked placement; return the motor or null. Mounted sources and insufficient travel reject. |
| `dashTo(position, options={})` | Direct swept motion, speed defaults to 3× max speed. |
| `teleportTo(position, options={})` | Clear endpoint search by default; exact placement if requested. Returns controller or `null`. |
| `stopMovement()`, `cancelMovement()` | Stop intention and motion; or cancel intention and brake naturally. |
| `getMovementState(result={})` | `{ mode, has_path, speed }`. |

Character `movement` defaults: `max_speed:180`, `acceleration:900`, `braking:1200`, `arrival_distance:2`. Acceleration/braking are units/s². Most character commands return the controller. `followTarget` and `fleeTarget` accept a body/element or fixed vector. Removing a movement target cancels the intention and emits `movementBlocked` with `missing_target`; removing a facing target cancels facing.

## Vehicle/path interface

`gameVehicle` delegates to `vehicleMotor`:

`assembleVehicle(vehicle_template)` configures the engine motor. Defaults are `max_speed:300`, `reverse_speed:90`, `acceleration:100`, `braking:240`, `wheel_base:40`, `max_steering:0.6` radians, `steering_rate:2` radians/s, `lateral_grip:12` per second, `drag:0.1` per second.

`accelerateVehicle(amount=1)`, `brakeVehicle(amount=1)`, `reverseVehicle(amount=1)`, `setHandbrake(amount)` take 0–1; `steerVehicle(amount)` takes −1–1. `realignSteering()` requests centred steering. Inputs persist until changed. Manual input cancels the current autonomous path. `stopVehicle()` requests braking; `parkVehicle()` also clears motion immediately. These return the controller.

`followPath(path, options={})` accepts `{points:[...]}` or a point array. `driveTo(position, options={})` asks the engine to find a route; returns controller or `null`. Options include `speed`, `following_distance` (4 default), `arrival_distance` (3 default). The engine calculates forward clearance and braking. `getSpeed()` returns signed longitudinal speed; `getVehicleState(result={})` includes body state, steering and path status. `pathMotor` implements `followPath` and `driveTo` as an engine component.

## Queries and awareness

Queries return fresh arrays/objects unless a `results` array or `result` object is provided. Empty lists are `[]`, a missing single result is `null`.

Filter options: `include_groups=ALL`, `exclude_groups=0`, `query_bit=ALL`, `ignore_body` (one body/element or an array), `include_ghosts=true`, `max_results`, `sort_by:'distance'|'none'`. Casts always order by impact fraction unless `'none'` is specified. Physical body-clearance requests additionally use reciprocal collision masks.

| Method | Packet/result |
|---|---|
| `peruseNearbyEntities(reference, options={}, results=[])` | `near_range:400` default, centre-distance filter. Hits contain `body`, `body_id`, `distance`, `direction`. Self is ignored by default. |
| `findNearestEntity(reference, options={})` | Nearest hit or `null`. |
| `raycast({from,to,...filters}, result={})` | Nearest thin-cast contact or `null`. |
| `shapeCast({collision_shape,from,to,from_rotation=0,to_rotation=from_rotation,...filters}, results=[])` | Contacts with `fraction`, `distance`, `normal`, `world_point`, `penetration_depth`, `body`, `body_id`. |
| `overlapShape({collision_shape,position,rotation=0,...filters}, results=[])` | Exact overlap contacts. |
| `isPlacementClear(body_or_shape, position, options={})` | Boolean. Touching counts as occupied within tolerance. |
| `findClearPlacement({body OR collision_shape,from?,to,min_distance=0,max_attempts=64,...filters}, result={})` | Endpoint-first bounded search; `{position,fraction,distance}` or `null`. Can cross solids, always validates returned endpoint. |
| `findPath(packet, result?)` | Same as `navigation.findPath`: clearance-field A* with string pulling, path reuse and partial goals. `{points,length,partial,visited_nodes,...}` or `null`. See [navigation](navigation.md). |
| `getPathClearance({body OR collision_shape,from,to,...filters}, result={})` | `{clear,distance,fraction,hit}`. |
| `predictCollision({body_a,body_b,seconds=1}, result={})` | Geometric constant-velocity prediction or `null`, including `seconds` to impact. This does not forecast future AI decisions. |

`character.awareness` is an `awarenessMatrix`: `analyzeSurroundings(options={})` sets options and returns current nearby hits; `getNearbyEntities(results=[])`, `getNearestObstacle()` and `getMovementClearance(packet,result={})` always query live engine state. The latter requires `to`; it supplies the character body and current `from`.

## Constraints, furniture and hit volumes

`createConstraint(packet)` returns a `physicsConstraint`, whose `constraint_id` is immutable and `getState()` returns configuration and applied impulse. Required: `body_a`; optional `body_b` (otherwise world anchor). `constraint_type` is `distance` (default), `spring`, `hinge`, `attachment`, `drag` or `slider`.

Keywords: `local_anchor_a`, `local_anchor_b`, `world_target` default `[0,0]`; `rest_length:0`; `stiffness:30`; `damping:4`; `target_rotation:0`; `min_rotation:-π`, `max_rotation:π`; `motor_speed:0`; `max_torque:0`; `spring_stiffness:0`, `spring_damping:0` (hinge only: an angular acceleration toward `target_rotation`, `-stiffness·error − damping·relative_spin`, independent of inertia); `break_impulse:null`. Hinge limits describe A relative to B/world. The maximum torque limits the hinge motor, not corrective constraint impulses. This is an iterative constraint model, not a full articulated-body solver.

`setConstraintTarget(constraint,world_target)`, `setConstraintMotor(constraint,changes)`, `removeConstraint(constraint)` update/remove a joint. `beginDrag(body,packet={})` creates a drag constraint; `setDragTarget(constraint,position)`, `rotateDraggedBody(constraint,angle)`, `endDrag(constraint)` provide furniture requests. The rotation request is an explicit placement and can request an overlapping orientation; query clearance before accepting an interaction that must remain clear.

`createHitVolume(packet)` returns a registered `gameTrigger` with a ghost kinematic body; `sweepHitVolume(body,to,options={},results=[])` accepts the entity/body and queries its swept shape; `removeHitVolume(body)` removes it. Gameplay selects whom a melee hit damages; it does not calculate segment/capsule intersections.

## Projectiles

`createProjectile(packet)` accepts body keywords plus `direction:[1,0]` or `target` (point/body), `speed:600`, `lifetime:3`, `owner_id:null`, `penetration_count:0`, `penetration_loss:0` (0–1), `impact_strength:0` (momentum). The engine ignores the owner body, orders impacts, suppresses repeat hits and applies the shared impulse operation. `penetration_count` counts additional solid hits allowed after the first; ghosts do not consume it. `impact_scale` is multiplied by `1-penetration_loss` after a penetrated solid.

The returned `gameProjectile` owns a `projectileMotor` as `physics_controller` and delegates `launchProjectile(direction,{speed?,target?})`, `redirectProjectile(direction,{speed?,target?,owner_id?})`, `removeProjectile()`. Its `.body` is the controller's body. The world also forwards `launchProjectile(projectile,direction,options)`, `redirectProjectile(projectile,direction,options)`, `removeProjectile(projectile)`. Redirecting clears prior hit tracking. Lifetime motion is truncated to the remaining seconds; spent bodies and entities are removed at the next command boundary. Game damage is selected in the event handler, using the returned impact scale if appropriate.

Named `impact_profile` and general `response_profile` presets are **proposed**, not accepted settings in this baseline. Use the concrete `impact_strength`, material and motor keywords above.

## Particles and chains

`createParticlePool({capacity=256,...body_keywords,lifetime=1,radius=0.5,collide=false})` returns a pool ID. `emitParticles(pool_id,{count=1,...overrides})` returns spawned body IDs up to capacity. Noncolliding particles still move, but generate no contacts. `getParticleState(pool_id,results=[])` returns body states plus `remaining`; `clearParticles(pool_id)` removes all its particles.

`createChain({points,anchors=[0],mass=1,damping=3,radius=0.2,stiffness=20})` returns a chain ID. Each point is a body; neighbouring points have distance constraints; anchor indices are immovable. `setChainAnchors(chain_id,positions)` takes one position per configured anchor. `getChainState(chain_id,results=[])` returns body states; `removeChain(chain_id)` removes all chain joints/bodies. Chains do not collide with world geometry in this baseline. They are a reusable chain primitive for future hair/cloth adapters, not a migrated wardrobe renderer.

## Shared spatial service and backend classes

`registerSpatialInstance(instance_id,bounds,data={})`, `updateSpatialInstance(instance_id,bounds)`, `removeSpatialInstance(instance_id)` maintain nonphysical records in the same grid. Bounds are `{left,right,top,bottom}`. `spatial_grid.queryBounds(bounds,results=[])`, `queryRadius(position,radius,results=[])`, `querySegment(from,to,results=[])`, `querySweep({from,to,radius},results=[])` return conservative body handles/metadata records. Exact physical queries belong to `physicsSystem`.

Engine-internal grid operations: `registerInstance`, `updateInstance`, `removeInstance`, `collectCandidatePairs`, `clear`. `exportInstances()` returns detached bounds with live immutable body handles/metadata references for tools/render inspection/save; it is not a per-frame culling API. `getStatistics()` returns counters, including `cells` (nonempty cells on both levels) and `coarse_instances` (entries on the coarse level for large bounds). Client systems must not mutate world-owned membership directly or instantiate replacement grids.

`collisionShape(packet).packet` is an immutable validated definition. `collisionDetector.contact(shape_a,pose_a,shape_b,pose_b)`, `separation(...)`, `sweep(shape_a,from_a,to_a,shape_b,from_b,to_b=from_b)` perform geometry. Poses have `position`, `rotation`; contact normal points A→B. `contactSolver.resolve` and `constraintSolver.solve` accept internal records and are called only by the world. They are exported for engine development, not game callbacks.

## Events

`contactBegin`, `contactStay`, `contactEnd`: `{body_a,body_b,world_point,normal,penetration_depth,relative_velocity,normal_impulse,tangent_impulse,sensor_only,simulation_tick}`. Bodies are ordered by ascending ID and normals point A→B.

`projectileHit`: `{projectile,body,target_body,world_point,normal,fraction,impact_scale,sensor_only,simulation_tick}`. Its normal points projectile→target. `destinationReached`: `{body,position,simulation_tick}`. `movementBlocked`: `{body,reason,simulation_tick}`. `constraintBroken`: `{constraint_id,body_a,body_b,impulse,simulation_tick}`.

Event packets and vector fields are immutable. Handle references permit requests, committed next step. An end event can refer to a removed body's immutable identity; do not assume `getState()` still succeeds. All listeners run even if one throws; `updateState` then throws an `AggregateError`. `on` returns an unsubscribe function.

## gameEntity and gameElements

The [entity design](entities.md) defines the official lifecycle/inheritance contract. Every game element extends `gameEntity`; construction registers its body and identity automatically. `gameCharacter`, `gameVehicle`, `gameProjectile`, `gameProp`, `gameStatic`, `gameTrigger` and `gameDecoration` are the built-in subclasses. Their static `entity_type` and `physics_role` identify factory selection and mechanical role. A concrete game entity is never a wrapper adopted around an existing game object/body.

`gameEntity(elements, packet={})` can be constructed directly with an owner, but factories are the preferred route, especially for custom subclasses. Packet fields include `entity_type`, `template` (qualified template ID), `name`, `tags`, `assets` (slot→qualified resource ID), `data` (declared gameplay state), and the body/controller keywords above. Per-instance definitions override immutable templates.

Entity properties are read-only: `entity_id`, `body_id` (same root identity), `entity_type`, `template_id`, `name`, `tags`, `assets`, `body`, `physics_controller`, `awareness`, `registered`, `pending`, `destroyed`, `active`, `position`, `rotation`, `linear_velocity`, `angular_velocity`, `mass`, `physics_type`, `collision_shape`, `collision_group`, `collision_mask`, `query_mask`, `axis_lock`, `ghost`. Physical getters read the engine body, not entity copies. `data` is a non-replaceable property whose object contains mutable, serializable gameplay state. Physical fields cannot be shadowed on subclasses. Legacy per-axis aliases throw instead of accepting shadow writes.

| Entity method | Contract |
|---|---|
| `activate()`, `deactivate()`, `destroy()` | Lifecycle requests; return the entity. Destroy is idempotent and cleans body/joints/scoped subscriptions/registry. |
| `updateBody(changes)`, `setPosition(position,options)`, `setRotation(angle,options)` | Engine requests; return entity. `gameCharacter.setRotation` uses its character-controller behavior described above. |
| `getState(result={})` | Detached entity metadata/data plus body state; destroyed entity has `body:null`. |
| `getRenderState(blend,result={})` | Delegates to authoritative body's render state. |
| `getAsset(slot)` | Immutable resource definition from the owning library. Missing slot throws. |
| `setAsset(slot,resource_id)` | Validates and updates a resource binding, never edits a shared template. |
| `on(event_name,handler)` | Entity-scoped subscription, handler's `this` is the entity; returns unsubscribe and cleans on destroy. |
| `createConstraint(packet={})` | Creates an engine constraint with this entity as `body_a`. |

`physics.elements` is a `gameElements`. Its read-only `world` and `asset_library` identify its owner and definitions. It maps identities, not positions; there is no second spatial index. A world cannot have a second `gameElements` owner; use its existing `elements` service.

| gameElements method | Contract |
|---|---|
| `createEntity(packet={})` | Select registered class by `entity_type` or template; return official entity. Failed subclass factory construction rolls back its root and nested children. |
| `createCharacter`, `createVehicle`, `createProjectile`, `createProp`, `createStatic`, `createTrigger`, `createDecoration` | Typed factories taking a packet. Reject a template/custom type with a conflicting mechanical role before creating bodies. |
| `registerEntityType(entity_type,Constructor)` | Register a gameplay subclass of `gameEntity`, normally one of its specialized bases. No duplicate names or non-entity classes. Returns the owner. |
| `listEntityTypes()` | Registered names, including built-ins. |
| `fetchEntity(entity_id)` | Entity or `null`; pending/destroyed entities are absent. |
| `getEntityForBody(body)` | Official root entity or `null` for an anonymous mechanical body. |
| `getEntities({entity_type?,active?}={},results=[])` | Identity-registry enumeration for lifecycle/tools/save, not a spatial query. Inactive entities remain registered. |
| `peruseNearbyEntities(reference,options={},results=[])` | Shared-index nearby query including registered nonphysical entities; each hit contains `entity` and `body`. |
| `getStatistics()` | Entity and registered-type counts. |

Physical query hits also contain `entity` where a root is registered. World events additionally expose `entity`, `entity_a`, `entity_b`, `target_entity` as applicable. In `projectileHit`, `projectile` is now the official `gameProjectile`. Snapshot format 2 saves the registry without replaying gameplay constructors on load. Re-register custom classes/Directory libraries before load; reconnect gameplay subscriptions afterward. Anonymous physics bodies/particles remain low-level mechanics, not game-entity surrogates.

## Data source

The Basement does not own data. A world is handed a data source as `asset_library` and calls two methods on it:

| Method | Contract |
|---|---|
| `resolveTemplate(template_id,packet={})` | Detached copy of the packet resolved over its template, with resource bindings validated. With no ID the packet is used as it is. An unknown ID throws. |
| `getResource(resource_id)` | Immutable typed resource; an unknown ID throws. |

`isDataSource(source)` tells whether an object provides both. `EMPTY_DATA_SOURCE` is the source of a world given none: it has no templates and no resources. The engine's real data source is the Directory's registry, `assetLibrary` in `engine/directory/`, which the Basement never imports.
| `exportLibraries()` | Detached data definitions for inspection/sharing. |

Template `extends` names a parent (local within a library or qualified). Objects merge recursively; arrays replace. `assets` binds resource IDs, and resources require a `kind` plus their data/URL/descriptor fields. No library may contain executable factories or physics algorithms. The Directory loader resolves resource `source` paths against the existing game database. The engine performs no Directory imports or game-specific asset selection.

## Independent bounds and authored components

`getBodyBounds(body,{bounds_type='collision'})` returns current world bounds. `queryEntitiesInBounds({bounds,bounds_type='render',...filters},results=[])` returns `{body,body_id,entity,bounds}` hits from the shared index and then filters using the requested extent. `bounds_type` is `collision`, `render` or `light`. `containsPoint(body,position,{bounds_type='collision'})` performs an exact engine shape test, useful for terrain/regions. Rendering and lighting bounds never change physical shapes or contact radii. Physical broadphase pairs are filtered using physical swept bounds.

Entity packets/templates may include `constraints:[joint_packet,...]`. The engine creates those joints with the new entity as `body_a` and its spawn position as the default world anchor. Explicit `world_target` overrides that default. Body-to-body joints use `createConstraint` after both entities exist. `getBodyConstraints(body,results=[])` returns attached joint handles. Invalid components roll back the entity and its joints. Optional `motion:{motion_type:'move'|'orbit',...keywords_below}` starts an engine motion during construction. Saved entities restore existing joints/motions without replaying these declarations.

`slider` adds `local_axis:[1,0]` (B's frame, or world frame without B), `min_translation:0`, `max_translation:100`, `motor_speed:0` units/s and `max_force:0`. It holds the perpendicular rail and relative `target_rotation`, constrains travel and drives along the rail using common mass/inertia/lock rules. Limits are not controlled by the motor force cap. `break_impulse` uses the ordinary joint lifecycle. `setConstraintMotor` changes speed, force or limits.

## Two-axle vehicles

`vehicle_template.tyre_model` is `bicycle` (default) or `two_axle`. Two-axle parameters are `front_grip:1`, `rear_grip:1`, `cornering_stiffness:12`, `max_lateral_acceleration:500`, `load_transfer:0.15`, `load_rate:5`. Front/rear tyre impulses act at separate axle points through the common body mass/inertia rules; steering does not assign a heading directly. Braking/throttle shift axle load and handbraking reduces rear grip. This is a new model whose tuning must be evaluated in the game; it does not claim identical feel to the old per-tick model.

`vehicleMotor.setSurface({grip=1,wetness=0})` and `gameVehicle.setSurface` accept a nonnegative grip multiplier and wetness in 0–1. `getVehicleState` also returns detached `axles:{load,front_slip,rear_slip}` and `surface`. These values survive save/load. Effects can consume this telemetry instead of calculating tyre slip themselves.

## Navigation

Every world owns `physics.navigation`, a `navigationSystem` with two layers: a cached clearance `navigationField` for open-space travel by any radius, and a `roadNetwork` lane graph for vehicles. Methods: `navigate`, `findPath`, `findRoute`, `registerProfile`, `getProfile`, `agentRadius`, `configureField`, `invalidateRegion`, `getStatistics`. Field methods: `clearanceAtCell`, `clearanceAt`, `exactSegmentClearance`, `cellOf`, `cellCenter`, `chunk`, `chunkRevision`, `isObstacle`, `invalidateRegion`, `invalidateAll`, `getConfig`. Road methods: `addNode`, `addLane`, `removeLane`, `setLaneOpen`, `getLane`, `getNode`, `snapToLane`, `findRoute`. The complete keyword reference, guarantees and measurements are in [navigation](navigation.md).

## trafficController

Every world owns `physics.traffic`, a `trafficController`; it owns route/signal/reservation data and no spatial index. Its methods are:

- `registerRoute(route_id,{points,speed_limit=180,stops=[],loop=false})`: cache nonzero-length route segments; 2–4096 points. Loops must be authored closed. Stops contain `distance` along the route, `signal_id` and/or `conflict_id`, and `clearance_distance:20` after the line.
- `addVehicle(vehicle,{route_id,following_distance=8,prediction_seconds=2,arrival_distance=3})`: attach the existing official vehicle motor to an itinerary.
- `setSignal(signal_id,'stop'|'go')`: signal policy supplied by the game; uninitialized signals stop traffic.
- `getSpeedCap(body)`: engine-consumed cap; infinity for unattached vehicles.
- `getState(vehicle)`: detached driver configuration, progress, speed cap and completion state, or null.
- `removeVehicle(vehicle_or_body_id)`: release route ownership and crossing/passing reservations. Destroying a body and manual driving inputs also release them.
- `requestPassingRoute(vehicle,{route_id,reservation_id?,...driver_options})`: validate an authored alternative/merge itinerary through shape clearance queries and reserve its passing resource. Returns false when blocked; accepted event-time requests recheck when committed. This does not invent an overtaking lane or predict every future driver's decisions.

Traffic uses shared-index nearby-body prediction, path clearance and braking. Stops sharing `conflict_id` serialize their crossing, releasing after the authored clearance distance. Admission is deterministic in driver registration order. It is a conservative reservation model, not the current game's full signal timing/driver personality model. Save/load retains route cursors, signals and reservations.

Events: `trafficRouteCompleted`, `passingRouteAccepted`, `passingRouteBlocked`, each with `body`, `entity`, `route_id` and simulation tick.

## motionController

Every world owns `physics.motion`, a `motionController`:

- `moveBodyTo(body,{position,rotation?,duration,easing='linear'})`: engine-owned absolute timeline, `linear` or `smooth` easing.
- `orbitBody(body,{center,angular_speed,rotate_body=false})`: engine-owned orbital position and optional rotation, suitable for ride parts and staged effects.
- `stopBodyMotion(body)`: stop this timeline and body velocity.
- `getMotionState(body)`: detached timeline/orbit state or null.

Bodies must be nonstatic. Scripts suspend the normal motor/force integration while active and request velocities through the ordinary integration/CCD/contact pipeline. Rigid/character bodies can be blocked; kinematic bodies act as prescribed moving geometry and cannot be stopped by a static body's impulse. Completion stops residual scripted velocity on the following step; normal motors then resume. `motionCompleted` reports `{body,entity,requested_position,simulation_tick}` when a timeline ends; the actual body can stop short if obstructed. Orbit/timeline state survives save/load. Game cutscenes should react to events and read body poses instead of calculating interpolation.

## Cloth meshes

`particlePhysics` and the world expose `createCloth({points,edges,anchors=[],owner?,mass=0.1,radius=0.2,damping=3,stiffness=30,wind=[0,0],collide=false,collision_mask?})`, returning a mesh ID. Points are world coordinates without an owner, owner-local coordinates otherwise; edges are vertex-index pairs. Anchors follow the owner inside the engine. Cloth particles use `BODY_GROUP.PARTICLE`; default masks prevent self-contact while optional world contacts use the common solver. Owner collision is excluded. Duplicate anchors/invalid edges fail before allocating bodies.

`setClothAnchors(cloth_id,positions)` updates anchor-local/world points; `setClothWind(cloth_id,force)` supplies a force per free vertex. `getClothState(cloth_id,results=[])` returns body states; `removeCloth(cloth_id)` removes mesh joints and particles. Removing its owner or a vertex removes the mesh at the command boundary. Lifecycle dependency maps store identities only. Cloths save/load with their owners and constraints. This edge mesh supports authored garment/hair meshes; render bindings, fitting and full wardrobe parity remain integration work.

## Flit clearance

`findClearPlacement` now unions occupied intervals from shared-index candidates, decomposing compound shapes into convex pieces and sweeping in both directions. It returns the furthest clear endpoint along a constant-orientation translation, with a numerical `clearance` skin (default 0.0001 units), or null. It can cross walls as a teleport; endpoint occupancy is checked again before returning. `min_distance` (default 0, finite and nonnegative) rejects destinations and clipped landings shorter than the requested minimum, inside the engine. `max_attempts`, when supplied, is validated for compatibility but no longer controls a fixed sample scan. This operation does not search through rotating placements. Sweep convergence limits still apply.


## Street-consumer additions

`gameEntity.physics_system` is a protected, read-only reference to its owning world. Game subclasses use it for engine requests; constructing/restoring an entity always establishes this ownership. Clients cannot replace it or adopt a legacy entity.

`predictMovementContacts({body,to?,speed?,seconds=1,...filters},results=[])` forecasts shape contacts along the body's current velocity, or a proposed path toward `to` at positive `speed`. Horizon is bounded to 0–10 seconds and clipped to proposed arrival. Hits contain `seconds` to contact, body/entity and contact geometry. Shared-grid candidates include approaching bodies outside the proposed corridor, using a cached world motion envelope; no private sensing index is created. Predictions assume constant velocities/angular velocities and do not forecast future control changes.

`characterMotor.suspendMovement(seconds)` / `gameCharacter.suspendMovement` temporarily suspend motor control while the normal engine force/damping/contact pipeline retains knockback. The suspension timer survives save/load. `evadeBody(threat,{distance=50,speed=2*max_speed,min_distance=4,teleport=false})` chooses and checks a perpendicular dodge inside the engine; it tries both sides and returns the motor or null. `teleport:true` performs an immediate checked evasion instead of installing a dash intent. Neither command asks game code to calculate a direction or displacement.

`trafficController.getSignal(signal_id)` returns the world signal state (`stop` if uninitialized). `getRouteStart(route_id)` returns an engine-calculated `{position,rotation}` for a registered route, suitable for entity creation. Contact events additionally expose `relative_speed`, computed by the shared collision pipeline so gameplay can apply damage thresholds without reconstructing velocity math.

Fixed-orientation circle/polygon and polygon/polygon sweeps now use direct translation intervals and rounded edge/vertex tests. This avoids advancement-budget stalls in pedestrian pathfinding near car corners. Rotating shapes retain conservative advancement.

The engine evaluates motors/forces for all movers, resolves existing contacts through the common solver before travel, then integrates and performs swept/discrete contacts and constraints. This preserves tangential motion at an existing contact instead of repeatedly clipping the entire step at t=0. Character personal-space steering uses a heading-relative passing side through the shared nearby query; authored waypoint clients can select `direct:true` to avoid redundant A* searches. Arrival includes the engine's numerical tolerance so a walker cannot stall a fraction above its destination threshold.


## Authored path geometry

`pathGeometry` is a stateless engine utility for authoring/topology queries, with no spatial index. `pointOnPath(points,distance,{end_clearance=0})` returns `{position,rotation,distance_along,path_length,segment_index}` along a polyline. `projectOnPath(points,position,options={})` returns its nearest allowed placement and `distance` to the query point. `nearestPath(paths,{position,near_range=Infinity,end_clearance=0})` accepts `{points,...metadata}` packets and returns the closest projection plus the selected `path`, or null. Paths require 2–4096 finite points and nonzero segments. Endpoint clearance is bounded to half the path length, so short paths yield their midpoint rather than an off-path placement. This linear topology selection is not a substitute for shared-grid body sensing.

`pathGeometry.transformPose({position,rotation=0},{local_position=[0,0],local_rotation=0})` resolves an authored local spawn/mount pose into a world pose inside the engine. Inputs and outputs must remain finite. It does not create a parent/child body relationship.


## Prescribed body attachments

`attachBody(body,{parent_body,local_position=[0,0],local_rotation=0})` mounts an existing body in the same world. It keeps its body/entity ID and configured mass, shape and filters. The engine suspends its independent motor/dynamics/contacts and updates its canonical pose/point velocity from the parent. Mounted entities remain in the shared grid for spatial/render queries. No replacement body, copied game transform or second index is created. Mass contribution is optional through `combine_mass`, described below.

`getAttachmentState(body)` returns `{body_id,parent_body_id,local_position,local_rotation,combine_mass,pending,detaching}` or null. Pending reservations prevent double mounts and cycles before event-time commands commit. `setAttachmentPose(body,{local_position?,local_rotation?})` updates the local relationship. Independent body transform/velocity/sleep requests are rejected while mounted or pending mount. Noncombining mounts also reject force/impulse requests; high-level motor intentions are suspended until detachment. Attachment chains are bounded to 64 bodies and cannot contain cycles.

`detachBody(body,{exit_points,inherit_velocity})` checks 1–64 parent-local candidate points using the original body shape/filters and shared-index clearance. It also checks the path from the mounted pose, excluding the parent vehicle only during the path check. A wall cannot be crossed merely because the final endpoint is free. Null means no exit is clear. Successful requests return the body; callback-time requests recheck at commit and can emit `bodyDetachBlocked`. Otherwise `bodyDetached` confirms release. An attachment must commit before it can be detached.

`getBodyPoint(body,local_position,{blend=1,local_rotation=0})` returns a world `{position,rotation}` through engine transforms. Mounted render interpolation composes the interpolated parent pose with the local attachment, so occupants remain aligned during turns. `getState().attached_to` reports the current parent body ID or null. `active` includes ancestor activity; updates to unrelated configuration do not permanently overwrite the body's own active setting while its parent is hidden.

Events `bodyAttached`, `bodyDetached`, `bodyDetachBlocked` include `body`, `entity`, `parent_body`, `parent_entity`, and simulation tick. Removal emits `bodyDetached` with `reason:'body_removed'|'parent_removed'`; ordinary release uses `reason:'requested'`. Scoped entity subscriptions recognize the parent body as well as the child. Parent removal releases descendants without creating a new body. A removed parent's former seat position can initially overlap scenery; restored physical contacts resolve that position on following steps. Requested exits always require clear geometry. Save/load preserves attachment links but does not replay attachment events.

Commands issued after an event-created pending batch stay ordered behind that batch, even between steps. They cannot make a reserved body appear in the spatial grid before its creation/registration commits. The application still owns the single simulation step.

`getAttachedBodies(parent,results=[])` returns current and reserved child body handles for lifecycle/admission checks. It is an identity relationship query, not another spatial index. Vehicle replacement currently requires releasing attached bodies first; the factory rejects an occupied replacement before creating or removing any identity.

Mounted traffic vehicles suspend their native driver and release crossing/passing reservations while their body is carried. Their route intent remains available after detachment. Traffic `getState` exposes `suspended` for this condition.

## Composite mass

`attachBody(body,{parent_body,local_position,local_rotation,combine_mass=false})` optionally contributes the child's mass to its parent assembly. `combine_mass` must be boolean. Each combining link contributes its subtree once; a noncombining link isolates that subtree from ancestors. Configured body masses and IDs are preserved. Inactive children contribute no mass. Mass properties are cached and invalidated by relationship, pose, shape, mass and activity changes.

`getMassProperties(body)` returns detached `{mass,local_center,center,inertia,body_count}`. `local_center` is relative to the body's authored origin, `center` is in world space, and inertia is about the aggregate center. Authored origins and body velocities keep their meaning: `linear_velocity` is velocity at the body origin. Free integration advances the aggregate mass center and rotates the origin around it. Each body's configured mass is located at its origin; circle intrinsic inertia is exact and other intrinsic inertias retain the documented enclosing-rectangle approximation. Attachment offsets use the parallel-axis theorem.

Contact impulses, forces, angular impulses and joint Jacobians use the same effective mass/center/inertia. A combined child's `applyForce`, `applyImpulse`, `applyTorque` and `applyAngularImpulse` route to the independent root if every intervening link combines mass. Without an explicit `world_point`, a child force/impulse acts at its current body origin. Local vectors use the addressed child's orientation. Independent transform/velocity commands remain prohibited while mounted; noncombining mounts still reject force/impulse commands.

Vehicle and character motors retain their existing unloaded acceleration/braking tuning as a force budget based on their own configured mass. Carrying mass reduces acceleration/braking and increases stopping distance. Bicycle yaw uses a torque budget based on the vehicle's own intrinsic inertia; two-axle tyre impulses use aggregate center lever arms. Contact impulses above motor target speed are not clamped away.

Mass-combining capture is inelastic: linear and angular momentum are merged at the requested mounted placement. Teleporting a distant body into that placement is an explicit placement operation, so it does not preserve the distant body's old orbital moment. Snapshot restoration does not replay capture. Combined detachment defaults to `inherit_velocity:true`; noncombining detachment retains the old false default. Explicit false requests a stop. Checked exits reposition the child, and that prescribed placement can change orbital angular momentum. Local-pose edits are also prescribed configuration changes, not a simulated actuator. Use physical joints for independently swinging loads; no lag or spring force is invented by a prescribed mount.

Characters can opt into torque-limited facing with `movement:{physical_turning:true,turn_speed:12,turn_acceleration:80}` at creation/in a Directory template. Defaults retain the existing upright character behavior (`physical_turning:false`). With physical turning enabled and rotation unlocked, contact torques are permitted and movement-facing / look-at intentions request bounded torque using the character's own intrinsic inertia as the budget. Off-center attached loads then resist turns and move around the aggregate center, instead of snapping to a new facing. `axis_lock.rotation` still takes precedence. Suspended movement leaves physical knockback unopposed.

## Native level integration helpers

`layoutGeometry.cutWallOpenings(walls,openings,{margin=2})` compiles authored `{x,y,w,h}` wall rectangles into segments around openings, without mutating the definitions. This is a level-construction operation, not a runtime obstacle index. Whole maps (walls, props, lights, rooms, doors, cloths, exterior streaming and the room graph) are built by the separate Basement map package; its API is in `src/engine/basement/maps/README.md` in the game checkout. `layoutGeometry.boxGrip(shape,pose,{near,side?,direction?,gap=0})` returns a box face's `{side,position,local_position,rotation,distance}`; sides 0–3 are +x,+y,-x,-y. A world-space direction can select the face. `getBodyGrip(body,options)` evaluates this geometry using the canonical body's current shape/pose. `distance` is distance from `near` to the box surface.

Character `lookInDirection(direction,options={})` requests facing through the motor. `teleportInDirection(direction,{distance,angle?,...placement_options})` computes a directional destination and uses the existing checked teleport pipeline. Undefined direction uses `angle` when supplied, otherwise the body's current rotation. An explicitly supplied zero heading returns null rather than choosing a fallback direction; `findDirectionalPlacement` follows the same rule. These commands are also exposed by `gameCharacter`.

Motion `rotateBodyBy(body,{angle,duration=0.2,easing='smooth'})` requests a relative rotation through the ordinary scripted-motion/CCD pipeline. Obstructions may stop the motion short; it does not promise a successful full turn.

`createProjectileFrom(source,{local_position=[0,0],target?,direction?,...projectile_packet})` creates an official projectile owned by the source body. The engine resolves the local muzzle pose and tests barrel-path clearance through the shared index, starting at the source when the muzzle path is blocked. Target/direction resolution and launch stay inside the engine. Game code supplies damage and weapon policy as metadata.

For spring/drag/distance constraints, positive `max_force` bounds the linear solver impulse per substep. Zero retains the existing unlimited default. A spring applies impulses without position teleportation, so both holders and held objects continue through shared contact/CCD response. This supports native furniture interaction without a game-side collision or correction loop.

`commitCommands()` explicitly commits a reserved command batch between simulation steps without integrating motion, advancing the tick or dispatching contact events. It rejects calls during simulation, event delivery or another commit. Ordinary updates perform this same commit at their boundary. Scene save/teardown code can use it to finish cancelling transient interactions before taking a snapshot while paused. Saving with uncommitted requests still rejects; saving does not implicitly commit them.

`clearFacing()` cancels a character's persistent look-at/directional facing request so movement-facing can resume. `findDirectionalPlacement(body,{direction?,angle?,distance,...placement_options})` resolves a normalized directional destination inside Basement and returns the same checked landing packet as `findClearPlacement`.

Placement queries and clear placement commands accept `placement_bounds:{left,right,top,bottom}`. The entire rotated collision shape must fit inside those limits. Farthest-clear landing searches clip their candidate interval to the allowed region analytically; they cannot return a free point beyond the level boundary. This restriction applies to teleport landing, while swept movement still uses ordinary registered geometry.

`findNearbyPlacement(body,{near_range=240,spacing=20,max_samples=512,fallback_position?,...placement_options})` performs a bounded local rescue search using the shared index. It checks the current pose, then increasing radial samples, returning `{position,distance,checked_samples}` or null. `max_samples` is limited to 4096; an optional fallback is checked separately and is never returned occupied. This is an event-time search with temporary sample points, not a persistent obstacle grid.

### Runtime clock ownership

`new physicsSystem({step_authority})` optionally accepts a private Symbol supplied by the application coordinator. `updateState(step_seconds, authority)` requires that same Symbol for an owned world; omitting it throws before commands or simulation advance. Default standalone worlds keep their existing `updateState()` behavior. The authority is not configuration or save data, and loading a physical snapshot does not release ownership. The game runtime keeps the Symbol private so levels/systems can issue native commands without acquiring a second simulation clock.

`spatialGrid.revision` is a read-only monotonic counter changed by registration, actual bounds updates, removal and clear. Unchanged updates and queries do not change it. The native broadphase combines this with physical configuration/attachment/sweep invalidation to reuse candidate pairs; contact detection and response still use current body state.

[Spatial performance and diagnostics](spatial-performance.md) documents `spatial_sync_requests`, `spatial_sync_skips`, `bounds_calculations`, `swept_bounds_calculations`, `attachment_placements`, `broadphase_builds`, `broadphase_reuses`, and nested `spatial.cell_additions`, `cell_removals`, `query_cells`. Bounds returned by queries remain detached. Cached physical candidates invalidate on collision pose/sweep, filters and attachments even when a broad visual extent keeps grid bounds unchanged. Unrepresentable cell coordinates and regions over the one-million-cell budget reject; failed creation/update/transform commands do not retain partial physical changes.

### Native combat support primitives

These operations are reusable physics APIs; weapon identities, damage, teams, charge costs and status effects remain game policy.

- `advanceBody(body,{distance,direction?,angle?,placement_bounds?})`: move along a requested heading only as far as the first swept obstacle permits. Direction defaults to native facing. Returns actual travel; zero headings/blocked or invalid bounded landings return zero. This is a checked short advance, separate from teleport landing rules. One native shape cast handles thin obstacles; the caller does not sample positions itself.
- `applyImpulseBetween(source,target,{strength,world_point?,if_supported=false})`: resolve the source-to-target heading and native mass/inertia response. A confirmed gameplay hit can request a scalar impulse without rebuilding vectors or dividing by mass. It does not test overlap; the preceding engine hit/query establishes contact. Coincident centers yield a zero directional impulse.
- `sweepAttachedShape(source,{collision_shape,from_local_position=[0,0],to_local_position=from_local_position,from_local_rotation=0,to_local_rotation=from_local_rotation,line_of_sight=false,occlusion_groups=STATIC|PROP|VEHICLE,...query_options},results=[])`: transform authored local poses through the official source body and perform a swept query through the shared spatial grid. `line_of_sight` rejects candidates hidden by blockers between the source and candidate; the source/candidate bodies are ignored for that occlusion ray. No hit-volume body or second grid is required for an authored blade sweep.
- `shapeCast({...packet,predict_seconds=0})`: optionally sweep candidates' native linear/angular motion through the same interval. The existing cached movement envelope expands the shared-grid search so a fast object crossing neighboring cells is considered. It never advances a body. Predictive query results are forecasts; game rule selection remains separate from applying the eventual physical response.
- `createProjectileFrom(source,{...,angle?,angle_offset=0})` and `launchProjectile(direction,{target?,angle?,angle_offset=0,speed?})`: resolve target/direction and angular spread inside the motor. Targets take priority, then an explicit angle, then direction. Zero headings reject before velocity mutation.
- `redirectProjectile(direction,{target?,reverse=false,owner_id?,speed?,angle_offset?,at_fraction?,min_lifetime=0})`: ordinary redirection preserves current speed by default. `target` may be an entity or position; `reverse` uses current velocity. Invalid owners/headings reject before launch. With `at_fraction` in 0..1, schedule an interception in the next projectile step, using a detached target position. The engine orders it with ordinary contacts; an earlier stopping contact wins. At interception the engine places the same projectile body on its path, redirects it and stops travel for that step. It continues on the next step, avoiding a second unswept remainder path. Only the earliest scheduled fraction is retained. A pending interception round-trips in the projectile motor snapshot. If its previously valid deflector is removed before commitment, ownership becomes null; no replacement body is created.
- `onProjectileContact(handler)`: subscribe to synchronous, pre-response physical contacts. The handler receives immutable contact metadata with the official `projectile`, `target_entity`, `target_body` and `world_point`. Return null for the default rule, `{action:'ignore'}` to pass this contact, `{action:'hit',penetration_loss?}` for an ordinary hit with optional 0..1 post-hit attenuation, or `{action:'redirect',target?,owner_id?,min_lifetime?}` to redirect at the contact before impulse/damage events. Handlers select policy; they must not implement geometry or advance simulation. The first non-null decision wins. Async/unknown decisions reject. The return value is an unsubscribe; subscriptions are runtime connections and are not serialized.

`projectileRedirected` reports `{projectile,body,owner_id,simulation_tick}` after a committed native interception/redirection. Normal projectile impact events continue through `projectileHit`. Native geometry, trajectory, response and contact ordering remain centralized for all these cases.

### Native actor perception

`observeTarget(observer,target,{near_range=400,fov=2*PI,personal_space=0,touch_distance=0,occlusion_groups=STATIC|PROP|VEHICLE}={})` returns detached `position`, `distance`, `direction`, `bearing`, `relative_angle`, `behind`, `in_range`, `in_cone`, `close`, `touching`, and `line_clear`. Target may be an official entity/body or a point. The engine calculates all geometry and raycasts against its shared spatial grid; gameplay decides suspicion, team eligibility and what action follows. `touch_distance` is an authored sensing threshold, not a collision-contact event.

`predictTargetPosition(observer,target,{projectile_speed,max_seconds=2})` forecasts the target's position using its native velocity and bounded travel time. It returns `{position,seconds}` and never steps a body. This is a constant-velocity aim forecast, not a guarantee against later acceleration or cover.

`findWanderPlacement(body,{origin?,near_range=200,angle_sample=.5,radius_sample=.5,...placement_options})` resolves two authored RNG samples (0..1) into a nearby, checked position through the native placement query. Game AI supplies random samples and behavior timing; it does not calculate offsets or build another navigation grid.

The official registry reports `entityRegistered` and `entityRemoved` with `{entity,body,simulation_tick}`. These follow the existing deferred world-event dispatch. Registration happens through the same normal/restored base path; removal retires subscriptions and identity. A gameplay actor service can maintain an ID set from these events and explicit level-entry reconnection without scanning every world entity every simulation step. Runtime command commits do not run another physics step.

Character snapshot serialization omits intent/facing references to bodies removed before the next motor update. Direction intents/facing remain intact. Saving does not mutate the live motor; restored state never contains an invalid removed target ID.

### Attachment-local emitters and mounted launch

`attachBody(child,{parent_body,local_position,local_rotation,combine_mass,emitter=null})` may declare an attachment-local launch aperture. `emitter` contains `{enabled=true,local_position:[0,0],local_rotation=0,half_angle=PI/2,inherit_velocity=true}` in the immediate parent's frame. It is generic engine configuration, not a vehicle/weapon class. Ordinary attachments without emitters cannot launch from inside their parent.

`getMountedLaunchState(source,{local_position=[0,0],target?,direction?,angle?,angle_offset=0,collision_shape?,blend=1,check_clearance=true,near_range?,line_of_sight=false,occlusion_groups=STATIC|PROP|VEHICLE}={})` returns `{allowed,reason,attachment_id,revision,parent_body_id,...pose}`. Valid pose data includes muzzle `position`, `grip_position`, weapon `rotation`, spread-adjusted `launch_rotation`, `direction`, `carrier_velocity`, `relative_angle`, `distance`, `in_range` and `line_clear`. Fields are detached snapshots. A target is a native body/entity or a point; aim can instead be a direction/angle, defaulting to the aperture's outward heading. The engine solves lateral muzzle offset alignment. Targets inside the forward muzzle distance, inactive/reserved/detaching/disabled mounts, out-of-arc headings and blocked aperture/muzzle placements reject.

Clearance sweeps from the real mounted source to the muzzle against the existing grid. Only the source/its carrier ancestors are ignored while crossing the authored aperture. Final muzzle placement still checks the carrier itself; a muzzle inside the cabin is invalid. Optional sight/range fields describe the target from the resolved muzzle. Rendering may request interpolated poses with `check_clearance:false`; this performs no body mutation or gameplay timing.

`setAttachmentEmitter(child,emitterOrNull)` validates and queues emitter changes on the same attachment. `getAttachmentState` now includes a stable `attachment_id`, a `revision` changed by emitter/local-pose edits and a detached emitter descriptor. Exit/re-entry receives another ID; parent motion does not change it. Snapshots preserve IDs/revisions/emitters, and pre-emitter snapshots retain ordinary disabled-emitter semantics unless a game migration explicitly supplies one.

`createProjectileFrom` automatically uses the mounted aperture when its source is attached. A blocked mounted launch returns null before creating a projectile; it never falls back to a shot inside the cabin. The projectile keeps the passenger's owner ID, inherits parent linear plus angular velocity at the muzzle once if enabled, and then moves independently. It receives no permanent carrier collision exclusion, so a redirected shot can hit the carrier normally. Unmounted launch behavior is unchanged. `projectileMotor.launchProjectile` accepts optional `inherited_velocity` as a native vector in addition to its usual heading/speed options; redirection does not add it again.

Event-time accepted launches are pending native commands. They revalidate emitter, source and clearance at commit. If invalidated, the pending projectile is retired and `projectileLaunchBlocked` reports `{body,source_body,reason,simulation_tick}`. Such deferred cancellation does not promise rollback of arbitrary game policy already committed by the requesting callback. Normal gameplay issues mounted attacks through its shared before-physics queue.

`resolveAim(source,{target?,direction?,angle?,angle_offset=0}={})` returns a detached unit `direction` and absolute `rotation`. Target takes priority, then angle, then direction; with none supplied, native facing is used. Nonfinite/zero headings reject before mutation. Projectile launch uses this same resolver (and still requires a heading). `characterMotor.setMovement(undefined,{angle,speed,...options})` resolves angle-based movement inside Basement; explicit `[0,0]` remains a stop intent. `followTarget(target,{target_offset:[x,y],...options})` resolves an authored offset in the target body's frame (world-space offset for point targets), preserving ordinary cached pathing, collision spacing and snapshots.

`applyImpulseBetween(...,{if_supported:true})` returns null for targets behind any noncombining attachment link, without applying an impulse. The default retains strict rejection. Combined links still route impulse through the native composite mass/inertia calculation. This lets a confirmed hit request optional physical knockback without duplicating attachment traversal in gameplay.

`characterMotor.orbitTarget(target,{radius,angular_speed=.5,phase=0,slot_index=0,slot_count=1,...movement_options})` / `gameCharacter.orbitTarget` follows a moving world-space circular goal using ordinary native pathing, braking, collision and personal-space queries. Slot geometry and trigonometry stay in Basement. Phase starts from the world's simulation time and persists with the motor; identical requests reuse the current path and phase. Slot counts/indices must be integral and in range. A logical squad coordinator may assign slots without calculating physical goal positions or maintaining another spatial index.

### Native impact regions, beams and motion samples

`physicsSystem.testBodyRegion(body, { collision_shape, point, radius = 0 })` tests an authored local shape against a world impact footprint. This uses the same collision detector as physical contacts, without creating a hit body.

`physicsSystem.castBeamFrom(source, { local_position = [0,0], range, width = 1, penetrating = false, include_groups, target, direction, angle })` resolves aim and endpoints and sweeps the shared grid. Returns `{ from, to, rotation, hits }`. Width is the sweep radius. Cover clips the endpoint unless `penetrating` is true; that flag deliberately permits attacks through cover. Hits use the normal query filters and ordering.

`physicsSystem.getBodyMotion(body)` returns detached `{ distance, previous_rotation }` from the most recent fixed step. Animation may read actual travel without owning a second position or velocity history.

`physicsSystem.getConstraint(constraintOrId)` returns the existing immutable handle or null with direct ID lookup. It does not enumerate constraints.

`findWanderPlacement` additionally accepts `inner_range = 0`, bounded by `near_range`. Uniform area sampling chooses an annulus; checked fallback placements inside its inner radius return null.

`characterMotor.setMovement(direction, { angle, speed, acceleration })` optionally overrides acceleration for that request only. Values must be finite and nonnegative. The engine applies the force/velocity change, contacts and locks. Saved overrides are validated before replacement of a live world.

### Encounter geometry requests

`isDirectionInArc(body, direction, { half_angle = Math.PI })` tests a world direction against native body facing. Projectile hit events include the engine-produced `incoming_direction` (toward the projectile's origin), allowing directional shields without gameplay angle/vector calculations.

`queryRadialRegion(source, { radius, radius_to = radius, progress = 0, previous_progress = progress, thickness = null, outside = false, limit_radius, include_groups, ...filters })` returns `{ radius, hits }` using the existing spatial grid. A thickness requests a radial band swept between previous/current progress, so an expanding pulse does not skip crossed targets. `outside:true` queries outside the interpolated safe radius but inside a required finite `limit_radius`. Body extents are included. No unbounded world scan occurs.

`findRelativePlacement(body, anchor, { distance, angle_offsets = [Math.PI], ...options })` tests authored angles in the anchor's frame. A full candidate must have a clear landing and anchor-to-candidate sweep; blocked fallbacks return null. The caller can recheck the committed destination with `isPlacementClear` before teleporting.

`findFiringPlacement(body, target, { near_range = 420, inner_range = 140, max_candidates = 24 })` searches a bounded native candidate sequence for a clear landing, line of fire and path from the source. It reuses shared-grid placement, ray and path queries; it creates no actor-owned navigation index.

## Rigs and animation

`physics.rigs` is the world's `rigSystem`; the application runtime also exposes the same instance as `api.rigs`. It shares the world's fixed step, body registry, persistence and spatial grid. Ordinary joints and anchors create **zero physics bodies**. Animation data is in `animation/`; this folder remains usable when copied out of the game.

### `rigDefinition`

`new rigDefinition({rig_id, joints, anchors})` compiles an immutable hierarchy. `joints` contains `{name, parent:null, position:[0,0], rotation:0, scale:[1,1], limits:null}`. `limits`, when present, is `{min_rotation,max_rotation}` in radians. Parents may appear after children. Duplicate names, missing references, cycles and singular local scales are rejected. `anchors` is a dictionary of `{joint,position,rotation,scale}` offsets. The hierarchy supports multiple roots and non-humanoid forms.

- `rig_id`: authored identifier.
- `getJointNames()` / `getAnchorNames()`: detached name arrays.
- `toJSON()`: detached portable definition.

### `rigPose`

`new rigPose(definition)` creates mutable local transforms from a definition or its descriptor.

- `definition` / `revision`: compiled definition and changed-pose revision.
- `resetPose()`: restore authored rest transforms.
- `setJoint(name,{position?,rotation?,scale?})`: update one local transform.
- `setPose(joints,{weight:1,additive:false,mask:null})`: atomically update/blend named local transforms; limits clamp rotation. Additive positions/rotations are offsets; additive scale is a factor. Rotation blends take the shortest arc. `mask` is an array of joint names.
- `getLocalPose()`: detached local transform dictionary.
- `getJoint(name,{root?})` / `getAnchor(name,{root?})`: resolved `{position,rotation,scale,matrix}`. Optional `root` is a transform. `matrix` is the complete affine `[a,b,c,d,x,y]` transform, preserving shear from scaled hierarchies. Resolution is cached until the pose changes.
- `getSnapshot()` / `load(snapshot)`: versioned pose exchange; invalid loads leave the pose intact.

### `animationClip`

`new animationClip({clip_id,duration,loop:true,tracks:[],markers:[],root_motion:null})` compiles immutable authored data. Times are seconds. Each track is `{joint,channel,keys}`. `channel` is `position`, `rotation` or `scale`; keys are `{time,value,interpolation:'linear'}`. Vector channels use two numbers; rotation uses radians. `interpolation` can also be `hold` or `smooth` and applies from that key to the next. Key times must strictly increase within the duration. Channels hold their first/last authored values outside their keyed interval; non-looping clips hold at the end. Animation scale keys must be positive.

Markers are `{name,time,data:null}` with portable JSON payloads. A separate translation-only `root_motion` track uses `{time,value:[x,y],interpolation?}` keys in body-local space. It never writes a joint or teleports a body.

- `clip_id`, `duration`, `loop`: read-only authored properties.
- `sample(time)`: detached partial local pose. Looping samples wrap; non-looping samples clamp.
- `getRootMotion(from,to)`: accumulated local displacement, including crossed loops.
- `toJSON()`: detached descriptor suitable for reconstruction.

### `animationController`

`new animationController({definition,clips:[]})` combines clips and procedural poses. Standalone controllers have no automatic clock; callers explicitly advance them. Controllers returned by `physics.rigs.createRig` are owned and advanced exclusively by that world.

- `definition`, `revision`: current definition and resolved-pose revision.
- `addClip(clip)`: register an immutable clip or descriptor; unknown joints and duplicate IDs reject.
- `play(clip_id,{layer:'base',fade:0,weight:1,speed:1,additive:false,mask:null,restart:false,distance_per_cycle:null,root_motion:false})`: select a clip on a named layer. Repeating the same selection preserves playback; use `restart:true` to reapply options and restart. Layer order is insertion order. A fade crossfades the current layer contribution into the selected clip; masks select affected joints. Additive layers fade their offsets from neutral when first introduced.
- `stop(layer='base')`: remove a layer and reevaluate remaining layers.
- `pause()` / `resume()`: pause/resume this controller, including distance playback.
- `seek(time,{layer:'base'})`: set an absolute clip clock, suppressing skipped markers.
- `setProceduralPose(joints={})`: replace the final partial local-pose overlay; other joints remain clip controlled. No callback or render-time evaluator is stored.
- `advance(seconds,{distance:0})`: evaluate a standalone controller and return crossed marker packets. Owned controllers reject direct calls. Steps are 0..0.1 seconds; speed is 0..16. Non-looping end markers emit once. Markers at zero emit on the first positive advance; endpoint and next-loop zero markers are separate authored crossings. Pathological crossings over the marker budget reject before advancing any layer.
- `getRootMotion(seconds)`: preview the base layer's requested local displacement, or `null` when root motion is disabled/paused.
- `getJoint(name,options)` / `getAnchor(name,options)`: detached resolved transforms.
- `getPose()` / `getState()`: detached local transforms / playback state (`paused`, `layers`, `layer_order`).
- `getSnapshot()` / `load(snapshot)`: portable definition, clips, clocks, fades, marker cursors and procedural pose. Validation is atomic. An owned controller cannot replace its definition through `load`.

`distance_per_cycle` advances the clip by actual body travel after collision resolution, divided by the authored stride distance. A blocked character does not walk in place. `root_motion:true` requires an authored root track on the time-driven base layer and an unmounted native character motor. Before physics, the world converts that displacement into motor intent. Native acceleration, combined mass, axis locks and collisions determine actual travel. This is a desired velocity, not a promise to reach an exact animation endpoint. Mounting a character suspends root translation while its local animation can continue. Disabling/stopping/removing root motion cancels only the motor intent it owns; a subsequent independent movement command is preserved. Root rotation, automatic ragdolls and skeletal collision capsules are not part of this initial API.

### `rigSystem`

- `createRig(body,{definition,clips:[]})`: bind one controller to an existing authoritative body/entity. A body may own one rig. It creates no additional bodies or spatial grid.
- `getRig(body)`: controller or `null`.
- `removeRig(body)`: remove a rig; detach bodies bound to its anchors first. Removed-body/rig controllers reject further mutations.
- `getPose(body,{blend:1,world_space:false,relative_to:null})`: detached resolved `joints` and `anchors`. Blend interpolates previous/current **local** transforms before hierarchy resolution. `relative_to` returns transforms relative to a named joint, e.g. an unscaled authored root; it cannot combine with `world_space:true`.
- `getAnchor(body,name,{blend:1,world_space:true})`: detached anchor transform, using the body's render interpolation when returning world space.

The world emits `animationMarker` after simulation with `{body,entity,layer,clip_id,name,time,data,simulation_tick}`. Gameplay decides whether a marker produces sound, effects or an attack. Animation does not implicitly apply damage.

Existing `attachBody(child,{parent_body,rig_anchor:'hand_r',local_position:[0,0],local_rotation:0,combine_mass:false})` can bind a real body to a named rig anchor. `local_position`/`local_rotation` are offsets from that anchor. `setAttachmentPose` changes those offsets. `getAttachmentState` includes `rig_anchor`, `anchor_offset_position`, `anchor_offset_rotation` and the currently resolved body-relative local transform. The native attachment manager places, interpolates and carries the existing child body, including anchor translation/angular velocity. Optional combined mass uses existing compound mass/inertia calculations; changing the anchor invalidates the parent mass cache. This is a prescribed mount, not a simulated joint chain or a motor-work/reaction-torque solver.

`savePhysicsState` includes rigs; `loadPhysicsState` validates rigs before replacing the live world and restores them before named-anchor mounts. Older snapshots without rigs continue to load. Removing bodies and clearing the world remove their rigs. Render reads do not advance playback; the application runtime rejects animation mutations from render hooks.
