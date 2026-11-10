# Native apartment cutover

The playable `apt_949` scene now uses Basement as its physical authority. This is a scene cutover, not completion of the whole-game migration.

## Construction and ownership

`game-assets/apartment.json` defines templates, 63 furniture/fixture records, authored lights, and interaction rules. `apartment-definition.mjs` combines those resources with GameDB map/room geometry. `levels/apartment.mjs` constructs official player, props, doors, roster characters, sensors, lights and curtain meshes. Registered game subclasses contain gameplay metadata and intentions; Basement owns their bodies, velocities, contacts, impulses and spatial membership.

The classic build includes the native ESM graph through `tools/bundle-native.mjs`. It resolves static relative imports and JSON modules deterministically; unsupported syntax or dependency cycles fail the build. The source engine remains independently importable and dependency free.

`engine/apartment-level.js` commits the actual scene, routes controls and steps its world once per playable tick. Old entity registries and pending queues are emptied on entry. Legacy collision, integration, interpolation and spatial queries are bypassed in this scene. No old body is adopted or synchronized into a second world. An unstepped replacement is prepared and validated before retiring the current scene.

An outside car is a plain parking checkpoint while indoors, not a live legacy body. Leaving destroys the apartment world and reconstructs the still-legacy destination scene from gameplay/save data. Other levels still need their own cutover.

## Engine requests used by the frontend

| Concern | Request or read |
|---|---|
| Input and facing | `setMovement`, `lookInDirection`, `lookAt`, `clearFacing` |
| Grip selection | `peruseNearbyEntities`, `getBodyGrip` |
| Furniture coupling | `createConstraint` with a force-limited spring; same prop body switches static/rigid |
| Furniture turning and doors | `motion.rotateBodyBy`, collision-aware motion timelines |
| Flit and rescue | `teleportInDirection`, bounded clear placement, `findNearbyPlacement` |
| Standard projectiles | `createProjectileFrom` with engine barrel clearance |
| Rendering | Engine render snapshots and cloth point snapshots |
| Save/load | `commitCommands`, `savePhysicsState`, `loadPhysicsState` |

Furniture release removes its spring and returns the same body to static. The game never applies a post-contact positional correction. Authored lamp emissions on movable furniture share that furniture's light component and grid entry; their pose follows the engine body. Room/interaction queries use the same engine spatial service.

The renderer retains appearance packets and sprite caches, not physical actors or a private spatial index. The original prop and humanoid artists consume those packets. Repeated rendering must leave physics snapshots unchanged. Curtains simulate through native cloth; old render-time hair/garment integration is bypassed for native presentation.

## Persistence and lifecycle

New saves contain the official native world snapshot. Old apartment saves retain their indexed `[center_x, center_y, rotation]` furniture layout contract. Saves release temporary furniture control and commit queued commands without advancing simulation. Reset, replacement and exit retire the prior world's bodies, cloth and renderer caches. Save loading commits its scene synchronously before restoring scene data, avoiding restoration into a fading-out scene.

## Remaining work and parity limits

- City streets, traffic, pedestrians, vehicles, enemies, other maps and minigames still use legacy physical ownership. Their official ESM clients exist but production callers still need migration.
- Apartment companions are actual native NPCs with shared health, typed owned weapons, recovery/stims, speech and baseline AI. Mounted attacks, specialized companion tactics, optional cat behavior and the broader NPC ecosystem still need conversion.
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
