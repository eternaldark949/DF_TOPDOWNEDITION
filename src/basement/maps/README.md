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
map.updateDoors({ near_range: door => 90, duration: 0.35 });
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
| `doors` | `{x, y, w, h, orientation: 'H' or 'V', type: 'sliding', 'hinged' or 'plain'}`. A sliding door is two leaves (`door` and `door_panel`). |
| `cloths` | Hanging strips with a cloth mesh: `{x, y, width, length, segments = 5, role?}`. |
| `spawn: [x, y]` | Returned as `map.spawn`. |
| `regions: {size = 1024}` | Exterior region size. |

Ids are `wall_<i>`, `prop_<i>`, `lamp_<i>`, `door_<i>` (`door_<i>_right` for the second leaf), `<role>_<i>` for cloths, or the entry's own `authored_id`. The same definition always gives the same ids, which saves and region memory rely on.

Without `templates[section]`, each section uses the engine's own types: walls `static`, props `prop` (static), lights and cloths `decoration`, triggers ghost `trigger`, doors kinematic `prop`.

## Interiors and exteriors

- **Interior:** every entity is built at load. After a physics snapshot is restored, `reconnect()` re-links ids to the restored entities.
- **Exterior:** entries are bucketed by the region of their centre. An entry larger than one region (the boundary, a long wall, a big building) stays loaded. `setFocus(point, {radius, keep})` builds regions within `radius` and releases regions beyond `radius + keep`, so walking back and forth across a border does not thrash.
- **Region memory:** a released entity that was moved (a pushed bin, a knocked-over sign) keeps its pose. It is rebuilt there when its region loads again. `saveState()` / `loadState()` carry that memory as plain data.

The map system uses the world's one spatial grid and navigation field. It never keeps its own index of bodies; it only remembers which entity it built for each authored id.

## API

| Call | Result |
|---|---|
| `buildMapPackets(definition, {templates, prop_types, decorate})` | `{kind, spawn, entries}`. Each entry is `{section, index, source, packet}`. Pure, no world. |
| `new mapSystem(physics)` / `.load(definition, options)` / `.unload()` / `.current` | One active map per world. Loading releases the previous map. |
| `mapInstance.entity(id)` / `.entities(role?)` / `.packets()` | Lookups. |
| `mapInstance.updateDoors({near_range, duration, easing, include_groups})` | Opens and closes doors by proximity, with timed kinematic moves. |
| `mapInstance.setFocus(point, {radius, keep})` | Exterior streaming. Returns `{loaded, unloaded}`. |
| `mapInstance.reconnect()` / `.saveState()` / `.loadState(state)` / `.getStatistics()` / `.destroy()` | Lifecycle. |

## Game data

The game's prop catalog and per-map layouts live in the Directory: `src/directory/game-assets/props.json` and `src/directory/game-assets/maps/<map_id>.json`, read through `src/directory/game-maps.mjs`. The apartment builds through this system (`directory/apartment-definition.mjs`). Each map file's `host` field (`native` or `classic`) records which host owns it.

Run `node --test src/basement/maps/tests/*.test.mjs tools/test-map-layouts.mjs`.
