# How the working game connects

This describes the original at `e597475d679c60d58c8f78121f10a597cc0f2800`. It distinguishes observed source structure from proposed ownership. Follow source locations through MODULE_CATALOG and the compressed evidence. This is a source-wide inventory and a review of major execution paths; it is not proof that every dynamic branch has been understood or exercised.

## The central problem is ownership

The original is already divided into files. However, `engineMixin()` in `src/engine/game-engine.js` defines descriptors on `GameEngine.prototype`. There are 1,124 source contributions to that prototype, including its constructor/accessors. Splitting those methods across files did not restrict what they can read or change. Camera, UI, named companions, quest state, maps, physics, money, equipment, vehicles and rendering remain accessible through the same object.

ENGINE_METHODS lists every contribution with its source location. The `members` evidence identifies property reads/writes within each owner. Cross-file global references add another connection path, particularly `game`, `GameSettings`, `CONFIG`, timing globals and shared rendering helpers. These paths must be replaced by named commands, queries and connected services, rather than copied into a new central class.

## Build and initialization

`tools/build.mjs` determines classic-script order. The page head contains a separate inline initialization script; the boot loader activates ordered scripts. This is not an ES-module import graph. The generated `ASSETS` and `DFAB_BUILD` globals originate in the build tool. The evidence retains build order and those generated bindings.

`src/app/menu-wiring.js:1` constructs the global `game`. `src/engine/game-engine.js` constructs pause, UI, inventory, cutscene/story, weather, room/crowd, traffic, player, vehicle, progression and other services. It also creates named companions and starting rules. Later app boot wiring is distinct from this construction.

A constructor called on an assignment's right side finishes before its result is assigned. A child receiving `this` holds the same parent object and can see later mutations. A child that immediately copies an unavailable sibling or a primitive value holds that result instead. Replacement of a dependency is different from mutation of the parent. Migration should construct services, connect required dependencies, then start them. Forward declarations in source do not by themselves prove a runtime failure: execution timing matters.

## Starting, running and stopping

`src/engine/loop.js` owns enter/load/stop/reset and the frame loop. Loading uses asynchronous preparation and deliberate warmup callbacks. Those callbacks must have cancellation and scene ownership; they should not accidentally become additional simulation owners.

The loop uses a fixed simulation step, an elapsed-time accumulator, bounded catch-up, a display limiter and interpolation. Gameplay has per-tick tuning. `_simTick`, interpolated `_gameTimeSec`, wall-clock `_frameTime`, and `performance.now()` are different time domains. Replacing every duration with one seconds value would change behavior. Interpolation temporarily changes displayed transforms and restores them after drawing.

`src/engine/update.js` begins a projectile sweep step before actors move; processes timers, state effects, world/room/weather and movement/AI/game logic; and invokes collision later in the update (`CollisionSystem.update`, around line 1028). Story, scene and named tutorial conditions also live in this large method. `draw.js` then prepares a camera/view and renders the world and UI. Pause/loader/scene locks do not all mean the same thing. Their intended scopes need named contracts.

Stopping clears or disconnects audio, phone, UI and pause state. Reset clears scene work, timers, callbacks, collision/render caches, projectiles, progression and entity references. Retained infrastructure and retained world state must be distinguished from per-scene state. Every callback/task, registry entry, asset and listener needs an owner that can cancel/release it.

## Entities, collision and navigation

`src/physics/game-entity.js` supplies base registration, layer/type selection and queued entity operations. GameEngine also keeps parallel collections for props, NPCs, enemies, projectiles, traffic and other features. Membership can therefore be duplicated across registry and feature lists. The target should make scene membership authoritative while allowing systems to keep indexes that are maintained by lifecycle operations.

`src/physics/collision.js` groups bodies into explicitly processed layers. Its update begins with camera-visible candidates, with selected offscreen dynamic supplementation. Vehicles, actors, dynamics and projectiles then receive different handlers. TrafficManager handles vehicle/vehicle contacts separately, and vehicle wall probes can suppress duplicate wall handling. `_processActors` handles actor/actor, actor/static and actor/dynamic contacts; it does not provide a universal actor/vehicle contact rule.

Pedestrians already contain vehicle-threat/avoidance behavior (`src/entities/pedestrians.js`). That AI reaction is separate from physical contact resolution. Velvet Cat is an ActorEntity with collision enabled (`src/entities/enemies.js`); enabling that flag does not make an absent contact pathway exist. This explains why isolated fixes tend to accumulate.

The requested engine changes this contract intentionally: ordinary bodies share shape/height contact algorithms by default, independent of name and camera visibility. AI can still choose to avoid vehicles. Damage, hostility, permissions, one-way surfaces and non-solid triggers are policies layered on shared geometry; they must not be encoded as every possible named entity pair. Spatial structures support queries and updates, not separate definitions of what is solid.

`world/navigation.js`, `world/walker.js`, `traffic/roads.js`, pedestrian indexes and vehicle routing overlap in spatial needs but serve different queries. Share geometry and lifecycle rules, not necessarily one universal index. Preserve road lanes, room doors, obstacle revisions, local avoidance and population budgets while consolidating algorithms.

## Scene and map loading

`world/maps.js` supplies static metadata. `world/map-entities.js` constructs live instances. `engine/map-loading.js` combines them and adds generated city geometry, named buildings, transitions, lights, walls, traffic and story actors. The static map catalog alone is therefore not the entire world.

`loadMap()` recognizes the legacy `hub_949` alias, coordinates fade/pause/preparation, and uses a load sequence to reject stale asynchronous work. `_cancelMapTextureWarmup()` cancels pending jobs. `_doLoadMap()` clears old collision/registration/caches; combines metadata with created entities; creates or reuses hub content; selects active map; harvests building attachments; builds transition/render/room/navigation indexes; registers persistent actors; restores relevant vehicles and encounter state; resets animation after final placement; and resizes the view.

Maps are partly shallow-copied. Nested objects can remain shared. Generated transition markers are filtered to prevent accumulation. Hub caches, map snapshots, save snapshots, prepared artwork and active instances have different lifetimes. Preserve those distinctions instead of cloning everything or retaining everything.

Named city placements, companion gates, business entrances, dialogue and encounter choices belong to Game recipes/rules. Scene activation, cancellation, asset preparation, body registration, attachment resolution and cache disposal belong to reusable engine services. The engine coordinates these services; it should not know the identity of the hotel or a companion.

## Rendering, buildings and glow

`engine/draw.js` performs explicit phases and feature-specific draws. It resolves the view once, draws ground/buildings/entities/overhead objects and effects, applies lighting/daylight/fire illumination, draws emissive detail, then performs overlays and screen post-processing. Layer toggles/profilers wrap parts of this sequence. `world-state.js`, `lighting.js`, `shopfront-light.js`, `reflections.js`, `overhead.js` and individual building painters contribute additional decisions.

In particular, `draw.js` calls `drawEmissivePass()` after darkness and earlier world geometry. Being drawn late can place a glow above an already-painted roof unless that glow is clipped/hidden correctly. The source includes specific occlusion workarounds (for example roof/canopy checks for cat eyeshine and speech). This is a pipeline/visibility problem; a late pass is not automatically aware of every earlier surface.

The new foundation must use common declared surfaces/transforms/height and visibility for opaque artwork and emission. A building declares where its wall, window, door, roof and light source exist. The renderer handles projection, depth and obstruction. Soft bloom may spread around a visible bright source; it must not make an occluded source appear through a solid roof. Direct illumination, emissive surfaces, bloom, shadows and reflections are distinct effects and need distinct contracts.

Original buildings include multiple builders and projection/height conventions. Tiered building kit, building V2 and named recipes must be audited as data paths: ID/config → section/floor geometry → prepared wall/window/door artwork → reusable texture pieces → placed/projected surfaces → roof/attachments → lighting/reflection participation. Their original calculations are inventoried, but a formula appearing in `calculations` is not proof that the target renderer reproduces it.

The current hotel proof demonstrates one real asset. It does not establish full character animation, all building profiles, transparency, reflections, lighting or whole-game visual parity. Original feature painters cannot be kept as per-frame Canvas world callbacks underneath the WebGL migration. Canvas may prepare changing artwork explicitly; WebGL owns actual output.

## Player, weapons, abilities and effects

`engine/events.js` and player input helpers turn keyboard/touch state into actions. `player-fire.js`, `quick-draw.js`, `scope.js`, `finisher.js`, `executions.js`, `daytime-flit.js`, `knuckles.js` and status/combat modules combine general movement/aim/raycast/damage/effect mechanisms with the game's rules and costs. Actors, NPCs, enemies, projectiles and vehicles consume these results.

The engine should provide movement/sweep/aim, contact and hit queries, health/damage/effects, cooldown/resource transactions, equipment and animation mechanisms. Game declares weapons, costs, attack profiles, progression, faction policy and named encounter behavior. A complex reusable mechanic may live in an optional engine system configured by Game; it should not recalculate physics or patch draw order locally. Preserve tuning units, hit ownership, invulnerability, melee/execution timing, inventory selection and input sequencing before changing representation.

`ui/inventory-augments.js` mixes item definitions, inventory behavior and menu work. Saves store item IDs and reconstruct objects. `core/registries.js`, `core/resonance.js` and other progression code similarly mix definitions and mechanisms. Extract registry data and game policies while retaining reusable transactions, equipment slots, effects, validation and progression accounting in named systems.

## Story, crowds, missions and UI

`story/scene-runner.js` and dialogue/cutscene support provide reusable sequencing mechanisms, but authored scenes, cast, dialogue, rewards and gates are Game. `story/missions.js` combines mission machinery with named businesses and delivery-app rules. `world/lobby-life.js`, `club-life.js`, `cafe-life.js` combine crowd mechanisms with location-specific schedules/content. Reuse actor/navigation/population mechanisms; configure location recipes rather than writing separate physical/render systems per location.

Phone apps, shops, sidebars, coach/HUD reveal, saves and dialogue depend on DOM IDs and event handlers as well as world objects. The evidence includes literal and dynamic selectors, inline handlers and event registrations. UI migration must preserve touch/focus/fullscreen/orientation and pause behavior. Branded layouts and story text are Game presentation; input routing, widgets, screen lifecycle and command dispatch can be engine services. No world-space collision/projection calculation belongs in an app's view code.

## Audio, weather, assets and persistence

`audio/audio.js` supplies playback/mixing behavior and game music/ambience bindings. Browser audio activation needs user gesture handling. Pause, stop, map transitions, phone calls and vehicle engines change audio state. Asset readiness and lifecycle must remain explicit.

Weather has world state, room/indoor suppression, particles, lighting, ambience and wet/reflection effects. Going indoors must not silently replace the outdoor storm state. Share time/room exposure and declared sources across these systems while preserving separate update/render concerns.

`core/assets.js`, CacheDB, ground baking, procedural painters and per-map floor caches form several cache layers. A cache key must reflect inputs/version; CPU artwork, GPU resources, active placements and persistent cache entries have separate lifetimes. Loading and disposal should be scene/resource operations, with explicit budgets and diagnostics.

STATE_AND_SAVE lists the original returned save fields. Preserve the version-2 schema, aliases, migration/default/validation order, registry ID restoration, equipment variants and owned-vehicle rules. Generic persistence belongs to Directory; the game's schema and legacy compatibility mapping belong to Game.

## What remains uncertain

Static candidates do not resolve all local aliases, computed keys, prototype wrappers, runtime registrations, getter effects or callback order. The evidence retains raw expressions and source locations for these cases. Source mentions do not establish branch reachability or execution frequency. The original regression suite passes, but it is a mocked Node/VM check, not a complete playthrough or visual/performance comparison. Those limits remain explicit migration work rather than assumed parity.
