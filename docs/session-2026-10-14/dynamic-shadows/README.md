# Shared dynamic light shadows — trial

Lamp occlusion now belongs to each lamp's own contribution to the lighting layer. A source's shadow mask is applied to both its darkness-cutting and colour passes. Other lamps and transient lights can illuminate that shadow instead of being darkened by a final humanoid-specific overlay. Ground contact and sun shadows are unchanged.

Humanoids, cars (including traffic and bumper cars), collidable furniture and Velvet register local caster shapes with `DynamicShadows.note(entity, shape)`. Supported shapes are circles, oriented boxes, local polygons (3–32 points), and optional captured humanoid silhouettes on High. Shape fields include `radius` or `width`/`depth`, centre offsets `dx`/`dy`, `elevation` and `opacity`. Polygon edits, movement, rotation and appearance changes invalidate relevant cached masks. A lamp may supply `elevation`; otherwise the stylized projection uses a common default height.

Wall/building visibility uses the existing spatial index. Rotated caster footprints occupy every intersected grid cell. Door leaves cast at their actual hinged or sliding pose: opaque leaves block light, sliding glass transmits it (default opacity 0.35), retracted leaves and arches cast nothing. Door materials can set `shadowOpacity` and `shadowElevation`. Each caster receives its own source light; its unprojected body is removed from its cast before masks are combined. Casts from other entities can still overlap it.

The shared engine owns visibility, projection, silhouette captures, bounded caches and map lifecycle. Renderers no longer select the nearest two lamps or restore darkness after all sources have been combined. The integration covers standard lamps, baked building-interior lights, headlights and their spill, soft decor/area lights, neon, fireballs/trails, projectiles, muzzle flashes, medbay/vending glows and vehicle underglow. Adapters preserve each source's authored falloff, colour, flicker and static clipping. Headlights use a cone filter and tight rectangular buffers; fire and beams share identical hole/colour bitmaps. Interior lights retain their baked wall visibility. Source owners are excluded from their own casts. Sun/daylight/window projections and special club beams retain their separate paths.

| Setting | Total shadowed sources | Standard lamps | Per other family | Casters per source | Mask cap |
|---|---:|---:|---:|---:|---:|
| Off | 0 | 0 | 0 | 0 | — |
| Low | 24 | 8 | 4 | 12 | 128 px |
| High | 48 | 16 | 8 | 24 | 256 px |
| Ultra | 80 | 32 | 12 | 32 | 256 px |
| Gamma (experimental) | 48 | 16 | 8 | 24 | 256 px |
| Beta (experimental) | 128 | 48 | 20 | 48 | 512 px |

High can capture humanoid silhouettes; other qualities use projected hulls. Ordinary elevated lights use nominal 90 px / 120 px casts on Low / High. Door leaves, Ultra casts and sources below a caster's height can block toward the source's light edge.
Up to 256 visible casters register per frame, with a 24 MiB cap on lamp-mask caches. Budget exhaustion falls back to the lamp's normal static visibility without applying a stale mask. Stationary pairs reuse visibility and raster masks; moving entities and light sources re-plan only affected contributions. High limits captures to 16 per frame, normally refreshing moving silhouettes every 100 ms and stationary ones every second; facing and appearance changes invalidate them immediately. Cached crowd bodies use geometric fallback instead of forcing a live body capture.

`DynamicShadows.stats` reports source/door/caster/pair counts, blocked pairs, ray queries, mask builds/hits, captures and budget drops. Visibility is evaluated in the same render frame; there is no previous-frame caster list.

## Preview

The wall separates the orange lamp from the character. Cars now cast from the same lamp sources as humanoids.

| Before | Trial |
|---|---|
| ![Humanoid-only lamp shadows](before.png) | ![Shared wall-aware lamp shadows and car casts](after.png) |

## Validation and performance

The dependency-free game regressions cover walls, doors, source/caster movement, rotated boxes, polygon edits, all quality levels, resource budgets, removal, cache reuse and map resets. `tools/test-dynamic-shadows-browser.cjs` checks real pixels for overlapping-light conservation, self-shadow exclusion, rotating doors, glass transmission, sliding retraction and headlight cone filtering (requires Playwright and Chromium).

Before adding doors and the additional source families, one warmed headless Chromium apartment sample (50 measured frames after 15 warmups) gave these full-scene timings:

| Renderer | Median | 90th percentile |
|---|---:|---:|
| Main before this trial | 21.0 ms | 23.3 ms |
| Shared pipeline, humanoid casters only | 19.4 ms | 20.9 ms |
| Shared pipeline, expanded caster coverage | 22.6 ms | 25.5 ms |

The expanded scene registered 56 casters and 59 source/caster pairs, reused eight masks, performed zero visibility queries/rebuilds in the sampled stationary frame, and used 1 MiB of mask cache. These are single-machine exploratory timings, not a claim of improved frame rate across devices or moving scenes. The shared pipeline reduced cost with comparable humanoid coverage in this sample; casting from more entities increased total work. Low's budgets keep that expansion bounded. Source test data is in `browser-checks.json`.

The extension passes 96 dependency-free regressions (1,373 assertions). Real browser results are in `extended-browser-checks.json`: closed door shadow alpha 255, swung clear 164, glass 195 and fully retracted 164. A real headlight adapter pairs an in-cone caster and skips an off-axis one, using a 30,000-byte buffer. These fixtures verify rendering behaviour; the earlier timing sample does not benchmark this extension.

## Experimental Beta option

Select **Light Shadows → Beta** in settings. Beta is opt-in and saved per device; Low remains the default. It doubles Ultra's maximum mask resolution and sample density, raises source/caster budgets, and retains full-range geometric casts and the 24 MiB cache ceiling. High remains the captured-humanoid-silhouette mode. Beta uses hulls, as Ultra does. This is a higher-cost quality experiment, not a new 3D lighting model.

The renderer draws scene artwork once and accumulates per-source contributions into a Canvas 2D light layer, using darkness removal and additive colour. Each source has its own shadow mask and cached visibility. It is 2D light compositing, neither a full scene redraw per lamp nor a deferred G-buffer renderer.

## Experimental Gamma: High with a tiled GPU resolve

Select **Light Shadows → GAMMA (EXPERIMENTAL)**. Gamma copies High's budgets, 120 px nominal cast reach, mask density/resolution and humanoid silhouette capture policy. It changes light compositing rather than caster shape quality.

High's cached shadowed hole/colour sprites are uploaded to a bounded, padded atlas. Screen tiles (32 px) list only overlapping contributions. One fullscreen WebGL2 draw evaluates those lists, multiplies hole transmission, applies the room veil and adds coloured light. There is no scene redraw for each light. Static/unshadowed and special light paths remain Canvas inputs to the resolve. Shadow preparation, uploads, the existing optional soft blur and final scene compositing remain separate work: “one pass” means one GPU lighting resolve, not one draw for the whole frame or GPU-generated shadow maps. This is a 2D deferred-style resolve, without a depth/normal/material G-buffer.

Stable sprites stay resident and changing sprites alone are refreshed. At most 96 contributions enter the resolve; atlas or transform limits leave that contribution on its normal High path. The usual 24 MiB CPU mask budget still applies. The GPU atlas adds approximately 24.4 MiB on typical devices, plus three light-layer textures and the output surface. WebGL2 absence, context loss or GPU errors use High compositing. Map/quality switches release atlas source references. Low stays the default; Gamma persists per device.

Real Chromium fixtures verify one GPU draw, overlapping light conservation, room veil ordering, matching High within small 8-bit rounding differences, zero warm mask uploads and unavailable-WebGL fallback. An apartment frame also resolves in one draw with cached source masks. Results are in `gamma-browser-checks.json`. These are correctness/cache checks, not evidence of improved frame rate: Canvas-to-GPU uploads/readback and the light-layer size can offset batching gains, especially on software GPUs. `GammaShadows.stats` exposes backend, draw/upload/contribution counts and maximum contributions per tile.

### Profiler status

Settings → Developer → Profiler → Full shows a **Shadow renderer** section. Gamma reports **WebGL2 active**, **High fallback — WebGL2 inactive**, or **Gamma idle — no lighting pass**, plus resolves/frame, contributions, mask uploads/frame and maximum contributions per tile. It reads existing counters every 15 profiler frames without probing or timing the GPU. Zero uploads is normal for cached masks. Frame stamps prevent an earlier successful pass from being shown as active during an unlit frame. Other shadow modes show Canvas 2D or Shadows off.
