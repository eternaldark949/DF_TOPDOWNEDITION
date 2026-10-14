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

## How the new passes work

Wall visibility polygons and projected furniture/player/door footprints are
drawn into each light's own GPU render texture. Shadows therefore remove only
that light's contribution, and another light can still illuminate the area.
The caster's footprint is cut out of its projected shadow so its own surface
stays lit. Furniture/player shadows have finite reach; doors block to the edge
of the light. Geometry is quantized slightly to avoid subpixel cache churn.

Static light images are reused. Moving nearby geometry refreshes only affected
light images, using GPU geometry draws. There are no Canvas mask uploads or
WebGL-to-Canvas scene copies. Texture allocation/baking on first use is excluded
by warmup; new player poses or genuinely changed prop art can still require an
asset upload during gameplay. Small geometry buffers are updated during drawing
and are reported separately from bitmap uploads.

Room switches fade light strengths and emissive glows. The room veil follows
the original room visibility state. Glow sprites draw after scene lighting.
Decor animation uses prewarmed phase textures and GPU opacity changes. The
veranda's area lights use the authored rectangular falloff rather than circular
approximations. Lamp fixtures reuse asset variants. Door panels move as GPU
geometry, and door leaves participate in occlusion.

Bloom extracts bright pixels, blurs quarter-resolution GPU targets, and adds the
result to the original full-resolution scene. Atmosphere adds a mild amber wash,
vignette, and grain. These are visual approximations of the Canvas passes, not
a promise of identical pixels or guaranteed mobile FPS.

## Evidence and limits

`tools/test-native-webgl-layers-browser.cjs` checks every switch, sample resets,
stationary animated texture reuse, opaque walls, finite shadows, lit caster
surfaces, independent overlapping lights, grab hints, automatic recording,
recording cancellation/immutability, odd-size resize, and context recovery.
Cached render-texture pixels are explicitly invalidated after context loss.
Pixel readback is confined to tests.

Compare `native-webgl-canvas-look.png` with `native-webgl-canvas-reference.png`.
Both use the living-room camera and the same room-fade clock. The city backdrop
and daylight glass remain snapshots, player animation uses eight phases, and
shadow footprints approximate silhouettes. NPCs and advanced combat/cinematic
passes remain outside this apartment slice. Texture estimates exclude shared
filter-pool overhead and depth/stencil storage; CPU timings do not measure GPU
execution. Phone profiles are the basis for further performance decisions.
