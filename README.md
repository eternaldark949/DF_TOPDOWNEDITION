# ETRNLNINE — Engine foundation plan

**Status: agreed architectural direction; planning only.**  
**Owner: ETERNAL / @eternaldark949.**  
**Recorded: 2026-10-15.**  
**Branch: `engine/etrnlnine`, an independent root history in `DF_TOPDOWNEDITION`.**

## Read this before implementing

This document records the owner's requirements and the architectural agreement reached with Codex. It is the starting reference for both Codex and Claude. Do not replace these decisions with a conventional engine template, silently rename the levels, or continue the previous migration strategy.

The branch was intentionally created with only this plan. No engine implementation, game implementation, dependency installation, or automatic import of legacy files is authorized by this planning commit. The owner wants the plan solid before implementation begins.

New ideas are welcome. Distinguish agreed requirements from proposed details and unresolved choices. Record subsequent architectural decisions here or in explicitly linked decision documents so the owner does not have to repeat them across conversations.

## 1. Purpose and philosophy

Build a reusable engine with a game running inside it. This is a complete architectural upend, not a renderer adapter installed in the old game object.

The owner is willing to break existing implementation and reconstruct working behavior on a cleaner foundation. Existing working code does not have to survive merely because it works. The original game remains a source of requirements, content, visual references, gameplay behavior, and established optimization knowledge.

Code is an art form. The architecture should be functional and fun: artistic names with precise responsibilities, readable implementation, consistent vocabulary, and clear ownership. A clean foundation makes later creation easier and reduces repeated debugging and token expenditure.

This is not an attempt to build an infinitely general engine. It is a reusable foundation for the owner's games and their particular needs.

## 2. The house: agreed architectural levels

### Basement

> “A sturdy foundation makes for a sturdy house, and easygoing, sturdy development.”

Equivalent in purpose to the owner's earlier `g7Elements`, `g7Systems`, `g7Tools`, `g7States`, and related foundations.

Stores and defines all base properties, mathematical methods, baseline methods, systems, states, and capabilities accessible to the engine. Examples include entity and component foundations, geometry and material interfaces, spatial indexing, resource ownership primitives, input systems, physics/collision, profiling tools, and reusable lifecycle contracts.

Basement defines capabilities. It must not depend on Lobby, Directory, Penthouse, or a particular game.

### Lobby

> “Where you enter is where the gears start turning.”

Designs and manages the engine runtime loop: scheduling, engine time, lifecycle execution, pause/resume behavior, and the relationship between input, simulation, and rendering.

Lobby owns the runtime scheduler. Individual controls, libraries, toys, games, and subsystems must not start competing animation-frame loops. Registration and explicit lifecycle contracts determine execution order.

### Directory

> “When at the mall, I can tell where to go, what do I draw from and, what is available to me.”

Sets, contains, and maintains all libraries accessible to the engine. Owns their registration, identity, lookup, availability, loading/unloading policy, and resource-lifetime bookkeeping through Basement-defined interfaces.

Libraries can supply engine toys or game-specific content. Directory must not hard-code Freelancer content, implement its own renderer, or become another runtime scheduler.

### Penthouse

> “Ooh fancy, all the toys are here.”

Sets the available engine toys: procedural humanoids, preset foliage, preset building types, configurable controls, and other reusable creations. These also provide useful native engine tests and demonstrations.

Penthouse implements toys using Basement's public capabilities. Toys are explicitly registered and instantiated; their existence must not automatically start a game or allocate every available asset.

A generic humanoid generator or building type belongs here. 949's character identity and Enni Cole's particular design belong to the game.

### ETRNLNINE

The engine object that brings the house together. It remains simple: instantiate the levels, connect their dependencies, and expose the assembled engine's public entry points.

ETRNLNINE must not grow into a replacement monolithic game object. Gameplay rules, quest flags, map-specific artwork, and game HUD state do not belong in its constructor.

## 3. Definition, availability, and execution

These levels cooperate through explicit interfaces rather than unrestricted access to a shared global game object.

For example, a procedural humanoid follows this path:

1. Basement defines geometry, material, animation, entity, and resource interfaces.
2. Penthouse implements the reusable humanoid generator.
3. Directory registers available generators/presets and tracks their resources.
4. The game supplies character identity, appearance, behavior, and story roles, and requests an instance through public interfaces.
5. Lobby schedules that instance's registered updates and rendering work.
6. ETRNLNINE connects the levels; it does not implement those steps itself.

Dependency rules:

- Engine source never imports game source or reaches into a global Freelancer object.
- Penthouse builds on Basement-defined capabilities and contracts.
- Directory manages registered libraries through generic interfaces rather than importing named game assets.
- Lobby executes registered systems through explicit lifecycle interfaces; it does not contain their gameplay rules.
- Registration connects content to the engine. Engine internals must not be patched to install each new game or toy.
- Shared resources have explicit ownership and lifetimes. Disposal and cancellation are part of the contract, not optional cleanup added later.

## 4. Source organization

The four levels are intentional and must remain recognizable. Do not substitute a new naming scheme without discussing it with the owner.

The following is a responsibility-level layout, not authorization to create implementation files now. Subfolders and filenames inside the levels remain to be designed.

```text
/
├── README.md                 # This plan and its linked decisions
├── engine/
│   ├── basement/             # Foundational capabilities, systems, tools, states
│   ├── lobby/                # Runtime scheduling and lifecycle
│   ├── directory/            # Library registration, availability, lifetimes
│   ├── penthouse/            # Reusable engine toys and presets
│   └── etrnlnine.js          # Small composition/assembly entry point
├── games/
│   └── freelancer/           # Game content, worlds, rules, bindings, interface
├── examples/                 # Independent engine demonstrations
├── tests/                    # Meaningful boundary, lifecycle, and behavior checks
├── tools/                    # Build and development tools
└── docs/                     # Contracts and subsequent architectural decisions
```

The owner's manual rewrite states a single-file, zero-dependency engine direction. Organizing source into folders does not require abandoning self-contained HTML delivery. Do not silently introduce a runtime framework, CDN, or network dependency. Precise dependency and build policies must be settled explicitly before implementation; the earlier Three.js demos do not establish an engine framework choice.

## 5. Engine versus game

| Engine responsibility | Game responsibility |
| --- | --- |
| Geometry, materials, rendering, lighting infrastructure | Particular building designs, visual assets, and authored lighting arrangements |
| Entity lifecycle, collision, spatial queries | Characters, enemy types, vehicles, and gameplay behavior |
| Scene loading and world streaming | Maps, locations, and transitions |
| Animation and input infrastructure | Character animations, abilities, and action bindings |
| Audio and UI infrastructure | Soundtracks, dialogue content, menus, and HUD |
| Persistence mechanisms | Game-specific save schema and progression |

Reusable facilities may support gameplay systems without knowing Freelancer's specific actors, quests, locations, or DOM element IDs.

Acceptance checks for the separation:

- Boot the engine into an empty scene without importing a campaign or game-specific content.
- Run a second small demonstration game against the same engine without modifying engine source.
- Instantiate and dispose a Penthouse toy without requiring Freelancer's startup flow.

## 6. Engine-level input and configurable controls

Keyboard, mouse, touch, and gamepad support are engine capabilities from the foundation onward.

Placement:

- **Basement:** device input systems, action states, control interfaces, lifecycle and cancellation rules.
- **Directory:** action maps, device bindings, and registered control templates.
- **Penthouse:** reusable, configurable buttons, joysticks, triggers, directional pads, and other controls.
- **Lobby:** consistent input sampling and processing relative to simulation.
- **Game:** bindings and behavior for actions such as move, aim, interact, or use an ability.

Controls in the current main branch should be reconstructed as instances of parameterized templates, rather than copied as separate special-case implementations.

Illustrative configuration parameters, not a finalized API:

- Joysticks: radius, dead zone, response curve, fixed/floating origin, axis restrictions, appearance, and target action.
- Buttons: dimensions, activation mode, hold threshold, repeat behavior, appearance, and target action.

Instance invariants:

- Each instance owns its mutable pressed state, pointer/touch identifiers, timers, and callbacks.
- Templates supply defaults; they must not accidentally share mutable interaction state between instances.
- Shared immutable resources may be reused through explicit handles and ownership.
- Focus loss and cancellation release active controls; reconnect/disconnect handling is defined for gamepads.
- Simultaneous touches remain independent, with explicit ownership/capture and release.
- Multiple bindings must have a defined action-combination policy so an action is not accidentally delivered twice.
- Destroying or replacing a control removes its registrations/listeners and cancels pending interaction work.
- Repeated create/destroy cycles, pause/resume, and scene changes must not accumulate listeners or leave stuck inputs.

The exact event API, action aggregation rules, DOM-versus-GPU control presentation, and gamepad mapping/calibration policies remain implementation-design decisions to settle before coding them.

## 7. Native WebGL and established optimization knowledge

The intended replacement uses native GPU geometry, materials, shaders, and render targets. Do not rebuild the previous mixture of a Canvas drawing adapter, duplicated rendering paths, and per-frame drawing translation.

No Canvas 2D rendering or Canvas-based asset/text preparation is part of the intended replacement. A third-party capability probe is not an excuse for silently violating that requirement. Rendering and text must have an explicitly Canvas-free implementation.

Main already contains substantial optimization knowledge: spatial hashes/grids, visibility queries, bounded caches, detail levels, resource reuse, and allocation-management practices. Use that work as evidence and a reference. Recreate appropriate algorithms and policies in the new architecture; replace Canvas-specific mechanisms with GPU-native equivalents.

Examples of intended behavior:

- Construct and upload static geometry/material resources once; reuse them while valid.
- Submit visible instances and changed transforms, animation values, or lighting parameters per frame.
- Use retained buffers and bounded storage, with dirty-range updates where suitable, rather than rebuilding the same paths/meshes each frame.
- Feed the engine's spatial visibility result into rendering and resource ownership instead of independently scanning everything in every subsystem.
- Make GPU allocations attributable to owners and release them through defined lifecycles.
- World-label GPU allocations follow visibility and are released when labels leave visibility. Shared glyph resources must be explicitly bounded and accounted for; do not retain an unbounded collection of off-screen label allocations.
- Establish mobile work and memory budgets from the start. Do not design an expensive desktop showcase and treat mobile as an afterthought.

Visibility-owned resources, allocation diagnostics, automatic order-preserving batching, and explanatory frame captures are useful design directions raised in discussion. Their exact mechanisms remain to be specified; mentioning them here does not make an unreviewed implementation mandatory.

A clean architecture does not by itself guarantee speed. Measurement verifies the implementation against the known game and target devices; it must not become an endless substitute for implementing clear decisions.

## 8. What the existing work establishes

- The owner's `g7` scripts demonstrate a willingness to restructure systems and ownership rather than preserve an unsuitable implementation.
- The manual `dfab-hw-0.0.0.html` draft introduces these house levels, separate logic/render passes, render-target/blend/coordinate-space properties, queued brushes, and profiling. It is an unfinished architectural draft, not proof that its current Canvas implementation is the requested GPU engine.
- The current main game is behavior/content/visual reference material. Its `GameEngine` mixes engine responsibilities with game-specific state; spreading that object across mixin files does not establish engine/game separation.
- The existing WebGL branches contain useful technical work but are not the prescribed architecture for this rebuild.
- Codex's Enni Cole quality and mobile demonstrations are isolated visual/performance experiments. They are not an engine replacement, an approved framework dependency, or evidence of full-game mobile performance.

Do not import any of these implementations wholesale into this branch. Preserve requirements and useful knowledge, then design their place in the new engine deliberately.

## 9. Next planning decisions — not implementation authorization

Before implementation, agree and record:

1. Precise responsibilities and public interfaces inside each level, including the small ETRNLNINE assembly interface.
2. Library registration, stable identities, ownership, disposal, and cross-level access contracts.
3. Lobby's timing model, lifecycle phases, pause semantics, and input/simulation/render ordering.
4. Input/action contracts and configurable control-template schemas.
5. GPU scene representation, geometry/material/text strategy, batching/order rules, and visibility-driven resource lifetimes.
6. Target-device budgets, diagnostics, representative comparisons, and meaningful acceptance checks.
7. Source/build organization and single-file, offline, dependency policy.
8. A staged implementation sequence that proves an empty engine and independent example game before restoring Freelancer content.

After implementation is authorized, prefer coherent, verifiable portions of the agreed engine over parallel experimental renderers or speculative abstraction layers. Update this plan when a decision changes. Never silently redefine the owner's architecture to fit a convenient implementation.
