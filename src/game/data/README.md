# Game data

Dimensions Freelancer's content, as data the engine reads. Nothing here runs: every file is a Directory
library, registered at boot, and found by its qualified id (`library:local`). See
[READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md), section 2, *The game*.

| Folder | What it holds |
|---|---|
| `maps/` | One library per map, named for it (`apt_949.json` is library `apt_949`). Its `map` resource is the whole map: size, setting, spawn, floors (drawing steps in map space), `wall_look`, walls, rooms, doors, exits (`triggers` with `role: 'transition'` and `data.target`), placements, plus the game's own fields (`label`, `landmarks`, `windows`, `camera_bounds`, `ambient_darkness`, ...). Anything only that map uses (its textures, materials, rugs) sits in the same file. |
| `libraries/` | Libraries any map may use. `surfaces.json`: the plaster every map's walls are drawn in, and surfaces shared by maps: polished stone slabs (`stone_slabs`, recoloured by `stone`, `alt` and `seam`, sized by the pattern's `scale`) with obsidian and champagne flecks laid over them, honed marble (`marble_slabs`, by `tone`), herringbone parquet (`herringbone`, by `base` and `dark`) two-colour tiles (`checker`), and four laid patterns, each recoloured by its values and with a material that lays it: fan-arc cobbles (`cobble_fans`, material `fan_cobbles`), ring cobbles whose circles meet in eyes (`cobble_rings`, `ring_cobbles`), interlocking zigzag pavers (`zigzag_pavers`, `zigzag_paving`) with a red and slate-purple mix of them (`zigzag_pavers_mixed`, `zigzag_paving_mixed`) and a basketweave of them in red and purple squares (`zigzag_weave`, `zigzag_basketweave`) and long-plank herringbone (`plank_herringbone`, `herringbone_floor`, turned 45 degrees). `city.json`: the city's ground, for `sdc` and any street map: lot ground (`lot`), wet asphalt with cracks, oil stains, repairs and a wet sheen (`asphalt`) and its markings (`wheel_path`, `lane_dash`, `centre_line`, `road_edge`, `road_name`, and `paint_wear` laid over them to chip and fade the paint), pavers and kerbs (`pavers`, `pavers_mossy`, `kerb`, `kerb_face`, `kerb_lit`; a kerb is a floor step with a `thickness`), worn crossing stripes (`crossing_tile`, laid across a road by the pattern's `rotation`), lawns (`lawn`, `park_lawn`), block grounds (`loam`, `moss`, `paving_ivory`, `_slate`, `_rose`, `_terracotta`, `meadow_blood`, `_pink`, `_violet`, `_gold`, `_moon`, `hedge`), parks (`gravel`, `gravel_edge`, `park_hedge`, `pool_rim`, `pool_water`), and flat street furniture as objects (`manhole`, `kerb_drain`, `rain_pool`, `puddle_pink`, `puddle_cyan`, `puddle_gold`, `skid_marks`, `oil_stain`). Each material names its `surface.footstep`. |
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

- Floor art done, as textures, materials, floor steps (grouped, so a room's inlays are one entity) and rug objects:
  `apt_949`, `hotel_suite`, `hotel_lobby`, `church_boss`, `medbay_sw`, `moon_city_nightclub`, `cozy_cafe_interior`,
  `house_of_death`, `enni_cole_interior`, `enni_cole_upper`, `demoness_palace`, `neural_sys_interior`, `auto_shop`,
  `biggs_arena`, `keepers_hill`, `keepers_parlor`, `van_interior`. `ethereal_plane` had no classic floor art and has a new
  one: pearl and blush, mist, a bloom of translucent petals, drifting petals and sparkle, pearl walls. The apartment's bar cart is placed
  (`examples:bar_cart`, the engine's example library, until the game's furniture catalog exists). What moves (the
  hill's clouds and flowers, the road under the van, glows) is not floor art and is still to be built.
- No classic floor painter, so flat colours for now: `sdc`, `ollo_test`, `ollo_interior`. `sdc` and
  `ollo_test` keep their city fields (`buildings`, `pavements`, `crosswalks`, `floor_areas`) as data until the city's
  builder is rewritten.
- Furniture for every map but the apartment is next. The scene-only maps (`keepers_hill`, `keepers_parlor`,
  `van_interior`) have no walls, as in the classic game.
