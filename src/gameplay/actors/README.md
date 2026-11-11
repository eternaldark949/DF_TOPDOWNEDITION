# Actors: gameplay over official native characters

`gameActor extends gameCharacter` is the shared native foundation. `Player`, `NPC` and `Ganger` extend it. Each identity owns one registered Basement body, motor, awareness component and canonical `data` record. Physics owns geometry, velocities, contact response, impulses, pathfinding and the one incremental spatial grid. Actors request those operations; their game policy owns health, hiring, allegiance, dialogue, target selection and suspicion.

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
