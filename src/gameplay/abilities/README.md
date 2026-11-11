# Abilities

`abilityLoadout` owns learned capabilities. `abilitySystem` executes native casts. Directory owns spell definitions, radii, launch offsets and balance. Basement owns launch geometry, trajectories, collision, penetration, impulses and the existing spatial grid. Presentation owns drawing.

The existing authored abilities are Fireball, Shadow Bolt and Ember Burst. They use the values in `directory/game-db/progression.json`; `createAbilityCatalog()` converts authoring ticks/speeds into seconds/world units once. `game-ability-rules.json` supplies physical request defaults, including Fireball's radius 8 and the other projectiles' radius 5. These are authored shapes, not game-side intersection calculations. Catalog output is immutable. Fireball deals 50 energy damage, Shadow Bolt 20, Ember Burst 12. These are individual projectile casts; Ember Burst's existing rapid cadence is preserved rather than inventing a new multi-projectile attack.

## Ownership

| Record / concern | Authority |
|---|---|
| Learned IDs and equipped ability | Actor's canonical `data.abilities` record |
| Shared weapon/ability attack cooldown | Existing attack controller's `data.weapon_state.cooldown` |
| Queued logical cast | `abilitySystem`'s transient ID map; discarded at pause/transition/reconnection |
| Spell body / velocity / contacts | Official Basement projectile |
| Damage and team rules | Existing combat and projectile-impact policy |
| Spell shape/glow packets | `abilityPresentation` |

Abilities are innate/learned capabilities, not inventory items. They consume no carried slot and create no fictional weapon instance. NPCs expose `abilities`; any supported actor, including the real session Player, can use `api.abilities.getLoadout(actor)`. The attack controller must belong to that same official actor/world. There is no surrogate caster, duplicate simulation clock or ability collision index.

## Loadout API

`new abilityLoadout(data={}, catalog)` references a canonical owner record:

```js
{
    format_version: 1,
    known_ids: ['fireball', 'shadow_bolt'],
    equipped_id: 'fireball'
}
```

| API | Contract |
|---|---|
| `equipped_id` | Derived read; null means unequipped |
| `getDefinition(id)` | Read an immutable Directory definition; unknown IDs throw |
| `hasAbility(id)` | Whether this actor has learned the ability |
| `learnAbility(id)` | Learn a valid definition; returns false if already learned |
| `equipAbility(idOrNull)` | Equip a learned capability or unequip; does not reset attack cooldown |
| `getEquippedAbility()` | Definition or null |
| `forgetAbility(id)` | Remove a learned capability and unequip it if necessary |
| `snapshot()` | Detached JSON exchange |
| `load(snapshot)` | Validate the entire record before replacing fields; reject unknown/duplicate IDs and unlearned equipment |
| `validate()` | Validate the owner's actual record |

`actorAbilities(data,catalog)` reconnects the component over an actor's current record. Components/callbacks are transient; persisted state contains no JavaScript class instance or body copy. `NPC.equippedAbilityId` is a compatibility request that learns/equips the definition, or unequips on null. It is a derived accessor in both native and remaining classic NPCs; the old own property is removed. `abilitiesSnapshot` is a detached roster exchange, not another live ledger.

## Casting API

Directory's `createGameRuntime({ability_policy?, ...options})` installs `engine.api.abilities`. The native apartment host composes the same class. `new abilitySystem({weapons,combat,get_player,policy={}})` needs the existing world weapon service and combat policy. Optional callbacks: `random()`, `spread(actor,baseSpread)`, `can_cast(actor,abilityId)`.

```js
const ally = engine.api.actors.spawn({
    kind: 'npc', role: 'red_demon_dancer', name: 'Scarlet',
    position: [150,180],
    data: {recruited:true, hireType:'permanent', alliance:'friendly'}
});
// This role starts with the existing Fireball capability.
ally.abilities.learnAbility('shadow_bolt');
ally.abilities.equipAbility('shadow_bolt');
engine.api.abilities.requestCast(ally, 'shadow_bolt', {target:[300,180]});
```

| API | Contract |
|---|---|
| `getLoadout(actor)` | Official actor's canonical ability component; rejects foreign/destroyed entities |
| `getAttackController(actor)` | Existing player or registered actor execution component |
| `getRange(actor)` | Equipped ability's authored targeting range, or zero |
| `requestCast(actor, ability_id=equipped, aim={})` | Queue the latest logical request for this actor; returns false if paused/unlearned/unequipped default |
| `cast(actor, ability_id=equipped, aim={})` | Execute a learned capability immediately if ready; return official projectile or false |
| `cancelCast(actorOrId)` | Remove pending input for this identity |
| `beforePhysics()` | Consume queued requests once in the owning runtime phase; no independent timer |
| `gameplayPaused()`, `levelLeaving()`, `reconnectGameplay()` | Discard transient requests; saved ownership and attack cooldown remain on the actor |
| `attach(context)`, `detach()` | Lifecycle integration; no new world/listener loop |

Aim accepts JSON `target:[x,y]`, `direction:[x,y]`, or `angle`. Physical packet fields, owner IDs and damage supplied inside aim are not forwarded. The engine determines the muzzle transform, launch clearance and trajectory. Spread is an authored/random policy offset passed to the native launch request. A rejected launch spends no cooldown and emits no cast event.

`weaponSystem.canExecute()` is the common readiness check: world/runtime state, actor life/visibility/activity, holster, cooldown, quick draw, attachment and per-actor attack policy. Abilities additionally check learned ownership, stagger and optional cast policy. A successful cast sets that **same** attack cooldown to the ability rate. Equipping another ability or switching to a weapon cannot bypass it. Quick-draw readiness cannot bypass this check. Mounted casts now use emitter-equipped attachments through the shared attack API; ordinary attachments still block them.

NPC policy preserves weapon-first selection, falling back to the equipped ability. It queries the shared grid using the selected attack's range, respects engagement policy and native line of sight, and requests facing/casting. Penetrating weapons may retain their existing through-wall targeting; abilities stop at obstacles. The low-level `cast` method accepts logical aim without choosing a target or enforcing an AI range cutoff; lifetime and contacts govern the actual projectile, just as for weapons.

The runtime order is weapons (advance shared attack clock) → abilities (compatibility casts) → attacks (universal requests) → actors (select next intents), then native physics. AI requests execute on the next attack phase. The earlier classic apartment explicitly invokes actor policy → weapons → abilities → attacks in its one fixed step. Pending requests are transient, never saved, and discard on pause/level departure, source removal/defeat or equipped-ability change. The source's capability is checked again at execution.

## Contacts and events

Native spells create `df:projectile` bodies with `data.ability_id`, source ID/allegiance, damage type, damage and presentation metadata. The existing **single** world projectile-impact/contact policy in `weaponSystem` also routes these projectiles through `combatSystem`; the ability service adds no second impact listener. Damage is energy damage with `ability_id` on `combat:hit`. Native impacts stop at scenery, preserve team exclusions and remain compatible with shared redirection policy. There is no game-side collision response or position integration.

`ability:cast` includes `{entity_id,ability_id,projectile_id}` and is emitted after successful launch/cooldown commitment. Listeners may select sound, captions or VFX. Presentation reads state; it does not launch or damage anything.

## Saves, migration and remaining legacy execution

Native snapshots contain the original caster/projectile IDs, ability loadout and existing attack cooldown. Register concrete entity types, restore physics, reconnect player/session and weapons/actors, then call `abilities.reconnectGameplay()` to discard stale input. Components reconnect without subclass constructors. Recruited NPCs keep the same body/loadout across native runtime levels.

Directory's `importActorAbilities` converts old `equippedAbilityId`/`abilitiesSnapshot` exchanges once. Explicit saved unequip wins over role defaults. Native apartment snapshots migrate old aliases by entity ID. The classic save coordinator now saves learned/equipped capabilities and companion cooldown; it validates companion ability records before changing live player/currency/map state. Whole-game transactional save/load is still separate work.

The production city still owns legacy NPC/projectile bodies. `legacy-ability-launch.js` is the explicit remaining boundary for those actors: it reads the same shared loadout/normalized definitions and creates a legacy projectile. The old helper and stat/spread defaults are removed from the inventory UI. This boundary remains necessary until city actors and their world are native; moving it does not retire the city physics or count as native casting. Native casting never calls it.

Remaining companion work: broader tactical formation/room policy; full humanoid casting animation, particles, fire trails/audio and other presentation parity. Specialized hostile subclasses and their factory/caller conversions follow. No new map-specific ability implementation is needed.

## Presentation and verification

`abilityPresentation.render(context,blend,frame)` reads visible official spell projectiles through the renderer's shared query and submits shape/glow packets. The runtime example installs it. `combatPresentation` skips these spell bodies to prevent double drawing. The classic apartment's existing separate projectile artist reads the same color/radius metadata; its full Canvas-to-packet conversion is still tracked separately. Entity and ability classes contain no Canvas calls.

Tests: `node --test tools/test-ability-systems.mjs`, `node tools/test-ability-callers.cjs`, `python tools/test-abilities-browser.py`. They cover the three progression definitions, ownership/invalid saves, native targeting, single damage, readiness/cooldown sharing, queue cancellation, snapshots, real production save/transitions and actual Chromium pixels with stable physics during drawing. Basement's actor-support suite also covers saving immediately after removal of a motor's target: snapshots drop stale references without mutating live motor commands.

## Universal attack registration

Abilities are now registered alongside firearm and melee attacks through [attackRegistry and attackSystem](../attacks/README.md). For ordinary player/actor input, select `ability:fireball` and call `api.attacks.requestAttack(actor, aim)`. Player input and native NPC/Ganger callers use that shared entry point. The lower `abilitySystem` remains the executor and compatibility API. Plain gameCharacter subclasses are connected automatically; the service no longer requires a particular actor subclass to provide an items property.

Mounted firearms and abilities now share native aperture/arc/clearance and velocity-inheritance requests. Preparation uses the existing attack clock. See [mounted attacks](../attacks/MOUNTED-ATTACKS.md). Direct lower-level casting remains an execution API and does not run the universal service’s aim-preparation policy.

## Learned Hunter claw

The catalog also contains `hunter_claw`, normalized from `game-db/enemies.json` by `game-hunters.mjs`. This is a close-contact capability available to every character that learns it, including Player. It uses the same native projectile sweep/contact path with melee damage, a transparent radius-18 forward hit volume, .05-second lifetime and .75-second shared cooldown. `allow_mounted:false` is checked by both shared attacks and direct ability casting. Damage/reach come from Hunter authoring; hits never spawn at a chosen target position. See [Hunter ownership and pending classic callers](../actors/README.md#hunter-the-first-specialized-hostile-conversion).

`createAbilityCatalog(definitions=progression.abilities,{hunter_kind=enemies.kinds.hunter}={})` accepts an explicit Hunter authoring record when composing a custom Directory. The runtime consumes its resolved `df:abilities` / `df:attacks` resources rather than reconstructing a separate catalog.

## Timed lunge actions

Directory adds learned `marionette_lunge` with `delivery:'lunge'`, authored tell/drive/lunge/recovery durations, native hit shape, speed, damage and scalar impact. Other abilities retain projectile delivery. The same `cast`, `requestCast` and universal attack methods apply. A successful timed cast returns a detached acceptance record; it creates no projectile or extra hit-volume body.

Canonical `actor.data.ability_action_state` holds version, ability ID, phase, start/phase times, logical aim, locked heading, hit IDs and an interruption request. Phase times reference the existing `weapon_state.elapsed`; no second attack timer advances. `abilitySystem.beforePhysics` visits only active actions and uses native `resolveAim`, movement, swept attached shapes, occlusion and optional impulses. Target allegiance, damage and per-action hit policy use the shared combat service. `ability:cast` includes `action:true`; completion emits `ability:finished`. Any native character can learn/select the attack. Active actions block concurrent ordinary fire/casts through the existing controller readiness check.

Tells track a valid target until commitment. Target loss, forgotten capability, mounting, stagger or requested interruption enters recovery. Defeat/removal clears the action; pause freezes it and the existing clock. Level departure cancels active actions, including those on retained actors. Save/restoration retains phase, original identity, heading, hit ledger and cooldown; a restored lunge cannot damage the same target again. `reconnectActor(actor)` validates/rebinds one character; `reconnectGameplay()` rebuilds active ID references at a restoration boundary. No per-frame registry scan or secondary spatial index is used.

`validateAbilityAction(state,catalog,{clock}={})` accepts absent/null state or validates a complete JSON action. Unknown delivery/ability IDs, invalid phases/headings/aim/hit ledgers/times reject. Supplying the canonical weapon clock also rejects future phase timestamps. Production saves and ApartmentLevel preflight these records before replacing the live scene or currency; actor registration validates again against its real clock. `allow_mounted:false` remains enforced. Optional hit impulses ask Basement to skip unsupported noncombining mounts, preserving its strict default force rules and native composite response.
