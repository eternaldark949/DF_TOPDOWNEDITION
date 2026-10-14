# Shared dynamic lamp shadows — trial

Lamp occlusion now belongs to each lamp's own contribution to the lighting layer. A source's shadow mask is applied to both its darkness-cutting and colour passes. Other lamps and transient lights can illuminate that shadow instead of being darkened by a final humanoid-specific overlay. Ground contact and sun shadows are unchanged.

Humanoids, cars (including traffic and bumper cars), collidable furniture and Velvet register local caster shapes with `DynamicShadows.note(entity, shape)`. Supported shapes are circles, oriented boxes, local polygons (3–32 points), and optional captured humanoid silhouettes on High. Shape fields include `radius` or `width`/`depth`, centre offsets `dx`/`dy`, `elevation` and `opacity`. Polygon edits, movement, rotation and appearance changes invalidate relevant cached masks. A lamp may supply `elevation`; otherwise the stylized projection uses a common default height.

Wall/building visibility uses the existing spatial index. Closed room doors also reject lamp/caster pairs. Each caster receives its own source light; its unprojected body is removed from its cast before masks are combined. Casts from other entities can still overlap it.

The shared engine owns visibility, projection, silhouette captures, bounded caches and map lifecycle. Renderers no longer select the nearest two lamps or restore darkness after all sources have been combined. The integration currently covers `game.lamps`. Baked building-interior lights, headlights, neon, soft decor lights and fire lights retain their existing paths; they can fill a lamp shadow, but do not yet use the new caster contract themselves.

| Setting | Shadowed lamps per frame | Casters per lamp | Mask resolution cap | Shape |
|---|---:|---:|---:|---|
| Off | 0 | 0 | — | No dynamic lamp occlusion |
| Low | 8 | 12 | 128 px | Soft human/circle casts, oriented furniture/car hulls |
| High | 16 | 24 | 256 px | Captured humanoid silhouettes where available; hull fallback |
| Ultra | 32 | 32 | 256 px | Hull occlusion extended to the lamp's range |

Up to 256 visible casters register per frame, with a 24 MiB cap on lamp-mask caches. Budget exhaustion falls back to the lamp's normal static visibility without applying a stale mask. Stationary pairs reuse visibility and raster masks; moving entities and light sources re-plan only affected contributions. High limits captures to 16 per frame, normally refreshing moving silhouettes every 100 ms and stationary ones every second; facing and appearance changes invalidate them immediately. Cached crowd bodies use geometric fallback instead of forcing a live body capture.

`DynamicShadows.stats` reports caster/pair counts, blocked pairs, ray queries, mask builds/hits, captures and budget drops. Visibility is evaluated in the same render frame; there is no previous-frame caster list.

## Preview

The wall separates the orange lamp from the character. Cars now cast from the same lamp sources as humanoids.

| Before | Trial |
|---|---|
| ![Humanoid-only lamp shadows](before.png) | ![Shared wall-aware lamp shadows and car casts](after.png) |

## Validation and performance

The dependency-free game regressions cover walls, doors, source/caster movement, rotated boxes, polygon edits, all quality levels, resource budgets, removal, cache reuse and map resets. `tools/test-dynamic-shadows-browser.cjs` checks real pixels for overlapping-light conservation and self-shadow exclusion (requires Playwright and Chromium).

One warmed headless Chromium apartment sample (50 measured frames after 15 warmups) gave these full-scene timings:

| Renderer | Median | 90th percentile |
|---|---:|---:|
| Main before this trial | 21.0 ms | 23.3 ms |
| Shared pipeline, humanoid casters only | 19.4 ms | 20.9 ms |
| Shared pipeline, expanded caster coverage | 22.6 ms | 25.5 ms |

The expanded scene registered 56 casters and 59 source/caster pairs, reused eight masks, performed zero visibility queries/rebuilds in the sampled stationary frame, and used 1 MiB of mask cache. These are single-machine exploratory timings, not a claim of improved frame rate across devices or moving scenes. The shared pipeline reduced cost with comparable humanoid coverage in this sample; casting from more entities increased total work. Low's budgets keep that expansion bounded. Source test data is in `browser-checks.json`.
