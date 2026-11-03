# Foundation verification — 2026-11-03

## Completed locally

- `node rewrite/tools/build.mjs` generated the standalone HTML.
- `node rewrite/tools/build.mjs --check` verified exact source/artifact agreement.
- `node rewrite/tools/test-foundation.cjs` passed seven behavior scenarios.
- `python rewrite/tools/test-browser.py` passed desktop and touch Chromium scenarios
  with networking disabled and zero attempted HTTP/HTTPS requests or page errors.
- Desktop and phone/landscape screenshots were inspected as local evidence.

The seven deterministic scenarios cover:

1. Inert construction, duplicate-safe start, cancellation of request ID zero, and restart baseline.
2. Exactly 60 simulation updates over one second at simulated 30, 60, 120, and 144 Hz display rates.
3. Independent pause owners, continued rendering while paused, visibility suspension, and return without catch-up.
4. Bounded long-frame catch-up, recorded discarded time, and FPS based on raw elapsed duration.
5. Render order, world camera transforms, CSS-to-world conversion, pixel-density cap, resize, brush batching, and queue clearing.
6. Live Directory/engine references, Penthouse lifecycle and duplicate protection, input clearing, pointer coordinates, and listener cleanup.
7. Invalid setting rejection, Canvas state restoration after a throwing pass, and loop termination on failure.

Real Chromium checks cover a rendered cream marker pixel, backing pixel density,
responsive layout, visible start/stop/pause/resume controls, continued paused rendering,
stopped frame counts, keyboard movement, mouse placement, touch placement, camera zoom,
resize/rotation, feature removal, and engine destruction.

## Limits

Managed Chromium blocks `file://` navigation. Browser tests therefore load the exact
built HTML bytes directly into a page with networking disabled. This verifies standalone
execution and absence of external runtime requests, but does not test opening a file
through the owner's phone file manager. Actual phone browser performance, app-specific
file restrictions, and non-Chromium browsers remain unverified.

Canvas recorder tests establish ordering and API behavior, not pixel equivalence.
The browser pixel check verifies a visible marker, not every frame's visual correctness.
Profiler frame cost is synchronous CPU-side work, not GPU completion time.

The original game has not been migrated or modified. Its tests were not run for this
independent foundation. No equivalence claim is made for unported game features.
