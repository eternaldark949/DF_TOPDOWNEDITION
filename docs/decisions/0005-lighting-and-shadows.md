# Lighting — direct illumination, visibility and ownership

**Bloom update:** [decision 0012](0012-hdr-bloom.md) implements HDR multiscale bloom. Bloom limitations/plans below describe this earlier milestone.

Recorded 2026-10-16 after the owner approved the lighting/shadow work discussed alongside [ambient occlusion](0004-ambient-occlusion.md). This extends the retained **forward WebGL2 renderer**; it does not introduce deferred rendering or an external framework.

## Implemented capabilities

- Configurable directional light, ambient irradiance and eight retained point-light slots.
- One directional depth map with receiver-plane-corrected, four bilinear PCF taps (sixteen depth comparisons), texel-snapped light-space coverage, world-unit bias and filter settings.
- One optional selected point-light depth cube, filtered with four samples and receiver-plane comparisons. It occludes that light through actual resident geometry, including walls outside the camera view.
- Shadow caching: unchanged directional geometry/light coverage reuses its map; point cubes refresh on a separate rate budget. A moved light or different active world invalidates immediately.
- Existing analytic/screen AO remains an ambient-light visibility estimate. Cast shadows affect the corresponding direct-light term. Neither attenuates material emission.

The shadows of feet and nearby props now come from actual height/geometry, supported by AO. A separate screen-space contact-shadow ray marcher is **not** implemented. Neither are cascaded sun maps, area-light penumbras, multiple shadowed point lights, spotlights, clustered light selection, PBR materials, bloom or fog. These remain distinct future work, not hidden claims of this milestone.

## Source ownership and reading order

| Home | Source | Responsibility |
| --- | --- | --- |
| Basement | `lighting.js` | Ambient/directional/point data, validated public configuration and shadow capability ownership. |
| Basement | `shadow-math.js` | Sun and six cube-face projections; no GL or game dependencies. |
| Basement | `shadow-target.js` | One owned immutable depth texture/framebuffer, partial-failure cleanup. |
| Basement | `shadow-maps.js` | Active-world caster batch, depth passes, cache invalidation, point refresh budget, context/failure/cleanup. |
| Basement | `shadow-shaders.js` | Native instanced depth vertex shader and filtered per-light visibility. |
| Basement | `renderer.js`, `shaders.js` | Existing frame submission/material integration and explicit camera-versus-shadow instance packing. |
| Basement | `render-diagnostics.js` | CPU scope, shadow submissions/cache reuse, estimated texture storage and ownership/freshness captures. |
| Penthouse | `toys.js` | `castShadow` parameter on the existing box template. |
| Example | `worlds.js`, `scene.js`, `main.js`, `index.html` | Authored light directions/palettes and quality/local-shadow controls. |

Ambient and point arrays have **moved from Renderer into Lighting**. Callers now use `renderer.lighting.ambient`, `.positions` and `.colors`; there are no old-field compatibility aliases. The renderer owns submission, Lighting owns light data and shadow lifetimes. ETRNLNINE's composition root is unchanged.

No additional runtime loop, timer queue, Canvas preparation or game import was added. The point refresh clock is consulted by the existing renderer submission; it never schedules independent work.

## Public API and units

```js
const engine = new ETRNLNINE(canvas, {
  lighting: {
    directional: {
      direction: [-0.5, 0.8, 1.2], // receiver TO source, world axes; normalized on configuration
      color: [0.58, 0.49, 0.62],   // linear RGB irradiance
    },
    shadows: {
      mode: 'low',          // 'off' default; 'low' = 512² sun; 'high' = 1024²
      extent: 48,           // sun map half-extent, world units; not screen pixels
      bias: 0.02,           // receiver bias in world units
      normalBias: 0.025,    // receiver offset along surface normal, world units
      softness: 0.22,       // fixed filter spread, world units; not a physical source radius
      pointIndex: -1,       // -1 disables local shadows; select exactly one slot 0..7
      pointResolution: 256, // 128, 256 or 512 per cube face
      pointRefreshHz: 10,   // changed caster geometry refresh rate, 1..60 Hz
    },
  },
});
const light = engine.basement.renderer.lighting;
light.configureDirectional({ direction: [1, 0, 1], color: [0.5, 0.5, 0.7] });
light.setPoint(5, { position: [0, 2, 3], color: [0.3, 1.1, 2.7], radius: 10 });
light.configureShadows({ mode: 'high', pointIndex: 5 });
const report = light.inspect();
```

Configuration copies/validates direction/colors before mutation. Invalid patches leave previous settings intact. Color values must be finite in 0..32; point radius is 0..256 world units, with zero disabling the light. A point closer than the cube's 0.05-unit near plane is unshadowed. Direct light falloff remains the existing squared radius falloff and approximate normal response, not a physically calibrated lumen model.

`ambient`, `positions` (eight `[x,y,z,radius]` records) and `colors` (eight RGB records) are retained typed arrays for efficient per-world copies. Code writing directly to these arrays owns their validity. Use `configureDirectional` to preserve the normalized-direction contract rather than mutating its internal direction array.

A toy's `castShadow:false` removes it from depth passes but does not make it unlit or remove it from AO. The example crystal explicitly opts out of casting so its perpetual decorative spin does not invalidate every sun map. Ordinary walls, bodies, backpacks, foliage and props remain solid casters.

## Visibility, caching and contact quality

Camera culling is **not** reused as a shadow-caster list. One separate retained batch contains all eligible shapes in the active resident world, including offscreen blockers. The bounded capacity follows the supplied world batch's explicit capacity (2048 by default). Exceeding it fails explicitly; the renderer never silently drops a wall. This is a small-world scan, awaiting shared spatial queries for larger worlds, not a production large-world acceleration structure.

Caster records retain transforms/dimensions and zero unused material fields. Geometry/count changes increment their version; material recoloring does not invalidate depth. This avoids GPU uploads and shadow redraws for purely cosmetic changes. Sun invalidation also compares the complete light projection. Its x/y center snaps to map texels to reduce panning shimmer. Coverage outside the finite sun map is unshadowed; there are no cascades yet.

Filtered depth comparisons account for the receiver plane at the actual sampled texel. This prevents sloped surfaces from producing self-shadow speckling without relying on a large detached bias. Bias/normal offset remain configurable for geometry/precision extremes. Fixed-kernel PCF is a soft visibility approximation; it does not model distance-dependent area-light penumbras.

Point refreshes render all six faces from the same synchronous pose snapshot. There is no partially updated cube shared with presentation. A static cube is reused indefinitely; changed casters refresh at most `pointRefreshHz` times/second. Light position/radius/index changes and world transfers bypass this throttle. Light color changes do not redraw depth. Cached local shadows can therefore lag moving geometry by approximately one configured refresh interval (plus frame scheduling); `pointAgeMs` in captures exposes age.

Switching worlds replaces the borrowed caster batch and invalidates both maps before presentation. Disposing its source world batch removes the borrowed caster batch **immediately**, even if no further renderer frame runs. Shadow maps may retain renderer-owned depth storage for reuse, but never retain an unloaded World. Disabling shadows releases targets, programs and caster storage.

## Work and memory budgets

| Resource/work | Bound |
| --- | --- |
| Direct point-light slots | Eight |
| Directional shadow maps | One; 512² or 1024² |
| Shadowed point lights | One selected slot; six faces of 128²/256²/512² |
| Shadow geometry storage | One active-world batch; default 2048 × 48 bytes on CPU and GPU |
| Sun depth draws | Zero if reused, otherwise one per frame |
| Point depth draws | Zero if reused/throttled, otherwise six as one refresh group |
| Maximum shadow draws per frame | Seven, in addition to forward/AO work |

The caster buffer adds 98,304 requested GPU bytes and the same CPU storage at default capacity. It is included in renderer buffer totals, with owner `lighting.shadowCasters/<world-id>` in capture details. Directory's world-buffer totals remain a subset and must not be added twice.

Estimated depth storage budgets four bytes per depth24 texel, with actual driver padding/overhead unknown: low sun 1 MiB, high sun 4 MiB, and a 256² six-face cube 1.5 MiB. These are separate from requested GL buffer bytes, AO targets and excluded default framebuffer/MSAA storage. Standard WebGL2 depth formats require no float-color or third-party extension.

`renderer.shadows` records synchronous packing/depth submission CPU work. `renderer.shadowDraws` and `.shadowHits` report frame deltas; `.shadowTargets` reports estimated texture bytes. Detailed captures include map readiness, selected slot/resolutions, failures, caster owner/count/capacity/bytes, update counts and cube age. Optional renderer GPU timing encloses shadow/AO/forward submissions together. There is no production pixel readback or synchronous GPU completion wait.

## Failure and lifecycle

A failed depth target releases its partial GL objects and leaves the associated direct light unshadowed, with a readable reason in the example/profiler. Sun and local target failures are independent. Reconfiguration or context restoration permits retry; there is no hot allocation-failure retry loop. Context loss invalidates targets/programs while retained CPU batch storage supports restoration. Disposal is idempotent, including source-first and renderer-first cleanup.

The reusable engine defaults shadows **off**. The example opts into the lower-cost sun tier on all initial layouts; its point cube is opt-in through **World directory → Shadow the crystal light**. The menu also exposes **Cast shadows → Off / Soft / Fine**. These settings survive scene replacement/flitting because they belong to Lighting. No physical-phone performance claim is implied by the initial example policy.

## Verification

Run `npm test`, `npm run build`, `npm run test:browser`. [Lighting milestone evidence](../milestones/lighting/README.md) includes actual screenshots, controlled pixel comparisons and machine-readable results. Unit checks cover finite/atomic authoring, normalized directions, directional depth order, six cube projections, settings/storage budgets and partial allocation cleanup. Browser checks cover cast-shadow pixels, offscreen casters, caching, geometry/light changes, point throttling, world transfer, failure/disposal and context restoration.

The browser uses software WebGL and emulated touch. Its managed policy blocks file URLs; tests execute the unchanged self-contained HTML contents with Canvas 2D rejection guards and zero runtime network requests. Real-device speed, hardware timing and phone quality still need device testing.
