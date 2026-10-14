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
new recording or configuration change. Texture-quality changes also reset samples;
a recording started immediately afterward survives the one-time rebuild. The rolling history holds up to 6,000
frames so high-refresh displays can retain a complete 20-second run.

After the stationary comparison, walk around with Lighting + shadows enabled
to exercise player shadows, opening doors, and moving furniture. If Canvas look
is expensive, turn off bloom, atmosphere, softness, and decor animation one at a
time and repeat the recording. These switches make real changes to GPU work;
they do not choose another rendering backend.

## Animated characters and shape shadows

The build identifier is `native-webgl-city-v5`. **Canvas look** enables
all 43 switches. **Lighting + shadows** also enables continuous character
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

The five browser suites check the real main WebGL surface, all switches,
recording/export, moving gameplay, texture reuse, context recovery, odd-size
resize, walls, finite casts, lit bodies, overlapping light sources, continuous
poses, and projected silhouette gaps/rotation. Pixel readback is test-only.
`native-webgl-character-checks.json` contains the comparisons;
`native-webgl-character-parity.png` shows WebGL on the left, Canvas on the right.
Compare `native-webgl-canvas-look.png` and `native-webgl-canvas-reference.png` for
the apartment. These are comparison evidence, not a claim of identical pixels.

The apartment backdrop remains static; city geometry, emissives, traffic and
live people now render natively. NPC silhouette casts, additional combat/cinematic
passes, glass droplets and wet reflections remain unported. Furniture
uses the original geometric shadow footprints; some tiny blur/dash accents,
color falloff and GPU softness/halo remain approximate. Memory estimates exclude
shared filter-pool overhead and depth/stencil storage. Workspace Chromium uses
SwiftShader, so its frame rate is not a phone benchmark.

## Continuous decor, quality and combat effects

Decor animation now draws moving segments at the current clock on the GPU;
it does not select one of eight baked frames. Freeze it to compare its cost.
Texture quality is separate from screen resolution and shadow detail:

| Quality | Cached art density |
| --- | --- |
| Standard | Original 1 pixel per world unit |
| Auto | 2× furniture/fixtures, original floor/backdrop density |
| High | 2× all cached art, with asset-budget/device-size safeguards |

Changing quality rebuilds art once and releases its previous textures without
resetting gameplay or moving furniture. Auto does not automatically lower quality
in response to frame rate. The export identifies `textureQuality`, actual bake
densities, `qualityReductions`, glyph-atlas bytes and physical asset bytes.

Eight new switches isolate Bullet / fireball FX, Muzzle / weapon FX, Casings,
Impact particles, Decals, Combat cues, Shot lighting and FX glow. Canvas look
enables all eight; the other presets keep them off for controlled comparisons.
Fireballs use cropped views of a resident atlas, and text uses resident glyphs.
Shot lights can exercise both static and animated shadow refreshes: they are
moving light sources, not free sprites. FX glow uses a half-resolution blur with
fixed viewport bounds so small trail jitter does not grow its target repeatedly.

Per-frame `details.decor` and `details.effects` expose paths, visible prop count,
projectile/muzzle/particle/casing counts, transient sources and CPU submission
stages. Check `layerStages.effectsMs`/`decorMs`, uploads, bakes and shadow rebuilds
when disabling each group. First-use assets and target allocations are separate
from steady-state reuse; quality changes deliberately upload replacement art.

For the next phone capture, use Standard + Canvas look and walk/fire for 20s.
Compare Auto at the same zoom, then disable Shot lighting and FX glow separately
if cadence falls. Rain drops/splashes are now available; glass droplets and wet
reflections follow; see [the migration order](native-webgl-fork.md#next-rain-and-remaining-visual-parity).

## City and imported saves

**PLAY WEBGL CITY** starts a story-free city preview. **LOAD / IMPORT SAVES**
opens the original slot UI even with no fork saves yet: use Import with a JSON
export from Canvas, then select its slot. Imports write only the WebGL namespace;
Canvas saves are not overwritten. The toolbar's **Saves** shortcut reopens slots.
The normal pause menu still offers saving/export. Imported progress uses the
original migrations, inventory/equipment, vehicle, weather and story restoration.

Seven additional switches control city buildings/roofs, people/enemies, vehicles,
street details, world markers, rain drops and rain splashes. Gameplay continues
when drawing groups are hidden. Rain switches retain the simulation's arrays and
saved weather state; no per-frame Canvas rain bitmap is uploaded. City ground
still uses its own bounded full/half-resolution tile policy.

Per-frame `world` reports buildings, people, vehicles, ground tiles/gaps, native
paths and CPU submission time. `rain` reports simulated drop/splash counts, paths
and submission time (counts are not exact visible-drop counts). Imported imagery
is reference-counted across native contexts, and unused contexts/images retire.
Moving into new terrain can legitimately paint/upload new tiles and props;
warmed stationary tests check reuse. Shadow images are bounded to 64 cached
light owners, with visible sources kept recent.

Record a city route in Standard with Canvas look, then repeat with Rain drops,
Rain splashes, People / enemies, City buildings / roofs or Soft edges disabled
one at a time. Include firing and driving in separate captures. The apartment's
v4 phone FPS cannot establish the city's performance.
