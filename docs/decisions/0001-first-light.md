# First Light — runnable foundation decisions

Recorded 2026-10-15 after the owner invited implementation to begin. This scopes the first runnable milestone; the broader engine plan remains in the root README.

> Historical milestone record. The current example and runtime are extended by [Between Worlds](0002-between-worlds.md), including changes to the phases, file map, and implemented world capabilities below.

## Scope and delivery

- Native WebGL 2, JavaScript ES modules, no runtime libraries, no CDN, and no Canvas 2D preparation/rendering.
- A Node-only build tool produces one HTML containing source, procedural geometry, shaders, and interface styles. No installation or build step is needed to use the built artifact in a compatible normal browser.
- The first interactive example is `examples/atrium`, an independent little game. It is not Freelancer, Enni Cole, or a demonstration of all planned features.
- Interface text and controls use accessible HTML. World geometry/lighting uses WebGL exclusively. There is no GPU text implementation yet and no hidden Canvas font atlas.

## Responsibility map and reading order

| Read | File | Responsibility |
| --- | --- | --- |
| 1 | `engine/etrnlnine.js` | Small composition root; assemble the levels and connect input/pause lifecycle. |
| 2 | `engine/basement/basement.js` | Foundational capability owner. |
| 3 | `engine/lobby/runtime.js` | The only animation-frame owner; explicit scheduled phases. |
| 4 | `engine/basement/world.js` | Entity/world identities, local transforms, and parent-relative attachment resolution. |
| 5 | `engine/directory/directory.js` | Inert library registration, world adoption, and shared resource leases. |
| 6 | `engine/basement/input.js` | Device states, contributions, action aggregation, and one-shot press consumption. |
| 7 | `engine/penthouse/penthouse.js`, `toys.js`, `controls.js` | Registered procedural toys and configurable controls. |
| 8 | `engine/basement/renderer.js`, `shaders.js` | Retained instancing, dirty uploads, culling, lighting, and GPU disposal/restoration. |
| 9 | `examples/atrium/main.js`, `scene.js`, `layout.js` | Page lifecycle, game behavior, and authored layout, respectively. |

No engine file imports the example. Toys do not start loops. Directory receives factories instead of importing particular game libraries. The composition root contains no player movement, scene layout, or HUD IDs.

## Timing contract

Lobby samples input once per presentation frame, then runs zero or more fixed 1/60-second simulation updates, then renders with interpolation. At most five updates run per frame; excess wall time is dropped and counted. This avoids unbounded catch-up following browser stalls. Simulation time advances only by completed fixed steps.

The game snapshots local transforms before each update. Rendering resolves interpolated transforms parent-before-child. Horizontal coordinates are x/y world units; z is elevation; yaw is radians. The current hierarchy supports translation and yaw, not arbitrary skeletal orientation or scale inheritance. Parents must exist before children; direct reparenting/removal from the entity map is not a supported API.

Pause reasons are independently owned strings. Menu, visibility, focus, and lost GPU context cannot resume each other's pauses. Paused frames can still render, with a fully resolved pose, while simulation is stopped. Entering/leaving pause resets elapsed-time debt and clears input. Stop/start preserves simulation time and does not create duplicate frame owners.

## Input contract

- Bindings are supplied by a game; the engine has no built-in Freelancer action names.
- Vector sources choose the strongest magnitude; keyboard diagonals are normalized. This avoids doubling movement when two devices contribute.
- Button sources combine by OR. A press edge is consumed once, even across several catch-up simulation steps. Brief keyboard, pointer, and template taps are latched between frames.
- Standard gamepad mapping and a radial dead zone are implemented. Alternate mappings/calibration remain future work.
- Pointer position is surface-relative CSS pixels; the renderer supplies a ground-plane projection for the game's aiming policy.
- Each touch template owns a pointer ID and action contribution. Cancellation, lost capture, blur, pause, and disposal release that ownership. The first templates are fixed-origin joysticks and held buttons; floating origin, hold thresholds, repeat, and more modes remain planned.

## Resource and scene contract

Directory registration allocates nothing. Shared resources allocate on first acquire, remain alive while leased, and dispose on final release. Leases release once. Engine disposal safely invalidates remaining resources even when a caller releases its lease afterward.

A scene owns a Lifetime, a world, a GPU batch lease, its controls, and its phase registrations. Scene disposal unregisters callbacks, removes controls/bindings, releases GPU resources, and releases world membership. Scene replacement uses this same path, with no prototype patch or secondary game loop.

Entity identity is independent of draw-buffer position and is never reused in a running engine. IDs are session-local, not a disk save/replay format. Explicit world identity is present; inter-world transfer, readiness, streaming, persistence, and GRecorder are not implemented in this milestone.

## Rendering contract and initial budgets

- One retained unit cube and one program per renderer, one instance buffer/VAO per leased world batch.
- Each batch has an explicit 2,048-visible-instance capacity (98,304 bytes of CPU instance records and the same reserved GPU buffer bytes), and fails clearly if exceeded.
- Instance data is 12 floats: position/yaw, dimensions/emission, and linear color/padding. Static geometry is not regenerated every frame. A warmed unchanged scene uploads zero instance data; changed ranges use WebGL 2 bufferSubData offsets.
- CPU culling uses conservative view bounds. This small-scene scan is not the planned spatial-grid implementation. Full-world streaming or large-city performance is not established here.
- Orthographic oblique projection retains true elevation. Eight local light slots and ambient/directional lighting are supported. There are no shadow maps, bloom, fog volumes, transparent materials, advanced humanoid rig, or production text system yet.
- Device-pixel ratio defaults to a 1.5 cap; the renderer resizes backing storage when CSS dimensions change. This bounds fill work but is not a measured real-phone performance guarantee.
- GPU context loss pauses simulation. Restoration recreates the renderer and live batches from retained CPU data, without restarting game logic or adding a loop.

These are explicit initial limits and representations, not permanent engine ceilings. Future capabilities must extend the responsible contracts instead of introducing alternate renderer/game objects.

## Edit examples

Change `speed` and `response` in `examples/atrium/scene.js` to tune the demonstration's locomotion. Its load-dependent steering is an illustrative profile, not the planned mass-distribution simulation. Change the action map in that file to rebind keys or gamepad buttons.

Change object positions/colors in `examples/atrium/layout.js` to edit the courtyard. Change pavilion width/height/material arguments to instantiate a different building without editing its generator. Change the control creation arguments in `scene.js` to adjust joystick radius/dead zone/curve or button size/label.

Change the reusable defaults/generation in `engine/penthouse/toys.js` only when the change should apply to that toy across games. Change GPU projection/lighting in Basement's shaders only when the rendering mechanism itself should change.

A new game supplies its own entry point and scene, registers any new content through Directory, and subscribes to Lobby phases. It need not edit ETRNLNINE. A future game-specific subsystem belongs outside `engine/` even if it is convenient to put it in the root object.

## Run and verify

```sh
npm test
npm run build
python -m http.server 8000
# Open http://localhost:8000/examples/atrium/ for modular source development.
# dist/ETRNLNINE-Atrium.html is the single-file deliverable.
```

`npm run test:browser` uses Playwright and Chromium as development tools. In this workspace Playwright is preinstalled and Chromium is `/usr/bin/chromium`; elsewhere install Playwright separately and/or set `ETRNLNINE_CHROMIUM` to a compatible browser executable. They are not runtime dependencies.

Automated checks exercise lifetimes, action aggregation/short taps, gamepad input through an injected reader, interpolation/attachments, lease behavior, pause ownership/catch-up, house dependency boundaries, and collision queries. Browser checks exercise the actual WebGL renderer, the independent scene, simultaneous touch controls, repeated scene replacement, retained uploads, context restoration, and disposal. A second isolated world using registered primitives exercises engine operation without the Atrium game.

Managed Chromium blocks direct file URLs. The browser suite executes the built HTML contents directly in a page, verifies zero network requests, and tests modules separately over localhost. Direct file opening in a normal browser remains unverified here. Chromium uses software WebGL in this environment; desktop/mobile screenshots and emulated touch checks do not establish real-device frame rates or physical-gamepad behavior.
