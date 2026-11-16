# Engine user guide

How to use the engine, for someone making a game with it. It is split by concern: the engine and its jacks first, then each level and every system under it. Each section says what the system is for, the calls you use, and a short example. Deeper reference for a system lives in its own README, linked from its section.

What the engine is meant to become is in [READ-FIRST/ENGINE-API.md](../../READ-FIRST/ENGINE-API.md). This guide documents what works today. When a call in the API spec is built, it gets documented here.

**Contents**

- [Getting started](#getting-started)
- [The engine](#the-engine)
- [Basement (LV0)](#basement-lv0)
  - [Physics](#physics)
  - [Elements and entities](#elements-and-entities)
  - [Spatial queries](#spatial-queries)
  - [Navigation, motion and traffic](#navigation-motion-and-traffic)
  - [Animation rigs](#animation-rigs)
  - [Maps](#maps)
  - [Rendering](#rendering)
  - [Camera](#camera)
  - [Controls](#controls)
- [Lobby (LV1)](#lobby-lv1)
  - [The clock and pausing](#the-clock-and-pausing)
  - [Levels](#levels)
  - [Map levels](#map-levels)
  - [Travel](#travel)
- [Directory (LV2)](#directory-lv2)
- [Penthouse (LV3)](#penthouse-lv3)

---

## Getting started

A level with one character, moved by the `move` direction each tick:

```js
import { gameEngine } from './engine/game-engine.mjs';
import { gameLevel } from './engine/lobby/runtime/game-level.mjs';

class Room extends gameLevel {
    enter(context) {
        this.hero = context.basement.physics.createCharacter({ position: [100, 100] });
    }
    beforePhysics(context, seconds) {
        const [x, y] = context.basement.controls.direction('move');
        // steer this.hero with [x, y]
    }
}

const engine = new gameEngine();
engine.registerLevel('room', Room);
await engine.loadLevel('room');
engine.start();
```

---

## The engine

`gameEngine` (`src/engine/game-engine.mjs`) brings every level together. You make one, register levels and systems on it, load a level and start it. It knows nothing about your game.

### Jacks

Each level plugs in through one jack. Every jack is frozen.

| Jack | What it holds |
|---|---|
| `engine.basement` | The running systems: `physics`, `elements`, `rigs`, `motion`, `traffic`, `controls`, `camera`, `render` |
| `engine.lobby` | The loop's clock |
| `engine.directory` | The data functions (`assetLibrary`, `validateMapLayout`, `resolvePlacement`, …) plus `assets`, this engine's registry |
| `engine.penthouse` | The prefabs: `humanoid` |
| `engine.game` | The services your game passes in as `services` |

Levels and systems get a **context** with the same jacks (`context.basement`, `context.lobby`, `context.directory`, `context.penthouse`, `context.game`), plus:

- `context.engine`: the engine
- `context.createEntity(packet, {lifetime})`: an entity that lives for the level (`'level'`, the default) or the whole session (`'session'`)
- `context.on(event, handler)`: a physics event handler, removed automatically when the level or system goes away
- `context.defer(cleanup)`: a function run when the level or system goes away

### Calls

| Call | What it does |
|---|---|
| `new gameEngine({ physics, controls, camera, clock, services })` | Makes the engine. `services` are your game's own systems, found later under `engine.game` |
| `engine.registerLevel(id, LevelClass)` | Adds a level (a `gameLevel` subclass) |
| `await engine.loadLevel(id, options)` | Leaves the current level and enters this one |
| `engine.unloadLevel()` | Leaves the current level |
| `engine.registerSystem(id, system)` / `engine.removeSystem(id)` | Adds or removes a system that runs every tick (see [Systems](#systems)) |
| `engine.start()` / `engine.stop()` | Starts or stops the loop |
| `const resume = engine.pause(reason)` | Pauses for a reason; call `resume()` to release it (see [The clock and pausing](#the-clock-and-pausing)) |
| `engine.createEntity(packet, {lifetime})` | Makes an entity outside a context |
| `engine.retainEntity(entity)` / `engine.releaseEntity(entity)` | Keeps an entity across level changes, or lets it go |
| `engine.updateState()` / `engine.render(blend)` | Runs one tick or one frame by hand (the loop does this for you) |
| `engine.dispose()` | Shuts everything down |
| `engine.active_level`, `engine.running`, `engine.paused`, `engine.pause_reasons`, `engine.phase` | Read the state |

### Systems

A system is any object with some of these hooks. Each receives its context first.

| Hook | When it runs |
|---|---|
| `attach(context)` / `detach(context)` | When it is registered or removed |
| `levelEntered(context, level)` / `levelLeaving(context, level)` | Around each level change |
| `beforePhysics(context, seconds)` / `afterPhysics(context, seconds)` | Every tick, around the physics step |
| `render(context, blend, frame)` | Every frame |
| `gameplayPaused(context)` | When the game pauses |

Hooks must be synchronous. Load anything slow in a level's `prepare`.

---

## Basement (LV0)

The systems and operations. Everything here runs on its own, without a game. Reach it through `engine.basement` or `context.basement`.

### Physics

`basement.physics` is the world: bodies, collisions, constraints, projectiles, particles, cloth and chains, all on one fixed step and one spatial grid. The engine steps it; you never call its update yourself.

| Call | What it does |
|---|---|
| `physics.createCharacter(packet)` | A character body and entity |
| `physics.createVehicle(packet)` / `physics.createProjectile(packet)` | A vehicle or a projectile |
| `physics.createEntity(packet)` | Any registered entity type |
| `physics.createConstraint(packet)` / `physics.createChain(packet)` / `physics.createCloth(packet)` | Joints, chains and cloth |
| `physics.emitParticles(pool, packet)` | Particles from a pool made with `createParticlePool` |
| `physics.attachBody(body, packet)` / `physics.detachBody(body)` / `physics.getAttachmentState(body)` | Riding one body on another, such as a driver in a car |
| `physics.on(event, handler)` | Events such as `contactBegin` |
| `physics.savePhysicsState()` / `physics.loadPhysicsState(state)` | Save and restore the world |
| `physics.getStatistics()` | Body and contact counts |

Reference: [physics README](basement/physics/README.md) and [physics API reference](basement/physics/docs/api-reference.md).

### Elements and entities

`basement.elements` is the registry of every entity in the world. An entity is a game object with a body, a position, a rotation and properties. The built-in types are `gameCharacter`, `gameVehicle`, `gameProjectile`, `gameProp`, `gameStatic`, `gameTrigger` and `gameDecoration`.

| Call | What it does |
|---|---|
| `elements.createProp(packet)` / `createStatic` / `createTrigger` / `createDecoration` | One of the built-in types |
| `elements.registerEntityType(type, Class)` | Adds your own type (a subclass of a built-in one) |
| `elements.getEntities({instance_of})` / `elements.fetchEntity(id)` | Finds entities |
| `entity.get(key)` / `entity.set(key, value)` | Reads or writes a property |
| `entity.setPosition([x, y])` / `entity.setRotation(angle)` | Places or turns it |
| `entity.on(event, handler)` | Events on this entity |
| `entity.destroy()` | Removes it from the world |

`gameEntity` gets its own section here when the single `createObject` from the API spec is built.

Reference: [entities](basement/physics/docs/entities.md).

### Spatial queries

Everything in the world sits on one shared spatial grid, so asking what is around is cheap.

| Call | What it does |
|---|---|
| `physics.raycast(packet)` | The first thing along a line |
| `physics.queryRadialRegion(source, {radius, …})` | Everything in a circle or ring around a point |
| `physics.queryEntitiesInBounds(packet)` | Everything in a box |
| `physics.findNearestEntity(reference, options)` | The closest match |
| `physics.observeTarget(observer, target, options)` | Whether one character can see another (range, cone, walls) |
| `physics.findClearPlacement(packet)` and the other `find…Placement` calls | A free spot to put something |

### Navigation, motion and traffic

| System | What it does |
|---|---|
| `physics.findPath(packet)` | A path around walls |
| `basement.motion` | Moves bodies along paths and lanes |
| `basement.traffic` | Runs vehicles on a road network, with lane occupancy |

Reference: [navigation](basement/physics/docs/navigation.md). The API spec merges cars and walkers into one agent system on one network; that section of this guide is written when it is built.

### Animation rigs

`basement.rigs` runs skeletal animation: rig definitions, poses, clips, an animation controller per body, and inverse kinematics (`solveIk`). It shares the physics world's step.

Reference: [physics README](basement/physics/README.md), animation section.

### Maps

A map is data: size, walls, placements, lights, triggers, rooms, doors and cloth. `mapSystem` turns a map definition into entities in the world and streams them round a focus point.

| Call | What it does |
|---|---|
| `new mapSystem(physics)` | The map service for a world |
| `maps.load(definition, options)` / `maps.unload()` | Builds a map's entities, or removes them |
| `maps.setFocus(focuses, { radius })` / `maps.updateState()` | Streams regions in and out round the player |
| `maps.getDoors()` | The map's doors |
| `maps.saveState()` / `maps.loadState(state)` | Door and prop state |

Usually you don't call this yourself: a [map level](#map-levels) does it for you.

Reference: [maps README](basement/maps/README.md).

### Rendering

`basement.render` draws frames through a renderer you register, such as the Canvas backend. Each frame it hands your `render` hooks a `frame` to draw into.

| Call | What it does |
|---|---|
| `render.registerRenderer(id, Class)` | Adds a backend, such as `canvasRenderer` |
| `await render.setRenderer(id, { surface })` | Mounts it on a canvas |
| `render.resize({ width, height, pixel_ratio })` | Matches the screen |
| `render.getVisibleEntities()` | What is on screen |

The art toolkit (`basement/rendering/art.mjs`) builds shapes for a frame: `rect`, `roundRect`, `circle`, `ellipse`, `capsule`, `polyline`, `polygon`, `smoothShape`, gradients (`linear`, `radial`), `glow` and `groundShadow`, plus colour helpers (`rgba`, `mix`, `shade`). The light layer (`createLightLayer`) draws lights and shadows. The readable `drawRectangle` / `drawCircle` calls and looks as data from the API spec are documented here when built.

Reference: [rendering README](basement/rendering/README.md).

### Camera

| Call | What it does |
|---|---|
| `camera.follow(entity, { offset, smoothing })` / `camera.stopFollowing()` | Tracks an entity |
| `camera.setView({ position, zoom, rotation })` / `camera.getView()` | Places the camera |
| `camera.setBounds(bounds)` | Keeps it inside the map |
| `camera.screenToWorld(point)` / `camera.worldToScreen(point)` | Converts between screen and world |

### Controls

`basement.controls` gives one API for keyboard, mouse, gamepad and touch. Your code asks about **actions**, never keys. Taps, double taps and holds are timed for you.

```js
new gameEngine({ controls: { keymap: {
    interact: ['e', 'gamepadA'],
    dash: [['space', DOUBLETAP]],
    move_left: ['a'], move_right: ['d'], move_up: ['w'], move_down: ['s']
}, vectors: { move: { gamepad: 'left', touch: 'move', dead_zone: 0.15 } } } });
```

| Call | What it does |
|---|---|
| `controls.active(action)` | Held right now |
| `controls.justActivated(action)` / `controls.justReleased(action)` | Pressed or let go this tick |
| `controls.held(action)` | Seconds held |
| `controls.value(action)` | 0 to 1, for triggers |
| `controls.direction(name)` | One `[x, y]` from keys, stick or touch stick |
| `controls.readQueue(action, type)` | Takes a recognised `TAP`, `DOUBLETAP` or `HELD` off the queue |
| `controls.bind(action, ...inputs)` / `controls.setKeymap(keymap)` | Changes bindings |
| `controls.pointer()` | Mouse position, movement and wheel |

Input types: `PRESS`, `RELEASE`, `TAP`, `DOUBLETAP`, `HELD`, `REPEAT`. Input contexts, chords and rumble templates from the API spec are documented here when built.

Reference: [controls README](basement/controls/README.md).

---

## Lobby (LV1)

The game loop. It owns time and runs every system in order each tick: input, before physics, physics, after physics, camera, then render.

### The clock and pausing

`engine.lobby` is the clock: a fixed step, with frames drawn between steps.

`engine.pause(reason)` pauses for a named reason and returns that reason's own `resume`. The game runs again only when every reason is released, so a menu and a lost window focus can both pause without fighting.

```js
const resume = engine.pause('menu');
// later
resume();
```

### Levels

A level is a `gameLevel` subclass. It holds content and policy; it never owns the world or the clock.

| Hook | What it does |
|---|---|
| `async prepare({ assets }, options)` | Loads what the level needs. The only hook that may be asynchronous |
| `enter(context, prepared)` / `leave(context)` | Builds and tears down the level |
| `beforePhysics(context, seconds)` / `afterPhysics(context, seconds)` | Runs each tick |
| `render(context, blend, frame)` | Draws each frame |
| `disposePrepared(prepared)` | Frees what `prepare` loaded |

### Map levels

`mapLevel` is a level that loads a map: give it a map definition and it builds the map, streams it, places travellers and exposes its exits.

| Member | What it does |
|---|---|
| `mapDefinition({ assets }, options)` | Returns the map's definition (override this) |
| `getExits()` / `exitAt(body)` | The map's exits, or the one a body stands in |
| `mapFocuses(context)` | What the map streams round |

### Travel

`travelSystem` moves the player and companions through an exit to another map: `await travel.travel(target)`, which defaults to the exit the player stands in. It is a system: register it with `engine.registerSystem`.

---

## Directory (LV2)

The data layer, through `engine.directory`. It defines what each kind of data looks like, keeps the registry where everything is found by id, and loads library files. It has no behaviour.

| Call | What it does |
|---|---|
| `directory.assets` | This engine's registry |
| `assets.registerLibrary(library)` | Adds a library of templates and resources |
| `assets.getTemplate(id)` / `assets.getResource(id)` / `assets.listTemplates()` | Finds data by id |
| `directory.validateMapLayout(layout)`, `validatePropCatalog`, `validateSkeleton`, … | Checks data against its structure |
| `directory.resolvePlacement`, `resolveLayout`, `resolvePropLook` | Turns layout data into what the map builder reads |

Reference: [Directory README](directory/README.md).

---

## Penthouse (LV3)

Prefabs built only from the levels below, through `engine.penthouse`.

| Prefab | What it is |
|---|---|
| `humanoid` | A procedural humanoid with a rig, IK and physical arms |

Reference: [Penthouse README](penthouse/README.md).
