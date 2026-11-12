# DF_TOPDOWNEDITION
Repo for the top down edition of my game Dimensions Freelancer

> **Working on the code?** Read [READ-FIRST/ENGINE-ARCHITECTURE.md](READ-FIRST/ENGINE-ARCHITECTURE.md) before anything else. It defines how the engine and the game are structured.

## Play
Download **`DFAB V8.html`** and open it in your browser. That one file is the whole game, and it works offline.

On a phone, the easiest download is the whole repo as a ZIP:
`https://github.com/eternaldark949/DF_TOPDOWNEDITION/archive/refs/heads/main.zip`
Unzip it with your Files app, then open `DFAB V8.html` in Chrome.

## Quick draw
Hold **Holster/Draw** for about half a second with a firearm equipped. Drag the fire stick past its ring and release to draw, fire once, and reholster. Drag back inside the ring to cancel. The button shows recovery time; tap it to return to regular drawn fire. Menus and pause preserve the mode but cancel the armed shot, requiring a fresh aim and release. On desktop, aim with the left mouse button held and release to shoot.

## Controller (gamepad)
Plug in or pair any standard controller (Xbox, PlayStation, most Bluetooth pads), then press a button so the browser notices it.
- **Left stick** move / steer · **Right stick** aim · **RT** fire
- **A** interact · **B** flit · **X** holster/draw · **Y** doors and exits
- **LB** sneak · **RB** booster (hold: on an ally) · **LT** handbrake · **L3** auto-drive
- **Back** map · **D-pad ↑** phone · **D-pad ↓** night vision · **Start** pause
- In menus, dialogue and the title screen: **D-pad / left stick** moves the highlight, **A** selects, **B** goes back, **right stick** scrolls.

## How the project is organised
- `DFAB V8.html` is the **playable game**. It's generated, so don't edit it directly; changes go in `src/`.
- `src/` holds the game's source, split by topic. **[`src/MAP.md`](src/MAP.md)** lists every file and what's in it.
- `assets/images` and `assets/audio` hold **your own images and sounds**. They're baked into the game file automatically (see the README inside each folder).
- `tools/build.mjs` joins `src/` and `assets/` back into `DFAB V8.html`.

The [new gameEngine runtime](src/engine/lobby/runtime/README.md) owns the native physics API, shared clock, level lifecycle and composed systems. Its [browser example](src/game/examples/index.html) runs two Directory-authored levels in one world. The playable boot still uses the original `GameEngine` while shared classes and their callers are converted; importing the new runtime does not start another world.

The [Basement controlSystem API](src/engine/basement/controls/README.md) centralizes keyboard, mouse, gamepad and multi-touch input. The new runtime exposes it as `engine.api.controls`; bindings remain in the Directory.

The [shared rendering/camera API](src/engine/basement/rendering/README.md) separates data-only frames from the Canvas backend. [Its browser example](src/game/examples/rendering.html) demonstrates the new runtime boundary; existing game artwork still needs class conversion.

The [session/player API](src/game/mechanics/README.md) documents the shared session, native player health and abilities, and player input policy now installed by Directory composition. Production health/Flit consumers now use the shared player-vitals component; weapons, interactions, other gameplay policies and the production runtime switch remain under conversion.

## Adding your own images or sounds (works from the phone)
1. On GitHub, open `assets/images` (or `assets/audio`), then choose **Add file → Upload files**.
2. Give the file a simple name, like `portrait_949.png`.
3. Commit. GitHub rebuilds `DFAB V8.html` for you within a minute or two.
4. In code, use it by name: `drawAsset(ctx, 'portrait_949', x, y)` or `playSound('door_bell')`.

## Moving to the new engine
The [migration inventory](docs/migration/README.md) lists every classic script, where it goes on the Basement engine and what is still missing. CI checks that every new classic script gets a row.

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

Run `node tools/test-lamp-projection.cjs` for raised street-lantern projection, indoor fixture fallback, canvas state restoration, and shop roof occlusion checks.

Street trees have projected bark trunks, branches and leaf clusters; palms have separate curved fronds. New city planting checks full canopy clearance against every building section. Run `node tools/test-tree-projection.cjs` for geometry, roof occlusion, canvas restoration and city planting checks.

Tree and street-lamp parts share a height-sorted world pass, so leaves cover bases and lower shafts while higher lanterns remain visible. Run `node tools/test-canopy-lamp-depth.cjs` for ordering, reversed submission and canvas cleanup checks.

The Scrapyard now uses a hand-laid salvage-yard layout with wreck lanes, a sorting yard, and an open-roof workshop. Marked reinforcement gates check walkability, player distance and enemy spacing; its HUD tracks rounds, remaining/inbound hostiles, rewards and the regroup countdown. New rounds wait while you are outside the yard. Run `node tools/test-scrapyard.cjs` for routes, cover, safe spawning, rewards, HUD and map-cache/reset checks.

Photo replies in Messages are tied to individual snapshots, so contacts can respond to every photo while their wording rotates through a small character-specific pool. Run `node tools/test-photo-replies.cjs` for repeated sends, typing completion, saved-history rotation, group speakers, unread counts and story-message deduplication.

Sent photos occupy up to six image slots across Messages. A full limit opens Manage photos instead of removing older images. Images expire after 24 in-game hours or can be downloaded as their stored JPEG and deleted manually; the conversation remains. Run `node tools/test-photo-storage.cjs` for limits, downloads/deletion, expiry, legacy images and save cleanup.
