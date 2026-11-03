# ETRNL9 engine foundation

This is the first working foundation of the rewrite, organized around ETERNAL's
Basement, Lobby, Directory, and Penthouse design. It lives alongside the existing
game so the original remains available for later behavioral comparisons.

Open **[ETRNL9 Foundation.html](ETRNL9%20Foundation.html)** after downloading it.
That one file contains the engine source, test scene, presentation, and explanatory
comments. It needs no runtime libraries, fonts, asset folders, or network connection.
GitHub's file viewer displays source; download the raw HTML to run it in a browser.

The cream marker responds to WASD/arrows or a held pointer/touch. The orbiting shapes
demonstrate fixed simulation with display interpolation. Start, Pause/Resume, Stop,
and Zoom exercise actual engine operations. Pause keeps drawing; Stop cancels frames.

## Where things belong

| Level | Responsibility | Source |
|---|---|---|
| Basement | Shared configuration, small methods, generic named-library implementation | [basement.js](src/engine/basement.js) |
| Lobby | The one frame scheduler, fixed simulation, pause ownership, hidden-page suspension, start/stop | [lobby.js](src/engine/lobby.js) |
| Directory | Systems, tools, element and generalized asset registrations | [directory.js](src/engine/directory.js) |
| Directory → renderer | Canvas allocation, camera, ordered passes, queued same-color brushes | [renderer.js](src/engine/renderer.js) |
| Directory → input | Keyboard and primary pointer state; no game action bindings | [input.js](src/engine/input.js) |
| Directory → profiler | Actual completed frames/steps, sampled FPS, discarded time, synchronous CPU cost | [profiler.js](src/engine/profiler.js) |
| Penthouse | Installation, update, and removal of optional high-level features | [penthouse.js](src/engine/penthouse.js) |
| Engine | Assemble all four levels, connect them, delegate lifecycle | [engine.js](src/engine/engine.js) |
| Harness | Optional scene, test-specific controls and diagnostics | [rectangle-study.js](src/demo/rectangle-study.js), [boot.js](src/demo/boot.js) |

The Rectangle Study is an example of the Penthouse extension contract, not a
procedural humanoid or tiered-building migration. Those features, the existing
game's content, saves, audio, physics, and quests have not been migrated yet.
The asset library currently registers caller-provided references; it does not
claim to load or decode audio/images. Rendering passes are real callbacks with
explicit order and coordinate space; unimplemented lighting/bloom stages are not
advertised as functional switches.

## Construction and execution

1. The engine constructs Basement settings and libraries.
2. The Directory constructs systems and tools without subscribing or scheduling.
3. The Penthouse and Lobby are constructed with their actual dependencies.
4. The engine connects Directory components after all levels exist.
5. The caller optionally installs Penthouse features.
6. Only an explicit `engine.start()` begins recurring work in the Lobby.

An ordinary fixed step updates Directory systems, then Penthouse features. Rendering
runs once per display callback. Fixed simulation defaults to 60 updates per second,
with no more than five catch-up steps in one callback. Overload drops time and records
it instead of silently creating an unbounded backlog. This is a foundation policy,
not a claim of perfect simulation under overload.

Pauses use named owners so closing a menu cannot release a different system's pause.
Hidden pages suspend scheduling entirely and reset timing on return. Stop/restart
preserves scene state but never accumulates stopped time. Destroy removes features
first, then services and browser listeners; a destroyed engine cannot restart.

## Addresses you can inspect

```javascript
// Read the current fixed simulation time from its owning Lobby.
foundationEngine.lobby.simulationSeconds;

// Retrieve the renderer system by its Directory registration name.
foundationEngine.directory.systems.get('renderer');

// Retrieve the controlled element installed by the optional test feature.
foundationEngine.directory.elements.get('study.player');

// Retrieve the optional feature itself rather than putting its internals on the engine.
foundationEngine.penthouse.features.get('rectangle-study');

// Remove the study and its passes/elements while leaving the empty engine running.
foundationEngine.penthouse.uninstall('rectangle-study');
```

## Build and checks

From the repository root, with Node 18 or newer:

```sh
node rewrite/tools/build.mjs
node rewrite/tools/build.mjs --check
node rewrite/tools/test-foundation.cjs
```

These commands require no third-party Node packages. The build preserves readable
source blocks and all explanatory comments in the output. Edit `rewrite/src/`,
then rebuild; do not hand-edit the generated HTML.

Real browser verification uses development-only Python Playwright and installed
Chromium at `/usr/bin/chromium`:

```sh
python rewrite/tools/test-browser.py
```

An optional argument saves screenshots to a local evidence folder:

```sh
python rewrite/tools/test-browser.py /tmp/etrnl9-evidence
```

See [VERIFICATION.md](VERIFICATION.md) for completed checks and limitations.
The foundation workflow checks source/build synchronization and deterministic
behavior when rewrite files change. The original game's build workflow is unchanged.

## Source standard

Follow the repository's [CODE_REQUIREMENTS.md](../CODE_REQUIREMENTS.md).
Source explains unit purpose and executable steps, uses descriptive names, and
explains loop traversal and JavaScript-specific behavior where it appears.
The engine owns no harness-specific HTML IDs or Rectangle Study logic.
