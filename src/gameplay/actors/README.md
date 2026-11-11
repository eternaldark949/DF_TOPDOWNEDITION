# Actors: gameplay over official native characters

`gameActor extends gameCharacter` is the shared native foundation. `Player`, `NPC`, `Ganger`, `Marionette` and `GatlingGunner` extend it; native `Hunter` extends `Ganger`. Each identity owns one registered Basement body, motor, awareness component and canonical `data` record. Physics owns geometry, velocities, contact response, impulses, pathfinding and the one incremental spatial grid. Actors request those operations; their game policy owns health, hiring, allegiance, dialogue, target selection and suspicion.

## Composition and ownership

Directory's `createGameRuntime()` installs `api.actors` alongside `api.session`, `api.items`, `api.combat`, `api.weapons`, `api.attacks`, `api.abilities` and `api.loot`. `actorSystem` attaches to that runtime's existing world. The actor map is an identity/lifecycle lookup, not a spatial index. Registration/removal events connect actors automatically. Full registry scans happen only at explicit reconnection boundaries; threats and noise use grid-local queries.

The runtime runs weapons/abilities, the universal attack queue, then actors: actor attack intents execute in the next attack phase, with one fixed-step latency. The classic apartment explicitly runs actor intent, weapons/abilities and the same attack queue in its existing step. Neither creates another loop. Pause holds AI, health timers, contracts and weapon cooldowns. Rendering submits packets only.

| Record | Owner |
|---|---|
| `data.health`, `data.max_health` | Shared `actorVitals`; Player's `playerVitals` extends it with player policy |
| `data.actor_state` | Defeat, damage grace and elapsed game time |
| `data.inventory` | Actor's own typed `itemSystem`; unique item IDs, equipment, attachments and upgrades |
| `data.weapon_state` | Actor's shared weapon execution component; no copied cooldown or hit logic |
| `data.npc_state` | Recovery, burst count, speech and contract timers |
| `data.ganger_state` | Suspicion, search history, telegraph and interruption timers |
| Body position, rotation, velocity and attachments | Basement exclusively |

Module WeakMaps reconnect health/inventory wrappers and callbacks. Subclass constructors are not required during restoration. Persistent state is JSON; no saved JavaScript target references. `equippedWeaponId`/`weaponId` and `hp`/`maxHp` are derived compatibility reads/requests, not separate ledgers.

## Creating actors

```js
const ally = engine.api.actors.spawn({
    kind: 'npc', name: 'Victoria', role: 'teammate', position: [150, 180],
    data: { recruited: true, hireType: 'permanent', weapon_definition_id: 'pistol_fpx' }
});
const enemy = engine.api.actors.spawn({kind:'ganger', position:[300,180]});
ally.say('Ready.', 2);
engine.api.actors.hearNoise([250,180], {near_range:400, strength:1});
```

`spawn(packet, {lifetime='level'}={})` uses Directory's `createActorPacket`. Kinds are `actor`, `npc`, `ganger`; physical overrides use ordinary native entity keywords. Invalid policy state removes the attempted body/controller. Recruited NPCs are retained as session entities automatically, including actors hired after spawning. `release()` returns them to level lifetime. Session retention preserves the **same entity/body** across native runtime levels; it does not mount it to the player. Downed permanent companions remain retained. Levels must provide suitable arrival placement for the whole party; retention alone does not choose destination spawn positions.

`retainEntity`/`releaseEntity` accept idle, registration, input, before/after-physics and level-transition boundaries. Physical event callbacks queue actor lifetime changes for the next safe actor hook. They cannot mutate runtime lifetime bookkeeping during rendering or physics dispatch. Departing levels cancel actor movement and release transient hooks/controllers; entering levels reconnect surviving identities.

The production classic host still replaces its world when crossing the apartment boundary. Its explicit roster transfer destroys departed bodies and transfers records once; same-body retention applies to the new runtime, not that remaining classic boundary.

## Common API

| API | Meaning |
|---|---|
| `vitals`, `hp`, `maxHp`, `dead`, `visible`, `alliance`, `radius` | Canonical gameplay/shape reads; health/allegiance setters validate or delegate |
| `takeDamage(amount,{source=null,type='contact',bypass_invulnerability=false,impulse?}={})` | Apply health policy; optional supplied impulse is sent to the native body. Source is a native entity ID |
| `die({source,type}={})`, `onDefeated()` | One defeat transition; disable native body and emit semantic event |
| `heal(amount)` | Restore living health up to maximum; cannot revive |
| `revive({health=maxHp,position?}={})` | Require clear native placement, restore health and reactivate the same body; return false if blocked |
| `advanceActor(seconds)` | Shared lifecycle timer hook; normal callers use actorSystem |
| `connectActor({emit})`, `disconnectActor()` | Install/release transient callbacks; not a new registration/body |
| `items`, `inventory`, `restoreInventory(snapshot)` | NPC/Ganger item ownership and validated inventory replacement; NPC inventory setter delegates here |
| Inherited `moveTo`, `followTarget`, `fleeTarget`, `lookAtTarget`, `teleportTo`, `body.applyImpulse` | Native engine requests; game policy performs no corresponding physical math |

`actorVitals(data, {max_health=100}={})` exposes `health`, `max_health`, `dead`, `validate`, `setHealth`, `setMaximumHealth`, `importHealth`, `restoreHealth`, `heal`, `damage`, `snapshot`, `load`. Damage/healing return the actual amount changed. Maximum health is positive and finite; current health is clamped. `load` validates before changing fields. Player preserves its specialized recovery/protection and death rules.

Events: `actor:damaged`, `actor:defeated`, `actor:healed`, `actor:revived`, `actor:said`; NPC adds `npc:hired`, `npc:released`, `npc:downed`; Ganger adds `ganger:state-changed`, `ganger:last-known`, `ganger:bumped`. Each actor event includes `entity_id`. Combat emits `combat:downed` rather than killed for downed teammates.

## NPC policy

`NPC` (`df_npc`) handles civilian and teammate roles. Teammates use native follow/flee/placement facilities; self stims, out-of-combat regeneration and proximity healing use shared health. Permanent teammates down and revive. `hire({kind='contract',cost,minutes,world_minutes=0})` configures a contract/permanent recruitment; payment remains the caller's responsibility. `release()` ends it. `say(text,seconds=2,delay=0)` and `reactToEmote(emote,{tier=0,random=Math.random})` share authored reaction content with existing NPCs.

`inCar` and `seatIndex` read real attachments and vehicle occupants. No seat coordinates are copied. Mounted NPCs now target and fire through authored seat emitters and the shared attack API; all arc, muzzle, clearance and inherited-velocity work is in Basement. On foot, Fireball, Shadow Bolt and Ember Burst use the shared abilitySystem and the same attack cooldown as weapons. See [ability ownership, casting and remaining work](../abilities/README.md).

Equipment setters grant/equip real instances. `onWeaponFired` manages authored burst delays through the shared weapon controller. Roster import/export preserves burst size/delay/accuracy, cooldown and remaining burst count. Aliases are converted once at Directory/host boundaries. `rosterRecord(npc)` exports game metadata and a detached typed inventory; it is not another live owner.

`actorSystem({attacks,combat,session?,get_player?,policy={}})` accepts `stationary(actor,context)`, `may_engage(target)`, `world_minutes_delta(seconds)`, `aura_interval(actor)`, `visibility(player)`, `search_points(ganger)`, `random()` and `on_event(event,detail)`. Defaults use elapsed seconds/60 for world minutes. A production world-time coordinator must supply its own rate and translate historical contract expiry when importing older saves.

## Ganger policy

`Ganger` (`df_ganger`) implements `IDLE`, `SUSPICIOUS`, `ALERT`, `SUPPRESSING`, `SEARCHING`. Native observation supplies cone/range/proximity/occlusion, target prediction supplies shot leading, and engine motors supply approach/retreat/search/wander. The game selects states and authored thresholds, not collision outcomes. Suppression respects clear sight or a penetrating weapon. Search ends or consumes caller-provided room points.

Reads: `state`, `suspicion`, `isTelegraphing`, `ganger_state`. Requests: `hearNoise(position,{strength=1})`, `setBehavior(state)`, `interruptMelee()`. Melee interruption clears telegraphing, delays firing and respects resistance. Queued shots recheck interruption/stagger before execution. Elites, bosses, room-claim/flanking coordinators and other specialized subclasses remain separate conversion work.

## Shared weapon execution

`weaponSystem.registerActor(actor,{items=actor.items,policy={}})` installs one execution component over the actor's actual records. `getActorController(actorOrId)`, `requestActorFire(actor,aim)`, and `unregisterActor(id)` manage it. The world service advances all controllers once and owns the single projectile-impact/contact-policy subscription. Child controllers cannot register more controllers or duplicate the player's controller. They share the same world, contacts, combat service and Directory weapon rules.

Damage is routed once to the source controller. Projectile source allegiance survives source removal; native collision contacts remain the authority. Same-team targets and player-protected civilians are rejected by default policy. Per-actor policy supplies burst behavior and accuracy; it does not create another firing/collision implementation.

## Presentation and restoration

Actors contain no Canvas calls. Production apartment drawing still uses its existing separate humanoid artist. The native runtime example uses its generic body artist, shared weapon-art packets for every armed actor, and `actorPresentation` for names, speech and detection state. Full classic humanoid animation/presentation parity is pending. A future renderer consumes the same neutral packets.

Register Directory's concrete types before raw snapshot load. Restore the world, reconnect the session/player, then weapons, actors, combat and loot. `actors.reconnectGameplay()` rebuilds transient controllers, validates records and retains recruited actors. Runtime save/load orchestration remains a separate coordinator; raw physics snapshots alone do not preserve every runtime lifetime decision. Old `df_apartment_companion` saves migrate in place to `df_npc` by native ID; no alias class/body is created.

## Removal ledger and remaining callers

Removed: the apartment-only `ApartmentCompanion` class; duplicate common health implementations; legacy NPC's mutable weapon-ID owner; duplicate emote reaction content. Native actor classes contain no collision/integration implementation. The apartment now creates actual `NPC` instances and actual shared weapon controllers.

Still executable: classic `ActorEntity`, `NPC`, `Ganger`, specialized descendants, legacy city projectile/collision loops and classic mixins. Shared health and typed NPC inventories are now used there, but their physical ownership remains legacy. Their deletion depends on converting the city world/callers and specialized classes to native identities. No native body is created alongside a legacy actor to pretend that conversion is complete.

Next class conversions: specialized companion tactics and hostile subclasses; their factories/room coordinators; native city population consumers and level composition; remaining legacy collision/combat branches; production boot/mixins and full presentation/save coordination. [Combat removal ledger](../combat/README.md) tracks the corresponding executable branches.

Verification: `tools/test-actor-systems.mjs`, `tools/test-actor-callers.cjs`, `tools/test-actors-browser.py`, Basement `actor-support.test.mjs`, and the existing player/combat/apartment suites. Repeated identical movement requests retain path plans, failed paths respect the native retry interval, and grid-corner traversal has a regression test.

Ability loadouts now live in `data.abilities`; `NPC.equippedAbilityId` derives from them. Directory supplies role defaults and imports prior aliases once. Actors ask `abilitySystem` to cast through the existing native projectile/contact pipeline. See the [ability API](../abilities/README.md).

## Unified attack interface

Native Player, NPC and Ganger requests now pass through [attackSystem and attackRegistry](../attacks/README.md). They use the same registered firearm, melee and ability definitions as plain gameCharacter subclasses. Actor policy selects a target and requests an attack; it no longer chooses separate fire/cast APIs or privately creates weapon controllers. The attack service binds each actual character and handles owned inventories, queued input and selection. Lower execution classes and their shared physics remain unchanged authorities.

Native mounted companion attacks are now implemented. See [the mounted API and exact city/presentation boundaries](../attacks/MOUNTED-ATTACKS.md).

## Hunter: the first specialized hostile conversion

`api.actors.spawn({kind:'hunter',position:[x,y],rotation, data:{alpha:true}})` constructs the actual `Hunter` class, `df_hunter`, registered before restoration. Directory normalizes the existing Hunter definition to engine units and owns appearance authoring. Alpha defaults to two chained dashes; optional `dash_max` and `dash_cooldown` override that policy. `hunter_state` contains only version, cooldown, chain index and a pending hit-reaction flag; constructor-free restoration retains these values on the original identity. `validateHunter()` checks the saved state before actor registration.

Hunter retains Ganger's native awareness, suspicion, suppression, search, noise and sidearm execution. It overrides the read-only Ganger policy hooks `ignoresConcealment` and `minimumVisibility` to ignore player concealment and floor visibility at .55; native field of view, range and occlusion still apply. Damage requests an evasion; policy selects its chance/timing, Basement `evadeBody(...,{teleport:true})` calculates and checks the perpendicular landing. Engaged closing dashes call `teleportToward(player,{stop_distance:70})`; Basement owns the target offset, shared-grid shape sweep and placement check. An obstructed path retries after .5 seconds. `hunter:dashed` carries detached `from` and `position` records for effects/noise consumers, and `hunter:evaded` reports the hit reaction. There is no game-side position update or collision loop.

Hunter learns `hunter_claw` by default. `ability:hunter_claw` uses the shared attack queue, existing controller clock and native projectile sweep/contact dispatch. Its short-lived forward hit volume starts at the source, never at the target, and static scenery stops it. Directory derives damage/reach from the existing Hunter definition. Any native character, including Player, can learn/select this capability through `api.abilities.getLoadout(character).learnAbility('hunter_claw')` and `api.attacks.selectAttack(character,'ability:hunter_claw')`. It cannot be used while mounted. Sidearm and claw never get independent cooldown clocks.

This converts the base Hunter policy and factory contract. The old city `Hunter` and `Demoness` remain executable until HostileManager/palace callers migrate to the native class and duel abilities. Shared appearance authoring has already replaced the duplicated classic Hunter look generator. Demoness-specific spells, Drone, VelvetCat and all three Warden variants now have native implementations described below; the ordinary native GatlingGunner is described below; native Marionette is described below, with its classic preview caller still pending migration; they are not represented by native bodies alongside legacy identities. Full Hunter animation/afterimages and the dash-noise consumer also remain presentation/encounter integration work.

Validation for this conversion: eight native Hunter contracts, four standalone motor regressions, three generated playable-build caller checks and the extended Chromium actor suite. The latter exercises an actual Hunter dash, render stability and level-owned removal. Existing apartment, ability, attack and mounted-attack browser/caller checks remain green.

## Native Marionette

`api.actors.spawn({kind:'marionette',position,rotation,data:{cloth,appearance_seed,flank_offset}})` constructs actual `Marionette extends gameActor` (`df_marionette`). It registers one native character body and the standard attack execution component. It learns/equips `marionette_lunge` by default and owns no weapon surrogate. Directory's `game-marionette-rules.json` is now the single source for the previously inline `MARIONETTE` tuning and colors. `createMarionetteRules` converts authoring speeds/frames once; `MARIONETTE_RULES` exposes immutable raw authoring for the remaining classic draft.

Read `state` (`stalk`, `tell`, `lunge`, `recover`), `silent` and `marionette_state`. `validateMarionette()` validates constructor-free saved state. `updateBehavior(seconds,{player,attacks,random})` chooses pursuit, authored flank offset, jerk/cruise speed and attack timing. `followTarget` uses native target-frame offsets and shared-grid personal space. The native class never loops through other enemies, integrates velocity, tests walls or draws Canvas. Its ballistic resistance is health policy; the native solver owns impact mass/impulses. Damage during the tell requests interruption into recovery.

The common learned attack uses `ability:marionette_lunge`. It is available to Player and any other native character through `getLoadout(actor).learnAbility('marionette_lunge')` and the standard attack selection/request interface. The common executor owns tell (.38 s), locked-direction lunge (.3 s, drive for .16 s), recovery (.7 s), one hit per target, and the 1.4 s shared cooldown. There is no Marionette-only damage detector or separate attack clock. See [timed action API](../abilities/README.md#timed-lunge-actions).

Artwork lives in `presentation/marionette.js`, shared by the retained classic draft and native apartment renderer through detached pose records. The strings, wooden body, porcelain face, cloth and blade glints remain separate from behavior/physics. The native host draws the glints after room dimming. Generic standalone examples still use their basic shape artist; a renderer-neutral Marionette artist is not claimed.

The only discovered literal spawning caller is `tools/demo-darklands.cjs` (swarm/close previews), which still creates the classic class in its legacy world. `boss-hazards.js` also retains classic type-based lighting dispatch. Those callers and the classic physical class remain explicitly pending; no native shadow body is attached to that class. Native actors can already be created, stepped, rendered and saved by the shared runtime/native host. Ten native policy/action tests, four generated caller tests and an actual Chromium tell/lunge/save check cover this conversion. A complete production Darklands/encounter migration and exact movement-feel tuning remain separate work.

## Native GatlingGunner

`api.actors.spawn({kind:'gatling_gunner',position,rotation,data:{squad_id:'arena',formation_order:0}})` creates an actual `GatlingGunner extends gameActor` (`df_gatling_gunner`). It owns one native character body and an actual typed `gatling_gunner` firearm instance. Directory normalizes the existing enemy definition (200 health, mass 25, radius 20, ten shots, six authoring frames between shots, 210-frame reload and 12-frame tell). `game-gunner-rules.json` defines native range/movement/visual policy; the portable rotary weapon model supplies its actual [35,0] muzzle. No game-side projectile packet, previous-player-position velocity estimate or collision implementation is retained in the native class.

Read `state` (`ready`, `tell`, `burst`, `reload`, `dormant`), `isTelegraphing`, `dormant`, `gunner_state` and canonical `items`. `makeDormant()` cancels movement and requests action cancellation; `awaken(hold_seconds=1)` uses seconds, unlike the classic frame argument. `enrage()` adjusts the next burst's count (+3, capped at 1000), round interval (one authoring frame faster, minimum .05 s), and reload (.75 multiplier, minimum 1 s). `validateGunner()` checks saved policy/visual/tuning records. Barrel phase/speed/heat advance once in simulation; drawing reads them only.

The native policy obtains range, sight and leading from Basement. Solo actors approach/retreat or orbit; squads request native orbit slots with cached pathing and shared-grid personal space. `actorSystem.setSquad(actor,{squad_id,formation_order})` updates logical roster membership. Registration/removal, defeat/revival and health changes observed during normal actor updates invalidate that roster; sorting/index assignment happens on change. No gunner rebuilds the roster, scans it for separation, maintains a spatial index or calculates its own orbit points. Native sight gating and a tell also apply to the initial burst; movement-feel/balance parity still needs encounter review.

The gunner requests registered `ability:gatling_burst`, described in the shared ability API. Any native character can learn/use that action with an actual owned rotary weapon. `getAvailableAttacks` requires both capability and weapon ownership; `selectAttack` equips a required owned instance (or the supplied `instance_id`) before selecting the capability. Failure without ownership leaves selection/loadout unchanged. The ordinary firearm API remains the single-round executor; the learned burst action adds its own wind-up/count/reload policy over that same backend and clock, not an ammo-magazine subsystem.

The retained body/barrel/heat/Warden Canvas artwork is extracted to `presentation/gatling-gunner.js`. Classic body hooks remain callable for the existing silhouette captures. Native host packets use actual interpolated poses and canonical burst/visual state, with barrel heat above room dimming. The raw rotary item also has its own portable appearance for inventories and generic held-weapon presentation.

Still live: HostileManager's `gunner` row restore/wave factories in `entities/enemies.js`, production enemy update/death/finisher/FX callers, and `boss-intro.js`'s Warden trio. Native spawning routes valid `data.persona` to the corresponding concrete Warden class; their native censer/hymn/hook and encounter coordination are described below. The legacy class therefore remains a physical owner in legacy worlds; it never gains a native surrogate. Ordinary native actors, their saves and the reusable burst are implemented, not the Sanctum encounter cutover. Sixteen native gunner/burst contracts, three engine orbit cases, five generated caller checks and Chromium tell/burst/heat/save checks cover this pass.

Starter equipment now has an explicit one-time `actor_loadout_initialized` marker. Actor reconnects/restores do not refill an intentionally emptied NPC/Ganger/gunner inventory. Directory packet imports treat a supplied typed inventory, including an empty one, as already initialized. A transfer/reconnect/snapshot regression preserves the original item IDs in the receiving owner and verifies no replacement weapon is generated.

Production squad-loss reactions, death rewards and finishers remain caller/coordinator work. `enrage()` is exposed for that policy, but this pass does not automatically enrage native survivors when another squad member dies.

## Native Drone and VelvetCat

`api.actors.spawn({kind:'drone',position,rotation,data:{drone_kind:'lancer'}})` creates `Drone extends gameActor` (`df_drone`); kinds are `lancer`, `grappler`, `seer`. Directory converts existing balance into seconds and native speeds. `drone_state` stores flight phase, altitude, loss-of-sight duration and decision clocks. `state`, `isTelegraphing`, `validateDrone()` and standard actor damage/lifetime methods are available. The actual registered body becomes ghosted while high above ground. Descent triggers the registered landing shock; loss of sight requests a checked annular placement through Basement. Hover requests native following, retreat or orbit. There is no local collision loop, velocity integration, private spatial index or fake tether body. Shell/seam/recovery multipliers are game damage policy; the engine tests the authored eye region against real impact position/radius.

Drone capabilities are `drone_bolt`, `drone_lance`, `drone_grapple`, `drone_beam`, `drone_landing`. They use the shared attack/ability APIs and can be learned by the player or any native character. A seer's through-cover beam is deliberate authored behavior. The grapple launches a real projectile; confirmed contact creates a native spring with actual source/target body IDs. Damage ticks are logical policy, while the constraint solver owns all pull forces, mass and motion. See the [ability API](../abilities/README.md).

`api.actors.spawn({kind:'velvet_cat',position,data:{adopted:false,coat_palette:'default'}})` creates `VelvetCat extends gameActor` (`df_velvet_cat`). `adopt()` / `release()` emit `cat:adopted` / `cat:released`; actorSystem retains/releases the actual entity in the new gameEngine. Adoption never creates a surrogate or copies pose. `cat_state` stores follow/rest choices and timers, with Directory-owned offsets and speed bands. `setRestPose(null|'sitting'|'sleeping')`, `state`, `adopted`, `inCar`, `validateCat()` are available. `boardVehicle(vehicle,{combine_mass:false})` delegates to native passenger seats; `leaveVehicle(vehicle,options)` requests checked exit. `inCar` derives from the actual attachment. Vehicle contacts briefly suspend her motor; physical impacts remain entirely in Basement.

`velvet_animation` contains cosmetic springs, poses and a separate seeded RNG. Actual travel comes from the engine's motion sample, so blocked cats do not run in place. `presentation/velvet-cat.mjs` and `presentation/drone.mjs` hold shared retained Canvas art. Render packets are detached; eye locations recorded while drawing never enter entity/snapshot state. The native host performs a post-physics animation update once per step; the new gameEngine uses the ordinary system hook. A renderer-neutral replacement for this retained artwork is still future work.

**Caller boundary:** Double Nights `story/story-db.js` still constructs classic Drone instances; classic update, damage and boss-hazard lighting dispatch remain live. Cat creation/adoption in map-loading/events, `update.js`, `cars.js`, `draw.js` and `questState.hasVelvetCat` still belongs to the classic city runtime. These callers and their old physical classes remain until coordinated migration; neither receives a native shadow body. This pass shares their artwork and implements the official native classes, capabilities and save paths. Native cat retention does not imply same-body travel through the old city/apartment boundary, nor automatic synchronization to the old quest flag. Demoness/Warden native classes and coordination are implemented below; their production scene callers remain pending. Movement feel and scene/quest parity require caller integration review.

## Remaining specialized families: Demoness and Wardens

`api.actors.spawn({kind:'demoness',position,rotation,data:{solo:false}})` constructs `Demoness extends Hunter` (`df_demoness`). It uses its own Directory health, speed, dash count/cooldown, claw damage/reach, whip and appearance. It does not inherit the Hunter sidearm firing policy. `solo:true` enables authored health phases; phase changes adjust dash cadence, unlock the later abilities and cancel the current tell. `makeDormant()`, `awaken()`, `hearNoise(position,options)`, `phase`, `solo`, `decoy`, `dormant`, `demoness_state`, `validateDemoness()` and `canBeExecuted:false` are native API. The logical record preserves heard targets, decision timers, phase, cosmetic easing and decoy lifetime. Ordinary Hunter mechanics now expose `hunterRules`, `clawAttackId` and `usesSidearm` policy hooks rather than duplicating their implementation in the boss.

The reduced decoy capabilities are `demoness_decoy_claw` and `demoness_decoy_whip`; decoys learn only these two by default. The main registered abilities are `demoness_claw`, `demoness_whip`, `demoness_whip_double`, `demoness_bolts`, `demoness_sigils`, `demoness_step`, `demoness_gale`, `demoness_mirror` and `demoness_rite`. All are learned capabilities usable through the common API by other native characters. The duel chooses abilities by phase; geometric work, projectiles, checked teleports and impulses remain native. Decoys are actual Demoness identities with one health, dead-eye appearance, reduced whip/claw policy and a saved lifetime. Owner defeat retires surviving decoys and owned hazards.

`api.actors.spawn({kind:'vesper'|'matins'|'compline',position,rotation,data:{squad_id:'sanctum'}})` constructs concrete `Vesper`, `Matins`, `Compline` classes extending `Warden extends GatlingGunner`. Native IDs are `df_vesper`, `df_matins`, `df_compline`; `df_warden` is the common registered base. `kind:'warden',data:{persona}` and an explicit `kind:'gatling_gunner',data:{persona}` route to the appropriate concrete class. Invalid personas reject; they never become a disguised ordinary gunner. `warden_state`, `persona`, `makeDormant`, `awaken(hold_seconds)`, `enrage`, `validateGunner` and `canBeExecuted:false` are available. Authored personas have 1,500 health, radius 30, an actual owned rotary weapon and independent appearance data. Awakening staggers their first bursts by formation order. Survivor enrage changes the next burst once per squad defeat.

`warden_burst` shares the owned-weapon burst backend, including bounded saved extensions while squadmates reload. `warden_censer`, `warden_hymn` and `warden_hook` are reusable capabilities. The [encounter API](../encounters/README.md) coordinates sight, smoke, revealed targets, brief cover fire, one flanker and native firing placement. Censer and hymn use the shared secondary channel so gunfire can continue; hook owns a real projectile/spring through the existing grapple executor. Native hero Flit releases it.

`data.elite:'armored'|'swift'|'warded'` now works for authored Ganger/Hunter variants. Directory applies initial mass/speed/dash tuning once. `elite_state` preserves ward health; restoring native bodies does not apply multipliers again. Armored actors resist burn/bleed damage. Warded actors absorb frontal non-melee projectiles using engine-produced incoming direction and native arc tests; they do not invent a reflected trajectory. Appearance marks and exact movement-feel tuning remain presentation work.

## Actor class coverage and caller ledger

The source inheritance audit found these production actor families: PlayerEntity, NPC, Ganger, Hunter (including Alpha), Demoness (including duel/decoy), GatlingGunner (including all three Wardens), Drone, Marionette, VelvetCat and Pedestrian. Each now has an official native implementation. The armored/swift/warded modifiers are also native. No additional concrete ActorEntity/Hunter/Ganger/NPC subclasses were found. `RestrictedZone` and `HostileManager`/gauntlet are encounter managers, not actor subclasses; BumperCar is a vehicle/minigame class outside this actor audit.

**Still live as callers:** `HostileManager` row restore/palace wave factories in `entities/enemies.js`, `engine/boss-intro.js`, legacy enemy death/reward/finisher dispatch, and story/map factories continue to instantiate classic actors in the old city runtime. Classic hazard policy remains active for those worlds. Native class implementations and native encounter coordination are complete for the audited families; those production scene coordinators, rewards, cinematics and renderer-neutral art have not been claimed as converted. Classic classes can be removed after their last production callers move together. They have no native surrogate bodies.
