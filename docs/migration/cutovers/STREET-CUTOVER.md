# Traffic/pedestrian cutover progress

The apartment now has a [native scene cutover](APARTMENT-CUTOVER.md). This page tracks the still-legacy street client. The first factory/caller batch is applied to the generated playable game. **Its body ownership and physics remain legacy.** No second physics world, body-adoption wrapper, or shadow spatial index has been added to bridge the old game.

| Item | Status | Source/destination |
|---|---|---|
| Shared official vehicle creation | Implemented | `game-vehicle-factory.mjs` creates official engine entities from Directory definitions for ambient, owned, mission and taxi purposes. |
| Ambient admission and cleanup | Implemented for official managers | `traffic/traffic-manager.mjs` applies caps only to ambient entities, reserves event-time pending capacity and preserves owned/mission entities during street cleanup. |
| Official owned replacement | Implemented | Factory excludes the old body from placement testing, creates a fresh body/identity, then retires the original. Failed requests retain the original. |
| Live default owned-car caller | Consolidated | `legacy/engine/game-engine.js` calls `gameVehicles.create` with an initial pose. |
| Live garage replacement caller | Consolidated | `legacy/engine/cars.js` sends the new entity's initial pose through the shared construction boundary. |
| Live delivery-van caller | Consolidated | `legacy/engine/cars.js` selects `mission_id:amber_delivery`. Appearance/model/local spawn data comes from `GAME_DB.vehicles.mission_vehicles`; Basement resolves the local pose. |
| Live ambient traffic caller | Consolidated | `legacy/traffic/traffic-manager.js` calls the shared boundary after its existing admission policy. Old sensing/admission math still needs replacement. |
| Live taxi callers | Consolidated | `ZibSystem.spawnOnLane` owns creation and registration for ambient and summoned taxis. |
| Phone taxi caller | Rewritten | UI calls `ZibSystem.summonNearest`; no constructor, lane projection, placement math or population-array insertion remains in `zibMe`. |
| Shared path/placement geometry | Implemented and used live | `basement/physics/motion/path-geometry.mjs` supplies projection, nearest authored path and local-pose transformation. The build bundles this module with the native runtime from its ESM source. |
| Directory appearance source | Applied live and in official client | `GAME_DB.cast.pedestrian_appearances` supplies legacy static views and official entity resources/appearance IDs. |
| One simulation clock | Official clients corrected | `StreetPopulation.updateState` performs game policy only. The application/Lobby explicitly steps its world once. The preview and tests use that separation. |
| Remaining legacy constructor boundary | Pending retirement | `legacy/directory/game-vehicles.js` contains the only direct production `new TrafficVehicle` call. It still creates the old class; it does not claim native ownership. |
| Native entity class switch | Pending | Change live manager initialization/factories and remaining raw field callers to official entities; do not adopt old bodies or restore writable physical aliases. |
| Static/player/owned-car interaction | Pending | Register the game's actual scenery and other physical actors in the same official session world before retiring their old collision routes. |
| Lane routing data | Implemented, not yet used live | `directory/road-navigation.mjs` converts the city's built lanes and junction turn paths into Basement navigation road data (`:in`/`:out` nodes per lane, one connector per real turn). `tools/test-road-navigation.cjs` routes the real city map with it. Live traffic still uses the classic planner until vehicles move to the native world. |
| Roads, signals, driver behavior | Pending | Convert authored topology, signal demand/phase policy, lane restrictions and driver intent. Native motors, predictions and clearance replace their physical calculations. |
| Native seats and checked exits | Implemented in official ESM clients | Engine-owned mounts preserve body identity, interpolation, filtering, activation and saves. Occupied replacement is rejected before mutation. |
| Optional composite mass | Implemented in official ESM clients | Seat requests/authored data can opt into aggregate mass/center/inertia. Contacts, motor force/torque budgets and traffic stopping predictions use the same engine properties. |
| Seats, garage, taxis and mission consumers | Live identity switch pending | Port occupant identity/attachments, entry/exit placement, ride state, customization and mission consequences to engine commands/events. |
| Rendering, lights, reflections and minimap | Pending | Read render snapshots and shared-index visibility; replace raw physical field reads and interpolation swaps. |
| Save/reset/replay | Pending | Store official entity references and physical snapshots; remove direct physical field restoration and legacy counters. |
| Old solvers/indexes/profiling hooks | Pending deletion | Delete only after their consumers use the official world. Keep gameplay effects and profile the engine stages. |

The construction boundary is a staged live-client refactor. The official ESM factory is the destination; the classic boundary is explicitly temporary and must be removed when that client switches. There is no backend-selection flag or synchronization loop between them.

Verification commands:

- `node --test src/engine/basement/physics/tests/*.test.mjs tools/test-entity-assets.mjs tools/test-game-physics-scenarios.mjs tools/test-street-population.mjs`
- `node tools/test-vehicle-creation.cjs`
- `node tools/test-game-db.cjs`
- `node tools/test-game-regressions.cjs`
- `node tools/test-live-body-ownership.cjs` — a failing retirement gate until the actual playable actors and Lobby use the official session world.
- `node tools/build.mjs --check`
- Optional Chromium/Playwright: `python tools/test-live-vehicle-factory.py` and `python tools/test-street-browser.py`.

`node tools/audit-physics-ownership.mjs --check` remains a failing retirement gate until the legacy owners, indexes, API references and final constructor boundaries are gone. It is not a complete mathematical proof of ownership and must be followed by game behavior/performance review.

The global generated-game ownership gate still fails because legacy solver/base classes remain loaded for other scenes. Apartment bodies now pass ownership checks; `tools/test-native-apartment.cjs` separately checks its live execution and lifecycle. Composite mass does not complete the remaining street cutover.
