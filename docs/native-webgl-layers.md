# Testing the apartment layers

Open `DFAB WebGL.html`, choose **PLAY WEBGL APARTMENT**, then **Layers**.
The panel has three starting points:

| Preset | Enabled work |
| --- | --- |
| Baseline | Floor/backdrop, walls, furniture, player, basic lighting |
| Lighting + shadows | Baseline plus fixtures, glass/doors, decor lights, colored wash, occlusion, contact/room shading, glows and indicators |
| Canvas look | All passes, including softness, animated decor, scene bloom, and atmosphere |

Each checkbox is independent. Lighting must be on for its color, occlusion, and
softness passes to run. Hiding furniture, walls, or the player changes drawing;
it does not remove those objects from collision or automatically disable their
shadow switches. This allows the shadow cost to be tested separately.

For the first comparison, stand at the same point with the same camera zoom,
resolution, and FPS limit. Choose each preset and press **Record 20s**. The panel
closes, 15 frames of warmup are excluded, and the completed 20-second sample is
downloaded automatically as `dfab-native-webgl-layers-<configuration>.json`.
Changing layers cancels an in-progress recording and starts a fresh sample.
Restarting or restoring a lost context also clears the old sample.

The downloaded JSON records the exact enabled switches, build identifier,
camera/player positions, device, resolution/settings, actual frame intervals,
stalls, CPU render time, gap outside rendering, texture upload/allocation calls,
asset bakes, draw calls, geometry buffer bytes, CPU pass times, and shadow-cache
hits/rebuilds. The completed recording is frozen; **Export** repeats it until a
new recording or configuration change. The rolling history holds up to 6,000
frames so high-refresh displays can retain a complete 20-second run.

After the stationary comparison, walk around with Lighting + shadows enabled
to exercise player shadows, opening doors, and moving furniture. If Canvas look
is expensive, turn off bloom, atmosphere, softness, and decor animation one at a
time and repeat the recording. These switches make real changes to GPU work;
they do not choose another rendering backend.

## Animated characters and shape shadows

The build identifier is `native-webgl-silhouettes-v3`. **Canvas look** enables
all 28 switches. **Lighting + shadows** also enables continuous character
animation, silhouette shadows, high shadow detail and curtains.

For a controlled moving test, use the same route, view, zoom, resolution and FPS
limit for each recording. Walk, turn, sneak, aim/holster a weapon, and push a
piece of furniture near a light. Record these variants:

1. Canvas look with all layers enabled.
2. Same configuration, **Player shadows** off: isolates the character-shadow cost.
3. Player shadows on, **Shape-accurate shadows** off: compares geometric casts.
4. Shape-accurate shadows on, **High-resolution shadows** off: tests lower density.
5. Original configuration, **Character animation** off: freezes the body image
   while position/rotation and gameplay continue. This is a diagnostic control.

The original character's gait, stance transitions, recoil, poses, hair, clothing,
held items and weapon models generate GPU geometry. A persistent 384×384 GPU
character target supplies the visible body and its alpha silhouette. The same
world-space hair/cloth simulations run once, without a baking clone. Gradients
are rendered into reusable GPU targets; translating a gradient does not recreate
its pixels. Existing weapon/glow image assets may upload once on first use;
continuous animation does not require new Canvas bitmaps.

Static wall/door/furniture light images and pose-dependent light images have
separate caches. Animated alpha is stretched using the Canvas High projection,
and its unprojected body is subtracted so the caster stays lit. Gaps in the
silhouette remain gaps in its shadow. Each light owns its cast, so another light
can illuminate the region. Bounds come from the drawing geometry, without pixel
readback. Wall/door visibility and screen bounds reject irrelevant sources.

High shadow detail uses at most 256px per light target and density .5; lower
detail uses at most 128px and density .25. These limits bound large-light memory.
Moving doors or furniture still update affected static images. Restore after
context loss rebuilds all GPU-only character, gradient, veil and light images.

## Apartment passes and profiling

Curtains follow their original drawing routines through the native path adapter.
Lamp bodies reuse cached authored on/off assets, while their original particle
motion is batched into one GPU geometry pass; switches crossfade the assets. Glass updates with daylight and shattering.
Authored apartment glows retain their source strengths/flicker; the player's
halo follows the body silhouette. Room switches fade lights. Neutral light
holes use screen blending, reproducing destination-out on Canvas darkness;
color remains additive. The room veil is rendered at the original coarse world
resolution and composited before colored light at night. Outdoor rooms receive
sky illumination. Bloom follows Canvas' one-third/sixth/twelfth downscale chain
and .15/.08 strengths. Atmosphere uses the original tint setting.

Per-frame `animation` rows report pose revision, changed/frozen state, geometry
CPU time, raster-submission CPU time, phase/stance and position. `shadows` splits
`staticRebuilds`, `dynamicRebuilds`, `dynamicHits` and `silhouettePairs`.
`animationSummary` aggregates measured animation and shadow-refresh frames.
`initializationMs`, `entryTiming` and `startup.firstFrames` preserve renderer
construction and entry/startup work excluded from
warmed FPS. They do not measure downloading/parsing the HTML. Optional `gpu`
samples have labels and source frame IDs; unsupported devices explicitly say
`GPU timer unavailable`. CPU submission time is not GPU execution time.

## Evidence and remaining differences

The three browser suites check the real main WebGL surface, all switches,
recording/export, moving gameplay, texture reuse, context recovery, odd-size
resize, walls, finite casts, lit bodies, overlapping light sources, continuous
poses, and projected silhouette gaps/rotation. Pixel readback is test-only.
`native-webgl-character-checks.json` contains the comparisons;
`native-webgl-character-parity.png` shows WebGL on the left, Canvas on the right.
Compare `native-webgl-canvas-look.png` and `native-webgl-canvas-reference.png` for
the apartment. These are comparison evidence, not a claim of identical pixels.

The city backdrop/parallax, city glow/traffic, NPCs and advanced combat/cinematic
passes remain unported. Decor props retain phase-texture animation. Furniture
uses the original geometric shadow footprints; some tiny blur/dash accents,
color falloff and GPU softness/halo remain approximate. Memory estimates exclude
shared filter-pool overhead and depth/stencil storage. Workspace Chromium uses
SwiftShader, so its frame rate is not a phone benchmark.
