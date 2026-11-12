# Changelog

## The registry moves to the Directory — 2026-11-12

- `assetLibrary` moved out of the Basement into the engine's Directory (`engine/directory/registry.mjs`). The Basement no longer exports it and never imports the Directory.
- A world now takes any data source as `asset_library`: an object with `resolveTemplate()` and `getResource()`. New exports `isDataSource` and `EMPTY_DATA_SOURCE`; a world given none uses the empty source, which behaves exactly as an empty `assetLibrary` did.
- The registry's own tests moved with it to `engine/directory/tests/registry.test.mjs`.

## Faster spatial grid — 2026-11-12

- `spatialGrid` now has a coarse level for large entries (more than 16 cells across), numeric cell keys, array buckets and stamp-based deduplication. On the new `benchmarks/grid.mjs` it is about 1.5–1.9× faster than before; whole-world moving scenarios gain 15–30%.
- `querySegment` and `querySweep` now return only entries whose bounds meet the padded segment, rather than every entry in the visited cells.
- `getStatistics()` adds `coarse_instances`. The public API and the one-grid-per-world rule are unchanged.

## Navigation system — 2026-11-12

- Added `physics.navigation`, one request API for travel from A to B. It has a field layer (open space, any agent radius) and a road layer (authored lanes for vehicles). `navigate(body, to)` plans and hands the route to the body's existing character or vehicle motor.
- `physics.findPath` now uses the navigation clearance field instead of a shape cast per A* edge. That is about 100× faster on the city benchmark, and it finds routes the old bounded search missed. Paths are safe by construction, pooled, widened when a detour leaves the search area, and reusable: `characterMotor` keeps its path while the chunks it depends on are unchanged.
- The field is a lazy, chunked cache of obstacle distances built from the one spatial grid. Static/prop edits dirty only nearby chunks. Characters never touch it.
- Road routes minimise travel time, snap through the shared grid, cache node routes, honour closed lanes and save with the world. Generic spatial-instance saves now export only `spatial:` entries.
- Behaviour change: field planning ignores moving bodies and per-agent collision masks. Motors' local avoidance handles crowds. See `docs/navigation.md`.

## Shared renderer/camera boundary — 2026-11-10

- Added the separate Basement rendering package and exposed `api.render` / `api.camera` in the new runtime. Only the Canvas backend owns contexts; appearance producers submit pooled data packets and ordered passes.
- Added cached geometry/materials, image/target ownership, clips, gradients, text, shadows, dashes, capability checks and fresh-surface backend preparation. Visibility queries use the same physical world index.
- Camera following and coordinate conversion are independent of drawing and physical state. Surface changes retarget the central mouse adapter. The regular new-runtime example now draws by packets.
- Existing classic artwork and production boot still need class conversions. No WebGL implementation is claimed. The complete contract is in `src/engine/basement/rendering/README.md` in the checkout.

## Shared controls service — 2026-11-10

- The game runtime now owns the canonical Basement `controlSystem` through `api.controls`; the controls package is separate from physical simulation. Its API is documented in `src/engine/basement/controls/README.md` in the game checkout.
- Classic callers use the same class under the existing name. New runtime polling, edge lifetime, focus/cancellation, touch ownership and held-input suppression are centralized; old game-specific input policy conversion remains pending.

## Runtime coordinator — 2026-11-10

- Added optional private `step_authority` for runtime-owned worlds; direct unauthorized stepping rejects before commands or time advance. Standalone callers remain unchanged, and physical saves do not serialize or release clock authority.
- The game checkout now contains `src/engine/lobby/runtime/game-engine.mjs` and its level/system lifecycle API, executable multi-level example and acceptance tests. This coordinator uses the canonical Lobby and one native world; production class conversion/boot replacement remains pending.

## Playable apartment cutover — 2026-11-10

- Bundled the native runtime into the playable build; Directory-authored apartment actors now own official bodies, one shared index and one simulation clock.
- Added engine layout compilation, grip geometry, force-limited springs, bounded directional/rescue placement, projectile muzzle clearance, facing controls and explicit command commits.
- Replaced apartment furniture response with engine constraints; connected automatic doors, curtain cloth, native snapshots, scene cleanup and render snapshots. Furniture-attached lighting shares the prop body.
- Added generated-game and Chromium acceptance coverage. Other maps, street actors, full combat/story and cosmetic parity remain pending; no global retirement is claimed.

## Composite mass batch — 2026-11-09

- Added optional `combine_mass` mounts and `getMassProperties`: cached aggregate mass, local/world center, parallel-axis inertia and contributing body count without overwriting configured masses or identities.
- Shared contacts, force/impulse commands, joints and free integration now use the aggregate center. Combining child forces route to the independent root at the child's position. Nested contributions are counted once; inactive children and noncombining links are excluded.
- Vehicle/character acceleration and braking use their own configured mass as a force budget; traffic stopping predictions account for carried weight. Bicycle yaw uses an intrinsic-inertia torque budget, and tyre/joint lever arms use the aggregate center.
- Added opt-in torque-limited character facing with `movement.physical_turning`, allowing off-center loads to resist turning.
- Inelastic capture merges momentum at the mounted placement; combined release inherits velocity by default. Snapshots restore relationships without replaying capture. Prescribed pose/exit edits remain placements, not simulated actuators.
- Official vehicle seat APIs accept the mass option, and the browser preview exposes it. The actual classic game still uses its legacy world; a new generated-game ownership gate reports that directly.

## Attachment ownership batch — 2026-11-09

- Added prescribed body mounts with stable identity, parent-composed render interpolation, inherited activity, safe path/endpoint checked detachment, lifecycle cleanup and snapshots.
- Reserved pending mounts prevent duplicate ownership/cycles; subsequent pending commands retain creation/registration order. Mounted body motion commands cannot override the attachment.
- Native vehicle seat APIs now use Directory seat layouts and engine attachments; mounted pedestrian behavior suspends ground decisions. Occupied replacement is rejected before mutation.
- Mounted traffic controllers release junction reservations instead of blocking other drivers while carried.
- Bicycle steering now drives canonical angular velocity through tyre grip; the world integrates rotation once. Mounted point velocities therefore include the same yaw used by vehicle motion. Steering feel/tuning needs validation during live cutover.
- Classic seat and muzzle world transforms now call shared Basement geometry. Its legacy passenger synchronization and body-ownership switch remain unfinished.

## Factory/caller cutover batch — 2026-11-09

- Added stateless authored-path projection and local-pose transformation queries. The same import-free module is consumed by the classic build and ESM clients.
- Directory now owns general vehicle creation, purpose metadata, owned/taxi/mission presets, and safe official body replacement. Ambient capacity and cleanup apply only to ambient vehicles, with pending-spawn reservations.
- Street population policy no longer advances the physics clock; the application explicitly steps its owner world.
- Live classic vehicle callers now share one explicit legacy constructor boundary; taxi summoning delegates from UI to its service and Basement geometry. This is production caller consolidation, not a completed replacement of live physics ownership.

## Street-client follow-up — 2026-11-09

- Added protected entity `physics_system` ownership, movement-contact prediction through a cached shared-grid motion envelope, native dodge requests, suspension of motor control for physical knockback, and engine contact speed telemetry.
- Added direct fixed-orientation translation sweeps for circles/polygons, fixing a pedestrian/car-corner convergence failure caught by the street browser client.
- Official game-side ESM TrafficVehicle/Pedestrian subclasses and managers now consume these APIs. Their source, Directory definitions and client documentation live outside this reusable folder.
- Current single-file game loading and legacy classes remain pending production cutover.

## 0.3.0 — 2026-11-09

- Added distinct collision/render/light bounds in the single index, physical pair filtering, point/viewport queries, contact priorities and symmetric body exclusions.
- Added prismatic sliding joints and automatic template-declared joints/motions with rollback and spawn-relative default anchors.
- Added two-axle tyre impulses, load/grip/wetness telemetry, and persistent vehicle state.
- Added native traffic itineraries, moving-body prediction, signal stops, conflict reservations and clearance-checked authored passing routes.
- Added collision-pipeline scripted motion/orbits and anchored cloth meshes with wind, world contact, owner exclusions, lifecycle cleanup and snapshots.
- Replaced sampled teleport endpoint searches with convex occupied-interval union, including compound blockers and narrow free landing gaps.
- Expanded Directory templates for all six migration groups; added an explicit legacy retirement audit.
- The classic-script game and its old entity classes have **not** been switched over. This release supplies native capabilities; it is not a completed six-group migration.

## 0.2.0 — 2026-11-09

- Added the official `gameEntity` base and `gameElements` owner; specialized elements now inherit it directly and register by construction.
- Added prop/static/trigger/decoration elements, default nonphysical spatial membership, scoped lifecycle/event cleanup and constructor rollback.
- Reserved entity identity/components/transforms against subclass shadow fields and rejected legacy physical aliases.
- Added generic data-only `assetLibrary` inheritance/resources and Directory-owned definitions referencing existing game database chapters.
- Added entity identity to queries/events and snapshot format 2 with subclass/data restoration that does not replay gameplay constructors. Applications reconnect subscriptions after loading.
- Breaking pre-integration change: `createProjectile` returns `gameProjectile`, `createHitVolume` returns `gameTrigger`, and specialized constructors take `(elements, packet)`. No legacy wrapper/adoption route is provided.
- Kept the current game's entity classes and generated HTML unchanged pending their official rewrite/onboarding.

## 0.1.0 — 2026-11-09

- Added an independent native-ESM Basement physics package with no game/global/browser dependencies.
- Added authoritative body handles, one shared spatial index, shape detection/sweeps, contact response, body commands and lifecycle events.
- Added baseline character/vehicle/path/projectile controllers, constraints, particle pools and anchored chains.
- Added query/awareness APIs, nonphysical spatial registration, rendering snapshots and versioned state save/load.
- Added reference documentation, architecture/behavior/migration/status pages, executable examples, contract tests and a spatial benchmark.
- Left the current game's runtime and generated HTML unchanged. Detailed traffic, tyre, Flit and cosmetic parity are explicit next-stage work.
