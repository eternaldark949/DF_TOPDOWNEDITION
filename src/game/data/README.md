# Game data

Dimensions Freelancer's content, as data the engine reads. Nothing here runs: every file is a Directory
library, registered at boot, and found by its qualified id (`library:local`). See
[READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md), section 2, *The game*.

| Folder | What it holds |
|---|---|
| `maps/` | One library per map, named for it (`apt_949.json` is library `apt_949`). Its `map` resource is the whole map: size, setting, spawn, floors (drawing steps in map space), `wall_look`, walls, rooms, doors, exits (`triggers` with `role: 'transition'` and `data.target`), placements, plus the game's own fields (`label`, `landmarks`, `windows`, `camera_bounds`, `ambient_darkness`, ...). Anything only that map uses (its textures, materials, rugs) sits in the same file. |
| `libraries/` | Libraries any map may use. `surfaces.json`: the plaster every map's walls are drawn in, and surfaces shared by maps: polished stone slabs (`stone_slabs`, recoloured by `stone`, `alt` and `seam`, sized by the pattern's `scale`) with obsidian and champagne flecks laid over them, honed marble (`marble_slabs`, by `tone`), herringbone parquet (`herringbone`, by `base` and `dark`) two-colour tiles (`checker`), and four laid patterns, each recoloured by its values and with a material that lays it: fan-arc cobbles (`cobble_fans`, material `fan_cobbles`), ring cobbles whose circles meet in eyes (`cobble_rings`, `ring_cobbles`), interlocking zigzag pavers (`zigzag_pavers`, `zigzag_paving`) with a red and slate-purple mix of them (`zigzag_pavers_mixed`, `zigzag_paving_mixed`) and a basketweave of them in red and purple squares, every edge a zigzag that locks into its neighbour (`zigzag_weave`, `zigzag_basketweave`) and long-plank herringbone (`plank_herringbone`, `herringbone_floor`, turned 45 degrees). `landmarks.json`: the city's landmarks, each one building entity (`engine:building`) made of components, a layer per storey band, its walls dressed by a `facade` (windows, spandrels, piers, bands) and its roofs as drawing steps. `silver_queen`: the Art Deco apartment block in pale silver stone (the tower, two wings and the glazed pavilion between them, the setback with its roof lawn and pool, the crown with its hexagon skylight, the SILVER QUEEN marquee, cypresses, urns and lantern piers), with `silver_queen_forecourt`, its plaza, steps, lawns and beds, placed with it; its look values recolour it, and `lit` and `lobby_lit` are the share of windows lit. Heights are the classic city's, in world units. `weather.json`: weather as particle systems (`particle_system`, physics moves them, their `look` draws them): `rain`, streaks (18 born a second per 100 x 100, about 10 in the air) falling from 34 to 40 high that take the colour of lights they pass and land in `rain_splash`, small rings that grow and fade. `time.json`: the world's clock (`world_clock`, `city_clock`), after the Python timeSystem and sky in `docs/engine-reference/`: a game minute every five seconds of play, starting at 23:00, its phases (`deep_night`, `dawn`, `morning`, `day`, `dusk`, `evening`, `night`) with how dark each is and its sky and sun colours; maps with `switches.day_night` (`sdc`) lay their night from it. `city.json`: the city's ground, for `sdc` and any street map: lot ground (`lot`), wet asphalt with cracks, oil stains, repairs and a wet sheen (`asphalt`) and its markings (`wheel_path`, `lane_dash`, `centre_line`, `road_edge`, `road_name`, and `paint_wear` laid over them to chip and fade the paint), pavers and kerbs (`pavers`, `pavers_mossy`, `kerb`, `kerb_face`, `kerb_lit`; a kerb is a floor step with a `thickness`), worn crossing stripes (`crossing_tile`, laid across a road by the pattern's `rotation`), lawns (`lawn`, `park_lawn`), block grounds (`loam`, `moss`, bloom clusters scattered over a lawn (`blooms_blood`, `_pink`, `_violet`, `_gold`, `_moon`), `paving_ivory`, `_slate`, `_rose`, `_terracotta`, `meadow_blood`, `_pink`, `_violet`, `_gold`, `_moon`, `hedge`), parks (`gravel`, `gravel_edge`, `park_hedge`, `pool_rim`, `pool_water`), and flat street furniture as objects (`manhole`, `kerb_drain`, `rain_pool`, `puddle_pink`, `puddle_cyan`, `puddle_gold`, `skid_marks`, `oil_stain`), and street lamps (`street_lamp`, `street_lamp_rose`, `street_lamp_violet`: see `sdc` below). Each material names its `surface.footstep`. |
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
- Glowing art (`emits`, lit by the light grid): `moon_city_nightclub` has its dance floor's lit tiles in violet and pink,
  its five spotlight rings and a string of warm and pink bulbs along the bar's front, with `switches.light_grid` on at
  16-unit cells. The other maps' signs, lit windows, the ethereal plane's petals and the city's neon are still to be marked;
  the city's signs and windows come with its buildings.
- `sdc` (Southern Dimensions City) carries its layout as data, exported once from the classic city's seeded generator: `streets`
  (each road's outline, lanes, lane width and `stops`, its centre line with the normal at each point; the junctions), `blocks`
  (blocks, parks, the graveyard), `pavements`, `crosswalks` and the park `pools`. Its floor is drawn from `city.json` the classic
  way: each block's grounds (moss over loam, scattered blooms and flower meadows where the block's noise runs high, running-bond
  courts and a paved apron round each building, rain pools, a kerbside hedge), the parks (hedge border, gravel walk round a moon
  pool, beds, benches, the name at the north gate), roads with their markings and names, junctions, crossings, pavements and a
  raised kerb wherever a pavement meets a road. Its street lamps are `city.json`'s `street_lamp` (amber), `street_lamp_rose`
  and `street_lamp_violet`: the classic's twin hex lanterns on a crossarm over an iron post, each lantern's glass glowing
  (`emits`, so the light grid, the reflections and the night's shines read it) under its ribs and cap, one still point light
  between them for the pool on the pavement, and on each lantern a light too small to light anything that carries its
  `glare` star (the star alone, `fog: 0`). Few layers, as each is a packet a frame: the walled shaft (`cover: false`, too
  thin to hold the night back over its pool), the crossarm (its bar `emits` at the least strength, so the night is cut out
  over it and it reads as iron against its pool), the glass (live at night), and the ribs and caps in a still layer in the
  glass's plane; the colour is the look's `lamp` value, so a new colour is a template that `extends`
  `street_lamp` with its own values. They stand on both pavements of every straight road, 20 out from the kerb every 350 or so,
  clear of the junctions, and off each corner of every square junction, as the classic laid them: violet on both pavements
  of the avenues (West, East, Velvet, Meridian and Skyline Ave) and round their junctions, as the classic's West Ave burns;
  on the other streets amber on the north or west pavement and rose on the other; and the Silver Queen's violet round its
  block (978 placements, written by the street lamp
  generator kept with the project's tools). `switches.light_grid` is on. Its night is a deep violet dark with a violet
  hue grade and the lamps' glare stars. `switches.day_night` lays that night from the world's clock (`time:city_clock`) and `switches.weather` takes the world's weather (`weather:city_weather`: rain at the start, or snow or clear, at an intensity), falling over the camera's view. Its first entrance is the Silver Queen's (`silver_queen_door`, to `apt_949`), on the forecourt's carpet under the marquee, where
  "Silver Queen" lies in violet neon script on the marquee's roof as the classic laid it. Every map with exits shows them as
  the classic's glowing mats with their labels (`markers: {transition: {label: true}}`), pulsing, and a deeper purple while someone stands on one. Its other
  buildings, trees and props are next.
- No classic floor painter, so flat colours for now: `ollo_test`, `ollo_interior`.
- Furniture for every map but the apartment is next. The scene-only maps (`keepers_hill`, `keepers_parlor`,
  `van_interior`) have no walls, as in the classic game.
