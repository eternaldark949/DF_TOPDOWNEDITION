# Native WebGL fork

Status: playable apartment prototype on branch `codex/native-webgl-fork`.
`DFAB WebGL.html` presents its scene through WebGL; `DFAB V8.html` retains the
Canvas renderer. The branch starts from the Gamma diagnostics work.

## Try the apartment

Build with `node tools/build.mjs --webgl`, open `DFAB WebGL.html` in a browser,
then choose **PLAY WEBGL APARTMENT**. Use the usual keyboard or touch controls
to explore, interact, and move furniture. City exits and story entry points are
disabled in this slice. The toolbar can toggle lighting, restart the apartment,
or export `dfab-native-webgl-profile.json`.

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
- Player art uses an eight-phase, bounded pose texture cache; appearance and map
  changes release the old cache. Baking uses a separate gait object so it cannot
  change the live player's simulation state.
- Batched light sprites render to a persistent half-resolution GPU texture.
  One filter combines that lighting with the scene in the same context. Odd
  viewport dimensions do not cause recurring target allocation.
- The original game loop, collision, interactions, and DOM controls remain.
  This sandbox prevents the default story step from teleporting to an unported
  scene on its first update.
- WebGL initialization failures display an explicit message. Context loss stops
  drawing until Pixi and the browser restore the context. There is no Canvas
  renderer fallback in the preview.

Lighting currently has no occlusion, room veil, or bloom. Decor and city backdrop
animations are snapshots; NPCs, cinematic camera features, and advanced combat
effects are not migrated. This is the first playable slice, not a complete game
renderer replacement or a visual-parity benchmark.

## Verification

Run `node tools/test-native-webgl-browser.cjs` after building the preview.
Chromium checks the real WebGL surface, linked shader, warmed texture reuse,
movement, camera/screen round trips, furniture invalidation, resize/zoom, visible
lighting across repeated frames, the actual gameplay loop, context loss and
restoration, unavailable WebGL, and storage isolation. The fixture starts at an
880×411 viewport specifically to exercise odd half-resolution dimensions.
Pixel readback is used only in the test, never in the live renderer.

The tested warmed slice makes five draw calls per frame and zero texture uploads.
The original Canvas build also passed all 98 regressions / 1,379 assertions.
Workspace Chromium uses SwiftShader; its FPS does not establish performance on
the Mali phone. The export excludes ten initial frames, retains up to 120 recent
frames, and reports cadence, stalls, CPU render time, gap outside rendering,
uploads, bakes, draw calls, GPU identification, settings, asset texture bytes,
and lighting target bytes. GPU execution time and Pixi's full allocation overhead
are not measured. See `native-webgl-apartment.png` for the preview.

## Goal

Present gameplay through one WebGL context, with scene textures, lighting targets,
and postprocessing resident on the GPU. Preserve simulation, maps, saves, story,
input, audio, and the DOM interface while replacing their drawing dependencies.

The mobile target is the user's Mali-G68 phone. The existing captures establish
approximately 3.5–3.9 FPS for the hybrid Gamma pipeline, including long gaps outside
the measured render calls. They do not establish how fast a native renderer will
be or whether rendering accounts for every stall.

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
