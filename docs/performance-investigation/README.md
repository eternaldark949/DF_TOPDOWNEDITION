# Traffic and sign investigation

The October 18 detailed phone report identifies expensive traffic simulation, world tops, and character rendering. It does not establish that character physics or every remaining full-list scan is the main problem.

## What the probes found

A deterministic, 1,000-tick hub run used the game's actual simulation with mocked browser drawing services. The scene ended with 28 traffic vehicles, 77 street pedestrians, and 66 junctions. These are CPU investigation probes, not A53 frame-rate measurements.

- Wall-contact checks repeatedly request static broadphase candidates. An additional probe showed that the first static query of each tick, including geometry verification, was the dominant part of static-query time. Junction recollection was comparatively cheap in this scene.
- Before caching, the two tracked static grids materialized candidate lists 49,958 times. With bounded cell-range caching, they materialized lists 128 times for the same 49,958 query calls. Every narrow-phase and exact ray/rectangle predicate still runs normally. This reduces repeated work; geometry validation remains, and the call reduction is not an equivalent FPS improvement.
- Complete car positions, velocities, headings, lane/junction assignments, pedestrian positions/routes/states, and junction queue/occupancy/signal states matched the baseline after 1,000 ticks.
- A Chromium sign probe found ordinary attached signs already using their sprite cache once fonts were ready. The cold sprite-generation path and shopfront drawing had first-use spikes; street neon and landmark signs still have live drawing paths. Those observations do not prove the cause of every phone sign spike.
- Low crowd quality uses an eight-frame baked walk, simplified shading, and resting hair/cloth. High quality remains live. No crowd density or rendering-quality defaults were changed.

## Changes

Static collision candidates are cached by grid-cell range. Cached lists retain source slots, duplicates, and order. Geometry verification still occurs once per simulation tick; changes, length changes, and explicit invalidation discard cached ranges. Unknown arrays and unusual ranges keep their existing fallback behavior. Each source is limited to 256 ranges and 16,384 cached references; large candidate lists are not cached.

During an existing map-entry fade, visible ordinary sign sprites are prepared one job at a time. Font readiness checks remain in place. Glyph/glow baking has a separate method so the report can distinguish cold baking from warm sign drawing. First loads without a fade and signs newly encountered later still use ordinary lazy generation. No sign art, flicker, color, shadow layers, or camera projection was changed.

Detailed profiling now adds exclusive `Traffic:` substages for driving decisions, physics integration, static broadphase, geometry validation, wall contacts, sensing, lane decisions, junctions, and signals. Vehicle-contact timing belongs to the collision pass. `Signs:` substages separate street neon, shopfronts, ordinary signs/awnings, landmark signs, and cold sprite baking. These remain children of the existing report totals; do not add parents and children. The added hooks restore completely when detailed profiling stops.

## Report interpretation

Use local controlled comparisons to test suspected costs. Whole-Game Bench captures from real devices complement those tests; compare matching routes, settings and capture modes, since detailed timers add overhead. The new traffic rows distinguish collision-grid lookup from static-geometry verification and decisions; the sign rows distinguish cold generation from recurring paint. Font readiness is included in the context.

Run `node tools/build.mjs --check`, `node tools/test-game-regressions.cjs`, `node tools/test-performance-bench.cjs`, `node tools/test-traffic-crossings.cjs`, and `node tools/test-performance-investigation.cjs` for automated checks. Real device cadence still requires playtesting.

## Traffic decision pass (October 19)

The next phone capture showed driving decisions and manager work mattering much more than static geometry validation. This pass keeps the 30 simulation ticks per second, catch-up limit, reaction cadence, density settings, collision passes, and crossing rules unchanged.

- Queue sensing constructs its route samples only when a vehicle passes its existing distance rejection. Each car reuses its route and polyline arrays; samples are rebuilt from its current pose and route whenever needed.
- Lane-change clearance retains its fleet scan and exact 700-pixel distance test. A grid-query variant was removed after the desktop comparison showed that its cell traversal/sorting overhead could outweigh scanning a short fleet. The independently tracked player car is checked in the original position after the traffic source, without copying that source.
- Turn planning shares the distance result for consecutive choices with identical start coordinates. Different starts and geometry edits are read on every planning call.
- Driving decisions reuse their already computed heading sine/cosine. Manager perception updates use the reverse loop's original grid slot, removing the per-tick identity-map build. Both live-source removals and parked-car snapshots retain their earlier semantics.

Against a snapshot immediately before this pass, a deterministic 1,000-tick simulation produced identical final car positions, velocities, headings, lane/junction references and waiting flags, pedestrian positions/routes/states, and junction queue/occupancy/signal states. Chromium's controlled scene was pixel-identical, and the whole-game report still completed and downloaded text/JSON with profiling hooks restored. These checks establish behavior, not phone FPS. Desktop timing remains separate from A53 measurements; compare another phone capture on the same route and settings, preferably without a concurrent call.

The final desktop sample (three fresh pages per build, 1,000 warmup ticks followed by 1,000 measured ticks) measured median traffic-manager CPU submission of 698.9 ms before and 637.4 ms after, about 8.8% lower. Total simulation time was 1,195.9 vs 1,095.0 ms. This is a small synchronous desktop sample without rendering or A53 CPU emulation; earlier timings varied and the result is not a phone FPS prediction. Raw results and limitations are in `traffic-efficiency-desktop.json`.

Additional boundary/removal checks: `node tools/test-traffic-efficiency.cjs`.

## Character rendering pass (October 19)

The 02:02 phone capture kept the simulation close to its configured 30 ticks/s, but drew about 21 bodies per frame. People cost 12.24 ms/frame, with 7.57 ms in the broad body-and-limbs remainder. This pass investigated appearance reuse without reducing crowd quality or freezing animation.

Torso, head, hands and feet already have vector-outline caches. A retained-limb prototype was rejected: allocating fresh native paths for moving limbs could cost more than immediate drawing, and even stationary characters change their joints through breathing and weight shifts. No limb-cache code remains in the game.

Static garment details now share `Path2D` outlines by canonical body proportions: suit openings, racerbacks, crop details, hoodie drawstrings, jacket lapels/inner shirts, vest openings/ties, scrub necklines and clothing bust shapes. Colors, wetness, transforms, transparency and lighting stay live. Separate overlapping fills remain separate. No bitmap buffers, frame-quantized animation, or changes to crowd-quality defaults were introduced. The cache follows the existing read-only canonical-body geometry contract.

The measured gain is modest. A warm 24-character scene used 6,503 Canvas context method calls instead of 6,566 (about 1% fewer), excluding property assignments. In alternating desktop tests, the isolated garment pass measured a median 686.2 vs 710.3 ms for 1,500 frames of 24 garments. Full-character rendering measured 1,010.1 vs 991.8 ms for 600 frames of 24 bodies, with substantial variation across intervals: an overall CPU improvement has **not** been established. Raw results and limitations are in `character-rendering-desktop.json`; none of these figures predicts A53 FPS.

Chromium comparisons were pixel-identical for the city and six character sheets (high/medium/low quality, day/night), covering 48 combinations of builds, outfits, poses, androids, held items, facing and transparency. Automated checks verify shared geometry, live colors, separate fills, build-specific geometry, unchanged transforms/alpha, and zero additional paths or raster sprites after warmup.

Detailed reports now split `People: Body shapes` and `People: Clothing` out of the old body-and-limbs remainder. Clothing covers wardrobe drawing methods; body shapes covers limb outlines, hands, feet, shoulder caps, and cached torso/hip/head lookups. Nested hair, cloth, shade and body-shape work remains exclusive. The new hooks are removed entirely outside detailed profiling. The extra timers change diagnostic overhead, so use summary captures for before/after throughput and detailed captures to locate remaining costs.

Additional checks: `node tools/test-character-rendering.cjs`.

## Controlled character CPU investigation (October 19)

The next investigation runs locally rather than depending on another phone capture. `tools/bench-character-cpu.py` serves two standalone builds on localhost, uses fixed random seeds and game-time inputs, alternates warmed baseline/candidate runs, and checks complete hair/cloth/animation state hashes. It asserts that drawing uses the actual main world canvas, detailed timing hooks are disabled, and live hair/cloth owners exist. Font loading finishes before timing. Optional image exports and V8 CPU profiles run outside the measured intervals.

This corrects a limitation of the earlier character microbench: its preview canvas validated garment artwork and call counts but bypassed live hair/cloth physics. Those older timings cannot establish physics performance. The new fixtures cover moving and idle crowds, daylight, hair/cloth-heavy outfits, low-frame-rate catch-up, isolated solver work, and complete city updates/drawing. City graphics settings are read back and explicitly match the phone report, including bloom/reflections off; the city camera sits at a sidewalk junction where pedestrians are actually visible. A fixed invulnerability timer keeps the stationary test player alive; simulation-stop checks prevent paused/dead frames becoming false speedups.

Two production changes survived local measurement:

- Hair/cloth frame transforms now copy the exact six native `DOMMatrix` coordinate values once into a shared plain numeric object. Per-point loops and local/world conversions avoid repeatedly invoking native coordinate getters. Matrix multiplication, numerical evaluation order, solver topology and time steps stay unchanged.
- Limb shading skips geometry work when no shade/gloss will be painted. When needed, it reuses the length and angle already computed for the limb outline. The raw zero distance remains distinct from the outline's collapsed-joint fallback, preserving end-on shading.

Four paired 400-frame samples per character fixture measured these median synchronous CPU/submission times. All use 24 characters; solver-only rows exclude body painting.

| Fixture | Before | After | Change |
| --- | ---: | ---: | ---: |
| Mixed moving crowd | 796.80 ms | 713.45 ms | 10.5% lower |
| Idle crowd | 813.05 ms | 816.80 ms | effectively flat |
| Daytime crowd | 1,019.95 ms | 969.40 ms | 5.0% lower |
| Hair/cloth-heavy crowd | 1,379.25 ms | 1,291.10 ms | 6.4% lower |
| Heavy crowd at catch-up cadence | 1,674.90 ms | 1,577.25 ms | 5.8% lower |
| Hair/cloth solvers only | 221.55 ms | 154.50 ms | 30.3% lower |
| Solvers at catch-up cadence | 377.00 ms | 296.45 ms | 21.4% lower |

Full-city results are smaller. Three paired 180-frame samples at night measured 3,990.30 vs 3,960.90 ms (0.74%, within ordinary variation); daylight measured 5,392.10 vs 5,109.00 ms (5.25%). Each city scene ended with 100 street pedestrians and 60 cars and averaged about 12.25 drawn bodies over its warmup/measurement history. These small desktop samples do not establish phone FPS gains. Remaining local city samples spend substantial time inside native Canvas painting and state operations; the broad body/limb remainder is not all pose arithmetic or cacheable artwork.

Every compared animation/physics hash matched exactly, including car state in city fixtures. Live-canvas output matched pixel-for-pixel across all seven character/solver fixtures and both city fixtures. The pose/outfit/quality atlases and report exports also passed again. Same-game-time repeat draws ran zero additional physics slices in every fixture, so no scheduling reduction was warranted. Both solver catch-up caps remain 12.

The raw results, sample variation, settings, source-build hashes, CPU sample summaries and limitations are recorded in `character-cpu-local.json`. The new tests verify that point conversions do not perform additional native coordinate reads, duplicate limb trigonometry is removed, and collapsed joints retain their original shade length.

To repeat locally (requires Python Playwright and Chromium; `--chromium` selects another executable):

```sh
# Save the generated build before editing, then rebuild the candidate.
cp 'DFAB V8.html' /tmp/DF-before.html
node tools/build.mjs
python tools/bench-character-cpu.py --baseline /tmp/DF-before.html --candidate 'DFAB V8.html' --output /tmp/DF-character-cpu.json --scenarios mixed,idle,day,hair-heavy,catch-up,physics,physics-catch-up,city,city-day --runs 4 --frames 400 --images --profile
```

Use an otherwise idle environment for timing comparisons. Sampling, image export, state hashing and functional regression suites are separate from the timing intervals. Tests run concurrently for correctness are excluded from performance conclusions.


## Particle Canvas state investigation (October 19)

Full-city CPU samples identified `WeatherSystem.draw` as a frequent ancestor of native Canvas `restore` calls. Ordinary circular particles and sparks previously saved and restored the entire Canvas state individually. They now preserve their few changed style properties once per pass. Translated/rotated/blurred ghosts retain full save/restore. Every particle begins with its inherited opacity and relevant inherited color, preserving Canvas's ignored-invalid-assignment behavior, draw order and compositing. The existing final `globalAlpha = 1` remains unchanged.

Against the build containing only the two character math changes, three paired 180-frame samples of 240 mixed particles measured 47.4 vs 26.7 ms (43.7% lower synchronous submission time). A shadow/filter/clip/compositing fixture measured 247.3 vs 180.4 ms (27.1% lower). Both included invalid CSS colors and matched pixels and final Canvas state exactly. These are isolated particle-pass results, not whole-frame or phone FPS gains.

The same comparison's initial city samples were mixed: median night time was 9.7% lower and daylight 1.8% higher, with substantial variation between paired runs. Whole-city conclusions require the longer complete-change comparison recorded separately in the JSON. No quality, particle counts, crowd counts, simulation frequency, physics caps or animation cadence were reduced.

`tools/bench-character-cpu.py --scenarios particles,particles-effects` repeats these browser checks. `node tools/test-particle-rendering.cjs` verifies preserved order, inherited alpha/styles, transforms, interpolation/culling, source-state immutability and full state copies only for ghosts. Browser comparisons supply the actual CSS/Canvas rendering checks that mocks cannot establish.


The longer final comparison covers **all three changes** against the pre-investigation build: five paired intervals, each with 240 warmup and 240 measured frames, per city scene. Night measured 5,481.9 vs 5,486.5 ms (flat); daylight 7,226.1 vs 7,061.7 ms (2.28% lower). The scenes ended with 100 street pedestrians and 71 vehicles, averaging 15.67 drawn bodies over their history. Every paired animation/physics/traffic state hash and final image matched exactly. Variation remains large enough that these results do **not** establish a dependable whole-city frame-rate improvement. The isolated savings are useful, but they must not be presented as an equivalent total-game gain. Remaining native Canvas painting and submission work warrants further local investigation. The engine is headless Chromium in this container, without phone CPU/GPU emulation.

Final validation: 123 automated cases passed, including 91 broad game regressions with 1,363 assertions. The six character sheets, warmed full-city images, mixed-particle images, animation/physics/traffic state hashes, text/JSON exports, and profiler-hook restoration checks passed. The build freshness check and `git diff --check` passed.

## Phone pass: wall clearance, moving light cache, hybrid crowd (October 22)

The October 22 phone capture (Android, 4 GB, every setting High) averaged 4.5 FPS: traffic AI 64 ms/frame, people 20 ms/frame, and every frame a catch-up frame. Three changes target what stays on screen at full quality.

**Wall clearance (traffic).** A wall check that finds nothing records how much room the car had: the nearest wall box, or the edge of the grid cells it searched. Later checks return immediately while the car stays inside that room and the walls' geometry generation (`_physicsSpatial.generation`) is unchanged. The answer is the same as a full check. A 3,000-tick seeded city run ended bit-identical; wall-check time fell from 1.02 to 0.65 ms/tick and the whole update by about 4.6% on desktop.

Off-screen decision thinning was also tried: off-screen cars thought every second tick, with a guard that kept braking for the lead car and stop line between thoughts. It cut thoughts by 13–23% but was no faster in the same runs, raised car-to-car contacts from 0 to 10, and was removed. Adding fields to cars outside the constructor also slowed traffic by about 7% through object-shape changes; the remaining field (`_wallClear`) is initialised in the constructor.

**Moving-camera light cache.** The dark plus every steady hole (street lamps that don't flicker, wake or fade, and interior lights) is drawn into a world-space buffer covering the view and a margin, then slid under the view transform each frame. It is rebuilt when the view nears its edge or an input changes. Destination-out holes commute, so changing lamps and anything not in the buffer are still cut live. Chromium, 880×411 rainy night city, 400 alternating frames: lighting median 6.0 → 5.4 ms walking and 6.1 → 5.4 ms driving. The light layer differs by 0.2/255 on average from the sub-pixel slide; a still camera is pixel-identical. `GameSettings.movingLightCache` turns it off.

**Hybrid crowd (Crowd Quality High).** A walking passer-by more than 240 px from Stella has its legs and hips (under the cloth panels) and its arms, torso and head (over them) stamped from a 16-step baked walk. The live draw still runs, so hair and strand physics, cloth panels, the lamp rim, the head's shade, the contact shadow and held items stay live and in place. Baked parts are flat-shaded. Standing, posed, armed, driving, hurt, reflected or zoomed-in bodies stay fully live. In isolated warm draws (hair and cloth physics already stepped), median CPU submission per body was 0.10–0.12 ms live and 0.05–0.06 ms hybrid. Bakes are lazy (three cells a frame) and are kept through changes of pace. Memory is about 0.65 MB per walker, for up to 40 walkers. `GameSettings.crowdHybrid` turns it off.

None of these desktop figures predicts phone FPS; compare a phone capture on the same route and settings.

Checks: `node tools/test-traffic-efficiency.cjs`, `node tools/test-lighting-base.cjs`, `node tools/test-character-rendering.cjs`.

## Deep simulation profile (October 22, evening)

Method: Chromium's CPU profiler with line-level positions (`--detailed-line-info`), with the CPU throttled 4× (about this phone's simulation speed), on the city at night with High traffic and pedestrians (~72 cars, ~100 people). Equivalence is checked in the Node runner: seeded 3,000-tick runs must end with bit-identical car and pedestrian state. The Node runner's own timings were not used, because the VM context makes global lookups (`Math`, `Object.is`) 5–70× slower than in a browser and distorts the profile.

**Root cause: unstable object shapes.** Cars picked up about 50 fields lazily (`fade`, `_aiPhase`, `_trafficSensing`, signal and route-probe state, physics state…), each car in its own order. That gave 17 hidden classes among 73 cars. Every hot traffic function then saw "new" maps: V8 discarded its optimised code ("wrong map" deopts, 96 in 1,500 steady-state ticks for `updateAIDriving` alone) and recompiled `updateAIDriving` 22 times in 3,000 ticks, running in slower tiers in between. Pedestrians had the same problem to a lesser degree. Both constructors now declare those fields, in a fixed order, as `undefined` (or `0` where every reader uses `x || 0`). Steady-state deopts dropped to about 20, none in `updateAIDriving`.

Smaller, measured fixes:
- The crowd grid query sorted its hits back into source order with `sort()` and a comparator callback, on every query (about 225 a tick). It now uses an insertion sort on the index, keeping `sort()` above 64 hits.
- The queue probe (`_probeGap`, about 680 calls a tick) skips cars outside the probe points' bounding box, expanded by the car's half-diagonal. This is exact, because a point inside a car's box is within its half-diagonal of the centre.
- `updateAIDriving` had three closures, which put its locals in a heap context. They are now methods or inline code.

Result (Chromium, 4× throttle, update only): **17.1 → 9.9 ms per simulation tick**, with traffic down from 10.9 to 5.0 ms. Most of the gain came from the shape fix: 13.3 → 8.3 ms in a direct A/B.

Tried and reverted for no measurable gain: allocation-free `isOnScreen`/`getOnScreen` (escape analysis already removed the allocation; the remaining cost is polymorphic calls over 953 collidables), removing `_readFolk`'s closure, and declaring lamp fields up front (lamps had 11 shapes, but frame time didn't change).

Remaining simulation costs at 4× (ms per tick): traffic decisions' own work 0.7, people sensing 0.85, crowd grid queries 0.75, pedestrians 1.5, car contacts 0.9, collision system 0.8 (0.55 of it on-screen culling of collidables), weather 0.55, enemies 0.3, navigation refresh 0.26.

Checks: `node tools/test-traffic-efficiency.cjs`, `node tools/test-traffic-crossings.cjs`, `node tools/test-game-regressions.cjs`.
