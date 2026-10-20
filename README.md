# DF_TOPDOWNEDITION
Repo for the top down edition of my game Dimensions Freelancer

## Play
Download **`DFAB V8.html`** and open it in your browser. That one file is the whole game, and it works offline.

On a phone, the easiest download is the whole repo as a ZIP:
`https://github.com/eternaldark949/DF_TOPDOWNEDITION/archive/refs/heads/main.zip`
Unzip it with your Files app, then open `DFAB V8.html` in Chrome.

## Quick draw
Hold **Holster/Draw** for about half a second with a firearm equipped. Drag the fire stick past its ring and release to draw, fire once, and reholster. Drag back inside the ring to cancel. The button shows recovery time; tap it to return to regular drawn fire. Menus and pause preserve the mode but cancel the armed shot, requiring a fresh aim and release. On desktop, aim with the left mouse button held and release to shoot.

## How the project is organised
- `DFAB V8.html` is the **playable game**. It's generated, so don't edit it directly; changes go in `src/`.
- `src/` holds the game's source, split by topic. **[`src/MAP.md`](src/MAP.md)** lists every file and what's in it.
- `assets/images` and `assets/audio` hold **your own images and sounds**. They're baked into the game file automatically (see the README inside each folder).
- `tools/build.mjs` joins `src/` and `assets/` back into `DFAB V8.html`.

## Adding your own images or sounds (works from the phone)
1. On GitHub, open `assets/images` (or `assets/audio`), then choose **Add file → Upload files**.
2. Give the file a simple name, like `portrait_949.png`.
3. Commit. GitHub rebuilds `DFAB V8.html` for you within a minute or two.
4. In code, use it by name: `drawAsset(ctx, 'portrait_949', x, y)` or `playSound('door_bell')`.

## Building by hand (optional, needs Node 18+)
```
node tools/build.mjs          # rebuild DFAB V8.html
node tools/build.mjs --check  # just check that it's up to date
```

After building, run `node tools/test-game-regressions.cjs` to check progression and saves, flit controls and landing, autodrive, profiling, rendering limits, and load/update/draw across all maps. The runner needs no dependencies; it executes the game with mocked browser services, so browser visuals and device frame rate still need playtesting.

Run `node tools/test-traffic-crossings.cjs` for spatial traffic-sensing equivalence, candidate counts, and crossing queue spacing, overflow, clearance, and timeout checks.

## Whole-game performance report
In a running game, open **Settings → Developer → Whole-Game Bench**. Play normally through a busy scene for the 3-second warmup and 30-second capture. The report includes frame pacing, simulation and render timings, catch-up/dropped time, populations, and settings/device context. Detailed capture is now the default: it reuses Full profiler timings for entities, people (hair, cloth, shading, held items and crowd baking), buildings and world tops while the profiler panel and canvas-call counter stay off. Text and JSON identify the capture mode and its added timing overhead. Simulation context records the configured game speed and nominal tick rate. Use **Save text** or **Save JSON** to share or download it. Compare matching scenes and settings; synchronous Canvas timings do not measure GPU completion.

Run `node tools/test-performance-bench.cjs` for timing, frame-limit, warmup, interruption, cancellation, and profiler-restoration checks.

For a summary-only comparison from the console, use `PerformanceBench.run({ detailed: false })`. Compare runs with the same capture mode, scene and settings; detailed profiling is diagnostic and may lower measured FPS.

The [traffic and sign investigation](docs/performance-investigation/README.md) documents the repeated static-query cache, map-entry sign preparation, and new `Traffic:` / `Signs:` detail rows. Run `node tools/test-performance-investigation.cjs` for cache equivalence/invalidation, warmup, and timing-hook restoration checks.

For repeatable local CPU investigations, see the [controlled character and particle results](docs/performance-investigation/README.md#controlled-character-cpu-investigation-october-19). `tools/bench-character-cpu.py` compares saved before/after builds with seeded scenes, live main-canvas physics, warmed alternating runs, pixel/state equivalence, and optional CPU profiles. It requires Python Playwright and Chromium. Run `node tools/test-character-rendering.cjs` and `node tools/test-particle-rendering.cjs` for the focused rendering checks.

The [saved-game lighting investigation](docs/performance-investigation/lighting-local.md) records the cache/texture experiments and the private-save benchmarks (`tools/bench-lighting-save.py`). The retained immutable cache reuses the exact static lighting base when the camera and inputs settle; dynamic effects remain live. Run `node tools/test-lighting-base.cjs` for invalidation, memory ownership and fallback checks.
