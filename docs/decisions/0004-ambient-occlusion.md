# Ambient occlusion — grounding the forward renderer

**Bloom update:** [decision 0012](0012-hdr-bloom.md) implements HDR multiscale bloom. Bloom limitations/plans below describe this earlier milestone.

**Perspective update:** [decision 0011](0011-perspective-camera.md) adds the shared perspective lens, depth-correct AO/picking/guides and complete pose restoration. Camera limitations below describe the earlier milestone.

**Subsequent lighting milestone:** [Lighting and shadow decisions](0005-lighting-and-shadows.md) supersede the original light-data ownership and shadow limitations below; those describe this earlier milestone.

Recorded 2026-10-15 after the owner approved ambient occlusion with a cheaper geometry tier and an optional screen-space quality tier. Extends [First Light](0001-first-light.md) and [Profiler](0003-profiler.md).

## Implemented rendering direction

The renderer remains **forward**, with retained instanced boxes and the browser's antialiased default framebuffer. Deferred rendering is not required for AO. Screen quality adds normal/depth and ambient-visibility passes before the forward material pass. This milestone implements **analytic box-proxy AO and SSAO**, not GTAO, baked lightmaps, indirect light transport or cast shadows.

Only the ambient irradiance term is attenuated, before exposure/gamma. Directional and point-light terms and material emission retain their original brightness. AO is bounded and combines the two estimates by their strongest occlusion, avoiding multiplication that would darken the same cavity twice. This preserves the soft visual direction while grounding adjoining surfaces.

Cast shadows, wall occlusion of direct lights, bloom, fog, PBR materials, arbitrary meshes and transparency remain separate work. AO does not establish those capabilities.

## Responsibilities and reading order

| Home | Source | Responsibility |
| --- | --- | --- |
| Basement | `ambient-occlusion.js` | Settings, active-world proxy selection, optional GPU targets/programs, pass submission, failure/restore/disposal. |
| Basement | `occlusion-shaders.js` | Analytic visibility, normal prepass, deterministic SSAO and shared camera reconstruction. |
| Basement | `gl-program.js` | Shared compile/link ownership and failure cleanup; replaces renderer-local compilation. |
| Basement | `shaders.js`, `renderer.js` | Ambient-only integration and existing retained forward draw path. |
| Basement | `render-diagnostics.js` | AO CPU scope, estimated target bytes and capture-time settings/capability/ownership counts. |
| Penthouse | `toys.js` | Optional analytic-blocker parameter on the existing box template. |
| Example | `main.js`, `index.html` | Quality selection, initial viewport policy and actual fallback status. |

No new scheduler, renderer bypass, game import, Canvas preparation or dependency is introduced. AO owns renderer-level resources; it borrows the current world/batch only during submission. Directory retains ownership of the world's instance buffers. The ETRNLNINE composition root does not grow.

## Quality tiers

**Off:** original lighting; no occlusion candidate scan, screen programs or targets. The shared forward shader retains a uniform-controlled AO branch.

**Geometry:** analytic approximation using at most twelve oriented box proxies from the current world, including geometry outside the viewport. Candidate selection scans the current world's boxes and ranks footprint/proximity to camera center, with stable insertion-order ties. Sub-floor slabs, very thin geometry and explicitly excluded shapes do not consume the budget. Retained typed arrays hold centers, half extents and precomputed yaw sine/cosine. The fragment shader estimates local hemisphere coverage from distance/orientation, rejects a box's own surface and limits aggregate darkening.

This is **not a baked AO solution or an exact box-solid-angle integral**. Selection is intentionally bounded: not every object contributes. Crossing the selection cutoff can change occlusion; there is no temporal blending of proxy membership yet. Large flat receiver surfaces still receive local contact estimates because evaluation occurs per fragment. Emissive objects may occlude ambient light around them while their own emission remains unaffected.

**Geometry + screen:** adds SSAO from visible normal/depth geometry. Eight directions and two world-space sample distances estimate nearby occlusion, with bias and range rejection. Four-tap depth/normal-aware upsampling prevents a foreground sample from indiscriminately darkening the background. Sampling is deterministic, with no noise textures, temporal history or reprojection. Missing offscreen/depth-hidden geometry cannot contribute through SSAO; analytic proxies provide a limited independent complement.

Screen-space shading can still miss tiny contacts or exhibit silhouette/disocclusion artifacts, especially at low target resolution. This implementation does not claim GTAO quality or equivalence to Blender Eevee. It establishes a measurable, replaceable engine capability.

## Settings and editing

```js
// Engine defaults: target-free geometry AO. Profiling remains separately opt-in.
const engine = new ETRNLNINE(canvas, {
  occlusion: {
    mode: 'geometry',       // 'off', 'geometry', 'screen'
    strength: 0.7,          // 0..1, dimensionless; 0 disables AO work
    radius: 1.25,           // 0.1..4 world units, not pixels
    resolutionScale: 0.5,  // 0.25..1 of backing resolution
    maxDimension: 768,     // integer 64..1024, longest target edge
  },
});
engine.basement.renderer.occlusion.configure({ mode: 'screen', strength: 0.6 });
const report = engine.basement.renderer.occlusion.inspect();
```

Invalid settings throw before changing current settings. A shape can opt out of analytic selection with `ambientBlocker:false`; the box template exposes the same parameter. This does not remove the shape from the depth prepass or disable receiving AO.

Open **World directory → Ambient occlusion** in the example. It starts with Geometry on initial viewports at most 650 CSS pixels wide, and Geometry + screen on wider layouts. This is an explicit example policy, not device benchmarking or engine feature detection. Changing viewport size does not override a user's selection. Settings survive New scene and flitting because the renderer owns them.

Adjust overall strength/radius through settings, not duplicated game-specific shader constants. Hemisphere coverage, bias and sample distribution are documented in `occlusion-shaders.js`. If projection changes, update shared reconstruction to match `shaders.js` and verify pixel results.

## Work, storage and lifecycle

Geometry uses one existing forward draw, twelve proxy slots and **480 bytes** of typed proxy storage (two Float32 arrays and one Float64 ranking array). Candidate enumeration is a small-world scan, not the planned shared spatial grid. Fragment work is bounded by the number of selected proxies. There is no claim of zero cost or verified phone frame rate.

Screen mode uses three draws: instanced depth/normals, a vertex-ID fullscreen triangle, then the antialiased forward draw. It reuses synchronized instance buffers; the second geometry submission does not force a second upload. Normal RGBA8, depth24 and AO R8 textures use standard WebGL2 formats without float-color extensions. Two framebuffers and two additional programs belong solely to AO. At half resolution and a 768-pixel cap, work/storage stay bounded regardless of a large display.

Estimated target storage is **9 bytes per target pixel**, budgeting four bytes for depth24 padding. This is an estimate, not measured GPU memory; actual depth padding/driver overhead is unknown. Target bytes are separate from requested instance-buffer bytes, and default framebuffer/MSAA storage remains excluded. For 1440×1000 backing pixels, 720×500 targets budget 3,240,000 bytes (3.09 MiB).

Resizing replaces only viewport-dependent textures/framebuffers and retains compiled programs. Leaving screen mode or setting strength to zero releases its targets/programs. Repeated unchanged frames reuse resources. An unsupported/incomplete target falls back to geometry AO, releases partial resources and reports a reason. It retries only after explicit configuration or context restoration, preventing an allocation failure loop.

Context loss invalidates handles; restoration recreates renderer/batch resources and lazily recreates AO on the next draw. Disposal clears programs/targets/proxy arrays and follows the same renderer lifetime as its other foundational capabilities.

`renderer.ambientOcclusion` measures synchronous CPU selection/pass submission. `renderer.aoTargets` reports estimated texture bytes; `renderer.aoBlockers` reports selected proxies. Capture-time renderer details include settings/effective tier, blocker budget/candidates, target dimensions, texture/framebuffer counts and failure reason. Optional renderer GPU timing encloses all three submissions, without synchronous production readback or waiting.

## Verification

Run `npm test`, `npm run build` and `npm run test:browser`. See [AO screenshots and measured results](../milestones/ambient-occlusion/README.md). Browser tests read pixels only in isolated test fixtures to verify both tiers affect neighboring surfaces and direct/emissive lighting is unchanged with zero ambient light. They also verify repeated tier changes, bounded targets, framebuffer fallback and screen-target context recreation.

Software WebGL and emulated touch establish correctness here, not physical-phone performance or hardware timing accuracy. The managed browser blocks file URLs; built self-contained HTML contents are exercised directly with Canvas 2D rejection guards and zero runtime network requests.
