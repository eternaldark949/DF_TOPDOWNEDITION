# Lighting investigation using the supplied save — October 19

This pass retains a bounded immutable cache for the unchanged static lighting base. The save remains private and is imported at runtime for local testing. Existing traffic, crossing, character and particle changes remain intact.

## What is cached

Only the original darkness fill and static interior/street-lamp shadow holes are cached, at the exact current light-buffer resolution and camera transform. There is no camera snapping, reduced light count or lower update frequency. Vehicle headlights, projectiles, fire, reflection lifting, light color, soft-shadow blur, final opacity, night vision and lightning still run through the original live paths.

The camera and static inputs must repeat before building the cache. Camera motion, viewport/scale changes, tint, lamp path/gradient identities, lamp intensities, selection/order, interior sprites and geometry revision invalidate it. Continuously changing lamp inputs use the ordinary path. Active room systems, unusual Canvas effects, unbaked lighting, buffers larger than 1,048,576 pixels, and unavailable/lost bitmap contexts also retain the ordinary path.

One OffscreenCanvas and one ImageBitmap are retained. The image is replaced/closed on refresh, and both resources are released on map change or game reset. The saved scene uses a 640×288 light buffer (184,320 pixels, about 0.7 MiB per RGBA surface). At the size limit each surface is at most 4 MiB; native browser backing-store overhead is additional. Cache creation failure falls back to the already painted original frame.

## Attribution and rejected prototypes

The expensive first lighting-layer copy includes work deferred from previous Canvas commands. Removing street-lamp shadow fills in an **unshipped diagnostic ablation** reduced a fixed-scene 60-frame lighting sample from a median 463.7 ms to 115.7 ms. Removing the same-size blur alone measured 392.3 ms. These ablations intentionally remove artwork; they are not production changes. They locate lamp-gradient/shadow rendering as important work paid at the later copy boundary.

Shared raster falloff patterns, nearest-sampled patterns, per-lamp mask canvases/bitmaps, clipped gradient rectangles and context-backend hints did not establish useful gains. Near-collinear shadow simplification changed pixels and was rejected. An ordinary mutable static-base canvas showed an isolated improvement but did not justify retention in complete-frame comparisons.

## Why the comparison method changed

The first three-pair separate-page immutable-cache test measured median 180-frame update/draw times of 6,841.5 vs 7,147.3 ms. However, an identical-build control differed by **16.38%** despite matching pixels/state. That variation is larger than the apparent 4.47% prototype regression. The separate-page timings cannot establish a small gain or regression.

The follow-up uses **one live browser renderer and the normal saved-game rAF loop**, randomly assigning the original or candidate lighting method per accepted frame. Physics, world state, other rendering, browser process and DOM remain shared. An identical-code control assigns the same original method to both labels. Detailed profiler timers stay off; warmup and result extraction are outside captures. This compares loop CPU time, not GPU completion or phone FPS.

| Same-renderer capture | Original-labelled mean loop CPU | Alternate-labelled mean loop CPU | Difference |
| --- | ---: | ---: | ---: |
| Identical-code control | 21.637 ms | 21.542 ms | 0.44% lower |
| Immutable cache | 21.660 ms | 20.801 ms | 3.97% lower |
| Immutable cache repeat | 23.386 ms | 22.332 ms | 4.51% lower |

These two small live captures support a modest held-camera CPU benefit. They do not establish a general city FPS improvement or a benefit while moving. Sample distributions, controls and limitations are recorded in `lighting-local.json`.

## Repeating local checks

`tools/bench-lighting-save.py` imports a caller-provided private save through the existing file input and slot UI. It preserves actual progression/settings; the save itself is not included in the repository. Density comes from the save; missing crowd detail/lamp-shadow options use the prior phone report (high/off), with resolution scale 1 and device preset off.

After normal loading, the tool controls update/draw scheduling, seeds randomness and disables persistent geometry memoization equally. Date-based animation is fixed. `performance.now()` is scoped to a deterministic animation clock during update/draw, while interval timing uses the real clock. This is necessary because the saved restricted-zone border animates from the monotonic clock. Otherwise its moving dashes make equivalent screenshots differ.

State hashes include progression, pedestrians, animation/cloth/hair and traffic. Image export and hashing occur outside measured intervals. Evidence records populations, camera motion and cache use. Scenarios cover held camera, walking, driving, apartment and daylight. Optional visual checks exercise lamp intensity/geometry, night vision, lightning, hard shadows, low lighting quality, half resolution and firelight. Driving uses the production car-entry method; controlled intervals use deterministic keyboard-state inputs. Separate-page timings require identical-build controls and are not sufficient evidence for small changes.

```sh
python tools/bench-lighting-save.py \
  --baseline /tmp/DF-before.html --candidate 'DFAB V8.html' \
  --save /path/to/private-save.json --output /tmp/DF-lighting.json \
  --scenarios held,walking,driving,indoor,day --runs 1 --frames 20 --images --visual-checks
node tools/test-lighting-base.cjs
```


The moving-input control measured 26.446 vs 26.034 ms (1.56% label difference); the candidate capture measured 30.716 vs 29.841 ms (2.85% lower). This is compatible with no observed moving-camera regression, but does not establish a moving-camera gain. Walking may also stop briefly against objects; cache eligibility remains based on the actual transform, not the requested input.

For the stronger live timing design, use the baseline build saved **before** this lighting change and the current lighting module:

```sh
python tools/bench-lighting-live.py --baseline /tmp/DF-before.html \
  --lighting-source src/engine/lighting.js --save /path/to/private-save.json \
  --output /tmp/DF-lighting-live.json
# Repeat with --walking for the moving-input control.
```

This specialized tool installs candidate lighting helpers into the same page and randomizes only `_renderLightingSystem` per accepted frame. It is not a generic comparison of unrelated full builds. It includes a same-original-method control, warmup, two held-camera candidate captures, raw frame samples, settings context and stopped-game/error checks. It restores the original loop/render method and closes the cache at the end.

Final verification: **131 automated cases passed**, including 91 broad game regressions with 1,363 assertions. Five saved-game state/image pairs and 40 additional lighting-effect image comparisons were exact. The normal-UI car/navigation/save-reload run passed 24 checks; all 14 compared save sections matched exactly and the original uploaded file remained unchanged. Context-failure, invalidation, bitmap ownership and map/reset-release checks passed. The live benchmark CLI also passed a short functional smoke run. Concurrent correctness-only timings are explicitly excluded from performance evidence. Build freshness and whitespace checks passed.
