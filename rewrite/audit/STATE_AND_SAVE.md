# State, persistence, and relationship lookup

The original has several overlapping ownership mechanisms: GameEngine properties, module globals, GameEntity registration, per-feature arrays, map data and caches, DOM state, and storage payloads. A property being reachable through `game` does not establish which subsystem should own it.

## Shared state evidence

Use `members` for property reads/writes grouped by owner and path; each write retains its operator, line and source expression. `globalAccesses` includes same-file as well as cross-file project-global reads/writes. `mutationCandidates` identifies calls that may mutate receivers; these are candidates, not proof of side effects. Object aliasing and arbitrary dynamic keys are not fully resolved. A mutation inside an unresolved callback may affect an object declared elsewhere.

Most frequently referenced cross-file globals:

| Binding | Source reference sites |
|---|---:|
| `game` | 743 |
| `GameSettings` | 416 |
| `CONFIG` | 276 |
| `_gameTimeSec` | 219 |
| `showMessage` | 216 |
| `audioSys` | 155 |
| `_frameTime` | 155 |
| `phoneSystem` | 131 |
| `_zoomLOD` | 115 |
| `GameEntity` | 112 |
| `seededRandom` | 97 |
| `LampEntity` | 88 |
| `LandmarkKit` | 86 |
| `glowA` | 85 |
| `RenderStats` | 84 |
| `pickFrom` | 71 |
| `drawGlow` | 67 |
| `_simTick` | 65 |
| `NPC` | 49 |
| `engineMixin` | 48 |
| `PropEntity` | 47 |
| `ambience` | 43 |
| `PropPass` | 41 |
| `MapIcons` | 41 |
| `hexToRgba` | 35 |
| `ITEM_REGISTRY` | 32 |
| `Poly` | 30 |
| `getColliders` | 29 |
| `NavGrid` | 29 |
| `darkenHex` | 28 |
| `clamp` | 28 |
| `CollisionSystem` | 27 |
| `COSMETICS_REGISTRY` | 27 |
| `SPEAKER_COLORS` | 27 |
| `TierKit` | 25 |

## Save compatibility boundary

The original save version is 2. `src/engine/save-load.js` defines defaults, merge, migration, validation, storage and restore. Item IDs reconstruct inventory through `ITEM_REGISTRY`; unknown registry entries can be discarded by validation. Preserve old IDs/aliases, settings, equipment forms and progression settlement before moving these operations. Old `hub_949` map IDs alias to `sdc`. A game-specific compatibility adapter should own this schema; the engine supplies storage, schema tools and lifecycle coordination.

Saving is restricted during active scenes. Owned-car driving state differs deliberately from borrowed/hijacked vehicles. World snapshots and map render snapshots are separate lifetimes. Restore must reconstruct registries/components and connect dependencies before enabling simulation; loading only the visible map is insufficient.

Fields returned by the original outer `getSaveSchema()` object (nested serializer payloads are separately inventoried in `serializationFields`):

- `version`
- `timestamp`
- `player`
- `player.x`
- `player.y`
- `player.health`
- `player.currency`
- `player.scrap`
- `player.boosters`
- `player.buffs`
- `world`
- `world.mapId`
- `world.worldMinutes`
- `world.questState`
- `world.weather`
- `world.visitedMaps`
- `car`
- `car.x`
- `car.y`
- `car.angle`
- `car.mapId`
- `car.visible`
- `garage`
- `isDriving`
- `dancers`
- `teammates`
- `inventory`
- `inventory.items`
- `inventory.equippedWeaponId`
- `inventory.equippedAttachmentId`
- `inventory.equippedAttachments`
- `inventory.order`
- `inventory.weaponMode`
- `phone`
- `phone.messageHistory`
- `phone.contactOverrides`
- `phone.unread`
- `phone.lastMessageAt`
- `phone.feed`
- `phone.metNPCs`
- `augments`
- `resonance`
- `darkElement`
- `cosmetics`
- `story`
- `foundNotes`
- `hudRevealed`
- `coachTaught`
- `missions`
- `bonding`
- `transcript`
- `restrictedZone`
- `hordeGauntlet`
- `settings`
- `settings.trafficDensity`
- `settings.pedestrianDensity`
- `settings.foliageDensity`
- `settings.rainDensity`
- `settings.lightingQuality`
- `settings.adaptiveLighting`
- `settings.filmGrain`
- `settings.softShadows`
- `settings.bloom`
- `settings.fogGlare`
- `settings.starGlare`
- `settings.streetFog`
- `settings.lampSparks`
- `settings.shopLight`
- `settings.wetReflections`
- `settings.atmosphereTint`
- `settings.colorGrade`
- `settings.gradeCustom`
- `settings.stealthGray`
- `settings.reflections`
- `settings.photoReflections`
- `settings.soundRings`
- `settings.finisher`
- `settings.footsteps`
- `settings.enemyRings`
- `settings.playerGlow`
- `settings.fpsLimit`
- `settings.audioEnabled`
- `settings.flitRing`
- `settings.flitFlick`
- `settings.flitTwoFinger`
- `settings.flitButton`
- `settings.aimBeforeFire`
- `settings.sniperRelease`
- `settings.preciseStick`
- `settings.scopeView`
- `settings.scopeSlow`
- `settings.cameraEdgeLock`
- `settings.baseZoom`
- `settings.ambienceVolume`
- `settings.musicVolume`
- `settings.fullscreen`

## Ownership contracts to establish

| State | Proposed authoritative owner | Other concerns receive |
|---|---|---|
| Position, rotation, height, body shape | Directory scene/body instance | Live transform/body handle; common invalidation |
| Entity membership and removal | Directory scene registry | Queries and lifecycle notifications |
| Simulation clock and pause | Lobby clock/pause services | Explicit tick/seconds or real-time clock |
| GPU textures, prepared CPU artwork | Directory asset/render services | Asset handles, preparation status |
| Inventory, equipment, effects, health | Directory named gameplay systems | Commands and read views; Game supplies definitions |
| Quest flags, story, named cast and maps | Game state/content | Data and registered rules using engine operations |
| Storage encoding and IO | Directory persistence | Game schema/migration adapter |
| UI screen state | Directory UI service + Game view models | Inputs/commands; no world-space calculations |

Do not cache a primitive copy when a caller needs changing parent state. A stored object reference sees mutations to that object; it does not follow replacement of a child reference automatically. Construct services first, connect them second, and begin runtime third. No repeated “refresh parent engine” should be necessary for ordinary mutation.
