# Basement map system

`mapSystem` builds one map into one physics world from plain data. It handles interiors (built whole) and exteriors (streamed by region). It knows no game names: the Directory supplies the data, the entity templates, and a `decorate` hook for game fields.

```js
import { physicsSystem } from '../physics/index.mjs';
import { mapSystem } from './index.mjs';

const physics = new physicsSystem({ asset_library });
const maps = new mapSystem(physics);
const map = maps.load(definition, { templates, prop_types, decorate });
map.entity('door_0');            // live entity by authored id
map.entities('prop');            // live entities by role, in build order
map.updateState({ near_range: door => 90, duration: 0.35 });
map.setFocus(player.position);   // exteriors: build near regions, release far ones
```

## Map definition

Every section is optional. Rectangles are top-left: `{x, y, w, h}` for walls, triggers and doors; `{x, y, width, height}` for placements.

| Field | Meaning |
|---|---|
| `map_id`, `kind` | `kind` is `'interior'` (default) or `'exterior'`. |
| `size: [w, h]`, `boundary: {thickness}` | A ring of four walls just outside the map. |
| `walls`, `wall_openings` | Static walls. Doors and openings are cut out of them. |
| `placements` | Props: `{type, x, y, width, height, rotation?, movable?, light?: {radius, position?}, template?, data?}`. `prop_types[type].movable` is the default for `movable`. |
| `lights` | Free lamps: `{position, radius, render_radius = 20}`. A light carried by a prop is that placement's `light`. |
| `triggers` | Exits, rooms, zones: `{x, y, w, h, role, authored_id?, data?}`. |
| `rooms` | `{id: {x, y, w, h} or {rects: [...]}, type: 'indoor' or 'outdoor', label}`. One ghost volume per rectangle, in the shared grid. |
| `doors` | `{x, y, w, h, orientation: 'H' or 'V', type?, hingeSide?, hinge?, rooms?: [a, b]}`. `type` names a door kind (default `plain`; see *Door kinds*). `hingeSide: 'right'` mirrors the kind end to end; `hinge` overrides a hinged leaf's `HINGE` values. `rooms` links the two rooms it joins. |
| `room_links` | Extra links without a door (a wide wall gap): `{rooms: [a, b], openness = 1}`. |
| `cloths` | Hanging strips with a cloth mesh: `{x, y, width, length, segments = 5, role?}`. |
| `spawn: [x, y]` | Returned as `map.spawn`. |
| `regions: {size = 1024}` | Exterior region size. |

Ids are `wall_<i>`, `prop_<i>`, `lamp_<i>`, `door_<i>` (`door_<i>_right` for the second leaf), `<role>_<i>` for cloths, or the entry's own `authored_id`. The same definition always gives the same ids, which saves and region memory rely on.

Without `templates[section]`, each section uses the engine's own types: walls `static`, props `prop` (static), lights and cloths `decoration`, triggers ghost `trigger`, doors kinematic `prop`.

## Rooms

`map.rooms` is the map's room graph (empty when the map has no rooms).

- **Where:** `roomAt(point)` checks the last answer's rectangles, then the shared spatial grid. `contains(id, point)`, `room(id)` and `rooms` give the records `{id, type, label, rects, bounds, flags}`.
- **Links:** `connections(id)` lists `{room, link_id, kind, openness}`. A door's openness follows its leaf from closed (0) to open (1) as it moves; an arch is 1; a `room_links` entry has its fixed value. `openness(a, b)` is the most open direct link.
- **Routes and spill:** `route(a, b, {min_openness})` is the fewest-rooms route through open links, or null; `reachable(a, b)`. `exposure(from, {falloff})` gives every room the best product of openness along any route, for light spill, sound and awareness.
- **Occupancy:** `track(body)` follows any body; `updateState()` re-reads tracked bodies (a body still inside its room costs one rectangle test, no grid query). `roomOf(body)`, `occupants(id)`, and `onRoomChange(fn)` for `{entity, from, to}`. With `keep_in_gaps` (default) a body standing in a doorway stays in its last room.
- **Flags:** `setFlag(id, key, value)` / `getFlag` for per-room game state such as lights off. They save with `map.saveState()`.

## Interiors and exteriors

- **Interior:** every entity is built at load. After a physics snapshot is restored, `reconnect()` re-links ids to the restored entities.
- **Exterior:** entries are bucketed by the region of their centre. An entry larger than one region (the boundary, a long wall, a big building) stays loaded. `setFocus(point, {radius, keep})` builds regions within `radius` and releases regions beyond `radius + keep`, so walking back and forth across a border does not thrash.
- **Region memory:** a released entity that was moved (a pushed bin, a knocked-over sign) keeps its pose. It is rebuilt there when its region loads again. `saveState()` / `loadState()` carry that memory as plain data.

The map system uses the world's one spatial grid and navigation field. It never keeps its own index of bodies; it only remembers which entity it built for each authored id.

## API

| Call | Result |
|---|---|
| `buildMapPackets(definition, {templates, prop_types, decorate, door_kinds})` | `{kind, spawn, entries, door_kinds}`. Each entry is `{section, index, source, packet, joints?}`; `joints` are constraint packets the map creates with the entity (a hinged door's hinge). Pure, no world. |
| `new mapSystem(physics)` / `.load(definition, options)` / `.unload()` / `.current` | One active map per world. Loading releases the previous map. |
| `mapInstance.entity(id)` / `.entities(role?)` / `.packets()` | Lookups. |
| `mapInstance(physics, definition, {…, door_kinds})` | `door_kinds` adds kinds or replaces built-in ones, for both the leaves and the room links. |
| `mapInstance.updateState({near_range, duration, easing, include_groups})` | Opens and closes sliding and plain doors by proximity, with timed kinematic moves, then updates room occupancy. Hinged doors are skipped: they are physical. |
| `HINGE` | Defaults for a hinged leaf: `{mass: 12, damping: 7.7, closing_stiffness: 64.8, swing_limit: π − 0.25}`. A kind's leaf `hinge`, then the door's `hinge` field, override them. |
| `DOOR_KINDS` / `validateDoorKind(kind, name?)` | The built-in kinds / the check every kind passes before it is built. |
| `mapInstance.setFocus(point, {radius, keep})` | Exterior streaming. Returns `{loaded, unloaded}`. |
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
