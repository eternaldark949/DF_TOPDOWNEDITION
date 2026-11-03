# Foundation verification — 0.2.0, 2026-11-03

## Completed locally

- `node rewrite/tools/build.mjs` produced the single HTML artifact.
- `node rewrite/tools/build.mjs --check` verified exact source/artifact agreement.
- `node rewrite/tools/test-world.cjs` passed the original seven foundation scenarios
  and ten added spatial/physics/world-contract scenarios.
- `python rewrite/tools/test-browser.py` passed desktop and touch/rotation checks
  against the built HTML, with networking disabled and no attempted HTTP/HTTPS requests.
- `python rewrite/tools/test-world-browser.py` passed actual WebGL2 pixel, shadow,
  large-scene, and context-restoration checks on desktop and touch viewports.
- Real neutral-scene screenshots were inspected locally.

The ten added deterministic scenarios verify:

1. Spatial queries match a seeded brute-force oracle, including negative positions,
   multi-cell uniqueness, oversized objects, movement/removal, and safe address rejection.
2. One shared transform/geometry updates physical and projected bounds; materials/visibility
   invalidate buffers; parent-attached lights follow rotation/height and clean up with owners.
3. Canvas world callbacks cannot bypass a depth-aware scene, even if registered earlier.
4. Circle/box, rotated box/box, and circle/circle contacts use generic shape response.
5. Separated Z ranges permit an underpass; gravity lands another body on an elevated slab.
6. Unequal masses exchange elastic momentum correctly; kinematic motion pushes dynamics.
7. Sensors emit begin/stay/end without pushing; default masks accept a new category,
   while explicit exclusions suppress it.
8. Removal observers cannot resurrect an unregistered body through a retained transform.
9. A fast body is stopped by a thin wall; excessive safety work fails explicitly.
10. Ten thousand static bodies remain registered while local narrow checks stay below 20;
    a moderate zoomed-out view visits cells; unloading releases body/index/contact references.

The world browser checks read actual final image pixels. They verify that:

- A green elevated surface hides red ground emission, even when declared before it.
- Emission on the elevated surface still respects the same visibility rule.
- Material and visibility edits change output without manual mask/cache invalidation.
- An unchanged scene reuses its completed image without losing depth-correct pixels.
- Moving an ordinary opaque blocker changes source visibility on a ground receiver.
- More than 32 nearby shadow casters work without a small fixed uniform-array truncation.
- Nonzero-Z projection/inversion uses the same coordinate contract.
- Losing/restoring the actual WebGL context rebuilds the same scene correctly.
- The real stress control registers 10,000 additional bodies while visible mesh count stays local.

## Sparse-scene CPU measurements

`node rewrite/tools/bench-world.cjs rewrite/benchmark-world-local.json` records actual
registration and simulation costs in this workspace. The workload keeps 100 moving
circles constant while increasing sparse static boxes; five warmup steps precede
sixty measured steps. See the retained JSON for exact timings and runtime version.

| Static bodies | Moving bodies | Narrow checks / fixed step | Full static scan for final local query |
|---:|---:|---:|---|
| 1,000 | 100 | 400 | No |
| 10,000 | 100 | 400 | No |
| 25,000 | 100 | 400 | No |

The 400 checks include four solver passes for 100 local contacts. Setup was approximately
0.06, 0.43, and 0.94 seconds; mean fixed-step CPU cost was approximately 5.7, 7.4, and
5.3 ms respectively in this run. These numbers are observations, not thresholds or
proof that larger scenes are inherently faster. Runtime noise/warmup affects timings.

A first per-pixel blocker-loop shadow prototype passed geometry checks but was slow
under software WebGL. The retained implementation instead uses source depth cubemaps,
source-area scissoring, cached element meshes, and unchanged-frame image reuse. Its
camera/light correctness was rechecked after that replacement. No real-phone FPS
claim is made from headless software-rendering measurements.

## Limits and unverified behavior

Managed Chromium blocks direct `file://` navigation. Tests therefore load the exact built
HTML bytes into a page with networking disabled. Phone file-manager integration and
actual device/GPU performance remain unverified, as do Safari/Firefox behavior.

The GPU checks use opaque primitives and finite-resolution hard shadow maps. They are
not comprehensive visual regression coverage, and finite shadow-map sampling/bias can
produce aliases or small shadow offsets. No support claim is made for transparency,
material image textures, alpha-cutout sprites, bloom, reflections, or arbitrary meshes.

Physics is a linear 2.5D contact foundation with bounded substeps. It is not a full
angular rigid-body/joint solver or general continuous-collision implementation. Dense
clusters can require many real pair tests. Huge spatial queries can intentionally use
a bounded entry scan. Sparse benchmark results do not establish universal scalability.

The original game has not been changed or migrated. Its tests were not run for this
independent engine implementation. No equivalence claim is made for unported features.
