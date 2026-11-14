# Map bench (phase 0 of the map plan)

`tools/bench-maps.mjs` loads the game in headless Chromium, sets up five scenes at 22:00 and runs the game's
own Whole-Game Bench (`PerformanceBench`) over each: 3 s of warmup, then 8 s measured, at 1280×720.

| Scene | What it holds |
|---|---|
| `cafe-night` | The cozy cafe (classic level), standing amid its props |
| `apartment-night` | Apartment 949 (the native level), standing amid its props |
| `apartment-door` | Apartment 949, the door with the most lamps near it (8) swinging fully open and shut every two seconds |
| `city-night` | The city street at the spawn, standing |
| `city-drive` | Her car on auto-drive to the clinic, set down on the nearest lane that routes there |

Each scene also runs a fixed calibration workload (arithmetic and canvas fills) in the same page. The check
compares **relative** costs (scene milliseconds per calibration millisecond), so a slower or faster machine
moves both together.

```
node tools/bench-maps.mjs              # run and print the full report
node tools/bench-maps.mjs --record     # write tools/bench-maps-baseline.json
node tools/bench-maps.mjs --check      # fail when a scene runs over 1.6× its baseline (CI runs this)
  --scene <id>  --duration <ms>  --warmup <ms>
```

The check holds the whole frame's CPU and the light layer (`Render:Lighting`) for every scene, except the
drive's light layer: that costs 10 or 25 ms a frame depending on whether the cached light rebuilds inside the
window, so it is recorded but not held. Record a new baseline only when a change is meant to move the numbers,
and say so in the commit.

## The baseline (November 13, headless Chromium, software canvas)

These are software-rendered, so the absolute times are far above a real GPU's; read them against each other.

| Scene | Frame CPU (mean / p95) | Light layer | FPS | Biggest sections |
|---|---|---|---|---|
| cafe-night | 27.0 / 31.2 ms | 7.3 ms | 28.6 | PostFX 15.2, Lighting 7.3, Entities 3.6 |
| apartment-night | 55.7 / 72.2 ms | 40.8 ms | 14.7 | Lighting 40.8 |
| apartment-door | 56.7 / 69.7 ms | 40.3 ms | 15.2 | Lighting 40.3 |
| city-night | 93.3 / 112.9 ms | 35.0 ms | 9.5 | Lighting 35.0 (Glow: tiered lights 29.2) |
| city-drive | 114.6 / 138.2 ms | 9.5 ms | 7.7 | PostFX 49.4, Buildings 20.8, Entities 19.1 |

What it says:

- **The native apartment spends about three quarters of its frame on the light layer** (40 of 49 ms drawn),
  over five times the cafe's. Its scene draw is cheap; the cost is the light layer, which `sceneLighting.createLayer`
  builds every frame from each room and lamp.
- **The swinging door costs almost nothing more** than the still apartment today (56.7 against 55.7 ms),
  because the light layer costs the same whether the door moves or not.
- **The city's light is mostly glow**: tiered lights take 29 of its 35 ms.
- **Driving is bound by post-processing and buildings**, not light: the light cache holds between rebuilds.

## November 13, later: the native layer at the player's resolution

The native light layer drew at full resolution whatever the settings, while the classic layer draws at
Lighting Quality × ½ for soft shadows (half resolution by default). Both now read `game.lightLayerScale()`
(src/legacy/engine/lighting.js). Re-recorded baseline:

| Scene | Frame CPU | Light layer |
|---|---|---|
| cafe-night | 29.2 ms | 7.8 ms |
| apartment-night | 25.3 ms (was 55.7) | 13.7 ms (was 40.8) |
| apartment-door | 28.1 ms (was 56.7) | 14.2 ms (was 40.3) |
| city-night | 89.2 ms | 33.8 ms |
| city-drive | 109.7 ms | 9.5 ms |

Of the native layer's cost, building its packets is about 1 ms; the rest is drawing them.

## November 14: still lights kept between frames

The engine's light layer can now be split (`createLightLayerParts`): lamps and steady lights are painted
once into two pictures over the map (the dark with their cuts, and their colour) and stamped each frame;
only flickering lights and the rooms' areas are drawn live. The pictures repaint when a still light changes
(a room switched, a lamp moved). A Chromium pixel test holds the split layer to the whole one within 3 per
channel. Re-recorded (this machine ran about 15% slower than the day before: compare `relative`):

| Scene | Frame CPU | Light layer |
|---|---|---|
| apartment-night | 16.0 ms (was 25.3) | 3.2 ms (was 13.7) |
| apartment-door | 14.6 ms (was 28.1) | 2.0 ms (was 14.2) |

## November 14, later: doors block lamplight (phase 2)

Door leaves now block light, so a lamp near a swinging door recasts its shadow every frame the leaf
moves (about 0.6 ms a lamp in the apartment) and is drawn live until the leaf has rested 0.3 s. The
door scene keeps its door always swinging past eight lamps, so its light layer went from 2.0 to about
12 ms; its baseline was re-recorded for that scene alone. The still apartment is unchanged within noise.
Phase 3 (the one-sweep shadow cast and per-frame budgets) is where this cost comes back down.

| Scene | Frame CPU | Light layer |
|---|---|---|
| apartment-door | 26.8 ms (was 14.6) | 12.0 ms (was 2.0) |

## November 14, later still: the fast path (phase 3)

- **One sweep.** The shadow cast keeps only the edges facing the light within its reach, joins edges end to
  end on a line, and sweeps once round the light: 0.61 to 0.16 ms an apartment lamp, the same shape.
- **Change counters.** Light blockers count up per-cell counters when they move, change or go; a light keeps
  the revision under its reach and recasts only when it moves on. Walls built or removed now recast too.
- **Tiles.** Still light is baked into 1024 px tiles (the region size), only those in view stamped and those
  within 512 px painted ahead of the camera; a change repaints only the tiles its light reaches.
- **Budgets.** Shadow rebuilds share 1 ms a frame, nearest the view first. Lights out of view are skipped.

Two new scenes measure the native light layer alone, built from the map definition and drawn as the native
host draws it: `light-cafe` (the cafe at night) and `light-street` (a 6000 px street, 72 lamps, 12 vending
machines, 8 doors always sliding, the camera panning). They hold the light layer only.

| Scene | Light layer | Shadows | Lights live |
|---|---|---|---|
| light-cafe | 1.9 ms (classic cafe: 9.5) | 0 | 1 of 16 (the vending machine's pulse) |
| light-street | 8.0 ms | 0.7 ms | 12 of 86 |
| apartment-door | 9.8 ms (was 12.0) | | |

The street without its doors moving costs 4.3 ms panning and 2.4 ms standing. What is left is drawing the
live lights on Chromium's software canvas (about 0.4 ms each for a 320 px lamp): every lamp beside a moving
door is live. The apartment-door and light scenes' baselines were recorded with this change.

## November 14, evening: a moving shadow keeps its colour baked

Profiling the street showed the live lamps are bound by filled pixels, and that a lamp's colour (an added
radial glow, which no shadow clips) was more than half of each. A lamp whose shadow is moving now cuts live
while its colour stays in the baked tiles. Drawing the live lights at a lower resolution was tried and
dropped: the extra surfaces cost more than the pixels they saved.

| Scene | Light layer |
|---|---|
| apartment-door | 5.9 ms (was 9.8) |
| light-street | 7.6 ms (was 8.0) |
| light-cafe | 2.0 ms |

## Phase 4, step 2: the city at night through the native light layer

The classic city is exported once from its seeded generator to `src/game/data/game-assets/generated/sdc-city.json`
(`node tools/export-city.mjs`, `--check` to compare). `src/game/levels/city-definition.mjs` makes it a map
definition: 677 building and yard walls, 1843 lamps, 10 doors as exits, streamed in 1024 px regions 3072 px
round the camera. Two scenes light it as one outdoor room at the classic sky's 22:00 darkness:
`light-city` (standing on Crimson Blvd) and `light-city-drive` (the camera along it at 500 px/s).

| Scene | Light layer |
|---|---|
| light-city | 2.4 ms (the classic city-night light layer: about 40 ms) |
| light-city-drive | 4.4 ms (p95 6.0) |
| light-cafe | 1.9 ms |
| light-street | 7.1 ms (was 7.6) |

What made the difference, all in the shared code:

- **Signatures without text.** A tile's key hashed every still light as a string each frame. Each light is
  now hashed once a frame as numbers, and a tile mixes its lights' digests: the layer's own work fell from
  1.1 to 0.5 ms.
- **The outdoor sky baked.** An area's thinning of the dark (the sky over an outdoor room) is drawn into the
  dark tiles it covers instead of over the view every frame.
- **Tiles painted once, whole.** A tile ahead of the camera waits until every light reaching it has its
  shadow, and a light reaching a tile in view casts at once. Bodies stream in past the light layer's reach,
  so a wall arriving never recasts a painted tile. Driving went from 49 to 8 tile paints per 2000 px.
- **Number keys for change counters.** The light revision a lamp checks each frame reads cells by number.

Driving still costs 2 ms more than standing: that is the tiles ahead being painted, about 40 lamp gradients
each, on Chromium's software canvas, close to one tile pair per 1000 px.

## Phase 4, step 3: the city's ground drawn natively

The export now carries the streets as the traffic network lays them out (each road's outline and its centre
line as stops with their offset across, the junctions, angled crossings' frames). `src/game/presentation/city-ground.mjs`
draws the ground from it, with the classic look in `src/game/data/city-ground.json`: the lots and their grain, floor
zones and lawns, roads (wheel paths, lane dashes, the centre line, edges, names), junctions with manholes,
pavements with kerbs and drains, and worn crossings. It is painted once per 512 px tile through a pictureCache,
the tiles in view stamped and those 256 px ahead readied, as the classic ground baker did. Lot grounds round
the buildings and the parks come with the buildings in step 5.

Two scenes draw the ground at full size with the light layer over it through drawLayer's half-size surface,
as a native host would: `city-native` (standing) and `city-native-drive` (500 px/s). They hold `cpu`, the two
together.

| Scene | Ground + light | Ground | Light | Tiles painted a second | Baked tiles in use |
|---|---|---|---|---|---|
| city-native | 7.0 ms | 1.5 ms | 5.5 ms | 0 | light 18 MB, ground 20 MB |
| city-native-drive | 13.2 ms (p95 22) | 5.7 ms | 7.5 ms | light 2.3, ground 4 | light 24 MB, ground 20 MB |
| classic city-night | 108 ms frame | | 40 ms | | |

On this software canvas the light layer costs about 3 ms more over a full-size canvas than over a half-size
one: drawLayer scales its half-size surface up over the whole view. Driving, a ground tile takes tens of
milliseconds to paint here. The baked tiles in use come to about 44 MB, over the 32 MB target; the light
layer's tiles ahead (512 px, snapped out to whole 1024 px tiles) are most of its share.

## Readying only what the camera heads for

Tiles were readied the same distance all round the view, so a camera standing still or driving east kept
tiles on every side. `aheadOf({margin, velocity, lead})` (rendering) now gives per-side margins: 128 px all
round, and a second of the camera's motion on the side it moves toward. The light layer and the ground take
it as `ahead`; the looks' `tile_ahead` is that margin.

| Scene | Ground + light | Ground | Light | Baked tiles in use |
|---|---|---|---|---|
| city-native | 6.3 ms (was 7.0) | 1.4 ms | 4.9 ms | 20 MB (was 38) |
| city-native-drive | 11.8 ms, p95 16.5 (was 13.2, p95 22) | 5.1 ms | 6.7 ms | 27 MB (was 44) |
| light-city-drive | | | 3.9 ms (was 4.4) | 12 MB (was 24) |

The baked tiles in use are now within the 32 MB target.

