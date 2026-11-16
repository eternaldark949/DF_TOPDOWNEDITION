# Engine API: general purpose, data and switches

Written with ETERNAL on 2026-11-15. Read it after [ENGINE-ARCHITECTURE.md](ENGINE-ARCHITECTURE.md), which says where each system lives. This file says what each system does and how it is called. Every change follows it, whatever the code in `reference/classic/` does. Only ETERNAL changes it.

How to use what exists today is in [src/engine/API.md](../src/engine/API.md), split by level and system. Every engine change that adds or changes a call updates that guide in the same commit.

## Where things live

- **Basement (LV0)** holds the systems and operations: objects, the drawing backend, physics, the spatial grid, navigation, agents, controls, UI, audio.
- **Lobby (LV1)** runs the game loop.
- **Directory (LV2)** holds the data.
- **Penthouse (LV3)** holds the toys and special features that put it all together into sets of prefabs.
- **The game** is data handed to those levels, plus the few game rules that are not general.

## The rules

The engine is a small set of general systems, and the game is data handed to them.

1. **One system per job.** Objects, drawing, maps, agents, navigation, controls, UI, audio, saves, time. No second copy for one map, screen, venue or character.
2. **Things are data.** A prop, an enemy, a venue, a screen or a light is a record with a name, an id and its values. No class or module is named after one thing in the game.
3. **Switches, not branches.** What runs where is a true/false switch in the data (`traffic: true`). No code checks a map id, a character name or a screen name.
4. **Calls say what they do.** `createObject`, `drawRectangle`, `loadMap`, `ui.open`, `bind`. A user who knows what they want gets it in a few lines and never needs the internals.
5. **Local space.** Everything drawn or placed on an object sits around that object's origin, like a Blender asset.
6. **The classic code is a reference for how things looked and felt, never for how they are built.** Its map-id checks, per-venue scripts and per-screen classes are what this API replaces.
7. **A feature is data first.** A new enemy, venue or screen is a record plus switches. Engine code is written only when a feature needs a capability no system has, and then it is built once, for everything.

**Bosses, cutscenes and anything "special" are data too.** A boss is an object like any other and uses the same code at its core. A cutscene is a map plus a list of steps (move, say, wait, fade) with branches. A boss is a spawn point, phases with conditions, dialogue steps and a rule table. Data picks which actions run and when. When a record needs an action that does not exist yet (a spiral of shots aimed ahead of the player), the action is added once as a general verb, such as `firePattern {shape: spiral, count: 12, aim: lead}`, and every boss, turret and enemy can use it. Maths, loops or variables never go into the JSON.

## At a glance

| The game hands over | Read by | What it becomes |
| --- | --- | --- |
| **Catalog**: props, characters, lights, sounds, each a record with a name, an id, a look and switches | Objects, Drawing, Audio | Objects in the world, drawn from their look around their origin |
| **Maps**: size, walls, placements, exits, a navigation network, and `switches` | Maps, Navigation, Agents | One loaded map with only the systems its switches turn on |
| **Rules**: behaviour tables (sense → decide → act), agent profiles, bindings | Agents, Controls | Cars, walkers, enemies and the player all run the same loop |
| **Screens**: UI contexts with items, positions, styles and transitions | UI | Main menu, pause, pages, HUD as one overlay system |

Under those sit the services every system shares: the loop and time, the spatial grid (awareness), physics, saves and the debug view.

The flow for any map is always the same: `loadMap(id)` reads the map's data, creates its objects from the catalog, turns on the systems its switches name, and the loop runs them. Nothing in that path knows which map it is.

## The API

Each call is one line. **Today** says what exists now: *have* means it works and only needs the name or shape below, *partly* means part of it is there, *missing* means it has to be built.

### Objects

An object is like Blender's `KX_GameObject`: a name, an id, a position, a rotation, a parent, properties, and parts (look, body, light, sound, behaviour) switched on by data. A light is an object. A human is an object with a human look and a behaviour. There is one object class, `gameEntity`, and no subclasses: `kind` is a preset of body defaults and parts (a `motor` for walking, driving or flying, `awareness`), a record overrides any of it, and objects are sorted by `kind` and `tags`.

| Call | What it does | Today |
| --- | --- | --- |
| `createObject(record, at)` | Makes an object from a catalog record at a position: its look, fitted bounds and surface switched on by the record's fields | have: `engine.createObject`; map placements still have their own path |
| `object.get(key)` / `object.set(key, value)` | Reads or writes a property; `set` fires `propertyChanged` | have: `gameEntity.get`, `has`, `set` |
| `object.moveTo(x, y)` / `object.rotateTo(angle)` | Places or turns it | have |
| `object.attach(child, at)` | Parents one object to another at a local offset | have: `gameEntity.attach`, `detach`, `parent`, `children` |
| `object.toWorld(p)` / `toLocal(p)` / `distanceTo(t)` / `directionTo(t)` | Frame and distance helpers | have |
| `object.on(event, fn)` | Runs `fn` on touch, use, enter, leave, hit, death | partly: triggers and interactions, not one event list |
| `findObjects({near, radius, kind, property})` | Asks the spatial grid what is around | have: grid awareness and lookups |
| `removeObject(object)` | Takes it out of the world and every system | have |

### Lights

| Call | What it does | Today |
| --- | --- | --- |
| `createObject({light: {type, radius, color, intensity, shadows, animation}})` | Any light is a light object; `type` is point, cone, area or ambient | partly: point lights, stutter animation, neon as colour-only lights |
| `light.set('on', false)` | Switches it like any property | partly |

### Maps

| Call | What it does | Today |
| --- | --- | --- |
| `loadMap(id)` | Loads any map the same way, turning on its switched systems | have: `GameMapLevel` loads all 21 maps |
| `switches: {traffic, walkers, ground, buildings, plants, lighting, …}` | True/false per system in the map's layout file | have for six systems |
| `travel(exit)` | Moves the player through an exit to another map | have |
| `spawn(record, at)` on load | Places the map's characters and props | partly: layout NPCs are not spawned natively |
| One map drawer | Ground, buildings, plants and interiors drawn by one drawer | partly: the drawers still carry city names and there is no interior drawer |

### Agents and navigation

| Call | What it does | Today |
| --- | --- | --- |
| `createAgent(record, at)` | An object with a profile and a behaviour table | partly: cars and walkers are two separate systems |
| `agent.goTo(place)` | Plans a route on the network and follows it | partly, twice over |
| `profile: {network: 'foot' or 'car', speed, gap, …}` | What a car or a walker is, as data | missing |
| `rules: [{when, do}]` | The behaviour table: sense, decide, act | missing as data; written as code per system |

### Audio, saves, time

| Call | What it does | Today |
| --- | --- | --- |
| `playSound(name, {at, volume, loop})` | A sound, placed in the world if `at` is given | missing natively |
| `save(slot)` / `load(slot)` | The whole game's state | missing: only partial saves |
| `engine.after(seconds, fn)` / `engine.every(seconds, fn)` | Timers on the game clock (see the Lobby) | missing |

### Debugging

| Call | What it does | Today |
| --- | --- | --- |
| `debug.show(layer)` | Draws the grid, network, colliders or agent state over the game | partly |
| `measure(name)` | Times a system per frame | have: the map bench |

Controls, drawing and UI have their own sections below.

## Agents and navigation

Cars and walkers are the same thing. Both sense what is around them, decide what to do, and move along a network. Today they are two systems: cars on the road network with lane occupancy, walkers on a separate sidewalk network with their own manager. That is why moving walkers over was hard: every fix had to be made twice, and the two had to be taught about each other at crosswalks.

1. **One network.** Every map has one navigation network of nodes and lanes. Each lane lists the `profiles` that may use it, such as `foot` or `car`. A crosswalk is a lane both profiles share, and a signal on it is data.
2. **One agent loop.** Every agent runs the same three steps each tick:
   - **Sense**: ask the spatial grid what is ahead, beside and near (awareness, lane occupancy).
   - **Decide**: run its behaviour table, a list of `when → do` rules, such as "when the lane ahead is taken, wait" or "when the signal is red, stop before the crossing".
   - **Move**: a motor turns the decision into motion: steering and speed for a car, steps for a walker.
3. **Car or walker is data.** A profile sets the network, speed, size, following gap and which rules apply. An enemy, a guard, a shopper or a boss is a profile too.
4. **Following works the same for both.** An agent keeps a gap to whatever occupies its lane ahead, whether that is a car, a walker or the player.

The tuning already in `game-street-life.json` (`walk_close`, `crosswalk_reach`, `stop_before_walkway`) becomes profile and rule data.

## Lobby: the game loop

The Lobby owns time. It runs every system in a fixed order each tick, and knows nothing about the game.

**Each tick:** input → UI → before physics → physics → after physics → camera → render. UI and input run even while the game is paused; everything from before physics onwards stops.

| Call | What it does | Today |
| --- | --- | --- |
| `engine.start()` / `engine.stop()` | Starts or stops the loop | have |
| `const resume = engine.pause(reason)` | Pauses for a reason (menu, focus lost, cutscene) and returns its own resume; the game runs again only when every reason is released | have |
| `engine.paused` / `engine.running` | Reads the state | have |
| `engine.setTimeScale(k)` | Slow motion or fast forward for the game clock; UI keeps real time | missing |
| `engine.step(ticks)` | Advances a paused game by hand, for debugging | missing |
| `engine.registerSystem(id, system, {phase, pausable})` | Adds a system to a phase; `pausable: false` keeps it running while paused | partly: no `pausable` switch, so nothing runs during a pause |
| `engine.loadMap(id)` / `engine.travel(exit)` | Loads a map or moves through an exit | have |
| `engine.after(seconds, fn)` / `engine.every(seconds, fn)` | Timers on the game clock: they pause and scale with it | missing |
| `engine.on('paused' or 'resumed' or 'map_loaded', fn)` | Engine events | partly: systems get hooks, nothing else can listen |

## Controls

One API for every input type, as in ETERNAL's Python control system (`docs/engine-reference/`): each device (keyboard, mouse, gamepad, touch) is an instance with `input_active`, `input_just_activated`, `input_just_released` and a ghost image of the last frame, and a timing monitor classifies presses into tap, double tap and held and puts them on a queue. Game code only ever asks about **actions**, never keys.

The Basement `controlSystem` already works this way. What is left is input contexts, chords, rumble as data, and moving the classic game's hard-coded key handling onto it.

| Call | What it does | Today |
| --- | --- | --- |
| `bindings` file: `{context: {action: [input, …]}}` | Every binding as data; an input is a name (`e`, `gamepadA`, `mouseLeft`, `touchFire`) or `[name, type, seconds]` | partly: one keymap, no contexts |
| `type`: `press`, `release`, `tap`, `doubletap`, `held`, `repeat`, `chord` | How an input must be used for the action to fire; the timing logic stays hidden | have, except `chord` |
| `controls.active(action)` / `justActivated` / `justReleased` / `held` / `value` | Reads an action this tick | have |
| `controls.direction('move')` | One `[x, y]` from keys, stick or touch stick, with dead zones | have |
| `controls.readQueue(action, type)` | Takes a recognised tap, double tap or hold off the queue | have |
| `controls.useContext(name)` | Switches which bindings are live: `gameplay`, `menu`, `dialogue`, `vehicle` | missing |
| `controls.rebind(context, action, inputs)` and `controls.saveBindings()` | Player rebinding, kept in the save | partly: `bind` exists, no save |
| `controls.rumble(name)` | Plays a vibration template from data (`punch`, `bad_fall`, `explosion_near`), as in the Python templates | partly: a raw `rumble(ms, strength)` |

## Drawing backend

One Canvas backend in the Basement. It draws the essential shapes, and a **drawing** is a list of those shapes as data, around the object's origin. A thing's **look** is the values its drawing reads (`"$body"`), so one drawing serves every variant. Nobody writes canvas code to add a prop, a character or an effect.

**A drawing as data:**

```json
"drawing": [
  {"shape": "rectangle", "x": -10, "y": -6, "width": 20, "height": 12, "radius": 2, "fill": "$body"},
  {"shape": "circle", "x": 0, "y": 0, "radius": 3, "fill": "#c9b28a", "alpha": 0.8},
  {"shape": "line", "points": [[-8, 6], [8, 6]], "stroke": "#2b2118", "line_width": 1}
]
```

| Call | What it does | Today |
| --- | --- | --- |
| `drawRectangle({x, y, width, height, radius, fill, stroke})` | A box, rounded when `radius` is set | have |
| `drawCircle`, `drawEllipse`, `drawCapsule` | Round shapes | have |
| `drawLine`, `drawPolygon`, `drawCurve` | Lines and outlines | have |
| `drawText`, `drawImage` | Words and pictures | have `drawText`; `drawImage` missing |
| `fill` and `stroke`: a colour or a gradient (`linear`, `radial`) | How a shape is painted | have |
| `shadow`, `alpha`, `blend` on a step; `glow` and `ground_shadow` steps | Shadow, see-through, blending, light | have |
| `scene.draw(drawing, {at, rotation, scale, values})` | Draws a whole drawing in the object's local space, `group` steps nested, `"$name"` values from its look | have |
| `material: "brass"` on a step | Names a material record: paint fields plus a physical `surface` (friction, restitution, hit sound, hit effect, footstep); unknown fields refused | have |
| `fill: {type: "pattern", image, repeat}` | A texture: a registered image repeated across the shape, moving with its object | have |
| An object's `drawing` asset and `look` property | The render system draws every visible look each frame at the object's pose | have |
| `bounds: circle, box, capsule, hull` | Collision bounds fitted once from the drawing's solid steps; an explicit `collision_shape` wins | have |
| Variants | The same drawing in different colours or sizes: a look's values, chosen per object | have, through `values` |

**Made efficient by the backend, never by the game:** a drawing is compiled once into paths and cached; drawings that never move are baked into a layer image once; steps with the same paint are drawn together; the grid skips anything off screen.

## UI system

UI is one overlay over the game, drawn as page elements with CSS, so every look is a style. A screen is a **context**: a set of items, a layout and transitions. The pause menu, its pages, the main menu, the HUD, dialogue and the phone are all contexts.

**A uiElement (an item):**

- `id`, `type`: button, label, list, slider, toggle, image, bar, panel, input
- `text` or `value`, which can read live game data: `"text": "{player.money}"`
- `position`: an anchor (`top_left`, `centre`, …) and an offset, or left to the layout
- `style`: CSS
- `states`: style for `inactive`, `active`, `focus`, `hover` and `pressed`
- `animations`: `enter`, `leave`, `hover`, `click`, each a named animation with a duration
- `on_click`, `on_hover`, `on_focus`: what happens, as data: `{"open": "pause.settings"}`, `{"back": true}`, `{"event": "resume"}`, `{"set": "options.volume"}`
- `enabled`: true, false, or a game value it reads

**A context:**

- `name`: `main`, `pause`, `pause.settings`, `pause.saves`, `hud`
- `items`: the elements
- `layout`: `{kind: list or grid or free, direction, spacing: "auto" or px, align}`: dynamic spacing comes from here
- `focus`: the item in focus on entry; up and down move focus and skip inactive items
- `transition`: `{in: {kind: fade or slide or none, seconds}, out: {…}}`
- `pauses_game`: true or false
- `controls`: the input context it switches to, such as `menu`
- `modal`: true blocks the contexts beneath it

Pages are contexts too: "Settings" in the pause menu is `{"open": "pause.settings"}`, and Back returns along a stack.

| Call | What it does | Today |
| --- | --- | --- |
| `ui.define(context)` | Adds a context from data | missing |
| `ui.open(name, data)` / `ui.back()` / `ui.close(name)` | Switches screens with their transitions, along the stack | missing |
| `ui.focus(item)` / `ui.get(item)` / `ui.set(item, key, value)` | Moves focus or changes an item live | missing |
| `ui.on(event, fn)` | The game hears `resume`, `save`, `quit` and its own events | missing |
| Menu actions `ui_up`, `ui_down`, `ui_left`, `ui_right`, `ui_accept`, `ui_back` | Keyboard, gamepad and mouse drive every menu the same way through Controls | missing |

## Build order

Each step makes later steps smaller. A step is done when the game uses the new call and the old path is deleted.

1. **Lobby.** `pausable` systems, time scale, `step`, timers and engine events.
2. **Controls as data.** Input contexts, chords and rumble templates, with every binding in one file.
3. **Drawing backend.** The readable drawing calls and drawings as data in local space (done); then prop drawings move out of code into the catalog, one family at a time.
4. **UI system.** The overlay with items, states, styles and transitions; then the main menu, pause and its pages, and the HUD as data.
5. **Objects.** One `createObject` from a catalog record, with parts switched on by data (done: look, materials, fitted bounds, surface). Next, every placement, light and character goes through it.
6. **One map drawer.** Ground, buildings, plants and interiors drawn by one drawer that reads the map's sections and switches. Drop the city names. Spawn layout characters on load.
7. **Agents and one network.** Merge the walker network into the navigation network with profiles. Run cars and walkers on one agent loop with behaviour tables.
8. **Audio and saves.** Built once each, on the game clock and the object properties.
9. **Delete the classic path** in `reference/classic/` for each part as its native replacement ships.

## Open questions

- **Call names.** The names above are proposals in the spirit of the Python g7 base scripts. ETERNAL's naming wins wherever it differs.
- **Behaviour table shape.** Whether rules are plain `when → do` lists or something closer to the Python `sortObjectBasedOnProperties` routing, where an object's properties decide which system owns it.
