# Game data

Dimensions Freelancer's content, as data the engine reads. Nothing here runs: every file is a Directory
library, registered at boot, and found by its qualified id (`library:local`). See
[READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md), section 2, *The game*.

| Folder | What it holds |
|---|---|
| `maps/` | One library per map, named for it (`apt_949.json` is library `apt_949`). Its `map` resource is the whole map: size, setting, spawn, floors (drawing steps in map space), `wall_look`, walls, rooms, doors, exits (`triggers` with `role: 'transition'` and `data.target`), placements, plus the game's own fields (`label`, `landmarks`, `windows`, `camera_bounds`, `ambient_darkness`, ...). Anything only that map uses (its textures, materials, rugs) sits in the same file. |
| `libraries/` | Libraries any map may use. `surfaces.json`: the plaster every map's walls are drawn in. |
| `tests/` | `maps.test.mjs`: every classic map has its file, every file validates, every map builds, and the apartment draws. |

## Loading a map

```js
const registry = createEngineRegistry({ libraries: [...shared, ...maps] });
const map = new mapInstance(physics, mapDefinition(registry, 'apt_949:map'), {
    door_kinds: doorKindsOf(registry),
    make_object: (record, at, overrides) => objectPacket(registry, record, at, overrides)
});
```

## Where each map stands

All 21 classic maps are here, generated once from `reference/classic/game-db/places.json`. From now on the files
are the source; edit them, not the classic data.

- `apt_949`: done. Its floor art (teak, travertine, Versailles parquet, harlequin and bath marble, trellis
  carpet) is textures and materials, its rugs are objects, and the bar cart is placed (`examples:bar_cart`, the
  engine's example library, until the game's furniture catalog exists).
- Every other map: its geometry is data (floors as flat colours, walls, rooms, doors, exits, landmarks). Its
  floor art and furniture are next, the same way as the apartment. `sdc` and `ollo_test` keep their city
  fields (`buildings`, `pavements`, `crosswalks`, `floor_areas`) as data until the city's builder is rewritten,
  and maps whose walls were made in classic code (`keepers_hill`, `keepers_parlor`, `van_interior`) have none yet.
