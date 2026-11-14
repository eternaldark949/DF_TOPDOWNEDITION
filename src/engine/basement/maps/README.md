# Basement map system

`mapSystem` builds one map into one physics world from plain data. Every map loads the same way, a cafe or a city: it is streamed by region round its focuses, and a map smaller than its streaming radius is simply whole. It knows no game names: the Directory supplies the data, the entity templates, and a `decorate` hook for game fields.

```js
import { physicsSystem } from '../physics/index.mjs';
import { mapSystem } from './index.mjs';

const physics = new physicsSystem({ asset_library });
const maps = new mapSystem(physics);
const map = maps.load(definition, { templates, prop_types, decorate });
map.entity('door_0');            // live entity by authored id
map.entities('prop');            // live entities by role, in build order
map.updateState({ near_range: door => 90, duration: 0.35 });
map.setFocus([{position: player.position, velocity: player.linear_velocity}]);   // build near regions, release far ones
```

## Map definition

Every section is optional. Rectangles are top-left: `{x, y, w, h}` for walls, triggers and doors; `{x, y, width, height}` for placements.

| Field | Meaning |
|---|---|
| `map_id`, `kind` | `kind` is `'interior'` (default) or `'exterior'`: a label for the game (and `decorate`), never a loading path. |
| `size: [w, h]`, `boundary: {thickness}` | A ring of four walls just outside the map. |
| `walls`, `wall_openings` | Static walls. Doors and openings are cut out of them. |
| `placements` | Props: `{type, x, y, width, height, rotation?, movable?, blocks_light?, light?, template?, data?}`. `prop_types[type]` gives the defaults for `movable`, `blocks_light` (a big prop that casts a shadow) and `light`. |
| `lights` | Free lamps: `{position, radius, render_radius = 20, ...light}`. A light carried by a prop is that placement's `light`. |
| `triggers` | Exits, rooms, zones: `{x, y, w, h, role, authored_id?, data?}`. |
| `rooms` | `{id: {x, y, w, h} or {rects: [...]}, type: 'indoor' or 'outdoor', label}`. One ghost volume per rectangle, in the shared grid. |
| `doors` | `{x, y, w, h, orientation: 'H' or 'V', type?, hingeSide?, hinge?, rooms?: [a, b]}`. `type` names a door kind (default `plain`; see *Door kinds*). `hingeSide: 'right'` mirrors the kind end to end; `hinge` overrides a hinged leaf's `HINGE` values. `rooms` links the two rooms it joins. |
| `room_links` | Extra links without a door (a wide wall gap): `{rooms: [a, b], openness = 1}`. |
| `cloths` | Hanging strips with a cloth mesh: `{x, y, width, length, segments = 5, role?}`. |
| `spawn: [x, y]` | Returned as `map.spawn`. |
| `regions: {size = 1024, radius = 4096, keep = size}` | Region size, how far round a focus regions are built, and how much further they stay before release. |

### Lights

A light is declared the same way on a lamp, a placement or a catalog type: `{radius | size + round + soft + rotation, position | dx + dy, color, intensity, glow, look, shadows, animation}`. The builder turns each into `declaredLight(light)`, kept on the packet as `data.emission`, with a matching `light_shape`:

| Field | Meaning |
|---|---|
| `shape` | `'point'` (a `radius`) or `'strip'` (a `size: [w, h]` with `round`, `soft` and `rotation`, a rounded rectangle). |
| `position` | Offset from its body's centre. |
| `color`, `intensity`, `glow` | `null` when unset, for the game's look to choose. `intensity` is how much of the dark it lifts, `glow` how strong its colour is: a neon sign has `intensity: 0` and a glow. |
| `look` | The name of a profile the game's look gives the light (a street lamp's pool), or `null`. |
| `shadows` | `'dynamic'` (default): walls and every body that blocks light; `'static'`: walls only; `'none'`: no shadow. |
| `animation` | `{kind: 'steady' \| 'flicker' \| 'pulse' \| 'stutter', ...}`: flicker and pulse at `rate` rad/s, a pulse swinging by `depth`; a stutter (a faulty lamp) holds steady but for `burst` s every `period` s (shifted by `offset`), dropping by `depth`. The older `flicker: rate` is a flicker. |

Door leaves always block light (`blocks_light: true`). A placement blocks light when it or its type sets `blocks_light`; ghosts never do.

Ids are `wall_<i>`, `prop_<i>`, `lamp_<i>`, `door_<i>` (`door_<i>_right` for the second leaf), `<role>_<i>` for cloths, or the entry's own `authored_id`. The same definition always gives the same ids, which saves and region memory rely on.

Without `templates[section]`, each section uses the engine's own types: walls `static`, props `prop` (static), lights and cloths `decoration`, triggers ghost `trigger`, doors kinematic `prop`.

## Rooms

`map.rooms` is the map's room graph (empty when the map has no rooms).

- **Where:** `roomAt(point)` checks the last answer's rectangles, then the shared spatial grid. `contains(id, point)`, `room(id)` and `rooms` give the records `{id, type, label, rects, bounds, flags}`.
- **Links:** `connections(id)` lists `{room, link_id, kind, openness}`. A door's openness follows its leaf from closed (0) to open (1) as it moves; an arch is 1; a `room_links` entry has its fixed value. `openness(a, b)` is the most open direct link.
- **Routes and spill:** `route(a, b, {min_openness})` is the fewest-rooms route through open links, or null; `reachable(a, b)`. `exposure(from, {falloff})` gives every room the best product of openness along any route, for light spill, sound and awareness.
- **Occupancy:** `track(body)` follows any body; `updateState()` re-reads tracked bodies (a body still inside its room costs one rectangle test, no grid query). `roomOf(body)`, `occupants(id)`, and `onRoomChange(fn)` for `{entity, from, to}`. With `keep_in_gaps` (default) a body standing in a doorway stays in its last room.
- **Flags:** `setFlag(id, key, value)` / `getFlag` for per-room game state such as lights off. They save with `map.saveState()`.

## Streaming

One path for every map:

- **Regions:** entries are bucketed by the region their centre falls in. An entry larger than one region (the boundary, a long wall, a big building) stays loaded.
- **Focuses:** `setFocus(focuses, {radius, keep, budget_ms = 3, lead = 1})` takes points `[x, y]` or moving focuses `{position, velocity}`; a moving focus also reaches `lead` seconds ahead. Regions within `radius` of the nearest focus are built, nearest first; regions past `radius + keep` are released, so walking along a border does not thrash. It returns `{loaded, unloaded, pending}`.
- **Budget:** building stops once `budget_ms` is spent, and `pending` regions wait for the next call. The constructor builds round `options.focus` (default: the spawn, else the map's centre) all at once, as a level change does behind its fade. A map that fits inside the radius is therefore whole from the start, built in authored order.
- **Tiers:** `addTier(name, {radius, keep, load(key, bounds), release(key, bounds)})` adds per-region work beside the bodies (ground tiles, baked light, navigation), each tier at its own radius. The bodies are the `entities` tier.
- **Region memory:** a released entity that was moved (a pushed bin, a knocked-over sign) keeps its pose. It is rebuilt there when its region loads again. `saveState()` / `loadState()` carry that memory as plain data, and `loadState` puts an already-built entity back where it was left.
- **Snapshots:** after a physics snapshot is restored, `reconnect()` re-links ids to the restored entities; regions the snapshot held count as loaded, and the rest build as a focus reaches them.

The map system uses the world's one spatial grid and navigation field. It never keeps its own index of bodies; it only remembers which entity it built for each authored id.

## API

| Call | Result |
|---|---|
| `buildMapPackets(definition, {templates, prop_types, decorate, door_kinds})` | `{kind, spawn, entries, openings, door_kinds}`. `openings` lists every door, arches included: `{door_key, index, type, opening, leaf_ids}`. Each entry is `{section, index, source, packet, joints?}`; `joints` are constraint packets the map creates with the entity (a hinged door's hinge). Pure, no world. |
| `new mapSystem(physics)` / `.load(definition, options)` / `.unload()` / `.current` | One active map per world. Loading releases the previous map. |
| `mapInstance.entity(id)` / `.entities(role?)` / `.packets()` | Lookups. |
| `mapInstance.getDoors()` | Every door, arches included, in authored order: `{door_key, index, type, opening, leaves}`. `opening` is `{position, length, across, rotation}` (centre, along, the wall's thickness, and the turn that lays +x along it); `leaves` holds each leaf's live entity, or null while it is unloaded. Each leaf's `data.opening` carries the same opening. Artists draw doors from this. |
| `mapInstance(physics, definition, {…, door_kinds})` | `door_kinds` adds kinds or replaces built-in ones, for both the leaves and the room links. |
| `mapInstance.updateState({near_range, duration, easing, include_groups})` | Opens and closes sliding and plain doors by proximity, with timed kinematic moves, then updates room occupancy. Hinged doors are skipped: they are physical. |
| `HINGE` | Defaults for a hinged leaf: `{mass: 12, damping: 7.7, closing_stiffness: 64.8, swing_limit: π − 0.25}`. A kind's leaf `hinge`, then the door's `hinge` field, override them. |
| `DOOR_KINDS` / `validateDoorKind(kind, name?)` | The built-in kinds / the check every kind passes before it is built. |
| `mapInstance.setFocus(focuses, {radius, keep, budget_ms, lead})` / `.addTier(name, {radius, keep, load, release})` / `.loaded_regions` / `.region_size` | Streaming (see above). `setFocus` returns `{loaded, unloaded, pending}`. |
| `mapInstance.reconnect()` / `.saveState()` / `.loadState(state)` / `.getStatistics()` / `.destroy()` | Lifecycle. |

## Game data

The game's prop catalog and per-map layouts live in the Directory: `src/game/data/game-assets/props.json` and `src/game/data/game-assets/maps/<map_id>.json`, read through `src/game/data/game-maps.mjs`. The apartment builds through this system (`directory/apartment-definition.mjs`). Each map file's `host` field (`native` or `classic`) records which host owns it.

Run `node --test src/engine/basement/maps/tests/*.test.mjs tools/test-map-layouts.mjs`.

## Door kinds

A door is an opening in a wall plus the leaves that fill it. A kind is data that says what those leaves are; the builder has no per-type code. Positions run along the opening from its start (left for `H`, top for `V`) as `[fraction, px]`, meaning fraction × the opening's length + px.

| Leaf field | Meaning |
|---|---|
| `from`, `to` | Where the leaf starts and ends. |
| `motion` | `slide`: a kinematic leaf that `updateState` moves by proximity, by `travel` (`[fraction, px]`, signed along the opening). `hinge`: a rigid leaf on a hinge joint at `pivot` (0 = the leaf's start, 1 its end). Bodies push it open and its return spring swings it shut; `hinge` overrides `HINGE`. |
| `side` | Which side of the door the leaf is on, −1 or 1 (default −1 for the first leaf, 1 after). |
| `suffix` | Required after the first leaf: its id is `<door id>_<suffix>`. The first leaf takes the door's id. |

The built-in kinds:

| Kind | Leaves |
|---|---|
| `plain` | One leaf that slides its own length out of the opening. |
| `sliding` | Two half leaves, 2 px apart at the middle, that slide apart (`door_0` and `door_0_right`). |
| `hinged` | One leaf hinged at its start. |
| `arch` | None. The opening still cuts the wall and links its rooms, always fully open. |

A room link through a door is as open as its most open leaf. The engine's Directory ships `double` and `saloon` kinds as data (`doorKindsOf(registry)` collects a registry's kinds for `door_kinds`).
