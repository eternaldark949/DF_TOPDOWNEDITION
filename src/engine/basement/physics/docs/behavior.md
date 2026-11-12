# Behavior contract

## Units and authority

Time is seconds, positions/lengths are world units, velocities are units/second, acceleration is units/second², mass is kilograms and angles are radians. World units can be pixels if that is the project's convention. Forces and impulses are mass×acceleration and mass×velocity. Damping uses `exp(-rate × seconds)`, not per-frame multipliers. Convert old tick constants once in the migration adapter.

Body position is its authored origin, not a box corner; shapes are centered there by default. A mass-combining assembly can have an offset center of mass. Linear velocity remains velocity at the body origin, and the engine integrates free assemblies about their mass center. Box `dimensions` are full extents. Rendering offsets and old top-left coordinates are adapter concerns. The engine calculates inertia: exact for centred circles; enclosing-box approximation for other shapes. Multiple compound pieces belong to one body, with one mass and rotation. A deepest contact per body pair is iteratively resolved; there is no multi-point contact manifold or warm-start cache yet.

Static bodies have zero effective inverse mass/inertia and do not integrate. Kinematic bodies follow velocity commands but do not accept forces or impulses. Character motors command translational force budgets and facing; physical contacts do not spin characters unless `movement.physical_turning:true` enables torque-limited facing and angular response. `no_collision` bodies can move and receive explicit forces/impulses but are excluded from physical contacts and exact physics queries. Nonphysical spatial records remain available to culling/inspection through the shared index.

Locks zero physical velocity at the body origin on an axis and remove its effective inverse mass from contact/joint correction. Offset composite inertia and angular Jacobians include the support reaction of locked origin axes. Explicit placement/teleport is permitted to reposition a locked/static body, since this is how authored placement and load/editor operations work. Placement automatically updates the index. Snapshots are copies and never a second source of truth.

## Filtering and sensors

Contact requires both active bodies, neither `no_collision`, and reciprocal group/mask acceptance. Projectiles use exactly these rules. Query visibility additionally uses `query_mask` and the request's `query_bit`. Pure geometric prediction is intentionally independent of masks; it can answer whether two excluded shapes would geometrically intersect. Physical clearance queries supplied with a body use reciprocal physical masks.

A ghost reports contacts and hit events but does not separate bodies, receive a physical impact from that contact or stop a projectile. Whether a sensor hit should deal damage is a gameplay policy, using `sensor_only`. Ghosts are visible to queries unless excluded. Inactive bodies leave both the simulation and shared index.

Contact normals point A→B; position correction moves A opposite the normal and B along it. Linear and angular responses use the same effective mass/locks. Friction combines as the geometric mean; restitution combines as the lower value. Set both materials' restitution for a bouncy wall interaction.

## Time, commands and events

Call `updateState` once for each fixed Lobby step. This package does not create its own timers or animation loop. A step accepts positive seconds up to 0.1; the default is 1/60. Pausing means the owner does not call it. Never tie gameplay stepping directly to render frequency.

Normal external commands commit immediately between steps. Commands made inside event delivery commit at the beginning of the next step, in request order. New bodies can be returned immediately as reserved handles, but do not appear in world lookup/spatial queries until that boundary. Saves/loads reject pending commands. Removed handles cannot mutate a later body that reuses an ID after clearing a world.

Events are emitted after contacts/constraints have finished. Listeners cannot rewrite vectors or contact information. They may issue requests for next step. Listener failures are reported together after all listeners run. A simulation/geometry convergence failure throws rather than silently claiming clear space; the world does not promise rollback of an already-started simulation step after an internal exception.

## Continuous detection and sleeping

Fixed-orientation translation uses direct convex/rounded-boundary sweeps; rotating shapes use conservative advancement with angular reach, including two moving bodies. Existing contacts are resolved after motor/force evaluation and before travel so an inward motor request does not repeatedly freeze valid tangential movement at t=0. Spatial bounds cover swept movement so crossing objects are candidates even when their final shapes are separate. Physical CCD clips at first impact and resolves it. It does **not** simulate the remaining fraction of the step after impact in this baseline. Collision-disabled CCD falls back to endpoint overlap. Convergence has an explicit iteration limit and throws on exhaustion.

Projectile contacts are ordered along the travelled segment. Owner/repeated targets are ignored, sensors do not consume penetration, physical impacts use shared mass/locks, and lifetime truncates travel. The engine emits impact information; it does not read HP, alliances or weapon damage. Express collision alliances as masks/profiles in the game adapter.

Uncontrolled quiet bodies sleep after the configured delay. Motion/impulse requests wake them. Motor/joint island sleeping and continuous resting-contact warm starting remain future optimizations. Solver iteration budgets and candidate counters are observable, not hidden in gameplay.

## Paths and spatial limits

The baseline planner uses bounded A* routing nodes with exact swept clearance for each edge. This node lattice is search data, not an obstacle/spatial index. Failure/budget exhaustion returns `null`. Character motors replan at a bounded cadence. Vehicle paths use a motor and forward clearance/braking. The native traffic controller supplies route/signal/conflict scheduling and clearance-checked authored passing itineraries; it does not invent a passing lane.

`findClearPlacement` unions convex occupied intervals along constant-orientation translation and selects the furthest clear endpoint with a numerical skin. Compounds are decomposed, so narrow free intervals are retained. The final endpoint is checked again. General sweep convergence limits still apply; rotating placement searches are not supported.

Spatial query workloads are bounded: unreasonable million-cell bounds/segments/sweeps throw rather than allocate without limit. Segment/corridor traversals, ordinary bounds and physical contact queries all use the same instance registry. Tools can inspect `getStatistics()` to diagnose cell size or oversized bodies.

## Persistence

Versions 0.2 and 0.3 use snapshot format 2. It includes the official entity registry and declared gameplay `data` as well as physical records. Directory libraries and custom classes must be installed on the destination before load. Gameplay constructors are not replayed; restored objects keep their registered prototype. Reconnect gameplay subscriptions after loading. Format-1 snapshots from the initial independent prototype are not accepted.

Snapshots include body configuration/state, forces, motor intentions, paths, projectile hit tracking, constraints, particle/chain membership, nonphysical metadata and simulation tick. They exclude listeners, transient contact history and pending event queues. After load, overlapping pairs produce fresh `contactBegin` events; a sound/effect consumer may suppress them during its load transition.

Load requires matching world config and validates in a separate disposable world first. Validation failure preserves the existing world. Body handles from before a successful load become invalid; fetch the restored handles by ID and reconnect gameplay ownership. Event subscriptions remain registered. Save/restore within the same engine version is supported; cross-version save migration is a separate compatibility concern.
