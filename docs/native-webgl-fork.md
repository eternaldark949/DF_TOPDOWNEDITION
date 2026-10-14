# Native WebGL fork

Status: experimental city and interior fork on branch `codex/native-webgl-fork`.
`DFAB WebGL.html` presents its scene through WebGL; `DFAB V8.html` retains the
Canvas renderer. The branch starts from the Gamma diagnostics work.

## Try the apartment

Build with `node tools/build.mjs --webgl`, open `DFAB WebGL.html` in a browser,
then choose **PLAY WEBGL APARTMENT**. Use the usual keyboard or touch controls
to explore, interact, and move furniture. Authored city exits are enabled. **PLAY WEBGL CITY** starts a city sandbox;
**LOAD / IMPORT SAVES** opens the original save-slot UI. Export saves as JSON
from the Canvas build, import them here, then choose the desired slot. Imported
progress retains its story state; new-game story starts remain separate. **Layers** opens independent visual switches and the
Baseline, Lighting + shadows, and Canvas look presets. **Record 20s** warms the
selected configuration, measures it, and automatically downloads a profile.
**Export** also downloads the latest sample. See [layer testing](native-webgl-layers.md).

The HTML includes its scripts, art, audio, and pinned PixiJS 7.4.3 distribution
with its MIT license. It makes no runtime CDN dependency. The preview routes
application local storage into the `dfab_native_webgl:` namespace; it does not
share the Canvas game's save slots or settings, even on the same web origin.

Current implementation:

- A WebGL renderer owns the actual game canvas. Legacy helpers have a separate
  scratch Canvas context for asset baking; the scene is never copied into it.
- Apartment floor/backdrop art and individual props are baked as assets and kept
  in GPU textures. Furniture movement and rotation update sprite transforms.
  Art state changes replace and release the affected texture.
- Player art uses the same live procedural animation and configuration as Canvas.
  A native path adapter tessellates its body, clothing, hair, weapons and held
  items into WebGL geometry. One small GPU target supplies the visible body,
  animated silhouette shadows and the silhouette-shaped halo. There is no
  eight-frame pose cache or per-frame Canvas body capture.
- Static per-light wall/door/furniture images stay cached. A separate GPU pass
  projects the current character alpha into affected lights, using Canvas High's
  finite stretch and self-body subtraction. Position, angle and pose revision
  invalidate that pass. Its quad follows the actual geometry bounds, avoiding
  shading the whole padded body texture. Shadow resolution is bounded to 256px
  at high detail or 128px at low detail; shape and detail have separate switches.
- Screen-blended neutral light holes and additive color reproduce the Canvas
  dark-mask composition. Outdoor room illumination and a low-resolution,
  world-aligned feathered room veil are GPU passes. Window glass is live, and
  authored curtains, lamp particles/fades, and apartment glows use GPU geometry
  and cached image assets. Bloom uses the Canvas downscale scales/strengths;
  atmosphere follows the original tint setting.
- All 50 visual switches remain independent. Fireplace flames, crafting scanline,
  record sheen, tub ripple, plants and telescope accents follow their authored
  continuous clock through GPU geometry. Static segments remain cached and
  retain their drawing order; Decor animation off freezes their original art.
- Standard texture quality retains the original asset density. Auto doubles
  furniture/fixture density; High doubles all cached art. Logical world sizes
  stay unchanged. Changes rebuild and release assets once, independently of
  screen/shadow resolution; upgrades are reduced beyond a 128 MiB asset estimate
  or the device texture-size limit. Auto is selective quality, not an FPS governor.
- Authored bullets, sniper/crackle trails, muzzle stars, smoke, embers, casings,
  slashes, laser sight, impact particles, decals and combat/status cues use native
  geometry. Fireballs blend resident atlas frames; damage text uses a prewarmed
  GPU glyph atlas. Shot lights enter the existing lighting/shadow pipeline, with
  a bounded pool of four flashes, four standard projectiles and two fireballs.
  Each effects group, transient lighting and low-resolution FX glow has a switch.
  Odd viewport sizes reuse allocations.
- The original game loop, collision, interactions, and DOM controls remain.
  The preview buttons disable story startup; imported saves restore their original
  story data and normal map transitions.
- WebGL initialization failures display an explicit message. Context loss stops
  drawing until Pixi and the browser restore the context. There is no Canvas
  renderer fallback in the preview.

City streets use the original GroundBaker's bounded 512-world-pixel tile cache,
imported as resident GPU textures with GPU retirement tied to tile eviction.
Visible city buildings use their authored camera-dependent facades, roofs and
emissives; roof geometry is retained while the camera, daylight gate and LOD
stay fixed. World bodies and traffic use native paths. Building contexts and
far-off prop textures are released; street-light shadow images have a 64-owner
LRU and a 24MiB light-target budget. The apartment's distant city uses the original live CityView, with traffic, pedestrians, parallax and night lights. Detailed furniture shadows keep
Canvas's geometric footprints. A few tiny shadowBlur/dash accents, glyph outlines,
light-color falloff and the GPU halo/softness kernel remain approximate.
Additional combat abilities, some cinematic camera
features, glass droplets and wet reflections still need dedicated passes. Character parity is measured below; complete apartment pixel
parity and mobile performance still require comparison on the target phone.

## Verification

Run `node tools/test-native-webgl-browser.cjs` and
`node tools/test-native-webgl-layers-browser.cjs`, plus
`node tools/test-native-webgl-character-browser.cjs` and
`node tools/test-native-webgl-details-browser.cjs` and
`node tools/test-native-webgl-city-browser.cjs` and
`node tools/test-native-webgl-crowd-browser.cjs` and
`node tools/test-native-webgl-buildings-browser.cjs` after building the preview.
Chromium checks the real WebGL surface, linked shader, warmed texture reuse,
movement, camera/screen round trips, furniture invalidation, resize/zoom, visible
lighting across repeated frames, the actual gameplay loop, context loss and
restoration, unavailable WebGL, and storage isolation. The fixture starts at an
880×411 viewport specifically to exercise odd half-resolution dimensions.
Pixel readback is used only in the test, never in the live renderer.

Character tests compare 15 poses/outfits/held-item cases against the actual
Canvas procedural routine, including pistol/rifle/sniper models. Alpha-mask
intersection-over-union is approximately 98.8–99.6%; opaque RGB channel error
averages about 2–3 levels out of 255. The projector test verifies lit silhouette
gaps, self-body exclusion, finite reach, angle/pose invalidation and cache reuse.
A real requestAnimationFrame run exercises walking, continuous poses and shadow
refreshes with zero warmed bitmap uploads or asset bakes. Static light images
remain cached while pose-dependent images update.

Details tests exercise continuous decor, all three texture qualities, preserved
world dimensions/state, released replacement textures, warmed mixed effects,
fireball atlas views, resident glyphs, shot lighting and real weapon simulation.
Quality changes followed immediately by recording retain the new capture;
context restoration rebuilds GPU-only detail resources. Evidence is in
`native-webgl-details-checks.json`; `native-webgl-details.png` shows the mixed-FX
fixture, not an ordinary gameplay screenshot.

Warmed stationary layer tests make zero bitmap uploads. Draw counts depend on
the enabled passes and the device's batch capacity; exports include actual counts.
The original Canvas build also passed all 98 regressions / 1,379 assertions.
Workspace Chromium uses SwiftShader; its FPS does not establish performance on
the Mali phone. The export excludes warmup (15 frames after layer changes), retains up to 6,000 recent
frames, and reports cadence, stalls, CPU render time, gap outside rendering,
uploads, bakes, draw calls, GPU identification, settings, asset texture bytes,
lighting/shadow target bytes, geometry buffer bytes, configuration flags, and
per-frame character geometry/raster-submission stages, pose changes, and separate
static/dynamic shadow refresh counts. Startup exports include apartment-entry
stages and the first 15 renderer frames separately from the warmed sample.
Optional disjoint timer queries provide asynchronous GPU samples on supported
WebGL2 devices; no checkpoints/readback force GPU completion. Unsupported phones
explicitly report timer unavailability. Depth/stencil buffers and Pixi's full
allocation overhead are not measured. See `native-webgl-canvas-look.png`
and `native-webgl-canvas-reference.png` for the same apartment camera.

## Goal

Present gameplay through one WebGL context, with scene textures, lighting targets,
and postprocessing resident on the GPU. Preserve simulation, maps, saves, story,
input, audio, and the DOM interface while replacing their drawing dependencies.

The mobile target is the user's Mali-G68 phone. The first lightweight native
slice improved substantially over hybrid Gamma. The new visual passes require
fresh device measurements; the earlier result is not a benchmark of Canvas look.

## Rendering architecture

Use PixiJS's WebGL backend as the starting point.
Vendor the pinned, licensed build locally; preserve offline play
and avoid runtime CDN dependencies. WebGL initialization failure should show an
explicit unsupported-renderer message in this experimental fork.

Keep game state independent of renderer objects. Renderer-owned scene nodes track
entities through stable IDs. Draw order follows the existing floor, wall, entity,
roof, lighting, effects, and interface order; batch only where that order permits.

The render graph is:

1. Draw visible static chunks and dynamic sprites/meshes into a scene target.
2. Draw lights and occlusion into GPU lighting targets.
3. Combine scene and lighting, then apply optional bloom and atmosphere.
4. Present directly to the WebGL game canvas. Keep existing DOM menus above it.

Start lighting at the existing half-resolution size for comparable measurements.
Reuse allocations across frames; resize only when dimensions change. Track texture
bytes, uploads, draw calls, visible objects, frame intervals, and CPU stages.
GPU timing is optional because this phone did not expose timer queries.

## Existing code to reuse or replace

- `src/engine/game-engine.js`: replace creation of the main 2D rendering context;
  separate renderer allocation from gameplay initialization.
- `src/engine/draw.js`: retain camera/view calculations and visibility decisions,
  replace Canvas draw dispatch with scene synchronization and render passes.
- `src/engine/loop.js`: preserve fixed-step gameplay behavior; measure simulation
  and frame cadence independently of renderer submission.
- `src/entities/prop-sprites.js`: reuse sprite-art generation and its state-change
  invalidation, upload a texture only when that art changes.
- `src/ui/humanoid-render.js`: migrate characters separately. Shared baked poses
  can cover common animation states; articulated sprite parts or meshes can cover
  aim, customization, and effects without rebuilding a whole body every frame.
- `src/engine/lighting.js`, `dynamic-shadows.js`, `gamma-shadows.js`: retain useful
  light/occluder geometry and source discovery, replace Canvas lighting inputs
  with GPU draws. Integrate into the renderer's context and render targets.
- `src/engine/daylight.js`, `reflections.js`, and interior art: explicitly migrate
  clipping and blend behavior, including multiply, screen, and soft-light. Some
  operations need extra passes; avoid assuming they are free hardware blends.
- `tools/build.mjs`: support a separately named offline WebGL artifact when the
  first playable slice exists. Keep the Canvas artifact available for comparison.

Canvas2D remains useful as an asset authoring tool during loading or bounded art
invalidation. Its output becomes a persistent GPU texture. Do not rasterize the
complete live scene in Canvas and upload it every frame, and do not introduce a
general Canvas API shim that hides recurring rasterization costs.

## Migration sequence and acceptance

1. **Apartment slice:** load `apt_949`, render its floor, walls, furniture, and
   player through WebGL; preserve movement, camera, collision, and interactions.
   Expose missing visual features explicitly in development. Verify player and
   touch-coordinate alignment at different zoom and viewport sizes.
2. **Lighting in the same context:** add lamp contributions, silhouettes, veil,
   and optional soft edges. Confirm that ordinary warmed frames have no full
   scene or lighting Canvas uploads and no WebGL-to-Canvas scene composition.
3. **Dynamic art:** cover character animation, enemies, effects, and changing
   props. Bound bake queues and resident texture memory; dispose map resources
   and rebuild after context restoration.
4. **Other maps and screen effects:** migrate city chunks, roofs, cars, weather,
   reflections, daylight, bloom, and cinematic overlays. Verify ordering and
   representative scenes before treating the renderer as game-wide.

For each stage, compare the same camera, scene, settings, and phone with warmup
excluded. Report actual frame cadence, median/p95 interval, long stalls, simulation
time, render CPU time, uploads, draw calls, and memory. Compare with the live
profiler panel hidden as well as visible. A faster desktop run alone does not
establish a mobile win. The first success criterion is a measurable improvement
in the playable apartment slice, not a promised 60 FPS or immediate visual parity.

## City saves and rain in v5

The city suite imports a Canvas-format export through the actual file input and
loads it through the slot card. It verifies saved position, currency/scrap and
story data, isolated original storage, travel across distant city regions, texture
reuse, bounded shadow caches, and normal fade transitions through the tested maps.
See `native-webgl-city-checks.json` for the exact route/maps. This is functional
coverage, not a claim that every story scene or interior has full pixel parity.

Rain drops and splashes now reuse the original weather simulation, wind, height
parallax, frame interpolation, lamp highlights and batched paths, rasterized as
GPU geometry. Their switches do not stop the weather simulation or alter saved
conditions. Indoor rain uses the original outdoor fade and clips to outdoor room
rectangles; roof/window droplets and wet reflections remain separate work.
Per-frame `world` and `rain` rows expose visible work and CPU submission stages.
The city keeps GroundBaker's own full/half-density policy independently of the
furniture texture-quality selector. Original authored landmark sprite density
also remains unchanged.

## Next: rain and remaining visual parity

1. **Drops and ground splashes (first pass shipped):** retain weather intensity, wind and simulation;
   batch authored drop paths with height/parallax into reusable GPU geometry.
   Respect the apartment roof/outdoor boundary so rain lands on the veranda,
   rather than through the living-room roof. Render short-lived splash rings
   with age-driven shaders. Give drops and splashes independent test switches.
2. **Window droplets:** add a separate glass-local effect with clipped streaks
   and highlights. Bound its resolution and update cost independently of rain
   density; compare rain outdoors and through the apartment windows.
3. **Wet surfaces and reflections:** use material/roof masks and selective GPU
   scene/light targets for wet highlights and reflections. Avoid capturing the
   live scene in Canvas or reading GPU pixels back to the CPU. Start with lamp
   reflections, then add character/scene reflection detail only where visible.
4. **Remaining content:** NPC silhouette casts, additional abilities,
   city optimization and cinematic passes need separate parity
   comparisons before this becomes a renderer for the full game.

For the phone, first record Standard with Canvas look while walking and firing;
then compare Auto and the individual FX/shot-light/FX-glow switches. High has
four times the pixels per upgraded asset, so it needs a memory and cadence check.
The v3 phone recording (30.75 FPS) is a baseline, not a v4 performance claim.

The A53 5G is the target device. Its complete v4 High-quality recording averaged
25.84 FPS with zero warmed uploads/bakes and no >250ms stalls; the user also
reported satisfactory weapon play with a minor Anavia slowdown. City density,
rain and live crowds add work, so v5 needs a new phone recording. First test a
copied city save in Standard, walk/drive/fire, and record rain on/off separately.

## v6: city CPU bottleneck and resident crowd animation

The A53 v5 city recording averaged 3.42 FPS and 199.04ms inside rendering,
with 48 intervals >250ms. World preparation averaged 74.92ms, rain 7.48ms
(included in world), and lighting 6.35ms. About 35 people/24 vehicles and 1,447
world paths were submitted each frame, with 3.91MB of buffer traffic. Only seven
texture upload/allocation calls and four asset bakes occurred in the entire run;
street tiles and static shadow images stayed cached. The problem was repeated
procedural geometry and its downstream tessellation/submission, not bulk texture
uploads. The remaining render cost was not separately timed in v5, and the
93.01ms average gap outside rendering includes simulation/browser work; neither
number establishes GPU execution time.

v6 adds an optional GPU crowd animation cache. Eligible civilians share strips
by appearance/configuration and wet/dry state: one idle and sixteen walk poses,
rasterized through native paths into GPU render targets. A mesh shader samples
and interpolates adjacent poses with correct premultiplied alpha. Positions,
facing, contact shadows and gait timing remain live. The bake uses the original
lighter crowd art; the player's full procedural animation/shadows are unchanged.
Combat/dance/death/driving poses remain live. Turning the cache off restores v5's
live crowd paths for comparison. No Canvas body capture is used.

At most one new strip is built per frame, with 64 resident entries (approximately
81MiB at maximum occupancy), evicting entries absent for at least sixty frames.
A miss over the preparation/residency budget draws live, so people do not vanish.
Map changes release the cache; context restoration regenerates GPU strips.
`crowdTargetBytes` and `world.crowd` expose memory, hits/misses, builds, sprite
bodies and eligible live fallbacks. New strips allocate GPU storage during
warmup; ordinary warmed poses do not upload bitmaps or rebuild their geometry.

A controlled 36-person browser comparison cut measured buffer traffic by about
82% and draw calls by about 43%, with zero warmed uploads/bakes. Evidence and
context restoration checks are in `native-webgl-crowd-checks.json`. Software
Chromium timings are not a phone benchmark. Vehicles already use resident base
art; their tyres/lights/reflections remain live. Rain tessellation and simulation
remain candidates after the next recording.

Per-frame `world.timings` separates ground, streets, vehicles, people, buildings
and markers. `rain.cpuMs` is separate and included in total `world.cpuMs`.
`stages.sceneSubmitMs` measures the final Pixi scene call, including deferred
geometry building and driver submission, not just GPU work. For an A53 A/B,
let the crowd cache settle, record the same city view/route with GPU crowd
animation cache on, then off, keeping all other settings identical.

## v7: stationary building emissives

The two v6 A53 samples measured roughly 15.5–17.5ms of building preparation and
53.7–67.9ms of final scene submission per frame. They were stationary at different
positions and had different crowd/traffic counts, so they are not a controlled
cache comparison. Roof geometry was retained, but emissive windows, lanterns,
neon and washes were rebuilt in a shared native path context every frame.

The GPU building glow cache keeps the static emissive result in view-bounded
render textures. It invalidates on camera position/zoom, viewport, LOD, lamp/day
state, decor mode and quantized sky-darkness changes. Authored Silver Queen
crown/beams/mist and Moon City beams draw live outside the snapshot. A small
shader pulse approximates subtle static-lantern/window flicker; other captured
small emissive animations remain approximate. The toggle restores the complete
live v6 emissive pass. The cache does not use Canvas scene capture or readback.

Snapshot rendering retains source-over coverage independently of additive RGB:
additive draws keep destination alpha unchanged while adding color. Replaying
the image therefore composes cached RGB plus the underlying scene multiplied by
one minus cached coverage. Temporary blend configuration is restored before
ordinary rendering. The dedicated pixel test compares the same fixed viewport
and clock, with the optional pulse disabled. It uses readback only in the test.

Cached targets have a 1536-pixel dimension limit and a 24MiB total budget. Budget
misses retain live emissive drawing. Unused imported images retire from both
static/live contexts. Camera changes redraw affected targets; map changes dispose
them, and context restoration invalidates GPU pixels. Native view bounds now
populate the existing drawing-helper cull contract so offscreen details can skip
painting rather than treating the whole map as visible.

The stationary browser fixture reduces geometry-buffer traffic by about 67% and
building preparation by about 94%, while continuing live animated features.
`native-webgl-building-checks.json` contains composition, timing/resource reuse,
camera invalidation and recovery checks. Workspace FPS is not phone performance.
Per-frame `world.buildingCache` exposes hits, rasterizations, raster CPU time,
live paths, budget fallbacks and bytes; root `buildingTargetBytes` adds residency.
`bakeOrigins` tags asset creation/import by painter/context, so repeated imports
can be distinguished from these GPU rasterizations. A bake count includes a
first asset import; it is not proof that its Canvas painter ran again.

For the A53, leave the GPU crowd cache on and compare the same stationary camera
with only GPU building glow cache changed. Then record walking to measure view
invalidation. Keep texture quality, rain, crowd/traffic and other layers fixed.

## GPU rain and city depth in v8

Canvas look now enables all 47 switches. **GPU rain quads** replaces rain's
CPU-tessellated paths with two resident indexed meshes: one for drops and one
for splashes. Fragment shaders draw soft round streaks, bright cores, colored
lamp highlights, expanding rings and splash dots. Weather simulation, wind,
height parallax, interpolation and indoor outdoor-room clipping remain live.
Turn this switch off to compare the preceding native path renderer; both modes
present through WebGL. Drop and splash switches remain independent.

Profiles expose `rain.mode`, visible `dropQuads` / `splashQuads`, and packed
`vertexBytes` alongside simulation counts and CPU time. Quad mode has zero
rain paths; this means the shader replaced them, not that rain is missing.
Resident buffers grow as needed, with a 16,384-quad limit per mesh. The weather
simulation's normal particle budget is much smaller. No per-frame rain bitmap
is painted or uploaded.

**City depth sorting** groups each live person’s paths and cached body, then
orders people, the player and lamp fixtures by world Y. Lamp particles stay
with their fixture. Switching it off restores the preceding broad pass order.
This addresses city lamp/body overlaps; vehicles, furniture, roof cutaways and
indoor fixture ordering still use their existing passes and need a later pass.

The controlled Chromium fixture in [rain evidence](native-webgl-rain-checks.json)
checks visible shader output, geometry reduction, unchanged simulation arrays,
front/behind ordering, fixture hiding, comparison controls and GPU recovery.
It cut whole-scene geometry-buffer traffic by approximately 80% in the sampled
stationary scene, with zero warmed bitmap uploads/bakes. Desktop SwiftShader
timing is not a phone FPS prediction.

On the A53, record the same rainy city view with both caches enabled and only
GPU rain quads changed. Keep quality and population steady. Then walk past
lamps with City depth sorting on and off. Window droplets and wet reflections
are the next separate effects; NPC silhouette casts remain outstanding.

## Driven vehicle body and occupants in v9

The authored vehicle `draw()` deliberately skips body/lights when the player
is driving. Canvas paints occupants first, then calls `drawOccupantOverlay()`
to put the roof and door frame over them. The native fork previously omitted
that second pass, causing the driven car to disappear.

Native rendering now groups the driver sprite, live seated passenger poses,
and authored vehicle overlay in that order. The group follows the car's world
Y when City depth sorting is enabled; the broad-order comparison also works.
Vehicles hides the full vehicle group; People controls passenger poses, while
Player still controls the driver. Exiting removes the extra pass. Its context
participates in image retirement, map cleanup, GPU recovery and gradient memory
accounting. Profiles add `world.timings.drivenCarMs`.

[Driving evidence](native-webgl-driving-checks.json) covers real entry/exit,
movement and camera following, both depth modes, passengers, vehicle hiding,
zero warmed uploads/bakes, map changes and GPU recovery. The tested body mask
has approximately 99.9% intersection-over-union against the authored Canvas
overlay; this does not establish parity for every vehicle/model/state.

Full-game parity still requires complete object/indoor/roof depth ordering,
remaining dynamic shadow casters, glass droplets and wet/reflection materials,
and an audit/port of special render passes (scopes, abilities, ghosts, emotes,
quips and cinematic effects). Those need reference captures across maps and
states, beyond the apartment and stationary city fixtures.

## Casters, scene depth and the veranda city in v10

Canvas look enables all 50 switches. Three new controls default on:
**NPC shape shadows**, **Vehicle shadows**, and **Live veranda city**.
**Scene depth sorting** replaces the former City depth sorting label and now
also applies indoors.

NPC casts use the same interpolated GPU alpha as the visible crowd body;
no additional bitmap capture is needed for eligible cached poses. Live poses
render once into resident 192×192 GPU targets and display from that texture.
Contacts remain separate. Every light masks only its own contribution, with
finite projection, silhouette self-body exclusion, and spatial-index wall/door
blocking. Vehicle casts retain Canvas's rotated geometric footprint and
15-unit elevation; cat and budget-fallback casts use small geometric shapes.
Authored lamp/decor source elevations determine cast length. Hidden, dead,
in-car and reflection-proxy bodies do not register; blinking bodies disappear
from the caster list when their artwork disappears.

The workload is bounded: 32 live body targets (4.5MiB plus separately reported
gradients), at most 16 live captures per frame, 16 dynamically shadowed lights,
24 casters per light and 192 pairs per frame. Player/driven car casts take
priority. Combined light targets use a 64-owner LRU and 24MiB ceiling.
Overflow/fallbacks are reported; distant LOD skips other-actor casts. Static
walls/furniture remain cached independently of moving bodies. `casters` and
`world.casters` report shared bodies, captures/refreshes, geometric fallbacks,
blocked/dropped pairs, target residency and memory. The `casters` count is the
registered NPC/vehicle list; the player is added separately per light.

Furniture with collision, vehicles, doors, lamps and live bodies sort by world
Y. Each live prop's static/live segments stay together. Floor-level and fixed
non-navigation decorations keep their floor pass. Driven occupants stay inside
the car's composite group. Buildings/roofs sort by depth; trees retain the
original foreground canopy pass, the Ferris wheel remains above them, and
ordinary projectiles stay below roofs. Anonymous café/lobby/club bodies also
participate in sorting. Turning Scene depth sorting off restores broad passes.

The veranda uses the authored CityView base/glow routines: moving traffic and
pedestrians, camera parallax and eased lookout lean, vehicle lights, signal
cycles and roof beacons. Static city art stays cached. Its source bakers see the
miniature city's viewport rather than the apartment viewport. The finite car/
pedestrian asset set stays resident after first visibility; crop views retain
at most 256 older entries per context, with an active-frame burst protected
from premature destruction. The frozen comparison covers the 400-pixel city
strip. No per-frame city bitmap or GPU readback is used in gameplay.

[Parity evidence](native-webgl-parity-checks.json) checks multiple alpha casters,
limb gaps, self exclusion, wall blocking, phase invalidation, vehicle casts,
selection budgets, indoor overlaps, anonymous body groups, camera/parallax,
asset reuse and GPU recovery including live body pixels. The tested veranda
base differs from the authored Canvas drawing routine by approximately
0.32/255 mean RGB channel error on the same cached source art. This is a
specific pass comparison, not whole-game pixel parity or phone FPS evidence.

For the A53, record the same city view with both caches fixed and NPC shape
shadows changed alone, then compare Vehicle shadows. Walk around tables/doors
and parked cars with Scene depth sorting on/off. Record the veranda while
moving toward/along the railing; Live veranda city restores the still comparison.
Additional special combat/cinematic passes, glass droplets and wet reflections
remain separate migration work.
