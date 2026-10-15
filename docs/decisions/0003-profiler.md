# Engine profiler — measurements belong in the foundation

Recorded 2026-10-15 after the owner approved integrating the profiler before expanding spatial/motion systems. This extends [First Light](0001-first-light.md) and [Between Worlds](0002-between-worlds.md).

## Implemented responsibility map

| Home | Source | Responsibility |
| --- | --- | --- |
| Basement | `profiler.js` | Fixed-capacity frame history, synchronous nested scopes, numeric counters, summaries, immutable diagnostic captures and export. |
| Basement | `profile-data.js` | Bounded JSON-like copying, capture freezing, percentile math. |
| Basement | `gpu-timer.js` | Optional asynchronous WebGL timer queries, bounded query pool and disjoint/context-loss handling. |
| Basement | `render-diagnostics.js`, `renderer.js` | Rendering/culling/upload deltas, requested buffer accounting and renderer-owned GPU timing. |
| Lobby | `runtime-diagnostics.js`, `runtime.js` | Phase/named-callback measurements, fixed-step/drop/pause counters, start/end recording boundaries. |
| Lobby | `preparation.js` | Named measurements for actual preparation chunks in the existing frame loop. |
| Directory | `diagnostics.js`, `directory.js` | Live worlds/entities/leases/state accounting and explicitly named resource owners. |
| Penthouse | `profiler-view.js`, `profiler-style.js` | Reusable accessible HTML/SVG viewer, controls, history chart and downloadable JSON. |
| Example | `main.js`, `scene.js`, `worlds.js`, `journey.js` | Opt in, place/subscribe the viewer, label game work and supply resource owner names. |

ETRNLNINE only connects the capability to Lobby and Directory. The engine never imports the game to obtain labels or counters. The viewer receives a subscription function instead of importing Lobby or creating another loop. Closing/disposal removes that subscription.

## Read measurements correctly

- **Frame interval:** the raw time between animation-frame callbacks, in milliseconds. It includes browser scheduling, GPU/back-pressure effects, other page work and time outside the measured callback. The first callback after start/pause/resume has no interval sample.
- **CPU frame work:** measured work from the beginning of the runtime frame through end-of-frame counter collection. It includes instrumented synchronous GL API submission and any time those calls block. It does not establish when GPU work completed.
- **Inclusive scope time:** includes nested scopes. **Self time:** subtracts measured children. Inclusive rows must not be added as independent costs. Repeated fixed steps accumulate calls and time in the same frame.
- **Unscoped CPU:** CPU frame work outside completed top-level scopes, including bookkeeping and provider baselines. This is an attribution remainder, not a guessed subsystem.
- **GPU render time:** an optional delayed query result for renderer clear/draw submission, attached to its original recorded frame. It excludes separate destination preparation uploads and other GPU activity outside the queried region. Unsupported/pending/invalid results remain unavailable, never zero.
- **Collection time:** the end-of-frame scalar-provider sample window. It is included in measured CPU work. It is not a complete isolated estimate of all profiling overhead.
- **Capture/export:** on-demand copying/formatting is outside the recorded frame body; last capture/export durations are measured separately. Their cost can affect later frame intervals. The export duration is available after export through summary statistics; the JSON being written contains the previous completed export duration. Viewer work is a named callback while open and is included in its enclosing render phase.

The history provides nearest-rank p50/p95/worst CPU/interval values, completed GPU summaries, named scopes and per-frame counters. Browser clock resolution and display rounding can make small nonzero costs appear as 0.00 ms. It can identify attribution and correlation, not prove the root cause of every browser/driver stall. Cold engine constructor/shader initialization before runtime starts, browser layout outside callbacks, unregistered work and actual heap/driver memory are outside this first profiler's full attribution.

## Storage and overhead budgets

Defaults at engine construction:

| Storage | Limit |
| --- | --- |
| Retained frames | 120 slots, reused in a ring |
| Static scope names | 32, numeric handles after registration |
| Counter names | 48, with explicit units |
| Timeline spans per frame | 96; overflow is reported, aggregate scope timing continues |
| Nested scope depth | 16; excess scopes return a disabled token and increment an overflow count |
| Reporting providers | 8 |
| Saved captures | 2, oldest replaced |
| Provider capture data | One shared 1,024-node budget; 64 entries per collection; six levels; 256-character strings |
| GPU query objects | At most 4, allocated only when timing is enabled and a recorded render begins |

Default typed history/stack storage is **492,032 bytes** (480.5 KiB), allocated up front to avoid per-frame recording allocation. This is not total profiler heap usage: summaries, bounded captures, DOM and export blobs have additional storage. The viewer keeps at most one download URL alive and revokes it on replacement/disposal. Capture JSON text is reformatted only when the capture changes.

Recorded frame/scopes/counters reuse typed arrays and static handles. Summaries, sorting, JSON copying and DOM rows are on-demand work. The open viewer refreshes at most twice a second by default; closed viewers unsubscribe and do no scheduled view work. A live recording can contain 119 completed slots plus the current active slot while the viewer samples it; all 120 completed slots are available between frames.

Profiling is **off by default for the engine**. The example explicitly enables it for this milestone. Disabled/frozen frame and scope recording makes no profiler clock reads, no provider sampling and no history writes. Small instrumentation branches and existing non-profiler engine counters remain; this is not a claim of literally zero CPU cost. Open viewer work is independent of recorder enablement. No real-device overhead percentage is claimed.

Freezing history or stopping recording does not pause the game. Changing recording configuration is a between-frames operation. Provider errors are isolated/counted so a faulty report does not stop gameplay, including non-Error thrown values. Constructor failure from an undersized registry budget releases already-created GL handles and input listeners through the same ownership boundaries. Incorrect manual scope nesting remains a programming error; use finally and synchronous scopes.

## CPU scope and counter API

Register stable names once, such as at subsystem construction. Do not register one name per actor, frame or world instance; the registry is deliberately bounded and handles remain stable through scene replacement.

```js
const profiler = engine.basement.profiler;
const movement = profiler.scope('game.movement');
const candidates = profiler.counter('game.queryCandidates', 'count');

// Inside a synchronous scheduled update:
const token = profiler.begin(movement);
try {
  // Run movement/query work here.
  profiler.set(candidates, candidateCount);
} finally {
  profiler.end(token); // A disabled token is safely ignored.
}
```

Do not leave a scope open across await. Time actual synchronous chunks or use suitable explicit counters for asynchronous task state.

Lobby also accepts a static label on registrations:

```js
const remove = engine.lobby.on('update', update, 'game.update');
// Put remove() in the subsystem's Lifetime.
```

The recorder measures preparation, input, simulation boundaries, fixed updates and rendering. The example additionally names device sampling, each realm's construction chunks, transfer commits, locomotion, status/HUD updates and presentation.

## Providers and ownership

Providers can supply a baseline callback, scalar sampling, lightweight viewer status, on-configuration handling and detailed capture data. Register through `profiler.provider(name, callbacks)` and own its returned remover. Providers must be cheap and synchronous; bounded output copying cannot preempt an expensive provider callback itself.

Directory leases accept `acquire(key, factory, { owner: 'descriptive-owner' })`. Counts combine shared owners correctly and decrement on release. The example labels each batch by realm/world. Captures show bounded world/resource/residency rows, owner counts, buffer sizes and limits. They never copy live World, DOM, GL or class instances. Capture copying omits accessors, detects cycles and truncates oversize data.

Renderer counters use cumulative-work baselines at frame start, so preparation uploads remain counted even when later presentation resets the older last-draw stats. Registered counts include draws, submitted instances, visible candidates/culled shapes, uploads/bytes, live GL handles, CPU instance buffers, requested GL buffer bytes, preparation work, fixed steps/dropped time, worlds/entities/leases and saved-state bytes. Future spatial systems can use the same API; this does not claim that full spatial grids/queries are already implemented.

**Memory accounting limits:** renderer GL buffer sizes are requested allocation sizes, not measured driver memory. Default framebuffer/antialias storage, compiled program storage, browser heap and runtime object overhead are excluded. Directory's owned buffer bytes describe a subset of renderer totals; do not add both as independent allocations.

## GPU timing behavior

The backend checks `EXT_disjoint_timer_query_webgl2`. Timing is opt-in and unavailable controls are visibly disabled. It starts/ends queries only around recorded renderer submissions, polls `QUERY_RESULT_AVAILABLE`, and reads results only when available. It never calls finish, performs pixel readback, or waits for a full query pool: saturation skips timing and counts it.

GPU disjoint events invalidate pending timings. Context loss invalidates query handles; restoration reacquires capability. Freeze/disable/disposal releases pending query objects without blocking. Late results are attached only to their original still-retained frame. Expired results are discarded/counted. Captures are immutable: a GPU result that arrives after capture does not rewrite that capture.

## Viewer, captures and export

Open **Engine profiler** in the example. It is a registered `tool.profiler`, instantiated independently of game scene lifetime. It survives New scene while old scene resources and subscriptions are released.

- **Record** controls recording, independently of simulation.
- **Freeze history** lets you inspect a stable history while the game runs.
- **GPU timing** enables optional asynchronous timing when supported.
- **Frame counters** expands all registered frame values, including future custom counters.
- **Capture latest / Capture worst** saves immutable scope timings, ordered spans, frame counters and current provider ownership data.
- **Arm next spike** captures once when interval exceeds 50 ms or CPU frame work exceeds 16.67 ms, then disarms. Thresholds can be changed through the public armSpike API.
- **Export JSON** downloads the summary, history chart and retained detailed captures. No server or external storage is involved.

Historical timing/counters belong to the selected frame. Provider owner details are explicitly labeled **current state at capture time**, not reconstructed historical world state. The profiler does not retain a live world per history slot. A profiler frame capture is a diagnostic record; it is not GRecorder game-state replay.

A reusable viewer is created through Directory with a profiler, host element and a caller-supplied subscription function. Its UI names/IDs are local to its instance. Source/stylesheet comments describe placement and editing points. A game may register measurements without instantiating any viewer.

## Verification and limits

Use npm test, npm run build and npm run test:browser. Tests cover controlled timing math, percentiles, ring expiry, budgets, disabled clock behavior, frozen-game independence, scope failures, provider isolation, bounded immutable captures, resource ownership, actual upload accounting and query lifetimes. A fake GL boundary verifies that unavailable results are never read and disjoint results are discarded. Browser checks separately exercise the actual renderer capability/fallback, viewer controls, JSON download, portrait layout and repeated viewer disposal.

See [profiler milestone evidence](../milestones/profiler/README.md). As before, browser checks use software WebGL and emulated touch. Direct file navigation is blocked in this managed browser; the built offline HTML contents are exercised directly with zero runtime network requests. Physical phone performance, physical gamepad behavior and real-hardware GPU timing accuracy remain unverified.
