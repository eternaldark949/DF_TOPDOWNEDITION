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
        this.hero = context.createEntity({ kind: 'character', position: [100, 100] });
    }
    beforePhysics(context, seconds) {
        const [x, y] = context.basement.controls.direction('move');
        this.hero.motor.setMovement([x, y]);
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
| `engine.lobby` | The game loop: levels, systems, pausing and the clock (`lobby.clock`) |
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
| `engine.createObject(record, at, overrides, {lifetime})` | Makes any object from a catalog record (a template id or a record) at `at`; it leaves with the level unless `lifetime` is `session` (see [Objects](#objects)) |
| `engine.createEntity(packet, {lifetime})` | Makes an entity outside a context from a raw packet |
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
| `physics.createEntity(packet)` | Any entity; `kind` says what it is (see [Elements and entities](#elements-and-entities)) |
| `physics.createConstraint(packet)` / `physics.createChain(packet)` / `physics.createCloth(packet)` | Joints, chains and cloth |
| `physics.emitParticles(pool, packet)` | Particles from a pool made with `createParticlePool` |
| `physics.attachBody(body, packet)` / `physics.detachBody(body)` / `physics.getAttachmentState(body)` | Riding one body on another, such as a driver in a car |
| `physics.on(event, handler)` | Events such as `contactBegin` |
| `physics.savePhysicsState()` / `physics.loadPhysicsState(state)` | Save and restore the world |
| `physics.getStatistics()` | Body and contact counts |

Reference: [physics README](basement/physics/README.md) and [physics API reference](basement/physics/docs/api-reference.md).

### Elements and entities

`basement.elements` is the registry of every entity in the world. Every entity is one `gameEntity`: a body, a position, a rotation, properties and parts. There are no entity classes to extend. What an object is comes from its `kind`, a preset of body defaults and parts:

| Kind | What it is | Parts |
|---|---|---|
| `prop` | A rigid thing that can be pushed | none |
| `static` | A wall or anything fixed | none |
| `character` | Something that walks | character `motor`, `awareness` |
| `vehicle` | Something that drives | vehicle `motor` |
| `projectile` | Something that flies | projectile `motor` |
| `trigger` | An invisible sensor | none |
| `decoration`, `entity` | Something that touches nothing | none |

A record may override any of it: `{kind: 'prop', physics_type: 'static'}`, or `{kind: 'prop', motor: 'character'}` for a walking crate. Motor calls go through the part: `entity.motor.setMovement([1, 0])`, `entity.motor.steerVehicle(0.2)`.

| Call | What it does |
|---|---|
| `elements.createEntity({kind, ...packet})` | Any entity (`engine.createObject` makes one from a catalog record) |
| `elements.defineKind(name, {body, motor, awareness})` | Adds your own kind, as data |
| `elements.getEntities({kind, tag})` / `elements.fetchEntity(id)` | Finds entities by kind, by tag, or by id |
| `entity.destroy()` | Removes it from the world |

#### gameEntity

Every object in the world is a `gameEntity`, the way every object in a Blender game is a `KX_GameObject`. It has a name, an id, a position, a rotation, a parent, children and properties. Every call that changes it returns the entity, so calls chain.

| Call | What it does |
|---|---|
| `entity.name`, `entity.entity_id`, `entity.kind`, `entity.tags` | Who it is |
| `entity.motor`, `entity.awareness` | Its parts, or `null` |
| `entity.position`, `entity.rotation`, `entity.linear_velocity` | Where it is and how it moves (read only; change them with the calls below) |
| `entity.get(key, fallback)` / `entity.has(key)` | Reads a property |
| `entity.set(key, value)` | Writes a property; `undefined` removes it. Fires `propertyChanged` with `{key, value, previous}` on the next step |
| `entity.moveTo(x, y)` / `entity.rotateTo(angle)` | Places or turns it |
| `entity.toWorld([x, y])` / `entity.toLocal([x, y])` | Turns a point in its own frame into a world point, and back |
| `entity.distanceTo(target)` / `entity.directionTo(target)` | Distance and unit direction to a point or another entity |
| `entity.attach(child, {at, rotation})` | Parents `child` at a local offset; the child rides along until it is detached |
| `entity.detach()` / `entity.detach(child)` | Lets go of its parent, or of one child. Returns `false` when there was nothing to leave or no clear spot to leave at |
| `entity.parent` / `entity.children` | Its parent entity (or `null`) and its attached children |
| `entity.on(event, handler)` | Events on this entity, such as `propertyChanged` or a contact; returns a call that stops listening |
| `entity.activate()` / `entity.deactivate()` / `entity.destroy()` | Turns it on or off, or removes it |

```js
const lamp = elements.createEntity({ kind: 'prop', name: 'lamp', position: [0, 0], data: { on: true } });
const car = elements.createEntity({ kind: 'prop', name: 'car', position: [100, 40] });
car.attach(lamp, { at: [12, 0] });
lamp.on('propertyChanged', ({ key, value }) => console.log(key, value));
lamp.set('on', false);
car.moveTo(200, 40);           // the lamp follows at [212, 40] after the next step
car.distanceTo([200, 70]);     // 30
```

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

**Drawing.** Draw in an `artScene` with readable calls, each placed around the scene's origin, then hand `finish()` to the frame:

```js
const art = new artScene();
art.drawRectangle({ x: -10, y: -6, width: 20, height: 12, radius: 2, fill: '#5a4632' });
art.drawCircle({ x: 0, y: 0, radius: 3, fill: '#c9b28a', alpha: 0.8 });
art.drawLine({ points: [[-8, 6], [8, 6]], stroke: '#2b2118', line_width: 1 });
for (const packet of art.finish()) frame.submit(packet);
```

The calls are `drawRectangle`, `drawCircle`, `drawEllipse`, `drawCapsule`, `drawLine`, `drawPolygon`, `drawCurve`, `drawText`, `drawGlow` and `drawGroundShadow`. Paint fields on any of them: `fill`, `stroke`, `line_width`, `alpha`, `blend`, `shadow`, and gradients through `linear` and `radial`.

**Drawings as data.** The same shapes can be a list of steps in data, so a thing's appearance needs no code. `art.draw(steps, { at, rotation, scale, values })` paints them; a `group` step nests steps at its own offset, turn and size, and a value `"$name"` is read from `values` (a look's fields), so one drawing serves every variant:

```json
[
  { "shape": "rectangle", "x": -10, "y": -6, "width": 20, "height": 12, "radius": 2, "fill": "$body" },
  { "shape": "group", "x": 5, "rotation": 1.57, "steps": [{ "shape": "circle", "radius": 3, "fill": "$lamp" }] }
]
```

**Materials and textures.** A step's `material` names a material record, so many drawings share one substance. A material holds paint fields (`fill`, `stroke`, `line_width`, `alpha`, `blend`, `shadow`, …) and an optional `surface` (`friction`, `restitution`, `hit_sound`, `hit_effect`, `footstep`); any other field is refused. A step's own paint wins over its material's. A texture is a fill: `{ "type": "pattern", "image": "bricks", "repeat": "repeat" }` repeats a registered image and moves with its object.

**Looks.** An entity whose `drawing` asset names a drawing is drawn by the engine every frame at its own position and rotation; nothing else is needed. Its `look` property (`{values, scale, layer, depth, visible}`) says what the drawing reads and where it sits, so `entity.set('look', {...})` changes how it looks and `entity.setAsset('drawing', id)` swaps its art.

| Call | What it does |
|---|---|
| `render.drawLooks(blend)` | Draws every visible look into the open frame (the loop calls it for you) |
| `fitBounds(steps, bounds)` | The collision shape that fits a drawing's solid steps: `circle`, `box`, `capsule` or `hull` |
| `drawingReach(steps)` | The circle round everything a drawing paints, glows included |

The light layer (`createLightLayer`) draws lights and shadows. Colour helpers: `rgba`, `mix`, `shade`, `hexToRgb`.

Reference: [rendering README](basement/rendering/README.md).

### Camera

| Call | What it does |
|---|---|
| `camera.follow(entity, { offset, smoothing })` / `camera.stopFollowing()` | Tracks an entity |
| `camera.setView({ position, zoom, rotation })` / `camera.getView()` | Places the camera |
| `camera.setBounds(bounds)` | Keeps it inside the map |
| `camera.screenToWorld(point)` / `camera.worldToScreen(point)` | Converts between screen and world |

### Controls

`basement.controls` gives one API for keyboard, mouse, gamepad (buttons, triggers and sticks) and touch (buttons and sticks). Your code asks about **actions**, never keys or devices. Taps, double taps, holds and drags are recognised for you, each above a threshold you can set.

A binding is an input name (`'e'`, `'space'`, `'mouseLeft'`, `'gamepadA'`, `'gamepadRTrigger'`, `'touchFire'`), or `[input, type, threshold]`:

| Type | Fires when | Threshold (third value) | Default |
|---|---|---|---|
| `PRESS` | the input goes down | — | |
| `RELEASE` | it comes up | — | |
| `REPEAT` | it goes down, and again on each key repeat | — | |
| `TAP` | it is pressed and let go quickly | longest tap, seconds | `tap_threshold` 0.195 |
| `DOUBLETAP` | it is tapped twice in a row | longest gap between the taps, seconds | `tap_wait_time` 0.25 |
| `HELD` | it stays down long enough | shortest hold, seconds | `hold_wait_time` 1.0 |
| `DRAG` | a pointer press (mouse button or touch button) moves far enough before it is let go | shortest drag, pixels | `drag_threshold` 8 |

A press that became a hold or a drag is not also a tap. The defaults are changed for every binding at once with `timing`.

```js
import { TAP, DOUBLETAP, HELD, DRAG } from './engine/basement/controls/index.mjs';

new gameEngine({ controls: {
    keymap: {
        interact: ['e', 'gamepadA', 'touchInteract'],
        dash: [['space', DOUBLETAP, 0.3]],
        charge: [['mouseRight', HELD, 0.5]],
        pan: [['mouseLeft', DRAG, 12]],
        move_left: ['a'], move_right: ['d'], move_up: ['w'], move_down: ['s']
    },
    vectors: { move: { gamepad: 'left', touch: 'move', dead_zone: 0.15 } },
    timing: { tap_threshold: 0.2, drag_threshold: 10 }
} });
```

| Call | What it does |
|---|---|
| `controls.active(action)` | Held right now |
| `controls.justActivated(action)` / `controls.justReleased(action)` | Pressed or let go this tick |
| `controls.held(action)` | Seconds held |
| `controls.value(action)` | 0 to 1, for triggers |
| `controls.direction(name)` | One `[x, y]` from keys, gamepad stick or touch stick, with dead zones |
| `controls.readQueue(action, type)` | Takes a recognised `TAP`, `DOUBLETAP`, `HELD` or `DRAG` off the queue (true or false) |
| `controls.drag(action)` | While a drag is under way: `{ origin, position, delta, distance }` in screen pixels; otherwise null |
| `controls.pointer()` | Mouse position, movement and wheel |
| `controls.bind(action, ...bindings)` / `controls.setKeymap(keymap)` | Changes bindings |
| `controls.touch.button(element, 'touchFire')` / `controls.touch.stick('move', { zone })` | Wires on-screen touch buttons and sticks |

Input contexts and rumble templates from the API spec are documented here when built.

Reference: [controls README](basement/controls/README.md).

---

## Lobby (LV1)

The game loop. It owns time and runs every system in order each tick: input, before physics, physics, after physics, camera, then render.

### The clock and pausing

`engine.lobby` is the game loop, and `engine.lobby.clock` its clock: a fixed step, with frames drawn between steps. The engine's own loop calls (`loadLevel`, `start`, `pause`, …) are the loop's.

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
| `directory.validateMapLayout(layout)`, `validatePropCatalog`, `validateSkeleton`, `validateDrawing`, `validateMaterial`, … | Checks data against its structure (a library is checked when it is registered) |
| `directory.resolvePlacement`, `resolveLayout`, `resolvePropLook` | Turns layout data into what the map builder reads |

Reference: [Directory README](directory/README.md).

---

## Penthouse (LV3)

Prefabs built only from the levels below, through `engine.penthouse`.

| Prefab | What it is |
|---|---|
| `createObject(elements, record, at, overrides)` | Any object from a catalog record (see [Objects](#objects)); `engine.createObject` is the same with level lifetime |
| `objectPacket(assets, record, at, overrides)` | The entity packet a record makes, without making it |
| `humanoid` | A procedural humanoid with a rig, IK and physical arms |

### Objects

One call makes anything: `engine.createObject(record, at)`. A record is a template in a library (or an inline record), and its fields switch its parts on. Nothing in the call knows which record it is.

| Field | What it switches on |
|---|---|
| `kind` | What it is to physics: `prop`, `static`, `character`, `vehicle`, `trigger`, … |
| `assets.drawing` | Its look: a drawing resource, drawn every frame |
| `look` | `{values, scale, layer, depth, visible}`, kept as the object's `look` property |
| `bounds` | Collision bounds fitted from the drawing's solid steps: `circle`, `box`, `capsule` or `hull` |
| `collision_shape` | An exact shape; it always wins over `bounds` |
| `assets.material` | A material whose `surface` sets the body's friction and restitution |
| `data` | Its starting properties |

```js
engine.directory.assets.registerLibrary({
  library_id: 'yard',
  resources: {
    lamp: { kind: 'drawing', steps: [
      { shape: 'glow', radius: 60, color: '$light' },
      { shape: 'circle', radius: 10, material: 'brass', solid: true },
      { shape: 'rectangle', x: -2, y: 10, width: 4, height: 30, material: 'brass', solid: true }] },
    brass: { kind: 'material', fill: '#b5a642', stroke: '#5a4f1c', surface: { friction: 0.3 } }
  },
  templates: {
    lamp: { kind: 'prop', assets: { drawing: 'lamp', material: 'brass' },
            look: { values: { light: '#ffd27f' }, layer: 2 }, bounds: 'circle', data: { on: true } }
  }
});
// In a level's enter(context), or with { lifetime: 'session' } outside one:
const lamp = context.engine.createObject('yard:lamp', [100, 50]);   // drawn every frame; its hitbox fits the head and post, not the glow
```

A drawing step is solid when it says `solid: true`; when no step says so, every shape but glows, ground shadows, text and lines is. Bounds are fitted once, from the drawing at rest, so an animation never changes the hitbox.

Reference: [Penthouse README](penthouse/README.md).
