# HDR bloom · light that breathes

Implemented 2026-10-16 following the owner's green light after [perspective](0011-perspective-camera.md). This is native WebGL2 multiscale bloom on the shared forward renderer, not an imported image effect or a second renderer. The architectural aim remains crisp geometry with a soft, expansive luminous halo for Enni Cole. Volumetric fog, wet reflections and PBR materials remain separate work.

## Image pipeline

With bloom enabled, the forward material writes **linear RGBA16F radiance** before tone mapping. A multisampled colour/depth framebuffer preserves geometric edge coverage. Colour and depth resolve into textures. Thirteen-tap downsampling extracts bright samples using a soft knee, then builds six (Soft) or seven (Fine) bounded scales. A normalized nine-tap tent reconstruction mixes scales, retaining a bright core and broad low-frequency halo. Separate reduction/reconstruction targets avoid texture feedback.

The compositor adds bloom to scene radiance, applies exposure and exponential highlight rolloff, then gamma-encodes once for display. This retains the established tone curve; it does not claim an ACES implementation or exact Eevee equivalence. Bloom strength zero provides a matched HDR reference and skips pyramid submissions. Off releases optional resources and uses the original antialiased forward path, with the same configurable exposure. HDR and direct antialiased edges can differ slightly because radiance is resolved before nonlinear encoding in HDR.

The compositor restores resolved geometry depth into the default framebuffer. Editor grid/markers/rings render afterward, using their existing display colours and depth rules. They neither seed bloom nor enter shadow/AO/world membership. No extra geometry depth pass or guide-colour tone-map workaround is introduced. Resolved depth is per pixel; guide occlusion at antialiased silhouette edges is correspondingly per pixel rather than per covered sample.

## Ownership and source guide

- **Basement / `bloom-settings.js`:** atomic validation, pyramid dimensions and storage estimates.
- **Basement / `bloom-targets.js`:** transactional ownership of HDR textures, FBOs and MSAA renderbuffers; partial-failure cleanup.
- **Basement / `bloom-shaders.js`:** linear extraction, bounded spatial filters, reconstruction and final colour/depth composition.
- **Basement / `bloom.js`:** configuration, lazy programs/targets, ordered submissions, failure latch, diagnostics and lifecycle. No world references or scheduler.
- **Basement / renderer/material:** choose linear output only when HDR is actually ready, otherwise retain direct rendering. AO and shadow passes preserve their own resource ownership. Renderer restores normal framebuffer/depth state after exceptions.
- **Penthouse / `bloom-controls.js`:** a single parameterized UI template, injected host, renderer, error policy and Lobby subscription. Studio and the standalone Freelancer use the same widget.
- **Studio/game composition:** choose where the widget lives. View settings remain outside JSON/history/recovery and survive scene changes/Play in the same renderer. These settings are not currently persisted across page reloads or embedded as authored scene data.

ETRNLNINE remains a small root. Lobby alone schedules frames. No Canvas2D, image textures, runtime library, CDN, temporal history, production readback or GPU completion wait is added.

## Artist controls and API

In Studio open **View & guides → Bloom & exposure**. In Freelancer use **Bloom & exposure** below the game options. Both start Off so opening the build on a phone does not silently opt into HDR costs. Choose Soft or Fine to enable. Strength controls energy, Spread controls spatial reach, Threshold selects bright sources, and Exposure controls scene presentation. These are view settings, independent of the document. Freelancer’s Low power lighting choice also turns bloom Off; selecting another lighting tier does not re-enable it silently.

```js
const engine = new ETRNLNINE(canvas, {
  bloom: {
    mode: 'low',       // 'off', 'low' (Soft), 'high' (Fine); default off
    strength: 0.65,    // 0..3, additive radiance multiplier
    threshold: 1,     // 0..16, scene-linear peak RGB threshold
    knee: 0.6,        // 0..1, relative soft-transition width
    radius: 1.25,     // 0.5..3, coarse-level texels for tent reconstruction
    scatter: 0.8,     // 0..1, weight of broader scales
    exposure: 1.25,   // 0.05..8, multiplier before highlight rolloff
  },
});
engine.basement.renderer.bloom.configure({ strength: 0.85 });
const actual = engine.basement.renderer.bloom.inspect();
```

Parameters are finite and validated as one immutable candidate. Unknown keys throw. Artist parameter changes reuse targets/programs; quality/viewport changes replace targets. A higher threshold isolates emitters; a lower threshold lets more lit surfaces glow. Broad bloom can reduce local contrast if pushed too far: preserve geometry and make matched comparisons rather than using exposure changes to disguise results. The existing flat-material authored scene remains a blockout, not the final facade/interior material treatment.

## Capability, budgets and lifecycle

Requires WebGL2, `EXT_color_buffer_float`, and a common supported RGBA16F/depth24 MSAA count from 2–4. Without those, or on allocation/FBO/program failure, the capability releases partial resources and reports **Direct rendering** with the reason. It does not silently fall back to jagged HDR or pretend LDR blur is HDR bloom. Failure is latched until explicit configuration or context restoration; it never retries allocation every frame.

The scene target remains full backing resolution, bounded by the host's existing pixel-ratio cap. Soft caps the initial half-resolution bloom level at 512 pixels on the long edge, with at most six levels; Fine caps it at 1024, with at most seven. Later levels halve each dimension to at least one. At strength above zero, bloom uses **2N fullscreen submissions** (N reductions, N−1 reconstructions, one compositor) plus one MSAA colour/depth resolve. At zero strength only the compositor/resolve remain. This is an explicit capability/quality exercise, not a free effect or a phone-performance claim.

Storage estimates include RGBA16F at eight bytes/pixel, depth24 budgeted at four, scene MSAA samples, resolved colour/depth and both pyramid directions. Driver padding/default framebuffer storage are excluded. A 512×384 backing surface with 4× MSAA and Soft targets estimates about 12.25 MiB; the full-resolution scene dominates that budget. Fine controls bloom resolution, not scene pixel ratio. Full HDR at a large desktop viewport is substantially more expensive; quality selection is explicit.

Resize replaces targets while retaining programs. Off and disposal release every optional texture/FBO/renderbuffer/program. Context loss invalidates handles, and restore recreates lazily from settings. Repeated enable/disable, partial failure, empty scenes and thrown submissions preserve normal framebuffer/depth state. Rendering with no batch clears the default framebuffer without allocating a new HDR scene.

`renderer.bloom` is a bounded CPU profiler scope around target preparation and post submissions, excluding the forward material pass. `renderer.bloomTargets` estimates owned target bytes; `renderer.bloomPasses` counts post draws. Renderer draw totals include post and guide submissions, while geometry-instance counts retain their meaning. The existing optional GPU timer includes the complete render submission; CPU submission time is not GPU duration.

## Verification and next work

See [screenshots, measured pixels and lifecycle checks](../milestones/bloom/README.md). Use `npm test`, `npm run build`, `npm run test:bloom` and the existing runtime/editor regressions. Browser checks use software WebGL/emulated touch, not a physical-phone benchmark.

The next agreed engine capability remains scalable light storage/selection for 60–100 realtime contributing lights and about 1,900 authored lamps, with influence-volume spatial culling and independent shadow distance/importance/update budgets. Bloom does not expand the current eight-point authored schema or one-sun/one-point shadow budget. Further aesthetic work includes material response, actual atmosphere/fog, reflections and a reviewed 3D humanoid silhouette.
