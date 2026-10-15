# ETRNLNINE — Engine foundation plan

**Status: agreed architectural direction and feature intent; planning only.**

**Owner: ETERNAL / @eternaldark949.**

**Recorded and updated: 2026-10-15.**

**Branch: `engine/etrnlnine`, an independent root history in `DF_TOPDOWNEDITION`.**

## Read this before implementing

This document records the owner's requirements and the architectural agreement reached with Codex. It is the starting reference for both Codex and Claude. Do not replace these decisions with a conventional engine template, silently rename the levels, or continue the previous migration strategy.

The branch was intentionally created with only this plan. No engine implementation, game implementation, dependency installation, or automatic import of legacy files is authorized by this planning commit. The owner wants the plan solid before implementation begins.

New ideas are welcome. Distinguish agreed requirements from proposed details and unresolved choices. Record subsequent architectural decisions here or in explicitly linked decision documents so the owner does not have to repeat them across conversations.

## Navigation

1. [Purpose and philosophy](#1-purpose-and-philosophy)
2. [The house: architectural levels](#2-the-house-agreed-architectural-levels)
3. [Definition, availability, and execution](#3-definition-availability-and-execution)
4. [Source organization](#4-source-organization)
5. [Engine versus game](#5-engine-versus-game)
6. [Input and configurable controls](#6-engine-level-input-and-configurable-controls)
7. [Native WebGL and optimization](#7-native-webgl-and-established-optimization-knowledge)
8. [Existing work and reference material](#8-what-the-existing-work-establishes)
9. [Simulation ambition and shared contracts](#9-simulation-ambition-and-shared-contracts)
10. [Python-engine carryovers](#10-python-engine-carryovers)
11. [Integration and acceptance scenarios](#11-integration-and-acceptance-scenarios)
12. [Remaining decisions and implementation sequence](#12-next-planning-decisions--not-implementation-authorization)

## Decision status

- **Agreed requirement:** the owner's architecture, intended behavior, engine/game boundary, and clarified feature purpose recorded here.
- **Proposed implementation direction:** a concrete way to realize that intent. These details guide design review; they are not finalized APIs, algorithms, or numeric budgets.
- **Open decision:** an unresolved choice that must be recorded before dependent implementation.

Section 10 records the carryovers the owner asked to include. Carrying over a feature means preserving and improving its purpose, not copying unfinished Python methods or committing to every mechanism proposed below. This remains a planning branch; adding detail does not authorize engine implementation.

## 1. Purpose and philosophy

Build a reusable engine with a game running inside it. This is a complete architectural upend, not a renderer adapter installed in the old game object.

The owner is willing to break existing implementation and reconstruct working behavior on a cleaner foundation. Existing working code does not have to survive merely because it works. The original game remains a source of requirements, content, visual references, gameplay behavior, and established optimization knowledge.

Code is an art form. The architecture should be functional and fun: artistic names with precise responsibilities, readable implementation, consistent vocabulary, and clear ownership. A clean foundation makes later creation easier and reduces repeated debugging and token expenditure.

A clean foundation must support rich, interconnected simulation. The owner is not requesting a bare-bones engine or a reduction of the existing game's scope. An empty-scene boot and small independent example are architecture checks, not the eventual capability ceiling.

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

## 9. Simulation ambition and shared contracts

The owner's Python work and subsequent explanations establish a world whose systems inform one another. A character's relationships, surroundings, equipment, and physical state should produce meaningful behavior. Procedural behavior should connect perception, decisions, movement, and presentation rather than accumulate unrelated animation triggers.

Main's existing scope is substantial. Examples include doors affecting movement, sight, hearing, and navigation; weather affecting clothing, surfaces, sound, and visibility; and actors handling furniture, occupying seats, carrying drinks, and riding in vehicles. These interactions are requirements evidence for the replacement, not reasons to preserve the old monolith.

The supplied `DF_TOPDOWNEDITION_Features_and_Mechanics.md` is retained in [docs/references/DF_TOPDOWNEDITION_Features_and_Mechanics.md](docs/references/DF_TOPDOWNEDITION_Features_and_Mechanics.md). It inventories main at `a376397a995e4513571aed3ba10068b76b4cd077`, prepared 2026-10-13. It is a source inventory, not a playtest certification or the latest-main guarantee. Preserve its section 19 distinctions between implemented behavior, partial work, references, and future content. Do not turn every named item into a claim of working functionality or an automatically approved new feature.

### Shared foundations to design early

| Contract | Why it matters |
| --- | --- |
| Stable entity identities and lifecycle events | Recording, relationships, attachments, save references, streaming, and replay must refer to the same entity reliably, without keeping dead objects alive. |
| Defined clocks and timestamps | Simulation, pause, slow motion, audio, traversal, replay seeking, and atmosphere transitions need explicit time domains. |
| Spatial queries with declared purpose | Visibility, perception, traversal, residency, and recording can share indexing infrastructure while using different ranges, filters, update rates, and lifetimes. |
| Transform and attachment ownership | Equipment, passengers, virtual children, traversal contacts, and recorded poses need consistent local/world transforms and disposal rules. |
| Body and motion state | Movement, collision, load response, procedural pose, and traversal must agree on position, velocity, support, and capability. |
| Resource handles and ownership | A scene, recorder, audio voice, and visible actor can require the same resource for different lifetimes. Release it when its actual owners finish. |
| State capture and restoration boundaries | Saves and replay share identity/serialization mechanisms but require different data and restoration policies. Neither should serialize arbitrary engine objects. |

Shared infrastructure does not mean a single universal radius or one giant awareness system. Rendering visibility must not decide whether an off-screen actor exists, thinks, makes sound, or belongs to a recording. Systems communicate through explicit state and events, with authoritative ownership and scheduled updates.

## 10. Python-engine carryovers

The following features were selected in discussion and are now part of the planning scope. Feature intent and house placement are recorded alongside proposed implementation directions. Exact schemas, algorithms, and budgets remain open where identified.

### 10.1 GRecorder — editable state-based cinematics

**Intent:** reconstruct the useful principle of Rockstar Editor: record game state within a limited area instead of recording video, then edit the cinematography afterward. The Python recorder scaffold establishes intent; its unfinished methods are not an existing replay implementation.

**Proposed implementation direction:**

- Record timestamped entity states and lifecycle events: identity, spawn/despawn, transforms, relevant animation/pose state, equipment/attachments, and the world changes needed to reconstruct the take.
- Capture audiovisual events and their timing where required, including emitter activation, lights, sounds, and effects. Record seeds and/or evaluated state for procedural systems according to how those systems reproduce their output; a seed alone is not a universal replay guarantee.
- Combine periodic full snapshots with state changes between them. Seeking restores a nearby snapshot and applies subsequent changes instead of starting from the beginning every time.
- Bound recording by an explicit capture region, duration, memory/storage budget, and cleanup policy. Include a dependency margin or referenced state for outside influences such as incoming projectiles, approaching vehicles, relevant lighting, and sounds. A strict distance cutoff must not silently produce broken takes.
- Preserve asset/preset identifiers and compatible version information. Decide whether recordings pin required assets or fail clearly when the necessary versions are unavailable.
- Playback reconstructs a separate replay scene. Editing a camera, changing framing, or applying an approved presentation adjustment must not mutate the live game, grant rewards, rerun quests, or advance the active save.
- Distinguish recorded facts from editable presentation. Alternate cameras, framing, and grading are central goals; changing actor actions, weather, or lighting may require extra captured data and is not automatically supported by state playback.
- State playback is the baseline direction. Deterministic resimulation, branching alternate outcomes, and arbitrary scene reauthoring are separate capabilities, not prerequisites or implied promises.

**Placement:** Basement defines identities, clocks, capture/playback contracts, and serialization primitives. Lobby schedules capture and playback. Directory resolves recorded resources and their lifetimes. Penthouse can supply recorder/camera tools and a replay demonstration. The game declares recordable state and capture policy; cinematic tooling supplies the editing interface.

**Open decisions:** radius versus moving capture volume, boundary dependencies, snapshot frequency, compression, interpolation, pose fidelity, export/storage format, audio seeking, and recording budgets on phones.

### 10.2 Procedural traversal and parkour

**Intent:** restore DF's original parkour ambition, inspired by Assassin's Creed and Watch Dogs 2, with a more procedural implementation than the original Python version. Preserve useful concepts from its distance/facing/elevation tests, priorities, and interaction-point occupancy without making authored nodes the sole source of traversal possibilities.

**Proposed implementation direction:**

- Query nearby geometry for candidate surfaces, edges, ledges, openings, and landing areas. Validate reach, clearance, support, elevation difference, approach direction, and collision-safe paths before committing.
- Evaluate candidates against character capabilities and current body state: dimensions, reach, velocity, carried load, and allowed actions. The same obstacle can support different responses for different actors.
- Coordinate the movement trajectory, collision representation, orientation, and procedural pose through one traversal state. Hand/foot placement and animation blending should follow validated contact targets rather than hide incompatible motion.
- Let authored hints refine difficult locations, preferred routes, and intentional interactions. Geometry-derived opportunities and authored hints should use compatible candidate/validation interfaces.
- Define approach, reservation, commitment, interruption, landing, and failure states. A moving obstacle, occupied landing, invalidated support, or scene unload must have a safe cancellation/recovery path.
- Retain priority and occupancy concepts for shared interaction opportunities. The same reservation primitives can support cover positions, seats, and other interactions; their game rules remain distinct.

**Placement:** Basement supplies shape queries, contact/trajectory math, motion contracts, and reservation primitives. Penthouse supplies a reusable traversal toolkit and procedural humanoid integration. Directory registers profiles and presets. Lobby coordinates simulation phases. The game selects abilities, tuning, legal surfaces, and authored hints.

**Open decisions:** the world's elevation representation, supported collision shapes, first traversal action set, contact solver/pose method, moving supports, and fidelity/work budgets. The top-down presentation must not accidentally erase the height information traversal needs.

### 10.3 Awareness matrix — perception, memory, and social interpretation

**Intent:** characters should understand who is nearby, what they think about them, their relationship, and their own personal space. Awareness includes uncertainty and remembered information, rather than unrestricted access to every actor's true state.

**Proposed implementation direction:**

- Use spatial queries to find plausible candidates, then apply relevant sensory tests such as visibility, occlusion, facing, distance, and sound propagation. Reuse established main-branch stealth knowledge where appropriate.
- Maintain observations and memory with stable identities, timestamps, confidence, last-known information, and expiration. A character losing sight of someone must not automatically know their new exact position.
- Keep sensed facts, inferred beliefs, relationships, and decision policy distinguishable. Perception can report a nearby person without deciding that person's faction, importance, or threat for every game.
- Evaluate social context using game-supplied relationships, familiarity, dispositions, and current events. Personal-space preference can vary by actor, relationship, activity, and circumstances.
- Expose useful results to steering, interaction selection, attention/gaze, and behavior. Bound work through configurable update cadence, candidate limits, memory limits, and relevance; avoid all-actors-against-all-actors scans.
- Dispose or expire references correctly as actors leave, unload, or die. Remembered identity does not require retaining its scene object or GPU resources.

**Placement:** Basement supplies spatial/sensory queries, observation and memory contracts, identity references, and reusable evaluation mechanisms. Penthouse can offer generic perception/attention behaviors. Directory registers profiles. The game owns specific relationships, faction meaning, character judgments, and decisions.

**Open decisions:** observation schema, social evaluation interface, personal-space representation, memory decay, sensory scheduling, and simulation detail outside the player's immediate surroundings.

### 10.4 Body awareness, carried load, and expressive movement

**Intent:** equipment and carried weight should affect how movement feels and looks. The owner's example is a heavy backpack widening the character's turning curve as directional velocity increases, with a coordinated physical and visual response.

**Proposed implementation direction:**

- Describe body and carried items through appropriate mass/load, attachment position, balance, inertia, and capability parameters. Choose the level of physical approximation deliberately; full rigid-body anatomy is not required to achieve convincing behavior.
- Use authoritative velocity and turning response to produce the intended movement curve. Tune steering acceleration, lateral acceleration, rotational response, and load effects coherently rather than applying only a flat walk-speed penalty.
- Feed the resulting state into procedural lean, compensating posture, gait, and attachment motion. Bag swing and body response should relate to actual acceleration and turning, with bounded secondary motion.
- Keep locomotion, collision, traversal eligibility, and displayed pose consistent. If a character sheds or picks up a load, update its capabilities and response through one defined change rather than unrelated subsystem patches.
- Connect body state to awareness/behavior through explicit interfaces: an actor can choose a wider route or avoid a difficult climb because of its load. Physical state remains independently owned rather than buried inside social perception.

**Placement:** Basement defines body/motion/attachment contracts and reusable response calculations. Penthouse supplies configurable humanoid, locomotion, and secondary-motion implementations. Game equipment and character profiles supply authored values and ability rules.

**Open decisions:** units, mass-distribution approximation, steering model, secondary-motion solver, tuning controls, and acceptable mobile cost.

### 10.5 Virtual children and lightweight attachments

**Intent:** preserve the Python `virtualChild` idea: a local transform follows a parent without requiring a heavyweight independent scene entity for every detail.

**Proposed implementation direction:**

- Compute world transforms from parent/socket transforms and local offsets. Support a defined update order and invalidate cached transforms only when inputs change.
- Allow equipment, decorative details, effect origins, and interaction anchors to use lightweight attachment records. Allocate independent physics, behavior, or entity identity only when required.
- Define reparenting, detach behavior, parent disposal, pooling, and resource ownership. Detachment must explicitly choose whether to preserve world or local placement.
- Keep attachments available to relevant capture/pose systems without creating duplicate mutable representations.

**Placement:** Basement owns transform/attachment contracts; Penthouse toys use them. Directory manages shared attachment assets. The game chooses actual equipment and decorative content.

**Open decisions:** socket addressing, hierarchy depth, cycle rejection, transform inheritance options, and when an attachment becomes a separately simulated entity.

### 10.6 World partitions, proximity residency, and scheduled spawning

**Intent:** carry forward the Python world's partitions, elevation bounds, spawn schedules, unload distances, and persistent-versus-streamed asset concepts. Preserve policies; improve repeated proximity scans using the engine's spatial infrastructure.

**Proposed implementation direction:**

- Define partition membership and adjacency with horizontal and elevation bounds appropriate to the world representation. Query nearby partitions/candidates rather than scan every object.
- Separate asset availability, simulation residency, rendering visibility, and saved existence. An invisible actor may still be needed for sound, traffic, memory, or recording.
- Use configurable activation/unload ranges, hysteresis, and work budgets to avoid boundary thrashing and frame spikes. Track pending load/unload operations so completion cannot revive a disposed scene.
- Maintain explicit ownership for persistent resources and streamed instances. Recording or another subsystem can hold a bounded lease when normal proximity policy would unload something still needed.
- Schedule spawns against the correct world clock and restore policy. Stable identity and saved state prevent duplicate actors when a partition is revisited.

**Placement:** Basement supplies spatial structures, identities, lifetime contracts, and scheduling primitives. Directory manages availability and residency bookkeeping. Lobby processes bounded work. The game supplies maps, spawn definitions, schedules, and persistence rules.

**Open decisions:** partition representation, adjacency rules, asynchronous loading/build policy, simulation detail tiers, residency budgets, and capture leases.

### 10.7 Layered audio, duplicate protection, and ducking

**Intent:** preserve the Python audio system's logical dialogue/music/effect layers, active-handle tracking, duplicate protection, layer limits, and volume/ducking direction. These are logical audio channels, not a requirement for operating-system threads. Some Python subtypes were scaffolds; do not claim they already implement the complete system.

**Proposed implementation direction:**

- Provide managed playback handles, configurable buses/voice groups, queues, priorities, concurrency limits, and explicit duplicate policies. Two legitimate speakers or nearby emitters must not be suppressed by an overly broad global duplicate key.
- Compose master, bus, emitter, and temporary gain changes without overwriting user preferences. Ducking uses owned requests and smooth attack/release so overlapping dialogue or scenes restore volume correctly.
- Clean up completed, interrupted, cancelled, and unloaded voices, including queue entries and duplicate-protection registrations. Avoid stale handles that permanently block later playback.
- Integrate spatial position and optional occlusion through shared world interfaces. World pause, UI audio, slow motion, and replay seeking need deliberate clock/playback policies.
- Preserve main's useful surface/weather-aware footsteps, room ambience, and positional-audio behavior as reference requirements, with game content supplied separately.

**Placement:** Basement defines playback/bus/lifetime contracts and audio mechanisms. Directory manages sound resources and registered profiles. Lobby coordinates timing. Penthouse can provide reusable emitter and ambient-zone toys. The game supplies dialogue, tracks, surface mappings, and mix priorities.

**Open decisions:** browser audio backend, voice stealing, queue semantics, duplicate scope, ducking rules, pause/slow-motion policy, and replay audio fidelity.

### 10.8 Authored world time and atmosphere transitions

**Intent:** retain the earlier engine's authored time-of-day ranges and smooth atmosphere progression, and accommodate main's richer lighting/weather relationships without hard-coding a named scene sun.

**Proposed implementation direction:**

- Expose an explicit world clock and parameterized time-of-day profiles. Interpolate authored sky, sun, lighting, and atmosphere values across ranges, including the midnight boundary.
- Keep world time, simulation time scaling, real elapsed time, and presentation interpolation distinguishable. Sleeping, pause, cinematic playback, and replay seeking must not accidentally advance unrelated timers.
- Allow weather and other bounded influences to compose with the base profile through defined ownership and blending rules. Dependent foliage, cloth, rain, ambience, and lights consume shared environmental state.
- Update expensive derived resources only when needed and within budget; changing a clock value must not rebuild every material or atmosphere asset each frame.
- Let game schedules and authored events subscribe to explicit clock transitions, with defined behavior when time jumps forward or is restored.

**Placement:** Basement defines time/environment state and interpolation mechanisms. Lobby advances the relevant clocks. Directory registers profiles/resources. Penthouse supplies atmosphere and environment toys. The game authors climates, day profiles, schedules, and location-specific arrangements.

**Open decisions:** clock units and jump semantics, profile schema, weather composition, schedule catch-up rules, renderer representation, and replay/environment capture fidelity.

## 11. Integration and acceptance scenarios

These are planning targets for meaningful demonstrations after implementation is authorized. They are not a demand to implement every feature before the first engine milestone.

| Scenario | What it should demonstrate |
| --- | --- |
| Record, seek, and reframe a short scene | Stable actors and attachments, correct lifecycle/event timing, bounded storage, and no live-game/save side effects. Include an actor or projectile entering the capture boundary. |
| Traverse varied obstacles with two body profiles | Geometry/capability validation, coordinated motion and pose, occupancy, and safe failure when a landing becomes blocked. |
| Turn with and without a heavy backpack | A tunable change in movement curve with consistent collision, body compensation, and attachment response; behavior changes with speed. |
| Meet a friend and a stranger in a narrow space | Shared perception infrastructure with different game-supplied relationships/personal-space responses; occluded actors do not leak exact current state. |
| Repeatedly attach, detach, stream, and dispose | Correct transform ownership and bounded resources without stale registrations, duplicate spawns, or resurrected objects. |
| Overlap dialogue and ambience, then interrupt a scene | Scoped duplicate handling, concurrency limits, smooth ducking, cancellation, and correct restored user mix. |
| Cross midnight, change weather, sleep, and restore | Coherent atmosphere, schedule transitions, and explicit clock behavior without duplicated events or unrelated timer advancement. |
| Run an independent example without Freelancer imports | Reusable engine contracts and toys; no hidden reliance on the original game object or content. |

Diagnostics should make the relevant costs observable: recording storage, residency, active voices, perception candidates, traversal queries, entity/attachment counts, and GPU ownership. Establish numeric budgets against representative devices instead of inventing unlimited capacity.

## 12. Next planning decisions — not implementation authorization

Before implementation, agree and record:

1. Precise responsibilities and public interfaces inside each level, including the small ETRNLNINE assembly interface.
2. Library registration, stable identities, ownership, disposal, and cross-level access contracts.
3. Lobby's timing model, lifecycle phases, pause semantics, and input/simulation/render ordering.
4. Input/action contracts and configurable control-template schemas.
5. GPU scene representation, geometry/material/text strategy, batching/order rules, and visibility-driven resource lifetimes.
6. Target-device budgets, diagnostics, representative comparisons, and meaningful acceptance checks.
7. Source/build organization and single-file, offline, dependency policy.
8. Identity, transform/attachment, state-capture, clock, spatial-query, body-state, and resource-lifetime contracts needed by section 10.
9. The open decisions recorded under each carryover, including traversal elevation and GRecorder capture boundaries/fidelity.
10. A staged implementation sequence that proves an empty engine and independent example game before restoring Freelancer content. Start with shared contracts and a representative integrated slice; do not build disconnected feature demos that bypass the house architecture.

After implementation is authorized, prefer coherent, verifiable portions of the agreed engine over parallel experimental renderers or speculative abstraction layers. Update this plan when a decision changes. Never silently redefine the owner's architecture to fit a convenient implementation.
