# Incremental spatial work

The native world owns one persistent `spatialGrid`. Ordinary simulation steps preserve that index. A world clear or snapshot replacement is an explicit lifecycle operation.

## Changes

- Body collision, render and light bounds cache the actual pose and immutable shape that produced them. Unchanged poses reuse those bounds. Configuration changes preserve shape references when geometry did not change.
- Index synchronization checks pose, shape and sweep state before requesting bounds or touching the grid. A stationary body is not expanded to its circumradius and then shrunk again each frame.
- Entries retain integer cell ranges. Bounds changes inside the same range create no membership changes. Crossing a boundary updates only entering/leaving strips; cells shared by both ranges retain their existing membership.
- Queries traverse cell coordinates directly, without allocating an array of every cell key. Segment/sweep queries retain corridor traversal and deduplication.
- The native broadphase reuses its candidate-pair result while the shared index and physical candidate inputs remain valid. Exact contact detection/response and begin/stay/end events continue using current state.
- Stationary mounts reuse their prescribed pose when parent pose, velocity, local placement and effective activity are unchanged. Parent movement, activity and local-pose changes propagate normally.
- Identity operations on zero motion avoid needless force/damping/integration work and previous-pose array allocations. Motors, forces, gravity, nonzero damping, constraints, lifetime and gameplay clocks retain their normal behavior.

Candidate validity includes collision masks/groups/exclusions, physical type, activation, mounting, current collision pose and previous/swept pose. Tracking the collision pose is essential: a large light/render extent can keep an index entry unchanged while a collider rotates or moves inside it. Dropping the previous frame's sweep also invalidates candidate reuse. Same-cell movement still changes bounds/revision even when cell membership stays unchanged.

These derived caches live inside Basement on canonical body records or the broadphase. Spatial queries use the world's sole index. Saves contain authoritative body/component state and rebuild derived caches when loaded. Returned bounds are detached copies.

The simulation still visits bodies to advance controllers and physical policies. Real movement, rotation, shape changes, lifecycle changes and physical contacts require work. Dense real overlaps can still produce a quadratic number of necessary pairs. This optimization does not promise zero work for a populated moving scene or migrate the remaining legacy city indexes.

## Diagnostics

`physics.getStatistics()` returns cumulative counters. Compare snapshots over a measured interval.

| Counter | Meaning |
|---|---|
| `spatial_sync_requests` | Internal requests to synchronize a canonical record |
| `spatial_sync_skips` | Requests that reuse unchanged indexed geometry |
| `bounds_calculations` | Body collision/render/light bounds computed for a changed shape/pose or first request |
| `swept_bounds_calculations` | Conservative motion envelopes constructed for changed motion |
| `attachment_placements` | Mount transforms actually recomputed |
| `broadphase_builds` / `broadphase_reuses` | Candidate generation versus reuse |
| `spatial.updates` | Actual stored entry-bounds changes |
| `spatial.membership_changes` | Per-entry registration, cell-range change or removal operations |
| `spatial.cell_additions` / `spatial.cell_removals` | Actual entry-to-cell insertions/removals, including lifecycle clear |
| `spatial.query_cells` | Cell lookups performed by queries |
| `spatial.candidate_visits` | Deduplicated entries visited by queries |

`spatialGrid.revision` changes on registration, actual bounds change, removal and clear. Queries and identical updates leave it unchanged. `cell_additions - cell_removals` counts current entry/cell memberships; `cells` counts nonempty cells. `spatial.pairs` counts generated pairs, while world `candidate_pairs` includes pairs processed through reused broadphase results.

## Verification

`tests/spatial-incremental.test.mjs` adds 19 contracts. They cover unchanged bodies, edge-only membership updates, seeded resize/teleport/negative-coordinate equivalence, sleeping/wake-up, rotation and separate visual/light extents, mask/type changes, contact events, same-cell swept impacts, attachments, saved-state reconstruction, metadata-only changes and safe spatial budgets.

A second seeded oracle compares actual contact events against exhaustive pair detection over changing shapes, poses, masks, activation and body lifetimes. Exhaustive enumeration exists only in tests. An unrepresentable coordinate or over-budget extent rejects without retaining a failed body or changing an existing body's authoritative state.

A warmed, separated world of 1,000 awake bodies performs **zero additional body-bounds computations, swept-bounds computations, grid updates, cell insertions/removals and broadphase grid queries** over ten unchanged steps. Static scenery does not add bounds work when one unrelated body moves. Stationary mounts perform zero further placements or bounds/index work.

## Local comparison

Run `node src/basement/physics/benchmarks/spatial.mjs`. The script measures idle awake/sleeping bodies, moving bodies, static scenery with one mover, stationary mounts and a large entry crossing a cell boundary. Timing samples depend on hardware, JIT and garbage collection. The moving scenario receives 30 warm-up steps; time excludes setup/warm-up. Older engines report null for diagnostics they did not expose.

The following illustrative run used Node v24.22.1 on the same execution machine, comparing the engine at commit `5652d3f` with this change and using the same benchmark script:

| Workload | Before mean | After mean |
|---|---:|---:|
| 1,000 awake stationary bodies | 3.505 ms/step | 0.257 ms/step |
| 1,000 sleeping bodies | 1.302 ms/step | 0.286 ms/step |
| 1,000 moving separated bodies | 3.618 ms/step | 2.365 ms/step |
| 5,000 static bodies plus one mover | 0.011 ms/step | 0.012 ms/step |
| 300 stationary mounts | 0.767 ms/step | 0.266 ms/step |
| 10,000-cell entry crossing one cell horizontally | 5.691 ms/update | 0.032 ms/update |

The single-mover timing is effectively unchanged at this scale. Operation counts provide stronger evidence than small timing differences:

- The 1,000-body awake idle case changes from 2,000 entry-bounds updates and 2,000 candidate visits per step to zero after warm-up.
- The moving case retains its required 2,000 entry-bounds updates per step and computes body bounds once per moving body/step in this workload.
- Moving the 10,000-cell entry by one cell retains the overlap and performs 100 cell additions plus 100 removals. The previous algorithm removed/reinserted all 10,000 memberships.

These are standalone engine workloads, not full-game FPS or device performance claims. The playable apartment and destination runtime exercise this implementation; the remaining legacy city physics uses its older paths until converted.
