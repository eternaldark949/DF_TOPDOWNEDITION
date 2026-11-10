# Session and native player API

Directory's `createGameRuntime()` installs `gameSession`, `PlayerStateSystem` and `PlayerControlSystem` as real lifecycle systems. They are available through `engine.api.items`, `engine.api.session`, `engine.api.player_state` and `engine.api.player_controls`. The factory registers native types first, then creates **one persistent Player**. Callers obtain `api.session.player`; they must not create another player for each level.

These are game classes, outside Basement. Basement owns bodies, movement, velocities, impulses, attachment mass, collision detection, checked placement and the one spatial grid. Gameplay owns health, ability costs and timers, inventory and quest rules. No converted class uses the old GameEngine, DOM, Canvas or a second physical index.

## Ownership

| State | Authoritative owner |
|---|---|
| Position, facing, velocity, mass, collision shape, attachment | Official native entity/body/controller |
| Health/max health | `playerVitals` referencing `Player.data.health` / `max_health` |
| Attunement, Flit/invulnerability timers, sneak, buffs, regeneration timers | `playerVitals` referencing `Player.data.player_state` (format 1) |
| Item instances, equipment, mounts, per-item state | `itemSystem`, exposed by `gameSession.items` |
| Currency, quests, roster records, progression | `gameSession` |
| Player reference | Session stores only the native numeric `player_entity_id`; lookup uses `api.elements` |
| Input devices, held state, edges, normalization, dead zones | Basement `controlSystem` |
| Control-block tokens and injected callbacks | Runtime lifetime; not save data |
| Tuning | Directory's `game-player-rules.json` and `game-control-profile.json` |

Roster records are persistent domain records, not another registry of live bodies. Entity creation and lookup continue through the native registry.

## gameSession

`new gameSession({player?, state?, item_catalog?})`. `player` is the Directory entity packet used only when a new session has no player ID. `state` is a validated format-2 snapshot (known format-1 item counts migrate). `attach(context)` creates the official player with session lifetime, or retains the existing registered Player referenced by a restored ID. An unresolved ID fails; it never silently creates a replacement. `detach()` releases subscriptions and runtime references, not the session entity.

| Member | Contract |
|---|---|
| `player`, `player_entity_id`, `currency` | Current official entity, numeric reference, current funds |
| `changeCurrency(amount)` | Finite signed change; rejects a negative resulting balance |
| `items` | The authoritative [itemSystem](items/README.md), also exposed as `api.items` |
| `getRecord(collection, key)` | Detached copy, or undefined if absent |
| `setRecord(collection, key, value)` | Set JSON data in quests/roster/progression; item/equipment mutations use `items` |
| `snapshot()` | Detached, versioned JSON records; no physical state or health copy |
| `on(event, listener)` | Subscribe; returns idempotent unsubscribe |
| `emit(event, detail={})` | Synchronous event dispatch with a copied detail packet |

Generic record collections are `quests`, `roster`, `progression`. Inventory and equipment use the typed item API. Identifiers must be nonempty strings and cannot be `__proto__`, `constructor` or `prototype`. Snapshots reject cycles, nonfinite numbers and non-JSON objects. Listener errors propagate to the caller; runtime hook errors stop the loop. Events report committed state, not a transactional rollback mechanism.

```js
const engine = createGameRuntime({schedule_frame:null});
const {session} = engine.api;
const gun=session.items.grantItem('pistol_fpx');
session.items.equipItem(gun.instance_id);
const unsubscribe = session.on('player:damaged', ({health}) => updateHealthDisplay(health));
// The UI layer owns updateHealthDisplay; the Player knows nothing about DOM.
```

## Player

`Player extends gameCharacter`, registered as `df_player`. Construct it through native factories. All inherited motor/body methods are the actual Basement APIs.

| Method/property | Contract |
|---|---|
| `hp`, `maxHp`, `dead` | Authoritative health access; finite nonnegative HP, positive maximum |
| `takeDamage(amount, {impulse?, bypass_invulnerability=false, source=null}={})` | Returns whether applied. Dead, zero-damage and protected hits are ignored. Supplied impulse goes directly to the body; damage does not invent physical knockback |
| `heal(amount)` | Returns health restored, clamps to maximum, never resurrects |
| `makeInvulnerable(seconds)` | Set the gameplay protection timer |
| `addBuff(id, {duration_seconds, modifiers={}})` | Add/replace a timed buff on this entity |
| `getStat(stat, base)` | Sum additions, then multiply modifiers; clamp result at zero |
| `sneaking`, `flitting`, `attunement` | Gameplay stance and ability state |
| `initializeState(rules)` | Initialize once; validate existing restored data without resetting it |
| `advanceState(seconds, rules)` | Fixed-step gameplay timers; called only by PlayerStateSystem in the composed runtime |
| `beginFlit(cost, seconds)`, `resetState(rules)` | State transitions used by PlayerStateSystem after successful native placement |
| `connectGameplay({emit?, is_invulnerable?, on_damage?, on_death?, buff_system?})` | Explicit injected callbacks; no legacy host object. `disconnectGameplay()` retires them |
| `vitals` | The shared gameplay component; reads the same entity data, never a second health ledger |

Buff modifiers use `{statName:{add?,multiply?}}`, e.g. `{speed:{multiply:1.75}, flitCooldown:{multiply:1/3}}`. Durations are **seconds**, not old world-minute consumable durations. Zero-duration buffs have no effect. The session system does not import old purchase hooks or silently reinterpret their units.

Events: `player:damaged` (`amount`, `health`, `source`), `player:healed` (`amount`, `health`), `player:died` (`source`), `player:flitted` (`attunement`), `player:respawned`, `player:buff-added` / `player:buff-expired` (`buff_id`). Each includes `entity_id` and `event`.

## PlayerStateSystem

`new PlayerStateSystem({session, rules})` connects player events and advances timers once per runtime step, before controls. Paused/no-level runtime frames do not advance gameplay timers. Damage restarts regeneration's delay. Default regeneration heals 5 HP at exactly 10 seconds without damage, then every second. This preserves the production cadence. Dead players do not regenerate.

`movement_speed` applies the `speed` buff and the sneak multiplier to the Directory speed (312 units/second). Basement integrates that motor request.

`tryFlit({direction?, placement_bounds?}={})` returns a boolean. Missing direction uses native facing. Dead/hidden/mounted/already-Flitting players and insufficient attunement reject. Basement handles direction, shape-aware bounds, collision clearance and minimum travel. Cost is deducted only after an accepted landing. Default Flit distance is 120, cost 40, capacity 120, recharge 120/second and protection 0.25 seconds. `flitCooldown` modifies cost and `flitDistance` modifies distance, retaining the existing terminology. Flit does not disable physical collision responses; its protection gates gameplay damage.

`respawn({position, placement_bounds?, ...nativePlacementOptions})` requires a dead unmounted player and a successful checked native placement. It restores health/energy, clears buffs/timers and preserves the original body. The game flow system must choose the destination level and spawn; this class does not hard-code medbay or story changes.

Ability/respawn requests require an attached active level and an unpaused runtime. Call at an idle or before/after-physics gameplay boundary. Requests from rendering, lifecycle hooks or native physics callbacks throw before changing ability state; game flow must defer them to the next gameplay boundary.

## PlayerControlSystem

`new PlayerControlSystem({session, player_state, placement_bounds?})`. The optional bounds function receives runtime context. Directory reads `active_level.player_placement_bounds` when the level supplies it. Bounds are authored data, not a local collision calculation.

Each fixed step reads `controls.direction('move')`, requests native movement and uses the aim vector or camera-converted pointer for native facing. With no aim, facing follows native movement. Hidden, dead, mounted or blocked players produce no on-foot movement/action intents. Mounted bodies continue using native attachment behavior.

`block(reason)` returns an idempotent release function. Multiple blocks compose. Acquisition and final release clear held actions through the canonical controls service; releasing one block cannot release another. These are gameplay control gates. `engine.pause(reason)` separately pauses the entire simulation.

Default bindings: WASD/arrows move; mouse/space/right trigger/touchFire produce held `player:fire` intents; E/gamepad A/touchInteract produce edge `player:interact` intents; Shift/gamepad B/touchFlit requests Flit; C/left-stick click/touchSneak toggles sneak. Aim comes from right stick, touch aim or the mouse. Weapon cooldowns and interaction rules belong to their respective future systems; an intent event does not pretend to fire a completed weapon implementation.

## Persistence and migration boundary

Player fields reside in `entity.data` and therefore already round-trip through `savePhysicsState` / `loadPhysicsState`. Native restoration deliberately skips gameplay constructors. Player uses restoration-safe module helpers; injected callbacks are reconnected by PlayerStateSystem.

For low-level restoration, create a bare `gameEngine` with the Directory asset library and session service, register Player and other saved native types, load the physical snapshot, then register the session and player systems. Session attachment retains the actual restored entity. Tests exercise this sequence and preserve body identity. Passing a saved player ID to a fresh factory without its registered body intentionally fails.

**This is not a runtime-wide save/load implementation.** Coordinating saved level content, system reconnection, version migration and atomic gameplay restoration remains part of the persistence conversion. Classic save files are not automatically translated into the new coordinator.

The two-room runtime example uses these official session/player/control classes. Production's remaining `PlayerEntity` now uses the **same playerVitals component** as native Player, with its legacy movement still explicit. HUD/stats, stims/clinics, Stellar Lemonade maximum-health hooks, progression tuning, combat windows, story health checks, new-game reset and classic saves read the active player. The host fields `playerHealth`, `maxPlayerHealth`, `healthRegenTimer`, `flitState`, `lastHurtAt` and the `syncHealth` API are retired. No compatibility getters or synchronization loop replace them.

At the existing apartment/legacy body-replacement boundary, the retiring player's vitals snapshot transfers to its replacement. There is no host copy between transitions and no additional physical body. This is a state transfer at an existing physical migration boundary; it does **not** claim session body identity is preserved by the classic host. The destination runtime already preserves body identity across its levels.

Classic saves now include an additive `player.vitals` snapshot. The old scalar `player.health` is still exported for historical readers; the new record is authoritative when present. Older saves reconstruct health from the scalar and saved progression/buff rules. Validation rejects malformed vitals before changing live currency/player/map state; this is not an atomic validation claim for the rest of the classic save schema. Flit energy/protection, grace, recovery timing and combat timestamps now survive saves and map transitions. New-game reset clears them. Existing story/medbay death policy has one `respawnPlayer()` host entry point used by both player implementations, with explicit callbacks from native Player.

The [shared combat/weapon/loot classes](combat/README.md) now run in the new runtime and native apartment. Still pending: classic city combat callers, interactions, consumable purchase/shield policy, resonance/Last Stand/augment policy, story/death/medbay flow, production appearance/animation/audio, live level conversion, old mixins and production boot switch. The shared item API now owns production carried inventory/equipment and saves; native weapon execution/quick draw and physical loot now use shared classes, while legacy city callers and other systems still need conversion. Legacy city movement, Flit landing geometry, projectile response and collision systems remain physical migration work; moving their gameplay state does not retire their physical implementations.

## playerVitals

`new playerVitals(ownerData={}, rules=DirectoryPlayerRules)` is a gameplay component shared by native Player and the remaining production PlayerEntity. It retains a reference to `ownerData`, not a copy. Native instances obtain it lazily after restoration; the component itself is constructed normally, so private implementation fields are safe. Directory owns all default tuning.

| Member | Contract |
|---|---|
| `health`, `max_health`, `dead` | Current entity health; death derives from health, not a second flag |
| `attunement`, `max_attunement`, `flitting` | Current ability state |
| `flit_cost`, `flit_duration`, `flit_distance`, `flit_minimum_distance` | Directory rule values; durations are seconds |
| `last_flit_at`, `last_hurt_at` | Combat window timestamps in the owning runtime's game-time clock |
| `state` | The owner's actual `data.player_state` record, including timers, timestamps and native timed buffs |
| `setHealth(value)`, `setMaximumHealth(value)` | Validated health changes; maximum changes clamp current health |
| `setAttunement(value)`, `setMaximumAttunement(value)` | Validated energy/capacity changes; clamp to capacity |
| `damage(amount, time=elapsed_seconds)` | Apply damage and restart recovery; returns amount applied. Damage policy/protection checks belong to Player |
| `recordDamage(time=elapsed_seconds)` | Restart recovery and stamp a confirmed hit |
| `heal(amount)` | Clamp healing to maximum; returns amount restored; cannot resurrect |
| `restoreHealth()` | Explicit full restoration used by clinics/respawn; clears recovery timing |
| `importHealth(health, maximum=max_health)` | Validated historical health import boundary |
| `makeInvulnerable(seconds)` | Set grace/protection timer; the classic Last Stand caller now uses this rather than a player frame counter |
| `beginFlit(cost, seconds=flit_duration, time=elapsed_seconds)` | Spend energy and start protection **after** the physical owner accepts placement |
| `advance(seconds, {regeneration_delay?, regeneration_interval?, regeneration_amount?}={})` | Advance gameplay timers/recharge/recovery once; returns health restored |
| `snapshot()`, `load(snapshot)` | Detached JSON exchange; validate the whole vitals record before replacing its fields |
| `configureRules(rules)`, `validate()`, `reset()` | Configure/validate without resetting saved state; reset returns to Directory new-game defaults |

Both runtimes use this one timer implementation. PlayerStateSystem calls it through native Player's `advanceState`; the classic host calls it once in `updatePlayerRecovery`, in either its regular or apartment branch. Paused frames call neither. Classic progression supplies regeneration overrides in seconds. Native timed-buff expiry remains Player's responsibility; the old world-minute BuffSystem retains its existing separate consumable policy until its class conversion.

## Verification

Run `node --test tools/test-player-systems.mjs tools/test-player-vitals.mjs` for ownership, session mutation, native input, mounting, damage/impulses, timers/pause, Flit, checked respawn, saved identity reconnection and invalid-state rejection. Shared engine placement tests cover minimum travel and zero headings. Browser runtime and controls checks use these classes and verify health/inventory/equipment persistence across levels, actual mouse fire intents and simultaneous device input.

`node tools/test-player-state-callers.cjs` exercises the actual generated production build: absent host ledgers, stims/HUD, clinics, recovery, Last Stand grace, Stellar Lemonade, native/legacy transitions, single ticking, saves, upgraded old-save health, native death, invalid snapshot rejection and reset. The vitals suite also scans every production JS/ESM source for retired ledger names and synchronization methods. Both suites run in CI.
