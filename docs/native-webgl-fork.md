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
- All 43 visual switches remain independent. Fireplace flames, crafting scanline,
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
LRU. The apartment's distant city backdrop remains a snapshot. Detailed furniture shadows keep
Canvas's geometric footprints. A few tiny shadowBlur/dash accents, glyph outlines,
light-color falloff and the GPU halo/softness kernel remain approximate.
NPC silhouette casts, additional combat abilities, some cinematic camera
features, glass droplets and wet reflections still need dedicated passes. Character parity is measured below; complete apartment pixel
parity and mobile performance still require comparison on the target phone.

## Verification

Run `node tools/test-native-webgl-browser.cjs` and
`node tools/test-native-webgl-layers-browser.cjs`, plus
`node tools/test-native-webgl-character-browser.cjs` and
`node tools/test-native-webgl-details-browser.cjs` and
`node tools/test-native-webgl-city-browser.cjs` after building the preview.
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
