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
