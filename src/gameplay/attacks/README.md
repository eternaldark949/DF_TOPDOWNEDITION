# Universal character attacks

`attackRegistry` registers attack types and immutable attack definitions. `attackSystem` is the common character-facing API for selecting, checking, requesting and executing them. Player, NPC, Ganger and plain native `gameCharacter` subclasses use it. Directory installs `api.attacks` in `createGameRuntime`; the production native apartment composes the same service.

The registry is gameplay infrastructure. Basement continues to own bodies, trajectories, native hit volumes/sweeps, contacts, impulses, attachments and the single spatial grid. Registering an attack creates no physical body, inventory item, learned ability, clock or spatial index.

## Registered types and definitions

| Type | Definition examples | Existing executor |
|---|---|---|
| `firearm` | `weapon:pistol_fpx`, `weapon:sniper_sara` | `weaponSystem` firearm policy |
| `melee` | `unarmed:punch`, `weapon:maiden_kukri`, knuckle weapons | Existing punch/blade policy, native hit volumes/sweeps |
| `ability` | `ability:fireball`, `ability:shadow_bolt`, `ability:ember_burst` | `abilitySystem` native casting |

`createAttackCatalog({items,abilities})` references the existing catalogs. It does not copy damage/upgrades or create an alternative equipment ledger. Directory's `game-attack-rules.json` supplies targeting ranges. Immutable definitions identify `attack_id`, `attack_type`, source `item_id`/`ability_id` where applicable, name, range and baseline AI metadata. `getAttackProfile(actor)` derives weapon speed/rate/penetration from the equipped instance's effective stats, including upgrades. Actual firing/casting still computes its existing game policy from the original item/ability definition.

Types use trusted synchronous game callbacks. Their physical requests must use Basement; arbitrary custom collision/integration code is not a feature of this registry. Registry changes occur at idle/registration boundaries.

## Same API for every character

```js
const player = engine.api.session.player;
const attacks = engine.api.attacks;

engine.api.abilities.getLoadout(player).learnAbility('fireball');
attacks.selectAttack(player, 'ability:fireball');
attacks.requestAttack(player, {target:[300,180]});

// No actor-specific wrapper, surrogate player or second body is required.
const character = engine.api.physics.createCharacter({position:[200,240]});
const gun = attacks.getItems(character).grantItem('pistol_fpx');
attacks.selectAttack(character, 'weapon:pistol_fpx', {instance_id:gun.instance_id});
attacks.requestAttack(character, {direction:[1,0]});
```

Any official native `gameCharacter` (including custom subclasses) is attack-capable by default through registration events. Requests made before deferred registration dispatch also connect its real execution component on demand. Props, foreign-world entities and destroyed sources are rejected. The controlled Player retains the existing session inventory and root weapon controller. Other characters use their canonical `data.inventory`, learned capability record and one weapon execution component. No item model is shared between unrelated characters.

A character's selectable attacks come from its **actual owned instances and learned capabilities**. Registering Fireball globally does not teach it to everyone. Registration makes the execution type available; game progression decides who learns it. Likewise, selecting a gun requires an owned copy, and `instance_id` can select a specific upgraded/stateful copy.

## attackSystem API

Construct with `{weapons,abilities,combat,session?,get_player?,items?,definitions}`. For the controlled player, `items` is the canonical session inventory. The service contains no character-specific physical solver.

| Method / member | Contract |
|---|---|
| `registry` | The shared `attackRegistry` for this runtime |
| `getItems(actor)` | The actor's canonical typed inventory; no weapon/item grants |
| `getController(actor)` | Existing attack execution component; root controller for the player |
| `getAvailableAttacks(actor)` | Definitions selectable from owned weapons/learned abilities, plus unarmed and registered custom candidates; does not require cooldown readiness |
| `getSelectedAttack(actor)` | Explicit available choice, otherwise automatic equipped weapon → equipped ability → unarmed fallback; reading fallback does not rewrite saved choice |
| `getAttackProfile(actor)` | Definition plus effective per-instance weapon AI metadata |
| `selectAttack(actor,attack_id,{instance_id}={})` | Validate ownership, select an owned weapon copy or learned ability; clear pending attack input |
| `useDefaultAttack(actor)` | Restore automatic selection, preserving owned/learned records and cooldown |
| `canAttack(actor,request={})` | Common readiness and type policy check; no firing/damage |
| `getCooldown(actor)` | Seconds remaining on the existing attack controller |
| `requestAttack(actor,request={})` | Queue the latest request for this actor in the existing fixed step; false while paused or source capability unavailable |
| `executeAttack(actor,request={})` | Execute through the registered type now; returns projectile, true for a started swing/custom action, or false when blocked |
| `cancelAttack(actorOrId)` | Discard pending logical input; does not undo launched projectiles or committed effects |
| `registerActor(actor,{items?,policy?}={})` | Idempotent connection; optional items must be that character's canonical model |
| `configureActor(actor,options={})` | Explicit non-player controller-policy replacement over the same records; player policies belong in Directory composition |
| `reconnectActor(actor)` | Rebind the same actor after inventory replacement; preserve state/clock |
| `unregisterActor(actorOrId)` | Release transient controller connections and pending input; does not destroy the actor |
| `reconnectGameplay()` | Rebuild transient connections from official characters after raw restoration |

Requests accept only `{attack_id?, target?, direction?, angle?}`. Target/direction are JSON points/vectors. `attack_id` makes a one-off explicit request; omission uses the selected/default attack. Unsupported physical/damage/owner fields reject. An explicit weapon request requires that owned definition to be equipped; selecting it first handles equipment. Explicit ability requests require learning, while `selectAttack` also equips it in the capability loadout.

Selecting an ability can retain a held gun: ordinary player fire now casts the selected ability. Selecting bare hands unequips the weapon through the item model. Changing attack selection never resets cooldown. Choosing an attack cancels an armed quick draw and leaves it unholstered while retaining its cooldown. Advanced quick-draw configuration and weapon poses remain specialized execution APIs; their existing state machine remains the authority.

The readiness contract reuses `weaponSystem.canExecute()`: native runtime/world ownership, source life/activity/visibility, holster, shared cooldown, quick draw, attachment/emitter eligibility and actor attack policy. Stagger and Ganger interruption remain centrally enforced. Type `canUse` checks capability/game policy, not another cooldown clock.

## One attack queue and clock

The normal runtime installs weapons → abilities → attacks → actor policy. Weapons advance the one existing per-character attack clock; the universal queue then executes selected requests. Player input is produced earlier in the same step; actor AI produces the next step's requests. The classic apartment's existing host explicitly runs actor intent → weapons → abilities → attacks in its single tick.

Player held-fire input, native NPC/Ganger requests and the production native player's `fireWeapon` branch now call `attackSystem`. Actor code no longer branches between weapon-fire and ability-cast APIs. Player input handling is disabled on the lower weapon service in Directory composition, preventing duplicate subscriptions/execution. Standalone weapon hosts can retain their default `input_events:true` behavior.

Pending requests pin the selected ID, equipped **instance** ID and equipped ability ID. Equipment copies, selection changes, forgetting/unequipping capabilities, pause, control blocking, defeat/removal and level departure cannot fire a stale queued attack. Queue cancellation does not cancel already-launched projectiles. Existing backend cooldown, burst, quick-draw, shield, combo and active swing records remain authoritative.

Lower-level `weapons.fire`/`requestActorFire` and `abilities.cast`/`requestCast` remain explicit execution APIs for specialized hosts and existing callers/tests. Converted normal inputs use the universal queue. Do not schedule the same input through both APIs. No duplicate collision listener is added: the world weapon/combat impact policy still routes native projectiles once.

`attack:executed` describes a successful universal execution with `{entity_id,attack_id,attack_type,projectile_id?}`. Existing `weapon:fired`, `weapon:swing`, `ability:cast` and combat events remain available for specialized presentation. Internal quick-draw progression and direct backend calls retain their specialized events; the universal event is not a promise that all low-level calls were dispatched by the registry.

## Registering an additional type

```js
const registry = engine.api.attacks.registry;
registry.registerAttackType('signal', {
    validateDefinition(definition) {
        if (typeof definition.signal !== 'string') throw new TypeError('Missing signal');
    },
    canUse({actor}) { return !actor.dead; },
    execute({actor,definition,controller}) {
        actor.data.last_signal = definition.signal;
        controller.setCooldown(0.5); // existing shared clock
        return true;
    }
});
registry.registerAttack({
    attack_id:'signal:warning', attack_type:'signal', name:'Warning',
    range:100, signal:'warning'
});
engine.api.attacks.selectAttack(player,'signal:warning');
```

`attackRegistry` exposes `registerAttackType`, `registerAttack`, `getAttackType`, `getAttack`, `hasAttack`, `listAttackTypes`, `listAttacks`. Type registration requires synchronous `execute`, with optional synchronous `canUse` and `validateDefinition`. Duplicates, unknown types, malformed definitions and asynchronous callbacks reject. Definition data is detached/frozen; executable functions stay in registered game code, never serialized in Directory resources or character snapshots.

The custom executor owns its particular game rule and must commit any cooldown through the supplied existing controller. No independent timer should be introduced. Listener/handler errors propagate; arbitrary callback side effects are not transactionally rolled back.

## Persistence and presentation

Selection is canonical JSON on each native character:

```js
actor.data.attack_state = {format_version:1, selected_id:'ability:fireball'};
```

Null `selected_id` means automatic. Inventory and learned capabilities remain in their original owner records; the selection stores no copied weapon stats or ability ledger. Raw native snapshots preserve selection, IDs and the original physical body. Reinstall custom types/definitions before reconnecting saved choices. Reconnect weapons, attacks, actors and abilities at the explicit restore boundary; custom callbacks/queued input are not saved.

Player capabilities/selection and NPC selection now survive the production save and existing apartment/classic boundary through one-time record transfer. Unknown saved IDs reject before changing currency, live level or selection. The apartment validates saved character capability/attack records before committing its replacement world. Those compatibility boundaries still replace bodies; they do not imply same-body persistence through legacy city scenes.

Registry execution applies to official native characters. Legacy city `ActorEntity`/`PlayerEntity` and their solvers remain explicit conversion work. They preserve portable choice/capability data but still execute their old city combat rules. No legacy object is wrapped in a second native character to pretend otherwise.

Presentation remains separate. The runtime example now has a selectable Attack menu and an explicit Learn demo abilities action. Its ordinary fire control demonstrates player casting. Shared held-weapon presentation requests inventory through `api.attacks.getItems(entity)`, so custom characters need no `.items` property or actor-specific artist wrapper. Rendering does not execute attacks or advance cooldowns.

Verification: `tools/test-attack-systems.mjs`, `tools/test-attack-callers.cjs`, `tools/test-attacks-browser.py`, plus the actor, ability, combat, player, rendering, apartment and gameplay regression suites. Tests cover universal source classes, actual owned copies, custom types, one input/one attack, cooldown and stale-input rules, saves/lifetimes, generic-character presentation, quick-draw selection and real player keyboard casting through the example UI.

## Mounted execution

Emitter-equipped native seats now support the same firearm/ability API with shared-clock preparation. `canTarget`, `getMountedAttackState` and `getMountedAttackPose` expose target eligibility and renderer data without game-side geometry or body copies. See [mounted attack ownership, engine APIs, lifecycle and remaining legacy work](MOUNTED-ATTACKS.md).

A learned attack may declare `required_weapon_id`. Availability requires an actual owned weapon; selection equips a matching owned instance, honoring `instance_id` when provided. Missing ownership rejects before changing the learned/equipped ability. `ability:gatling_burst` uses this contract and the same underlying firearm executor/clock for player, NPC and gunner sources; its pinned cycle is described in [burst actions](../abilities/README.md#owned-weapon-burst-actions).
