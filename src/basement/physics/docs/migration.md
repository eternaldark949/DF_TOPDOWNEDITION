# Bringing the game onboard

The native runtime is now loaded in the playable build and owns the apartment scene. Apartment construction, lifecycle, tests and parity limits (game checkout: `src/directory/APARTMENT-CUTOVER.md`) document that completed slice. Other maps retain old ownership and require the migration below. No synchronized legacy/native body bridge is used.

Native prerequisites are recorded in the [six-group ledger](six-groups.md).

## Adapter boundary

The official [gameEntity contract](entities.md) is implemented. Existing classes must be rewritten to extend it or the matching specialized base and get their templates/resources from the Directory. The adapter is only a build/data/system boundary: it must not adopt an old object as a surrogate entity, retain a second physical owner or synchronize a writable `x/y` mirror.

1. Instantiate one engine world for the game session with the Directory asset library. Register game-specific subclasses with `physics.elements`. The Lobby calls `physics.updateState` once per fixed step and skips it while paused.
2. Import authored geometry through shape/body packets. Convert box top-left coordinates to centres and convert per-tick tuning to seconds once in this adapter. Retain gameplay ownership maps keyed by engine body ID, not duplicate physical state.
3. Replace movement writes with character/vehicle/projectile requests. Read physical snapshots or render snapshots at the required boundary. Remove render-time writes to simulation positions.
4. Express collision alliances, sensor behavior, materials and constraints as engine data. Connect engine events to game damage/audio/effects, without physical response in those handlers.
5. Replace every spatial consumer: traffic, navigation clearance, awareness, projectiles, targeting, culling and interactions. Body and nonphysical bounds register in the one Basement index. Keep route topology/itineraries as data, not private obstacle searches.
6. Retire old solvers, geometry helpers, collision grids and compatibility aliases as their consumers are migrated. Do not leave two active routes to the same physical outcome.
7. Exercise every map/minigame, save/load, pause, frame limits, controller mode and special movement; measure busy scenes before/after on matching devices/settings.

## Replacement mapping

| Current game operation | Destination |
|---|---|
| `CollisionSystem`, `collisionWorld`, `vehicleKit` response calls | Registered bodies and the world simulation pipeline. |
| Traffic `SpatialGrid`, collision `SpatialHashGrid`, other spatial candidate grids | `physics.spatial_grid` via world registration/query APIs. |
| `x/y/vx/vy/angularVel` writes, per-entity knockback integration | Character/vehicle motors; `applyImpulse` / `applyImpact`; read-only body handles. |
| Traffic braking/clearance, lane-runner movement | Engine `vehicleMotor` / `pathMotor`; route/signal policy supplied as data. |
| Bumper physics, enemy wall push/bounce and companion separation | Engine profiles, motors and shared contact solving. |
| Projectile damage-scaled force/torque | Authored impact strength/profile plus shared engine impulse application. |
| Navigation obstacle geometry, Flit landing and melee intersections | `findPath`, clearance/placement queries, hit volumes and shape casts. |
| Door physics and furniture correction | Hinge/drag/attachment constraints. |
| Cosmetic particles/hair/cloth solvers | Particle/chain engine plus rendering adapters. |
| Physical save fields | Versioned physics snapshot and gameplay body-ID references. |

## Gates before deletion of the old route

The independent implementation still needs game-specific adapters and richer navigation/traffic/cosmetic components. See [status](status.md). The existing game's particular tyre model, precise Flit landing expectations, traffic scheduling and clothing simulations must be characterized and reproduced or deliberately changed with review. A generic baseline must not silently replace their behavior just because it exports similarly named methods.

Tests should verify both behavior and ownership: mask/lock/mass consistency across every response, one spatial service, no camera-dependent physics holes, no direct game-state corrections, no production all-pairs searches, no hidden replacement indexes and no allocations or repeated static work that defeat the redesign. Dense genuine contact workloads require their own benchmarks.

The current `tools/build.mjs --check` should continue to pass throughout this independent stage. Integration with the classic-script single-file build needs an explicit bundling/adapter step; loading ESM files into that build without such a step is not supported yet.
