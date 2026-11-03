# ETRNL9 engine foundation — 0.2.0

The rewrite now has a shared world foundation, built on ETERNAL's Basement, Lobby,
Directory, and Penthouse organization. This is still an engine laboratory, not a
migration of Dimensions: Freelancer's game content.

Download **[ETRNL9 Foundation.html](ETRNL9%20Foundation.html)** and open that one file
in a browser. All engine code, comments, shaders, styles, and test content are inline.
There are no external runtime libraries, fonts, or assets. GitHub's source viewer
is not the running page; download the raw HTML. Shared-world rendering requires WebGL2.

## Neutral studies in the same file

**Shared world** is the default. WASD/arrows or a held touch destination move the cream
circle through ordinary physics. A moving heavy box participates through the same
contact solver. An orange volume moves below an elevated slab; a pink volume falls
onto its top. Purple ground emission is hidden by opaque geometry automatically.
A point source illuminates surfaces and casts geometric shadows.

**Hide slab visually** reveals emission/objects behind it without removing its physical
support. **Add 10,000 distant bodies** registers real indexed objects; compare total body
count with visible elements and local geometry checks. This one-time setup can briefly
block the page while registrations are created. Reset scene removes that population.
Zoom out to 50% to inspect the whole scene on a phone.

**Loop & brushes** preserves the original Canvas-only rectangle study in the same file.
Start, Pause/Resume, Stop, Reset scene, and Zoom use actual engine lifecycle operations.
Pause keeps rendering; Stop cancels frame callbacks. No game-specific collision response
or per-object painter priority is implemented by either study.

## Where concerns live

| Level / component | Responsibility | Source |
|---|---|---|
| Basement | Shared configuration and named collections | [basement.js](src/engine/basement.js) |
| Basement spatial library | Sparse grids, unique local queries, movement/removal, overflow budgets | [spatial.js](src/engine/spatial.js) |
| Basement world geometry | Shared XYZ, footprint, height, tracked transforms, material definitions | [world-geometry.js](src/engine/world-geometry.js) |
| Lobby | Only frame scheduler; fixed steps, pauses, hidden-page suspension, lifecycle | [lobby.js](src/engine/lobby.js) |
| Directory | Assemble systems/tools and expose element/asset libraries | [directory.js](src/engine/directory.js) |
| Scene system | Declarative elements/lights, ownership, automatic physical/visual index membership | [scene.js](src/engine/scene.js) |
| Physics system | Generic shape contacts, Z intervals, linear mass/friction response, sensors/events | [physics.js](src/engine/physics.js) |
| Canvas renderer | Final viewport, camera helpers, brushes, screen composition | [renderer.js](src/engine/renderer.js) |
| World renderer | GPU resource lifetime, opaque depth visibility, central surface lighting | [world-renderer.js](src/engine/world-renderer.js) |
| Render geometry helper | Reusable triangles generated from shared world geometry | [world-mesh.js](src/engine/world-mesh.js) |
| Point-light backend | Six-direction source visibility from nearby opaque geometry | [point-light-renderer.js](src/engine/point-light-renderer.js) |
| GPU program library | Fully commented projection, emission, depth, and lighting calculations | [world-shaders.js](src/engine/world-shaders.js) |
| Input system | Keyboard and primary pointer state, without game action mappings | [input.js](src/engine/input.js) |
| Profiler tool | Actual frames/steps, sampled FPS, discarded time, CPU-side frame cost | [profiler.js](src/engine/profiler.js) |
| Penthouse | Install/update/remove optional high-level features | [penthouse.js](src/engine/penthouse.js) |
| Engine | Construct levels, connect dependencies, delegate lifecycle | [engine.js](src/engine/engine.js) |
| Test content | Primitive declarations and harness controls/diagnostics | [world-study.js](src/demo/world-study.js), [rectangle-study.js](src/demo/rectangle-study.js), [boot.js](src/demo/boot.js) |

Read **[ENGINE_CONTRACTS.md](ENGINE_CONTRACTS.md)** for every property, default, coordinate
rule, ownership boundary, supported behavior, and explicit limitation. That document
explains why world glow no longer bypasses roofs and why a new body category requires
no new character/vehicle collision handler.

## Initialization and simulation order

1. Construct Basement, Directory, Penthouse, and Lobby without starting execution.
2. Connect system references after all components exist.
3. Install optional test features using completed Directory services.
4. Explicitly start the Lobby's one frame scheduler.
5. For each fixed step, capture moving positions, update feature/control intentions,
   then update Directory systems, including physics.
6. Render the current world and harness once per display callback.

The default simulation rate is 60 Hz. The Lobby caps catch-up work and reports dropped
time rather than allowing an endless backlog. Physics independently subdivides fast
movement within an explicit safety budget; exceeding it fails before movement instead
of silently permitting missed contacts. The Canvas study interpolates its own display
motion; shared-world rendering currently uses authoritative current geometry.

## Build and automated checks

From the repository root, using Node 18 or newer:

```sh
node rewrite/tools/build.mjs
node rewrite/tools/build.mjs --check
node rewrite/tools/test-world.cjs
```

The world runner includes the original seven foundation scenarios plus ten spatial,
physics, and world-contract scenarios. No npm packages are needed. Edit `rewrite/src/`
and rebuild; do not hand-edit the generated HTML. Comments are retained in the build.

Development-only real-browser checks:

```sh
python -m pip install -r rewrite/tools/requirements-browser.txt
python -m playwright install chromium
python rewrite/tools/test-browser.py
python rewrite/tools/test-world-browser.py
```

Tests use a configured `CHROMIUM_EXECUTABLE`, a system `chromium`, or Playwright's managed
browser. An optional output-directory argument saves screenshots. Headless software
WebGL is a test environment, not evidence of real phone performance.

A reproducible CPU workload compares sparse registries of 1,000, 10,000, and 25,000 static
bodies with a constant 100 moving bodies:

```sh
node rewrite/tools/bench-world.cjs /tmp/etrnl9-world-benchmark.json
```

See **[VERIFICATION.md](VERIFICATION.md)** for measured results and limitations. GitHub CI
runs source/build agreement, deterministic scenarios, and browser event/pixel checks.
The existing game's source, artifact, and workflow remain separate.

## Deliberate scope

Supported now: opaque boxes, circular prisms, planes, shared physical Z, spatial indexes,
linear body contacts, default all-category filtering, contact events, depth-tested emission,
point lights with hard shadows, static mesh/image reuse, and GPU context recovery.

Not implemented: migrated humanoids/buildings/gameplay, textures and alpha-cutout sprites,
transparent world materials, blurred bloom, angular dynamics, joints, general mesh
colliders, general continuous collision detection, asset streaming/decoding, and arbitrary
complex-scene performance guarantees. No existing-game equivalence is claimed yet.

Follow [CODE_REQUIREMENTS.md](../CODE_REQUIREMENTS.md) for descriptive names, function/class
purpose explanations, line-by-line English comments, and explicit language/loop reasoning.
