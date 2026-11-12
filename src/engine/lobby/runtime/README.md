# gameEngine runtime

`gameEngine` is the destination application coordinator. It owns one Basement world, the public API references, the shared Lobby clock, a level registry and explicit system instances. It contains no game collision math, private spatial index, old GameEngine delegate, or prototype mixins.

The classic playable boot still constructs `GameEngine`. Loading the new class into `DFNative` does not construct another world or silently route old classes through it. The first shared session/player/control conversion is installed by Directory; other production class conversions remain pending. The existing `ApartmentLevel` is the earlier scene-owned integration; it is not yet a `gameLevel` subclass and must relinquish its world/step when converted.

## Ownership decisions

1. **One world per runtime lifetime.** `physicsSystem` constructs the only spatial grid. Levels neither construct a world nor step it. A private Symbol authorizes only the runtime's simulation call. Independent standalone worlds remain supported.
2. **The API points to the real engine services.** `api.physics`, `api.elements`, `api.assets`, `api.motion`, `api.traffic`, `api.rigs`, `api.controls`, `api.render` and `api.camera` are stable references, not copied implementations or per-method forwarding wrappers. Basement's handles, registration, queries and events remain authoritative.
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
| `api` | Frozen service-reference object: `physics`, `elements`, `assets`, `motion`, `traffic`, `rigs`, `controls`, `render`, `camera`, plus explicitly supplied game services. |
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

### Composed systems

A system is an ordinary object/class instance, not an extension to `gameEngine.prototype`. Its optional synchronous hooks are `attach(context)`, `beforePhysics(context,seconds)`, `afterPhysics(context,seconds)`, `render(context,blend,frame)`, `levelEntered(context,level)`, `levelLeaving(context,level)`, and `detach(context)`.

A simulation tick first samples the owned controls service, then runs systems' `beforePhysics`, level `beforePhysics`, **one** Basement step (including native contact events), level `afterPhysics`, and systems' `afterPhysics`, then updates the camera once. Rendering runs level presentation then systems' presentation. Exit/detach cleanup reverses registration order. A simulation/presentation hook error stops scheduling and propagates; it is not caught repeatedly in an endless frame-error loop.

### Lifecycle context

`context.engine` and `context.api` provide the coordinator and canonical native services. `context.createEntity(packet,options)` uses runtime lifetime policy. `context.on(event,handler)` registers an automatically cleaned native world subscription. `context.defer(fn)` registers cleanup. Context helpers reject after their scope retires. An explicitly retained `api` reference remains the public session API, so clients must also cancel their own asynchronous work using deferred cleanup.

## Directory composition and example

`directory/game-runtime.mjs` exports `createGameRuntime(options)`. It constructs the asset library, registers currently available native player/prop/companion/street entity types, and returns an unstarted coordinator. It imports no legacy class or mixin. Production gameplay systems and level registrations will be supplied as their classes are converted.

```js
import { createGameRuntime } from '../../../game/boot/game-runtime.mjs';
import { gameLevel } from './game-level.mjs';

class Room extends gameLevel {
    enter(context) {
        context.createEntity({entity_type:'static', position:[200,100]});
    }
}
const engine = createGameRuntime();
engine.registerLevel('room', Room);
const player = engine.createEntity({template:'df:player_949', entity_type:'df_player'}, {lifetime:'session'});
engine.registerSystem('input', {
    beforePhysics() { player.setMovement([1,0]); }
});
await engine.loadLevel('room');
engine.start();
```

Serve the checkout over HTTP and open `src/game/examples/`. The two example levels are authored in `directory/game-assets/runtime-example.json`; they are explicitly demonstration content, not converted city/apartment levels. Keyboard input, native pushing/contact, two-level transitions, pause, scheduling and disposal run through the real new coordinator.

## Verification and next conversions

Run `node --test tools/test-game-engine.mjs tools/test-native-bundle.mjs` and `python tools/test-game-engine-browser.py`. The tests exercise ownership, stable identity/grid, hook ordering, queued event-time creation, cleanup, transition failures, disposal during loading, pause, stop/restart races and bundled execution without legacy globals.

Shared session/player control and production vitals ownership are implemented. Next convert the remaining game-specific input callers, level construction/lifecycle, population/vehicle ownership, combat/abilities, story/interactions, presentation and persistence into explicit registered systems. Keep game-specific policy in those classes and add missing physical capability inside Basement. Remove each old mixin as its responsibilities and callers are converted. Replacing the production boot happens against that shared class composition, not by adding more map-specific bypasses.

Verified this batch: **217 combined tests**, **134 isolated engine tests**, **13 apartment acceptance checks**, **118 existing game regression cases / 1,456 assertions**, GameDB and vehicle-construction checks, and both new-runtime and apartment Chromium checks pass. The global legacy retirement audit remains incomplete because production class conversion is pending.

## Central input service

`api.controls` is the canonical Basement `controlSystem`; see [its standalone API](../../basement/controls/README.md). The coordinator constructs it once, polls it before simulation policy, and consumes edges after all before/after-physics systems read them. Paused/no-level frames still sample input for UI. Input callbacks run in an `input` phase, so they can request an asynchronous level load but cannot recursively step the runtime. Pause/resume, stop and level commit suppress held gameplay input until release/neutral. Disposal removes the service's listeners and touch bindings.

Directory composition supplies `game-control-profile.json`. The runtime example now requests `context.api.controls.direction('move')`; it has no private keyboard state. Touch bindings use the same service for movement/aim sticks and buttons. Old classic input dispatch uses this same implementation through its name alias and explicitly requested legacy polling loop; conversion of its game-side joystick/gamepad policy remains pending.

## Renderer and camera boundary

`api.render` and `api.camera` are the real Basement services, documented in [the rendering API](../../basement/rendering/README.md). The runtime opens a frame, passes the data-only builder to level/system render hooks, and flushes the selected backend exactly once. Producer failures abort partial frames. No Canvas context or arbitrary draw callback goes through that contract.

Directory composition registers the Canvas backend; mounting is explicit: `await api.render.setRenderer('canvas',{surface})`. The previous `render_target` runtime option is rejected with migration guidance. The Directory factory accepts `surface` for initial input binding, and its `surface-input` system retargets controls after successful backend replacement. Use `api.render.resize` for logical viewport/DPR changes. Only the backend obtains contexts.

The regular runtime example now draws by packets. `examples/rendering.html` exercises paths, gradients, clipping, images, text, shadows and offscreen composition from Directory data. WebGL is an intended backend, not an implementation supplied here. The classic Canvas artists and the original playable boot remain pending shared class conversions.

## Shared session and player composition

Directory's `createGameRuntime({player?, session_state?, ...runtimeOptions})` now installs the official `gameSession`, `PlayerStateSystem` and `PlayerControlSystem`, available at `api.session`, `api.player_state` and `api.player_controls`. Obtain the persistent native player with `api.session.player`; callers no longer need a temporary input system or per-level player factory. `player` supplies a new session's entity packet. `session_state` supplies validated domain records; a saved entity ID must already resolve in the official registry and cannot silently create a replacement. The bare `gameEngine` remains game independent and creates no default player.

The shared classes own gameplay state/rules and issue Basement motor/placement requests. Directory owns their tuning and composition. See the [gameplay API reference](../../../game/mechanics/README.md) for ownership, methods, events, examples, restoration and exact migration limits. Shared weapons and actor execution are now installed; legacy city weapon callers, progression policies, story/death flow and classic save coordination remain pending.

`retainEntity(entity)` and `releaseEntity(entity)` accept idle, system-registration, input, before/after-physics and level-transition boundaries. `retainEntity(entity)` accepts these boundaries so an attaching session can retain an actual restored native body. This does not create another registry or physical owner. Full runtime save/load remains a separate conversion; loading a raw world snapshot beneath already attached systems is not the supported reconnection sequence.

Production health and Flit-state consumers now use the active player's shared `playerVitals` component. The original host no longer owns mirrored health, energy, protection or recovery ledgers. This does not switch its physical world or production boot; legacy weapon/interaction callers, gameplay policies and level/physical class conversions remain pending. See [the vitals API and migration boundary](../../../game/mechanics/README.md#playervitals).

Systems can implement `gameplayPaused(context)`. The runtime calls it after clearing inputs when acquiring a pause token; native weapon policy discards pending release shots. After `afterPhysics` hooks, the runtime calls the existing native `commitCommands()` without advancing time, so completed steps have no queued removals/spawns blocking a snapshot. See the [shared combat API](../../../game/mechanics/combat/README.md) for weapons, timed effects and registered world loot.

Recruited native NPCs are automatically retained by `actorSystem`; released contracts return to level lifetime. The same entity and body survive native level changes. See [actor lifetime and API contracts](../../../game/mechanics/actors/README.md).

Directory now installs `api.attacks`: the shared registry and character-facing dispatch for firearm, melee and ability attacks. Native Player/NPC/Ganger and arbitrary gameCharacter subclasses share it. Automatic connections use official registration events; selection persists on the character and normal input has one queue. See [attack API](../../../game/mechanics/attacks/README.md).

`api.rigs` is the native world rig service: body-owned animation shares the same fixed step and persistence. Render hooks may read resolved poses/anchors, but animation mutations and manual advances are rejected. Directory installs `humanoidSystem` as the first game-specific client; authored rigs/clips remain in Directory.
