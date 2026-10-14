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

The build identifier is `native-webgl-surfaces-v12`. **Canvas look** enables
all 63 switches. **Lighting + shadows** also enables continuous character
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

The seven browser suites check the real main WebGL surface, all switches,
recording/export, moving gameplay, texture reuse, context recovery, odd-size
resize, walls, finite casts, lit bodies, overlapping light sources, continuous
poses, and projected silhouette gaps/rotation. Pixel readback is test-only.
`native-webgl-character-checks.json` contains the comparisons;
`native-webgl-character-parity.png` shows WebGL on the left, Canvas on the right.
Compare `native-webgl-canvas-look.png` and `native-webgl-canvas-reference.png` for
the apartment. These are comparison evidence, not a claim of identical pixels.

The apartment backdrop remains static; city geometry, emissives, traffic and
live people and their bounded silhouette casts now render natively. Additional combat/cinematic
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

## City CPU comparison in v6

**GPU crowd animation cache** switches eligible civilian bodies between resident
GPU walk strips and v5's live procedural paths. Wait for the cache to settle
before recording; each frame prepares at most one new appearance. The cache
uses lighter authored crowd art with sixteen interpolated walk poses. Combat,
dance/death and driving poses still draw live, as does the player's full body.
Movement, collisions and contact shadows continue in both variants.

Repeat the same city route with only this switch changed. Inspect
`world.crowd.spriteBodies`, `atlasesBuilt`, `liveBodies`, `crowdTargetBytes`,
`world.timings.peopleMs`, `bufferBytes`, draw calls and `stages.sceneSubmitMs`.
The latter includes deferred tessellation and driver submission; GPU timer
unavailability still means there is no direct GPU execution measurement.
`world.timings` also separates ground/street/vehicle/building/marker preparation;
rain's own CPU time is included in total world time, so do not add it twice.

The dense 36-person test checks less geometry traffic, warmed texture reuse,
animation/movement and GPU-cache recovery after context loss. See
`native-webgl-crowd-checks.json`. The measured workspace speedup is not a mobile
FPS promise; the A53 v5 recording is the regression baseline.

## Building-cache comparison in v7

**GPU building glow cache** retains static emissive work in GPU targets while
major moving beams/crown/mist continue through their authored native routines.
Subtle static-light flicker uses a lightweight shader approximation; disable the
cache to compare the full live pass. Snapshot contents rebuild when camera,
zoom/view size, LOD, decor/lamp state or sky-darkness bucket changes. Their total
residency is capped at 24MiB; excess buildings draw live. All targets release on
map changes and refresh after WebGL restoration.

First stand at the same point and record with the crowd cache on, switching only
the building cache. Then walk the same route in both variants. Compare
`world.timings.buildingsMs`, `stages.sceneSubmitMs`, `bufferBytes`, draw calls and
`world.buildingCache` hits/rasterizations/fallbacks/bytes. Stationary frames should
reuse targets; movement deliberately invalidates the camera-dependent artwork.
GPU rasterization counts are separate from `bakes`/`bakeOrigins`, which trace
asset creation or first image imports (including building-base/top/emissive/live
and other world contexts). Do not infer CPU Canvas repainting from imports alone.
See `native-webgl-building-checks.json` for fixed-viewport composition and cache
lifetime checks.

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

Canvas look enables all 63 switches. Three new controls default on:
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

## Veranda lighting and final color grade in v11

The original city art was already shared, but its final presentation differed.
Canvas paints apartment darkness only inside the map; the distant CityView
strip at negative Y keeps its own baked night shading. The native shader now
uses that same map boundary instead of darkening the city a second time. It
also respects the original 95% indoor darkness rather than capping it at 85%.

The native draw's early return previously skipped the original final CSS filter
chain. v11 restores its exposure, brightness, contrast, saturation, time-of-day
grade, stealth grayscale, night-vision grade, soda hue and memory effects. The
existing shared temperature/tint overlay and vignette settings remain in place.
**Final color grade / vision** toggles the final filter chain for comparisons;
Canvas look enables it. The profile includes the applied `colorGrade.filter`.
CSS filters work on the browser's composited WebGL canvas without per-frame
Canvas2D copies or uploads. Browser compositor work is outside Pixi's GPU timer
regions; compare recorded frame intervals when evaluating this switch on a phone.

[Grade checks](native-webgl-grade-checks.json) compare independently baked city
base/glow assets and the actual Canvas/native draw paths for presets, custom
sliders and vision/story transitions, plus browser-composited color-chart pixels
and shader map boundaries. This does not establish whole-frame pixel parity:
the daytime sunlight wash and remaining special effects still need migration.

## Entrance pads, daylight, glass and reflections in v12

Twelve new independent switches default on (63 switches total): Entrance pads,
Entrance labels, Daylight color / haze, Sun cast shadows, Cloud shadows, Window
daylight, Rain on glass, Wet roof highlights, Wet ground / puddles, Puddle ripples, Reflected lights,
and Reflected characters / vehicles. Canvas look enables all of them. The
original map transitions, interaction grid, weather and save state are reused.
Quiet entrances stay unmarked; nearby labels follow the original indoor/outdoor
placement. The pad shader approximates Canvas's blurred border without live blur.

Daylight's screen, soft-light, golden-hour haze and violet vignette calculations
are fused into the existing scene-lighting shader. Turning off Lighting still
allows testing Daylight independently. Sun cast shadows use the authored building
footprints, car hulls and swept tree canopies in a bounded GPU union mask; fire
can lift that mask locally. Original cloud-shadow painters use native geometry
and resident gradient targets. Window daylight adds the authored light cutouts
and colored projections. The distant veranda city retains v11's lighting boundary.

Rain on glass is a continuous shader interpretation for intact indoor windows
and sliding glass panels. It fades with weather wetness, clips to moving door
leaves, keeps droplets attached to the panel, skips shattered windows and the
apartment's open-air railing windows, and does not place rain in the door opening.
Wet roof highlights add subtle moving sheen on up to 48 authored roof planes,
attached to each building’s original roof ordering without another scene capture.
The batchable roof geometry shares one resident 16KiB GPU material tile.
This material layer remains available with the Reflections setting Off.
It does not add optical scene refraction or every landmark skylight effect.

Wet surfaces reuse authored roads, pavements, seeded puddle lobes, polished-floor
rectangles, rug cutouts and fountain water. No changing puddle bitmap is baked:
resident edge textures scale with wetness. Water ripples use their original
simulation and the wet mask. Reflected light includes lamps, vehicle lights,
shots, cached building emissives and a GPU snapshot of prepared room glows.
Detailed reflections reuse player targets, crowd atlas frames and live caster
textures; other visible bodies are captured from already prepared GPU geometry,
without calling their animation painter again. Reflected body alpha interrupts
reflected lights. Cars reuse their authored resident body art. Reflections stay
below people/vehicles and use GPU wet masks and animated horizontal shimmer.

The Reflections setting still applies: Off disables the wet/reflection group;
Medium uses quarter-resolution targets, High uses half-resolution targets, and
Ultra increases the detail target to full resolution up to 1536 pixels. Light
and mask targets are capped at 1024 pixels per dimension. Work is bounded to
12 detailed movers, 16 additional body targets, six body captures per frame at
a 45ms refresh interval, eight cached reflected buildings and 192 light stamps.
The sun mask is capped at 1024 pixels; up to 128 entrance pads and 96 glass
panels draw in a frame. These limits can omit distant reflection detail; counts
and dropped work are included in the report. Special live landmark beams,
detailed reflected foliage and mirror-floor furniture still need further polish.

Profiles include per-frame `surfaces` counts, CPU preparation, mask refreshes,
body captures, target bytes and drops; supported devices also get asynchronous
GPU samples labeled `surfaces`. Daylight's fused final pass is included in the
scene GPU sample. Browser CSS grading still runs outside these timer regions.

[Surface checks](native-webgl-surfaces-checks.json) cover entrance pulses and
transition-grid agreement, quiet entrances, floor ordering, daytime color against
the original Canvas painter, glass animation/open doors/shattering/drying,
polished-floor rug and fountain masks, shared and captured reflected bodies,
quality settings, unchanged simulation state, warmed upload/bake reuse, map
travel and context recovery. Tested daytime color error is below 0.4/255 mean
RGB and at most 2/255 in the chart fixture. This is not whole-scene pixel parity
or a phone benchmark.

For A53 testing, use Canvas look and Settings → Reflections → High. Record the
same rainy city view with all three wet/reflection layers on, then disable
Reflected characters / vehicles alone, then Reflected lights. Test Puddle
ripples separately when moving through water. Walk through the apartment's
sliding doors during rain and check the entrance pad when exiting. Compare
Daylight, Sun cast shadows, Cloud shadows and Window daylight in daytime.
