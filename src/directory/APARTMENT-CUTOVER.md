# Native apartment cutover

The playable `apt_949` scene now uses Basement as its physical authority. This is a scene cutover, not completion of the whole-game migration.

## Construction and ownership

`game-assets/apartment.json` defines templates and interaction rules. Its 63 furniture/fixture placements, lamps and soft lights are in `game-assets/maps/apt_949.json`, drawn from the shared prop catalog `game-assets/props.json`. `apartment-definition.mjs` combines them with GameDB map/room geometry into a generic map definition, and the Basement map system (`src/basement/maps`) builds and runs the scene: walls, props, lamps, exits, rooms, doors and curtains. `legacy/engine/apartment-rooms.js` reads the map's room graph for the player's room and door openness between rooms. `levels/apartment.mjs` constructs official player, props, doors, roster characters, sensors, lights and curtain meshes. Registered game subclasses contain gameplay metadata and intentions; Basement owns their bodies, velocities, contacts, impulses and spatial membership.

The classic build includes the native ESM graph through `tools/bundle-native.mjs`. It resolves static relative imports and JSON modules deterministically; unsupported syntax or dependency cycles fail the build. The source engine remains independently importable and dependency free.

`legacy/engine/apartment-level.js` commits the actual scene, routes controls and steps its world once per playable tick. Old entity registries and pending queues are emptied on entry. Legacy collision, integration, interpolation and spatial queries are bypassed in this scene. No old body is adopted or synchronized into a second world. An unstepped replacement is prepared and validated before retiring the current scene.

An outside car is a plain parking checkpoint while indoors, not a live legacy body. Leaving destroys the apartment world and reconstructs the still-legacy destination scene from gameplay/save data. Other levels remain on the classic host. Their classes and callers still need conversion to the shared runtime; this is not a requirement to add more apartment-style scene handlers.

## Engine requests used by the frontend

| Concern | Request or read |
|---|---|
| Input and facing | `setMovement`, `lookInDirection`, `lookAt`, `clearFacing` |
| Grip selection | `peruseNearbyEntities`, `getBodyGrip` |
| Furniture coupling | `createConstraint` with a force-limited spring; same prop body switches static/rigid |
| Furniture turning and doors | `motion.rotateBodyBy`, collision-aware motion timelines |
| Flit and rescue | `findDirectionalPlacement`, `teleportTo`, `findNearbyPlacement` |
| Standard projectiles | `createProjectileFrom` with engine barrel clearance |
| Rendering | Engine render snapshots and cloth point snapshots |
| Save/load | `commitCommands`, `savePhysicsState`, `loadPhysicsState` |

Furniture release removes its spring and returns the same body to static. The game never applies a post-contact positional correction. Authored lamp emissions on movable furniture share that furniture's light component and grid entry; their pose follows the engine body. Room/interaction queries use the same engine spatial service.

The renderer retains appearance packets and sprite caches, not physical actors or a private spatial index. The original prop and humanoid artists consume those packets. Repeated rendering must leave physics snapshots unchanged. Curtains simulate through native cloth; old render-time hair/garment integration is bypassed for native presentation.

## Persistence and lifecycle

New saves contain the official native world snapshot. Old apartment saves retain their indexed `[center_x, center_y, rotation]` furniture layout contract. Saves release temporary furniture control and commit queued commands without advancing simulation. Reset, replacement and exit retire the prior world's bodies, cloth and renderer caches. Save loading commits its scene synchronously before restoring scene data, avoiding restoration into a fading-out scene.

## Remaining work and parity limits

- City streets, traffic, pedestrians, vehicles, enemies, other maps and minigames still use legacy physical ownership. Their official ESM clients exist but production callers still need migration.
- Apartment companions are actual native NPCs with shared health, typed owned weapons, recovery/stims, speech and baseline AI. Specialized companion tactics, optional cat behavior and the broader NPC ecosystem still need conversion.
- The native host uses shared firearms, punches, swept blades, bonuses, deflection and physical loot. Specialized attacks, encounter-specific rules and broader damage/death consequences remain to be ported.
- Story scene actors and special scripted movement still need native scene integration.
- Wardrobe/hair fitting and animation physics, full lighting/reflection/weather/VFX parity remain. Native curtains and shared-index lamp sensing are connected; that does not complete cosmetic migration.

Legacy classes remain loaded for those other scenes. The global audit and global retirement gate therefore must still fail; passing apartment acceptance is not proof of whole-game retirement.

## Verification

- `node tools/test-native-apartment.cjs`: generated-game ownership, one-step clock, legacy-path spies, movement/doors/walls, pause, bounded Flit, furniture, save/load, old saves, crafted station and scene re-entry.
- `python tools/test-apartment-browser.py`: public initial loading, faded exit/re-entry including sprite warmup, keyboard movement through the actual Lobby, unchanged physics during drawing, inventory/map/save/load and no page or console errors.
- `node --test src/basement/physics/tests/*.test.mjs tools/test-entity-assets.mjs tools/test-game-physics-scenarios.mjs tools/test-street-population.mjs tools/test-native-bundle.mjs`.
- Existing generated-game regression, GameDB, vehicle-construction and deterministic build checks.

The full API remains in [Basement's API reference](../basement/physics/docs/api-reference.md).

### Loading regression follow-up

The original acceptance fixture called `_doLoadMap` directly and missed the public loader's legacy lighting bake. Normal entry threw on native `lamp.x`; the native scene now bypasses that old cache, and texture warmup consumes render packets. Real Lobby movement also exposed the footstep callback reading the native player's legacy coordinates; footsteps now read the authoritative player pose and recognize native presentation identity. Once the apartment music decoded, room attenuation also expected legacy door records; it now reads the native room connection policy. The browser check exercises these public loading and moving paths, including music playback and console errors caught by the Lobby.

## Player vitals ownership follow-up

The production apartment and legacy player implementations now use the same [playerVitals component](../gameplay/README.md#playervitals). Health/max health, Flit energy/protection, grace, recovery timing and combat timestamps live in the active player's data. Existing scene replacement transfers that validated record once; there is no host health/Flit mirror or per-tick synchronization. Classic saves include the record and still import older health-only saves. Native death calls the existing shared medbay policy. This retires gameplay ledgers, not the classic scene-owned world or city collision implementation.

### Shared combat and physical loot

The native host now composes the same `combatSystem`, `weaponSystem` and `lootSystem` as the new runtime. The simplified `_fireApartmentWeapon` and native projectile-list mirror are removed. Weapons use official projectiles/swept queries, native interception/impulses and target-owned timed records. Inventory drops create registered `WorldLoot` bodies and retain exact bundles in native scene saves. The classic UI reads cooldown/holster/quick-draw state through derived accessors; it does not advance a second native combat clock. Native scene retirement detaches the shared services. The [combat API and removal ledger](../gameplay/combat/README.md) names the still-executable legacy city branches and their deletion conditions.

### Shared actor conversion

The apartment-only `ApartmentCompanion` class is deleted. Directory creates actual `NPC extends gameActor` instances, and `actorSystem` connects each to its real native body and shared weapon execution. Old companion snapshots migrate by ID. Roster saves and the existing classic scene boundary preserve exact item identities/upgrades and game metadata; they never retain departed bodies. See [actor APIs, native runtime retention and remaining class conversions](../gameplay/actors/README.md).

The native apartment now installs the same `abilitySystem` as the shared runtime. NPCs cast all three existing abilities using canonical learned/equipped loadouts and the shared attack cooldown. Learned state and cooldown survive saves and the explicit classic scene boundary. See [ability API and remaining mounted/presentation work](../gameplay/abilities/README.md).

The native host also installs the shared [attackSystem/registry](../gameplay/attacks/README.md). Its player fire branch and actor intents use the universal selected attack. Player learned capabilities/selection and NPC choice now survive native saves and the classic boundary as one-time record transfers. Classic city execution remains legacy despite retaining those portable records.

The shared native attack service now supports real seated player/companion firearms and abilities, including engine-owned window arcs, aperture clearance and inherited velocity. Native snapshots preserve their attachment/emitter/preparation records. The apartment still has no production vehicle/driver cutover; its legacy city boundary and vehicle artists remain separate work. [Mounted API](../gameplay/attacks/MOUNTED-ATTACKS.md).

## Reported apartment regressions: veranda, doors, Flit and firing

Earlier acceptance checks established native ownership, loading and movement, but did not establish complete gameplay/visual parity. The reported missing city view, changed doors, missing Flit lightning and release-to-fire failure were regressions, not expected consequences of the unfinished engine restructure.

The apartment renderer now refreshes its viewport bounds before calling the shared city backdrop artists, instead of retaining a previous scene's culling rectangle. Door artwork is extracted to `legacy/presentation/indoor-door.js` and used by both classic and native doors. Native sliding glass uses two real registered leaves with symmetric motion; artwork reads their interpolated poses. Native snapshots retain each leaf's ID. Old single-panel snapshots upgrade once on load, preserving the original primary ID and cancelling its obsolete motion timeline.

`triggerFlit` now shares its effects, feedback, sound and policy path across native and classic players. Native placement continues to use Basement queries/teleport requests. The apartment host advances/draws those effects and native noise uses the shared actor hearing query. The simplified `_flitApartment` method is removed. Native release-to-fire now consumes the existing input release request even after the fire stick becomes inactive, with one shot and the existing cooldown.

`tools/test-apartment-parity.cjs` exercises stale veranda bounds, successful/blocked Flit effects and feedback, release-to-fire, actual paired bodies/save identities, secondary-leaf culling and old snapshot migration (seven checks). `tools/test-apartment-parity-browser.py` uses real keyboard, mouse and touch events against the generated build, checks city stamps and Flit render stability, and captures review screenshots. These targeted repairs do not establish full lighting/weather/wardrobe/story parity; the remaining limits above still apply.

### Drone and VelvetCat class pass

The native registry now includes `df_drone` and `df_velvet_cat`. Both run in the new gameEngine and can be spawned/rendered/saved in the existing native apartment host. Shared Drone capabilities cover telegraphed bolts, locked lance/burn, a penetrating beam, native spring grapple and landing shock. Cat adoption retains the actual body between native levels; seats optionally combine mass. Cosmetic state is separate from movement and shares the retained artwork with classic classes.

This is a class conversion, not Double Nights/city scene retirement. `legacy/story/story-db.js` Drone factories and classic cat map/adoption/car/draw callers still use their original physical owners. Their movement code remains live until those callers move together. The old host's city boundary still transfers domain data to a different world; native cat retention does not bridge that boundary automatically. Demoness and Warden native classes/coordination are implemented in the specialized actor completion below; their production callers and the previously listed apartment presentation/quest gaps remain outstanding.

### Specialized actor class completion

Demoness, her solo phases/decoys, and concrete Vesper/Matins/Compline classes now use the native registry and shared actor/ability services. The native `encounterSystem` supplies persistent registered effects, Warden squad coordination, smoke/reveal/cover/flanking rules and owner cleanup. Censer/hymn can run on a reusable secondary channel alongside the actual owned-weapon burst; Compline reuses the native projectile/spring grapple. Armored/swift/warded Ganger/Hunter variants are native as well.

The actor inheritance audit is recorded in the [actor API](../gameplay/actors/README.md). No additional concrete actor subclass lacks a native implementation in the audited source. This does not retire HostileManager wave/restore factories, boss intros, legacy city updates, story progression/rewards or their original physical worlds. Retained Demoness/hazard artwork is shared and the native host can draw these classes, but renderer-neutral packets and full scene/cinematic/animation parity remain future work. The remaining class work is now caller integration and rendering, not missing native Demoness or Warden implementations.

### First procedural actor artwork cutover

Drone and VelvetCat body/light passes now use renderer-neutral packet producers and the actual Basement Canvas backend. The native host preserves existing pass boundaries; remaining classic actor callers use a thin packet submission adapter. Their old direct Canvas artists are removed. Cat eye anchors are returned as data rather than stored during drawing, and cosmetic animation is in a separate simulation-side module.

The normal shared runtime `actorPresentation` consumes these packets directly through `renderSystem`, including non-Canvas backends implementing the packet contract. No new physics initialization, spatial index or render clock was added. The current production host still contains direct Canvas drawing for all other artists; it cannot yet switch wholesale to WebGL. The [presentation API](../presentation/README.md) documents the producers, pass ordering, compatibility boundary and pre-conversion visual references.
