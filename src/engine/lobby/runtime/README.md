# gameEngine runtime

`gameEngine` (`src/engine/game-engine.mjs`, at the engine root) is the application coordinator: it plugs every level in through one jack each (`engine.basement`, `engine.lobby`, `engine.directory`, `engine.penthouse`, `engine.game`). It owns one Basement world, the public API references, the shared Lobby clock, a level registry and explicit system instances. It contains no game collision math, private spatial index, old GameEngine delegate, or prototype mixins.

The classic playable boot still constructs `GameEngine`. Loading the new class into `DFNative` does not construct another world or silently route old classes through it. The first shared session/player/control conversion is installed by Directory; other production class conversions remain pending. The existing `ApartmentLevel` is the earlier scene-owned integration; it is not yet a `gameLevel` subclass and must relinquish its world/step when converted.

## Ownership decisions

1. **One world per runtime lifetime.** `physicsSystem` constructs the only spatial grid. Levels neither construct a world nor step it. A private Symbol authorizes only the runtime's simulation call. Independent standalone worlds remain supported.
2. **The API points to the real engine services.** `basement.physics`, `basement.elements`, `directory.assets`, `basement.motion`, `basement.traffic`, `basement.rigs`, `basement.controls`, `basement.render` and `basement.camera` are stable references, not copied implementations or per-method forwarding wrappers. Basement's handles, registration, queries and events remain authoritative.
3. **Explicit composition replaces mixins.** Systems are normal instances with named lifecycle hooks, called in registration order. No `Object.assign`/prototype injection or legacy fallback is used. Directory composition passes dependencies between game systems explicitly instead of making the coordinator a service locator for old mixin methods. Removing the old production mixins is part of the following class conversions.
4. **Levels own content and policy.** `gameLevel` supplies prepare/enter/leave and optional policy/presentation hooks. Asynchronous `prepare` receives assets only. It cannot obtain the runtime's live world through its supplied context.
5. **Default entity lifetime is the active level.** Level exit enumerates the official native registry and retires nonpersistent entities, including entities made by direct native factories. This is lifecycle filtering, not a second entity or spatial registry. Session lifetime is explicit and preserves the original entity/body across level changes.
6. **Transitions happen between steps.** A request during a simulation callback prepares asynchronously and commits after that synchronous tick. Concurrent loads reject instead of silently superseding one another. Unknown IDs and preparation failures leave the live level intact. There is never a second staged physics world.
7. **Entry failure is explicit.** Once preparation succeeds, the previous level leaves before new bodies are created. If entry fails, partial level entities/resources are cleaned and the runtime has no active level. Session entities remain. A subsequent load can recover. This is not advertised as rollback of arbitrary gameplay side effects.
8. **Cleanup is scoped and exhaustive.** `context.on` subscriptions and `context.defer` callbacks retire with their level/system. Cleanup runs in reverse order, continues after failures, and reports aggregated errors. Retired context helper methods reject late creation/subscription attempts. Use `defer` for native pools, constraints that only reference session bodies, external resources and other resources not automatically owned by a retiring entity. A system owns its detach/deferred cleanup; entity session lifetime is independent of system registration.
9. **The existing Lobby remains the clock implementation.** Its canonical source is now ESM (`lobby/level-lobby.mjs`); the classic script references the bundled same class. The new runtime schedules that class, not another accumulator/integrator. Stop/restart invalidates old callbacks and start is idempotent. Without a scheduler, headless clients advance explicit runtime steps.
10. **Presentation reads snapshots.** Rendering is separate from stepping and receives interpolation blend and a data-packet frame builder. Native snapshots remain the read contract. Render hooks must not issue body commands through retained API references; these are ordinary trusted application systems, not a JavaScript sandbox. The runtime rejects its own entity factory during rendering and physics rejects unauthorized stepping.
11. **Persistence is not silently adapted.** The native physics API already provides full physical snapshots. A new runtime-wide gameplay/save envelope and reconnection of gameplay systems belong to the persistence class conversion; current classic saves do not automatically load into this coordinator.

## Public classes and methods

### gameEngine

```js
new gameEngine({
    asset_library,       // the data source, normally the Directory registry (assetLibrary); none = EMPTY_DATA_SOURCE
    physics: {},         // Native physics options; authority/library owned by the runtime
    controls: {},        // Basement controlSystem options; polling owned by the runtime
    clock: {},           // MAX_FRAME_MS, MAX_STEPS, GAME_SPEED; STEP_MS must match physics
    frame_clock,         // Optional existing clock observer
    schedule_frame,      // Defaults to browser requestAnimationFrame, or null headlessly
    cancel_frame,
    services: {},        // Explicit game service references; cannot shadow Basement APIs
    camera: {}           // Camera position/zoom/rotation/viewport/bounds
});
```

| Member | Contract |
|---|---|
| `basement`, `lobby`, `directory`, `penthouse`, `game` | The level jacks. `basement`: the running systems (`physics`, `elements`, `rigs`, `motion`, `traffic`, `controls`, `camera`, `render`). `lobby`: the loop's clock. `directory`: the Directory's functions plus `assets`, this runtime's registry. `penthouse`: the prefabs. `game`: the services the game plugged in. Each is frozen. |
| `physics_system`, `lobby` | Canonical owned world and Lobby; no writable replacement setters. |
| `active_level`, `running`, `loading`, `paused`, `pause_reasons`, `phase`, `destroyed` | Lifecycle observations. |
| `registerLevel(level_id, LevelClass)` | Register a `gameLevel` subclass. Duplicate IDs reject. |
| `listLevels()` | Return registered IDs. |
| `loadLevel(level_id, options)` | Promise resolving to the entered level. Only preparation is asynchronous. |
| `unloadLevel()` | Boundary operation; releases current content/resources. |
| `registerSystem(system_id, instance)` | Attach a composed instance. Immediately notify it of an existing level. |
| `removeSystem(system_id)` | Notify, detach and release its deferred resources/subscriptions. |
| `listSystems()` | Return IDs in execution order. |
| `createEntity(packet, {lifetime:'level'})` | Official native construction plus lifetime policy. Use `'session'` for persistent actors. |
| `retainEntity(entity)` | Mark an existing official entity as session-lived without replacing its identity. |
| `releaseEntity(entity)` | Return it to default lifetime; does not immediately destroy it. |
| `pause(reason)` | Return an idempotent release function. Multiple tokens compose. |
| `start()`, `stop()` | Start/stop the sole scheduled loop. Starting twice does not schedule twice. |
| `updateState()` | One fixed native step when running, unpaused and a level is active; otherwise returns false. |
| `render(blend=1)` | Render separately, even for stopped inspection. Paused rendering uses blend 1. |
| `dispose()` | Terminal cleanup of levels, systems, subscriptions, all bodies and scheduling. |

### gameLevel

A level constructor receives `{level_id}`. The read-only `level_id` must match registration. Hooks:

- `prepare({assets}, options)` may return a Promise of prepared data.
- `enter(context, prepared)` instantiates official content.
- `beforePhysics(context, seconds)` sends intentions.
- `afterPhysics(context, seconds)` applies gameplay consequences.
- `render(context, blend, frame)` reads presentation state.
- `leave(context)` performs level policy cleanup.
- `disposePrepared(prepared)` releases preparation resources on exit or failure.

Except `prepare`, hooks must be synchronous. Levels can omit hooks via the base defaults.

### mapLevel

`mapLevel` (`map-level.mjs`) is a `gameLevel` that is one Basement map. A subclass gives `mapDefinition({assets}, options)`, returning `{definition, map_options}`. The level then:

- builds the map on `enter` and releases it on `leave`;
- streams the map after each step round `mapFocuses(context)` (default: every active character body, else the spawn) within `mapStreamBudget(context)` milliseconds (default 3), and builds the arriving regions whole on `enter`;
- when the map's `switches.light_grid` is true, keeps its light grid (`this.light_grid`, a Basement `lightGridSystem` over the map's `light_grid` settings, tier options from `lightGridOptions(context)`): baked whole on `enter`, and after each step given the glowing movers among `lightGridMovers(context)` (default every character and vehicle; while a map with a night shows it, and only those standing still are baked, a passing one is a live light) and re-baked within `lightGridBudget(context)` milliseconds (default 2);
- when the map's `switches.lighting` is true, keeps it lamp-lit: its night (its `night` record, or the engine's `NIGHT` without one) is on from `enter`, at full strength, unless `day_night` hands it to the clock, and its lights cast shadows on the walls (`render.setLightShadows(true)`, off again on `leave`). Whenever its night is drawn, its rooms thin it (`nightAreas(context)`: an outdoor room to the clock's darkness, an indoor room with a `fill` to that fill while its lights are on);
- runs `map.updateState(mapUpdateOptions(context))` after each step, so doors and rooms stay current;
- when the map's `switches.traffic` or `switches.walkers` is true and it has an `agents` record (`{settings?, profiles: {name: profile}}`), brings its streets to life (`this.agents`, a Basement `agentSystem` over `streetNetwork(definition)`): the profiles on the car lanes with `traffic`, the rest with `walkers`. Before each step they run round `agentFocus(context)` (the first map focus, and the camera's view so they appear out of sight), and on `enter` the street is filled at once. `makeAgent(context, name, profile, pose)` makes each one (default: an entity of the profile's `template` in one of its `looks`; override it for agents that need more, such as a rig). They go on `leave`;
- lists its exits with `getExits()`: the map's triggers whose data names a `target` level, as `{entity, target, label, auto, bounds}`. `exitAt(body)` gives the exit a body stands in.

Arrival: `loadLevel(id, {arrival: {from}, travellers: [entity ids]})` places the first traveller just inside the exit whose target is `from`. On a streamed map the regions round that exit are built first, wherever it lies. The traveller steps out the way away from what stands right behind the exit (off a map edge: in from it; out of a door in a street front: away from the building), ties going to the map edge the exit sits nearest, until the spot is clear and outside every exit, and faces that way; a blocked way gives way to the next. Each later traveller goes to the nearest clear spot beside the first or further in, never inside an exit. With no exit leading back, the first traveller lands at the map's `spawn`.

### travelSystem

`travelSystem({get_travellers, can_travel})` (`travel-system.mjs`) moves the party between levels:

- **Exits.** After each step it records the exit the leading traveller stands in as `exit`: `{target, label, auto, available}`. `available` is false when the target is not a registered level or `can_travel(exit, context)` refuses. `onExitChanged(listener)` reports changes, leaving the level too (with null), so a prompt for the exit goes with it. An `auto` exit travels on contact.
- **Travel.** `travel(target?)` loads the target with the travellers, resolves to the new level and records `previous_level`. Every traveller must be a session or retained entity, because the runtime retires level entities on the way out.
- **Saving.** `saveState()` / `loadState()` carry `{level_id, previous_level}`.

The game composes it with the player first and adopted companions on foot behind (`game.travel`). Every map with a layout, the city included, is registered as a `GameMapLevel` (`game/levels/game-map-level.mjs`) by `registerMapLevels(engine)`, under its map id.

### Composed systems

A system is an ordinary object/class instance, not an extension to `gameEngine.prototype`. Its optional synchronous hooks are `attach(context)`, `beforePhysics(context,seconds)`, `afterPhysics(context,seconds)`, `render(context,blend,frame)`, `levelEntered(context,level)`, `levelLeaving(context,level)`, and `detach(context)`.

A simulation tick first samples the owned controls service, then runs systems' `beforePhysics`, level `beforePhysics`, **one** Basement step (including native contact events), level `afterPhysics`, and systems' `afterPhysics`, then updates the camera once. Rendering runs level presentation then systems' presentation. Exit/detach cleanup reverses registration order. A simulation/presentation hook error stops scheduling and propagates; it is not caught repeatedly in an endless frame-error loop.

### Lifecycle context

`context.engine` is the coordinator, and `context.basement`, `context.lobby`, `context.directory`, `context.penthouse` and `context.game` are the same jacks as the engine's. `context.createEntity(packet,options)` uses runtime lifetime policy. `context.on(event,handler)` registers an automatically cleaned native world subscription. `context.defer(fn)` registers cleanup. Context helpers reject after their scope retires. An explicitly retained `api` reference remains the public session API, so clients must also cancel their own asynchronous work using deferred cleanup.

## Directory composition and example

`directory/game-runtime.mjs` exports `createGameRuntime(options)`. It constructs the asset library, registers currently available native player/prop/companion/street entity types, and returns an unstarted coordinator. It imports no legacy class or mixin. Production gameplay systems and level registrations will be supplied as their classes are converted.

```js
import { createGameRuntime } from '../../../game/boot/game-runtime.mjs';
import { gameLevel } from './game-level.mjs';

class Room extends gameLevel {
    enter(context) {
        context.createEntity({kind:'static', position:[200,100]});
    }
}
const engine = createGameRuntime();
engine.registerLevel('room', Room);
const player = engine.createEntity({template:'df:player_949', kind:'character'}, {lifetime:'session'});
engine.registerSystem('input', {
    beforePhysics() { player.setMovement([1,0]); }
});
await engine.loadLevel('room');
engine.start();
```

`src/engine/tests/game-engine.test.mjs` runs the coordinator end to end with no game present: levels, transitions, pause, scheduling, objects and disposal.

## Verification and next conversions

Run `node --test src/engine/tests/game-engine.test.mjs` and `python tools/test-game-engine-browser.py`. The tests exercise ownership, stable identity/grid, hook ordering, queued event-time creation, cleanup, transition failures, disposal during loading, pause, stop/restart races and bundled execution without legacy globals.

Shared session/player control and production vitals ownership are implemented. Next convert the remaining game-specific input callers, level construction/lifecycle, population/vehicle ownership, combat/abilities, story/interactions, presentation and persistence into explicit registered systems. Keep game-specific policy in those classes and add missing physical capability inside Basement. Remove each old mixin as its responsibilities and callers are converted. Replacing the production boot happens against that shared class composition, not by adding more map-specific bypasses.

Verified this batch: **217 combined tests**, **134 isolated engine tests**, **13 apartment acceptance checks**, **118 existing game regression cases / 1,456 assertions**, GameDB and vehicle-construction checks, and both new-runtime and apartment Chromium checks pass. The global legacy retirement audit remains incomplete because production class conversion is pending.

## Central input service

`basement.controls` is the canonical Basement `controlSystem`; see [its standalone API](../../basement/controls/README.md). The coordinator constructs it once, polls it before simulation policy, and consumes edges after all before/after-physics systems read them. Paused/no-level frames still sample input for UI. Input callbacks run in an `input` phase, so they can request an asynchronous level load but cannot recursively step the runtime. Pause/resume, stop and level commit suppress held gameplay input until release/neutral. Disposal removes the service's listeners and touch bindings.

Directory composition supplies `game-control-profile.json`. The runtime example now requests `context.basement.controls.direction('move')`; it has no private keyboard state. Touch bindings use the same service for movement/aim sticks and buttons. Old classic input dispatch uses this same implementation through its name alias and explicitly requested legacy polling loop; conversion of its game-side joystick/gamepad policy remains pending.

## Renderer and camera boundary

`basement.render` and `basement.camera` are the real Basement services, documented in [the rendering API](../../basement/rendering/README.md). The runtime opens a frame, passes the data-only builder to level/system render hooks, and flushes the selected backend exactly once. Producer failures abort partial frames. No Canvas context or arbitrary draw callback goes through that contract.

Directory composition registers the Canvas backend; mounting is explicit: `await basement.render.setRenderer('canvas',{surface})`. The previous `render_target` runtime option is rejected with migration guidance. The Directory factory accepts `surface` for initial input binding, and its `surface-input` system retargets controls after successful backend replacement. Use `basement.render.resize` for logical viewport/DPR changes. Only the backend obtains contexts.

The regular runtime example now draws by packets. `examples/rendering.html` exercises paths, gradients, clipping, images, text, shadows and offscreen composition from Directory data. WebGL is an intended backend, not an implementation supplied here. The classic Canvas artists and the original playable boot remain pending shared class conversions.

## Shared session and player composition

Directory's `createGameRuntime({player?, session_state?, ...runtimeOptions})` now installs the official `gameSession`, `PlayerStateSystem` and `PlayerControlSystem`, available at `game.session`, `game.player_state` and `game.player_controls`. Obtain the persistent native player with `game.session.player`; callers no longer need a temporary input system or per-level player factory. `player` supplies a new session's entity packet. `session_state` supplies validated domain records; a saved entity ID must already resolve in the official registry and cannot silently create a replacement. The bare `gameEngine` remains game independent and creates no default player.

The shared classes own gameplay state/rules and issue Basement motor/placement requests. Directory owns their tuning and composition. See the [gameplay API reference](../../../game/mechanics/README.md) for ownership, methods, events, examples, restoration and exact migration limits. Shared weapons and actor execution are now installed; legacy city weapon callers, progression policies, story/death flow and classic save coordination remain pending.

`retainEntity(entity)` and `releaseEntity(entity)` accept idle, system-registration, input, before/after-physics and level-transition boundaries. `retainEntity(entity)` accepts these boundaries so an attaching session can retain an actual restored native body. This does not create another registry or physical owner. Full runtime save/load remains a separate conversion; loading a raw world snapshot beneath already attached systems is not the supported reconnection sequence.

Production health and Flit-state consumers now use the active player's shared `playerVitals` component. The original host no longer owns mirrored health, energy, protection or recovery ledgers. This does not switch its physical world or production boot; legacy weapon/interaction callers, gameplay policies and level/physical class conversions remain pending. See [the vitals API and migration boundary](../../../game/mechanics/README.md#playervitals).

Systems can implement `gameplayPaused(context)`. The runtime calls it after clearing inputs when acquiring a pause token; native weapon policy discards pending release shots. After `afterPhysics` hooks, the runtime calls the existing native `commitCommands()` without advancing time, so completed steps have no queued removals/spawns blocking a snapshot. See the [shared combat API](../../../game/mechanics/combat/README.md) for weapons, timed effects and registered world loot.

Recruited native NPCs are automatically retained by `actorSystem`; released contracts return to level lifetime. The same entity and body survive native level changes. See [actor lifetime and API contracts](../../../game/mechanics/actors/README.md).

Directory now installs `game.attacks`: the shared registry and character-facing dispatch for firearm, melee and ability attacks. Native Player/NPC/Ganger and arbitrary gameCharacter subclasses share it. Automatic connections use official registration events; selection persists on the character and normal input has one queue. See [attack API](../../../game/mechanics/attacks/README.md).

`basement.rigs` is the native world rig service: body-owned animation shares the same fixed step and persistence. Render hooks may read resolved poses/anchors, but animation mutations and manual advances are rejected. Directory installs `humanoidSystem` as the first game-specific client; authored rigs/clips remain in Directory.
