# Combat, weapons and physical loot

Directory installs `api.combat`, `api.weapons` and `api.loot` in the existing `gameEngine` world. They run from the runtime's fixed step, use `api.items`, and never create another world or grid. The native apartment host composes the same classes against its existing scene world. Its earlier `_fireApartmentWeapon` implementation is deleted.

Directory owns balance and geometry: `game-combat-rules.json`, `game-db/items.json`, `combat-profiles.mjs`, and `weapon-appearance.mjs`. The original catalog's ticks/speeds convert from its declared authoring frequency to seconds/units per second at execution. Guns retain unlimited ammunition behavior; arbitrary per-item `state.ammo` remains saved data, not an invented ammunition rule. Critical chance, blade perks and mirror tuning are shared with remaining classic callers through `COMBAT_RULES`.

## Ownership and lifecycle

| State | Owner |
|---|---|
| Equipped item, upgrades, mounts and individual item state | The canonical `itemSystem` |
| Weapon cooldown, holster, draw phase, combo, shield charge and active swing | Official player's `data.weapon_state`, format 1 |
| Health | Existing native entity health/component; no second combat health ledger |
| Bleed, burn orbs, stagger/resistance and pending slam | Target's `data.combat_state` |
| Dropped item bundle | Official `WorldLoot.data.item_bundle`, until received by inventory |
| Every position, velocity, impulse, contact and swept intersection | Basement body/motor/shared spatial grid |
| Sounds, particles and drawing | Semantic events and separate presentation |

Runtime order is input/player intent → weapon policy → native physics → timed combat/loot → commit queued engine commands. Committing commands does not advance time. The command boundary makes a completed runtime step safe to snapshot even after a projectile removes itself or gameplay queues an impulse/spawn. Standalone physics retains its explicit `commitCommands()` contract.

`attach(context)` connects each service to the existing runtime. `detach()` releases its references/subscriptions. Systems use `beforePhysics`/`afterPhysics`, `levelEntered`/`levelLeaving`, and weapons use `gameplayPaused`. Level departure cancels pending attacks/draws and retires level loot. Cooldown and other persistent player data remain with the official body. Status tracking reconnects at entry, including effects on persistent entities. There is no extra animation loop or wall-clock timer.

Raw native snapshots save those JSON records and the original physical entities. After `physics.loadPhysicsState(snapshot)`, call `combat.reconnectGameplay()`, `weapons.reconnectGameplay()`, and `loot.reconnectGameplay()` to rebuild transient ID indexes/connections. Register concrete entity types with Directory's `registerGameEntityTypes(world)` before loading. Reconnections validate supported domain records and never construct replacement bodies. The broader runtime gameplay save/load coordinator is still pending; this does not make raw-world restoration equivalent to restoring the runtime's retained-entity bookkeeping.

## weaponSystem

One canonical weapon service handles world projectile hit policy, the controlled player's inventory and registered actor execution components. Construct with `{items,combat,session?,get_player?,rules?,policy?}`. `get_player` defaults to the supplied session's player. The native apartment supplies its official player lookup directly; it does not fabricate a session or a surrogate player.

| API | Contract |
|---|---|
| `state` | Current player's authoritative record; reading does not initialize/mutate it during rendering. |
| `cooldown_seconds`, `holstered`, `quick_draw`, `active_swing`, `guarding` | Derived reads of that record. |
| `fire({target?,direction?,angle?}={})` | Execute if allowed/ready; returns the official projectile for firearms/punches, true for a started blade, otherwise false. No timer advances in this call. |
| `requestFire(aim={})` | Queue the latest logical aim for the next shared policy step. Paused requests are discarded. |
| `setCooldown(seconds)`, `setHolstered(value)` | Explicit game/UI requests; no duplicate cooldown ledger. Drawing resets the first-shot bonus window. |
| `armQuickDraw()`, `requestQuickDraw(aim={})` | Arm a firearm, then commit a release shot after the authored draw interval. |
| `interruptQuickDraw()`, `cancelQuickDraw()` | Cancel a pending release while retaining the mode, or leave the mode. Cooldown cannot be bypassed. |
| `getSwingPose()` | Read the shared authored local hand/blade pose for presentation. No body mutation. |
| `advance(seconds)` | Synchronous host integration hook. The normal runtime invokes it once in `beforePhysics`; callers must not add another clock. Paused calls do not advance. |
| `reconnectGameplay()` | Initialize/validate the current player's weapon record and clear queued input after raw snapshot restore. |

Firing rejects dead/hidden players, holstering, cooldown, paused/stopped runtimes, mounted players and a policy block. Rendering cannot fire or advance weapons. Normal fire is suppressed while quick draw is armed. Seven authored draw ticks produce one shot, ten recovery ticks return to holstered readiness, and the extra/minimum cooldowns use seconds. Pause, control blocking and level departure discard unfinished releases. Keyboard, mouse, gamepad and touch use the same fire/`player:fire-released` intents; control processing supplies logical target/direction data rather than reconstructing projectile angles.

Firearms submit a local muzzle and spread offset to `createProjectileFrom`; the engine resolves placement, launch and clearance. Native projectile contacts apply damage once per body and enforce penetration/lifetime. Ordinary sniper attenuation is zero; door contacts request half damage beyond the door through the native penetration rule. The Directory's effectively unbounded count preserves the original catalog's penetrating behavior without serializing Infinity.

Bare fists and knuckles use actual official short-lived projectile hit volumes driven by the native motor, not legacy projectile objects or copied body state. Knuckles count jabs, choose haymakers, request native impulses and apply stagger/slam policy. Blades query authored capsule poses using `sweepAttachedShape`; the engine transforms the hand/edge, detects crossings and rejects occluded candidates. Each swing stores struck IDs, not an enemy array, and applies each target's crit, bleed and lifesteal once. Step-in requests use checked native advancement. Pose functions in `melee-poses.mjs` are animation authoring, not intersection or physics integration code; the duplicate classic pose implementation is removed.

Mirror Blade uses predicted native sweeps to select an interception, then schedules native redirection at its contact fraction. The engine resolves it among ordinary contacts, so a preceding wall can win. Mirrored Glass chooses a redirect in the pre-contact rule, spends charge and regenerates on game time. Neither path calculates a reflection vector or writes velocity in game code. An interception keeps the same projectile body and continues travel on the following step.

Policy callbacks optionally supply existing game rules: `stat(name,base)`, `roll_crit(stats)`, `random()`, `fast_reload()`, `mirror_glass()`, `flit_active(player)`, `flit_multiplier()`, `quick_draw_window()`, `quick_draw_multiplier()`, and `can_fire()`. The native apartment binds its current resonance/augment/cosmetic rules. Full progression/resonance class extraction remains separate; the new runtime accepts those policies without importing the classic host.

Events: `weapon:fired` (source/projectile IDs, definition, mode, crit/haymaker), `weapon:swing` (source, definition, duration, side), `weapon:deflected` (projectile ID and blade/glass origin). The combat service forwards them to the session and optional event sink. UI/sound handlers read official state and draw; they do not run collision work.

## combatSystem

Construct with `{session?,rules?,policy?}`. Optional policy callbacks are `can_damage(source,target)`, `incoming_multiplier(target,type)`, and `on_event(event,detail)`. Default targeting excludes the source and matching nonempty teams/alliances. The native runtime applies the shared blade guard to its player; the apartment uses the same rule with its existing game policy.

| API | Contract |
|---|---|
| `canDamage(source,target)` | Team/liveness/damage-capability policy; no geometric test. |
| `damage(target,amount,{source_id=null,type='ballistic',crit=false,bypass_invulnerability=false,...detail}={})` | Apply through the target's existing `takeDamage` or canonical `data.health`; store numeric source attribution and emit hit/kill events. |
| `applyBleed(target,{dps,seconds=3,max_stacks,source_id=null})` | Stack/refresh a timed bleed. |
| `attachOrb(target,{damage,interval_seconds,ticks=12,max_orbs=4,source_id=null})` | Snapshot burn damage. At the limit, replace the oldest orb while preserving progress to its next burn. |
| `haymaker(target,{damage,source_id,boss?})` | Stagger with boss resistance, suspend its existing native motor and arm a short slam window. |
| `advance(seconds)` | Advance active effect records once, through the shared fixed step. No all-entity collision scan. |
| `reconnectGameplay()` | Validate saved effects and rebuild the set of target IDs with timed state. |
| `emit(event,detail)` | Semantic event forwarding; not a physics response. |

A slam requires an actual native `contactBegin` with impulse against static/prop geometry while armed. Nearness to a wall alone cannot trigger damage. Bleed/burn bypass ordinary damage grace using the target's declared API. Entity-specific immunity rules remain with that entity. Timed records use IDs/JSON and never retain saved JavaScript target references.

Events: `combat:hit`, `combat:killed`, `combat:stagger`, `combat:slam`. Listener failures propagate; events describe committed game state and do not promise arbitrary callback rollback.

## lootSystem and WorldLoot

Construct `lootSystem({items,get_player,rules?,on_event?})`. Physical defaults are in Directory's `df:world_loot` template; interaction tuning is `game-combat-rules.json`'s `loot` section. The engine registers `WorldLoot extends gameProp` as `df_world_loot`. Its read accessors are `bundle` and `definition_id`; body pose/velocity remain inherited native reads.

| API | Contract |
|---|---|
| `dropItem(instance_id,{position?,source?,delay_seconds?}={})` | Prepare a native body, then extract the exact root plus mounts from inventory. Failed body creation leaves the inventory untouched. |
| `spawnItem(definition_id,{item_options?,...placement}={})` | Reserve an unowned instance for a reward and create world loot. |
| `spawnBundle(bundle,placement={})` | Accept an unowned validated bundle; reject IDs already in inventory or world loot. |
| `pickup(entity_id)` | Require delay, shared-grid proximity, clear native line of sight and inventory capacity. Receive exact identities once, then retire the body. |
| `getEntities()` | Current official loot identities; no copied physical state. |
| `advance(seconds)` | Advance pickup delays and query the shared index around the player; the normal runtime owns this call. |
| `reconnectGameplay()` | Validate saved bundles/delays and rebuild item/entity identity lookups after raw restore. |

Full bags leave loot in the world. Mounted attachments transfer with their weapon, keeping per-instance state/upgrades and IDs. A separately dropped mounted attachment must first be detached. The lookup maps enforce ownership; they are not spatial indexes. Drop impulses, clipping, damping, collisions and pickup raycasts all use the existing engine. Exception paths retain one owner even when a post-commit inventory listener throws. Events: `loot:spawned` and `loot:picked-up`.

World loot is level-owned; native apartment snapshots retain it within that saved scene. The existing classic cross-scene/save coordinator remains the owner of level retirement policy.

## Presentation and actual removal status

`combatPresentation` lives in `src/presentation/combat-presentation.mjs`. `installCombatPresentation(engine)` prepares `weaponAppearance` resources and installs the packet producer. It draws visible native shots/loot/status marks and the held gun/blade through renderer-neutral packets and existing culling. The runtime example installs it and exposes real equip/drop/quick-draw controls. Rich particles, animation parity and the classic artists remain separate presentation conversions.

Removed in this pass: the apartment-only firing implementation; its projectile-list mirror; duplicate melee pose functions. Shared tuning now replaces duplicate crit/bleed/blade-perk/mirror values. Native weapon cooldown, holster and quick-draw access in the classic UI is derived from the official player's record, with no live host copy. Legacy combat fields/references are deleted on native entry and only recreated for the still-legacy player after departure. That existing scene-replacement boundary transfers cooldown, holster, shield charge and combo once, converting game-time ages; active cuts/releases do not cross it. It does not retain either old body or a shadow combat record.

Remaining classic city callers are **still executable**, so deleting them now would break the game:

| Old implementation | Why it remains / condition for deletion |
|---|---|
| `combat-effects.js`'s legacy `fireWeapon` branch | The city still creates `ProjectileEntity` and legacy actors. Delete after those callers use official native actors/projectiles. The native branch only calls `weaponSystem.fire`. |
| Collision portions of `status-effects.js` and `knuckles.js` | They still serve city actors whose positions are owned by legacy physics. Replace those actor classes, then delete their scans, overlap math and velocity writes. The native services do none of that work locally. |
| Legacy `quick-draw.js` execution branch | Still serves the legacy player's clock. Native mode delegates to the shared state machine; the file also currently owns classic DOM/button presentation. |
| Loose `weapon_drop`/`Loot` objects and classic pickup loop | Still used by city rewards and legacy world state. Native inventory drops use `lootSystem` and `WorldLoot` now. |
| Classic projectile/weapon/effect artists | Still called by production drawing. Shared neutral presentation is live in the new runtime; full artwork conversion is not complete. |

These are caller/class conversion blockers. More generic scaffolding is not required before continuing removal; delete each branch when its last live legacy caller is converted. No shadow native world, mirrored actor or private combat grid is used to bypass that dependency.

Verification: `tools/test-combat-systems.mjs`, `src/basement/physics/tests/native-combat.test.mjs`, `tools/test-native-combat-callers.cjs`, and `tools/test-combat-browser.py`, plus the existing gameplay, apartment and rendering regressions.

## Actor execution update

`registerActor(actor,{items=actor.items,policy={}})`, `unregisterActor(id)`, `getActorController(actorOrId)` and `requestActorFire(actor,aim)` now route NPC/Ganger weapons through the same execution code and one global impact/contact subscription. Records remain on each official actor. `combat.canDamage(source,target,{source_alliance}={})` preserves projectile team policy after source removal; protected civilians reject friendly fire. Downed permanent companions emit `combat:downed`. See [actor API and remaining specialized conversions](../actors/README.md).

`weaponSystem.canExecute()` now supplies common attack readiness to `abilitySystem`. Casts use the actor’s existing cooldown record. The one world projectile policy routes native spell bodies with `damage_type`/`ability_id` through combat; abilities add no collision listener. See [ability API](../abilities/README.md).

## Universal character attacks

Directory composition disables the weapon service’s own ordinary fire-input subscription (`input_events:false`) and installs [attackSystem](../attacks/README.md). Player input, native actor AI and the native apartment fire branch dispatch registered firearm, melee or ability attacks through that service. It owns generic character controller connections; actorSystem no longer duplicates binding policy. The existing weapon executors, shared cooldown and one world impact/contact subscription remain authoritative. Standalone hosts retain `input_events:true` by default.
