# Between Worlds — preparation, transfer and residency

Recorded 2026-10-15 after the owner approved the two-world flitting milestone. This extends [First Light](0001-first-light.md), using the same native WebGL renderer, input system, resource leases, and single runtime loop.

## Implemented scope

The independent example now contains the Amber Atrium and Violet Court. They have separate geometry, horizontal collision data, lighting, and mutable state. The same actor and attached equipment travel between them. A pending destination is prepared in actual construction/upload chunks; a transfer commits only at a fixed simulation boundary after readiness and landing validation.

Changed light selection, prop position, and crystal rotation survive world eviction and reconstruction during the running example session. This is selected-state persistence in memory, not a disk save format or a complete simulation snapshot. New scene resets that session deliberately.

## Source map and ownership

| Home | File | Responsibility |
| --- | --- | --- |
| Basement | `transfer.js` | Preflight identity/tree/landing checks and synchronous attachment-tree membership mutation. |
| Basement | `renderer.js` | Public batch preparation, retained GPU buffers, drawing and disposal. |
| Lobby | `preparation.js` | Cooperative generator work, step/time budgets, abort cleanup. |
| Lobby | `runtime.js` | Existing frame loop; preparation and boundary phases added in their proper place. |
| Lobby | `travel.js` | Own active/pending tickets, observe readiness, commit at boundaries, notify after success. |
| Directory | `residency.js` | World definitions, coalesced preparation, tickets, residency limits, LRU/explicit eviction and bounded JSON state. |
| Directory | `directory.js` | Own the residency service alongside existing libraries/worlds/resource leases; safe expected-instance release. |
| Penthouse | `controls.js` | Existing button template extended with optional edge offsets for multiple instances. |
| Example | `worlds.js`, `layout.js` | Realm profiles, generator construction, collision queries, resource factory and state schema. |
| Example | `journey.js` | Game-specific links, initial actor, prewarming, interaction/persistence policy. |
| Example | `player.js` | Game-owned steering/gait state, preserved across realm transfers. |
| Example | `scene.js`, `main.js` | Control/phase lifetimes and page UI. Neither contains the residency/transaction algorithms. |

ETRNLNINE remains the same small composition root. New ownership belongs to the appropriate level; there is no separate transition engine, patched renderer, global player object, or competing loop.

## Preparation and residency contract

1. Register an inert factory under a world key. The example captures a stable world ID and profile in that factory. No GPU asset is created merely by registration.
2. `residency.prepare(key)` returns a ticket immediately. The call admits a pending record before starting work, coalesces concurrent requests for the same key, and pins that record for this owner.
3. The factory receives `{ signal, state }`. State is a fresh parse of the last JSON capture, or null on the first visit. It reconstructs through Basement/Penthouse interfaces and must release partial allocations promptly on abort/failure.
4. Await `ticket.ready`, which resolves without a resource value. Then use `ticket.value` while the ticket is owned. This avoids completed readiness promises pinning obsolete world resources after eviction.
5. A factory must return a live world, `capture()`/`dispose()`, and explicit true geometry/collision/landing readiness flags. The example sets those flags only after actual construction, collision data creation, and GPU preparation.
6. Release every ticket once. Releasing one owner cannot abort another owner's preparation. Releasing the last preparing owner aborts and removes its pending record. A late result from an invalidated record is disposed instead of resurrecting it.
7. A ready record with no owners may remain as an inactive cache entry. Admission evicts the least recently used unpinned record if needed. `trim()` explicitly evicts unpinned worlds; pinned active/pending owners are protected.

The default managed-world capacity is **two contexts including preparations**, not two ready worlds plus unlimited in-flight loaders. The default total serialized snapshot budget is **65,536 UTF-8 bytes**. Numeric budgets are checked. If all slots are pinned, an extra request fails safely. If capture/encoding or its byte budget fails, eviction leaves the world resident and its changes intact.

The capacity applies to this residency service's records. Directly adopted isolated worlds, such as the original primitive renderer test, have their own explicit owner; the interactive two-world example routes all its realms through residency. Per-world entity/content budgets and partition streaming remain separate future work.

Eviction captures game-selected state before disposing the world/batch and clears the resident resource reference. Disposed GPU batches clear their CPU instance data too. Factories use `directory.releaseWorld(id, expectedWorld)` so a stale cleanup cannot remove a newer reconstruction that reuses the same world identity. Callers must not retain borrowed resource references after releasing ownership.

## Scheduling and cancellation

The existing Lobby frame now performs:

```text
budgeted preparation → input sampling → [boundary → fixed update] → interpolated render
```

Preparation defaults to at most **two generator steps and a 2 ms admission budget per frame**, measured between steps. A synchronous JavaScript chunk cannot be preempted: a single overlong chunk can exceed 2 ms and is reported by `peakChunkMs`. This is a cooperative work budget, not a hard execution-time guarantee. The example yields between real geometry groups and GPU upload work; no artificial loading delay stands in for preparation.

Pause blocks preparation and transfer boundaries, while retaining normal render/pause behavior. An asynchronous factory completion can mark a request ready during pause, but it cannot commit it. Stop/dispose does not create additional frame owners. Abort calls generator return so its finally block releases partial geometry, adopted worlds, and GPU leases.

The example prewarms its one linked neighbor after initial boot. That independent ticket is intentionally retained until transfer or explicit release. Cancelling a flit releases the transfer request; a separate prewarm owner may still want the destination. **Release inactive** cancels a pending flit, releases the warm owner, and snapshots/evicts unpinned worlds, retaining only the active realm.

## Transfer contract

`WorldTravel` holds the active world's ticket so the source cannot be evicted while a destination is prepared. Latest request wins. Missing definitions, failed preparation, pinned budgets, and blocked destinations report a readable refusal without moving the actor or spending game resources.

A request accepts either a copied landing object or a pure landing resolver evaluated at commit. The example maps the actor's current ground coordinates and orientation at the boundary, so movement during preparation does not send the actor back to an old request position. Other games may supply explicit anchors or coordinate mappings instead.

At a boundary, Basement checks live distinct worlds, a shared identity domain, source root ownership, destination ID collisions, finite destination coordinates, and the supplied pure landing query. Membership mutation then runs synchronously without user callbacks. The root and descendants retain their entity IDs and object references; all move to destination membership in parent-before-child order. Unrelated actors remain in the source. Previous transforms are reset, avoiding interpolation through the old location/world.

After successful mutation Lobby promotes the destination ticket, releases the source pin, and emits an immutable event containing world IDs, root/descendant IDs, and simulation time. Observers see the fully committed state. An observer failure is counted separately and cannot retroactively turn the completed transfer into a failed transaction.

The example preserves the controller's velocity/load/gait state and the actor's equipment. It transfers the root's attachment tree only; passengers, nearby companions, projectiles, reservations, or unrelated objects do not implicitly follow. There are no ability costs in this example; a future game should charge them on successful completion according to its own rules.

## Identity and persistence limits

World identity remains stable across reconstruction. The travelling actor and attachments also keep their identities across transfers. Static scenery is procedurally reconstructed with new session entity IDs, using the game's selected state rather than serialized live entities. Future saves/GRecorder need authored stable keys and richer capture schemas for individually persistent scenery; this milestone does not pretend those are implemented.

Inactive worlds do not run game simulation here. Their selected state remains unchanged until resumed/reconstructed. There is no real-time off-world catch-up, network loading, disk persistence, arbitrary world creation, or full-world state recorder. Existing visibility culling is retained; large-world spatial partitions and streaming are still planned.

## Controls and editing guide

- WASD/arrows or the touch joystick: move. Mouse: look when stationary.
- E/click/Light button or standard gamepad A: toggle the active world's crystal light.
- G: move that world's prop between its authored positions; overlap with the actor is refused.
- F/Flit button or standard gamepad B: request the other realm.
- X or standard gamepad Y: cancel the pending transfer. Standard gamepad X / keyboard B changes the pack profile.
- Open **World directory** to inspect ready/pending ownership, live GPU counts, snapshot bytes, and last commit/wait timings. **Release inactive** demonstrates actual eviction and later reconstruction.

Edit realm palettes/height in `examples/atrium/worlds.js`. Edit construction/obstacles/yield boundaries in `layout.js`. Change the link/arrival/prewarm policy in `journey.js`. Edit the saved-state schema and version validation in `worlds.js` when adding persistent game facts. Keep engine transfer/loading rules out of those game policies.

`waitMs` includes readiness and waiting for a frame/simulation boundary, even for an already prepared destination. `transferMs` measures the synchronous validation/membership/ownership work. Neither number is a complete frame-time or real-phone performance benchmark.

## Verification

Use `npm test`, `npm run build`, and `npm run test:browser`. The latter executes the built HTML with a Canvas 2D rejection guard and zero runtime network requests, and runs isolated source-module fixtures for failure/lifecycle cases. The build tool now supports the generator export used by cooperative layout preparation.

See [milestone evidence](../milestones/between-worlds/README.md) for screenshots and machine-readable results. As in First Light, managed Chromium blocks file URLs; the suite runs unchanged HTML contents directly in a page. Software WebGL, synthetic touch, and a portrait viewport do not prove physical-phone or gamepad performance.
