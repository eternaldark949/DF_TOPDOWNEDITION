# Engine architecture: read this before any work

This is the governing description of how Dimensions Freelancer and its engine are built. It was written with ETERNAL (the project's owner) and records their design. **Read all of it before you plan, write, move or review any code in this repository.**

- If any other document disagrees with this one, this one wins.
- If code disagrees with this one, the code is wrong. Fix the code, or list the mismatch under [Known mismatches](#9-known-mismatches-today), but don't quietly work around it.
- Only ETERNAL changes the rules here. If a task seems to need a rule changed, stop and ask them first.
- New code must follow these rules from its first commit. Don't add a temporary breach to fix later: that is how a structure gets plagued by an issue snowball.

---

## 1. The model in one paragraph

This is a classic game-engine architecture with four engine levels and a game on top of them.

1. **Basement (LV0)** holds the base engine systems: physics, forces, joints, rigs, maths, spatial queries, maps, rooms, rendering and controls.
2. **Lobby (LV1)** is the game loop. It runs the clock. Nothing moves without the clock, so **the Lobby is responsible for updating everything**.
3. **Directory (LV2)** holds the libraries: catalogs, data structures and parameters, with no behaviour. It plays the role of a `.blend` file, holding the databases, files and assets that build into the single-file game.
4. **Penthouse (LV3)** holds prefab toys. Each one is built only from the levels below and proves that they work. Examples are the procedural humanoid and a future foliage system.
5. **The game** is its own set of modules on top of the engine. Its mechanics define and run game-specific behaviour.

The engine knows nothing about the game, and it runs standalone.

```
            ┌──────────────────────────────────────────────┐
            │  GAME  (Dimensions Freelancer)               │  mechanics, levels, entities,
            │  defines and executes game behaviour         │  presentation, UI, story, boot
            └───────────────┬──────────────────────────────┘
                            │ uses (imports) ↓    never the reverse
   ┌────────────────────────┴───────────────────────────────────────┐
   │ ENGINE                                                          │
   │  LV3 PENTHOUSE  prefab toys built only from LV0 + LV2           │
   │  LV2 DIRECTORY  libraries: data structures, catalogs, params    │
   │  LV1 LOBBY      the game loop: the clock, which updates all     │
   │  LV0 BASEMENT   base systems: physics, rigs, maths, maps, render│
   └─────────────────────────────────────────────────────────────────┘
```

---

## 2. The levels in detail

Each level below lists what it is, what it owns, what it may import, what it must never do, and how to tell whether a file belongs there.

### LV0 Basement: base engine systems

**What it is:** the mechanisms every game could use. It answers the question "how does the world work?" and never "what is this game?".

**It owns:**
- Physics: bodies, collision, forces, constraints, joints, motors, motion, particles.
- The world's one spatial grid. There is no shadow index anywhere else.
- Navigation and traffic primitives.
- Rigs and keyframe animation (`basement/physics/animation/`).
- Attachments, the asset library mechanism (`assetLibrary`: templates, `extends`, typed resources and qualified ids `library:local`), and snapshots.
- The map system and room graph (`basement/maps/`), rendering (`basement/rendering/`), controls (`basement/controls/`) and maths.
- Services that are still missing are Basement work too: audio, a UI layer, lighting, timers, decals, the game-wide save envelope and generic asset loading. See `docs/migration/README.md`.

**It may import:** only other Basement code. Each package should depend on as few of its neighbours as it can. For example, `maps` imports only `physics`.

**It must never:**
- import the Lobby, the Directory, the Penthouse or the game;
- contain a game name, such as `df_`, `apartment`, `ganger`, a character or a venue;
- read game globals such as `window.game`, `GAME_DB` or `DFNative`;
- advance itself. Each system exposes `updateState()`, and the Lobby calls it.

**The belongs-here test:** would a different game, such as a racing game or a stealth game, use this file unchanged? If so, it's Basement. If you would have to delete a game name first, it's not.

**How games hand it information:** through parameters, templates, data packets and hooks. Two examples are the map builder's `decorate(packet, info)` and an entity's `entity_type`. A hook is a slot the game fills; the Basement still contains no game logic.

### LV1 Lobby: the game loop

**What it is:** the clock and the order in which things are updated. The Lobby runs the clock, and nothing moves without it, so the Lobby is what updates everything: physics, systems, mechanics, animation, camera and the frame that gets drawn.

**It owns:**
- the fixed timestep and accumulator;
- clamping stalls and capping the number of steps per frame;
- slow motion through `timeScale`, and pausing;
- the interpolation blend used for drawing;
- the frame schedule;
- the ordered list of update phases;
- the application coordinator that registers levels and systems and runs their hooks in order. Today that coordinator is `runtime/game-engine.mjs`, which belongs in the Lobby (see section 9).

**The jacks:** `levelLobby.plugIn({...})` takes the following jacks:
- `isRunning`, `beginFrame`, `frameRateLimit`, `acceptFrame`, `timeScale`, `isPaused`;
- `beforeStep`, `simulateStep`, `afterSimulation`;
- `renderFrame(blend)`, `endFrame`, `scheduleNextFrame`.

**Update order within one fixed step:** `input` → `beforePhysics` → `physics` → `afterPhysics` → `camera`. Drawing happens afterwards in `render(blend)`, which reads snapshots only.

**It may import:** the Basement, because it steps the Basement's systems.

**It must never:**
- know what the game is;
- contain game rules;
- keep its own world or spatial index.

**The rule that follows from it:** no system, level, mechanic or prefab may run its own loop, its own `requestAnimationFrame`, its own timer that moves the world, or its own call that advances a world. Physics enforces this: `physicsSystem.updateState()` refuses to step without the private authority held by the runtime. Anything that changes over time is a system with `updateState()` or a phase hook, and the Lobby calls it.

### LV2 Directory: the libraries

**What it is:** the game's databases, files and assets. Think of it as a `.blend` file holding data blocks: the game is built into a single HTML file (`DFAB V8.html`), and the Directory is where everything that gets packed into that file lives as data.

**It owns:**
- catalogs, such as the prop catalog `game-assets/props.json`, items, weapons and vehicles;
- data structures and their parameters, such as the humanoid skeleton, proportions, builds and clips in `directory/humanoid/`;
- map layouts (`game-assets/maps/<map_id>.json`) and `GAME_DB` (`game-db/`);
- balance numbers, palettes, materials and authored reactions;
- templates that Basement factories accept;
- the list of libraries that make up the game.

**Mechanics versus libraries.** This is the most important distinction in the project.
- **A library** is a catalog that can be used but does not define behaviour, only parameters. "A shotgun has 6 pellets, spread 0.3 and range 220" is a library entry.
- **A mechanic** defines and runs game-specific behaviour. "When the player fires, spawn pellets, apply recoil and alert the room" is a mechanic, and mechanics belong to the game.
- When data needs a behaviour, the data **names** it (for example `"behaviour": "vending_machine"`), and the game registers the mechanic under that name. This works the same way as the `entity_type` registry. The Directory never holds the code.

**It may import:**
- its own JSON and data files;
- **types and constants** from the Basement or the Penthouse, so its data matches their shapes. For example, `rigDefinition` and `animationClip` are used to describe a clip.

**It must never:**
- contain behaviour, such as update functions, event handlers, AI, crowd logic, sound playback or drawing;
- import the game (`gameplay/`, `entities/`, `levels/`, `presentation/`, `traffic/` or any classic folder);
- create entities or worlds;
- start or compose the runtime;
- contain the generic loading machinery. Resolving `extends`, placements over type defaults, and templates is Basement work. The Directory supplies the files and the list of what to load.

**The belongs-here test:** could a designer edit this file without knowing JavaScript, because it is numbers, names, shapes and lists? Or is it a small pure function that only reshapes data once at load and holds no state, such as converting authored units to engine units? Then it belongs in the Directory. If it runs every frame, reacts to events or decides what happens, it doesn't.

### LV3 Penthouse: prefab toys

**What it is:** the proof that the levels below work. A prefab invents no new mechanism. It is built **only** from what the Basement provides (physics, forces, joints, rigs, maths) and the data structures the Directory provides, put together into something complete that runs. If a prefab runs, the levels under it are complete.

**Examples:**
- **The procedural humanoid.** It boots with a physics body and a rig, ready to stand, walk and be posed. It reads its skeleton, proportions and clips from the Directory, and it turns rig poses into render packets.
- **A future foliage system.** Complex plant life built from joints and forces for sway and wind, with plant data from the Directory.

**It may import:** the Basement, and the Directory's data structures and data.

**It must never:**
- import the game;
- contain game rules. The humanoid can take a stance, but which stance a ganger takes when shot is the game's decision;
- contain a mechanism the Basement lacks. **If a prefab needs something missing, the missing piece goes into the Basement first**, and the prefab uses it.

**The belongs-here test:** is this a ready-made, reusable thing, such as a person or a tree, made entirely of engine parts and data, that a different game could drop in and configure? Then it belongs in the Penthouse.

### The game (Dimensions Freelancer)

**What it is:** the game's own modules, separate from the engine but using it. This is the layer that knows what Dimensions Freelancer is.

**It owns:**
- mechanics: combat rules, abilities, AI, encounters, venue life, crowds, story, missions and the effects of every interaction;
- the game's entity classes and their registration;
- levels, meaning which map is loaded with which systems and policies;
- presentation: how the game's things look, written as appearance producers that submit render packets to the Basement renderer;
- UI screens such as the HUD, menus, phone and inventory;
- the boot code that composes the runtime.

**It may import:** every engine level.

**Nothing in the engine may import it.**

---

## 3. The dependency rule

An arrow means "may import from". Every arrow points down. An import that points up, or sideways between Penthouse and game, is a bug.

| From \ To | Basement | Lobby | Directory | Penthouse | Game |
|---|---|---|---|---|---|
| **Basement** | yes (prefer few cross-package links) | **no** | **no** | **no** | **no** |
| **Lobby** | yes | yes | **no** | **no** | **no** |
| **Directory** | types and constants only | **no** | yes | types and constants only | **no** |
| **Penthouse** | yes | **no** (it gets stepped; it never steps) | yes | yes | **no** |
| **Game** | yes | yes | yes | yes | yes |

Two consequences:
- **The engine runs standalone.** Basement, Lobby, Directory structures and Penthouse can be loaded, stepped and tested with no game code present. Their tests and examples must prove it: `basement/maps/tests/maps.test.mjs` already rejects imports from game code.
- **The game is replaceable.** Deleting the game folders must leave a working engine, and the engine's tests must pass without them.

---

## 4. Who updates what

| Thing | Updated by | How |
|---|---|---|
| Physics world | Lobby | `simulateStep` → runtime → `physicsSystem.updateState(step, authority)`. A private Symbol held by the runtime authorizes it; anything else that calls it is refused. |
| Rigs and animation | Lobby | Inside the physics step (`physics.rigs`). Mechanics choose clips during `beforePhysics`. |
| Maps (door motion, exterior streaming, room occupancy) | Lobby | Through a system's `updateState()` hook in the phase list. Map objects never run themselves. |
| Game mechanics | Lobby | Registered systems with phase hooks (`input`, `beforePhysics`, `afterPhysics`). |
| Camera | Lobby | The `camera` phase. |
| Drawing | Lobby | `renderFrame(blend)` → `render(blend)`. It reads snapshots and must not change the world. The runtime rejects entity creation and rig changes during rendering. |
| Level changes | Lobby | Between steps, never in the middle of one. |

If you are tempted to write `setInterval`, `requestAnimationFrame`, `setTimeout` that moves something, or `while (running)`, stop. Make it a system and register it.

---

## 5. Code style: the g7 conventions

ETERNAL's g7 UPBGE engine scripts are the reference for API shape and style. Read them in `docs/engine-reference/` (`base-game-script.py` from 3.3.2023 and `base-game-script-2.0.py` from 3.11.2024).

- **Elements, systems, tools.** An engine is made of three kinds of thing:
  - *elements* are things in the world, created through `create…` factories such as `createCharacter` or `createEntity`;
  - *systems* are kept current by `updateState()`, which the Lobby calls;
  - *tools* are helpers such as timers, recorders and debuggers.
- **`updateState()` is the update method's name.** Don't use `update()`, `tick()` or `step()` for a system's per-step work.
- **Named state constants** instead of magic values: a states library of `UPPER_SNAKE` constants.
- **Data travels as packets:** plain objects of snake_case keys that describe an entity or a frame, such as entity packets and render packets.
- **Templates:** a packet can name a template, and templates `extend` one another.
- **Naming:**
  - lowercase class names (`physicsSystem`, `levelLobby`, `mapInstance`, `roomGraph`);
  - `snake_case` fields and packet keys;
  - `camelCase` methods;
  - `UPPER_SNAKE` constants.
- **Units:** positions are centres, in world units, seconds, kilograms and radians.
- **Level banners:** every engine file starts with its level banner on the first line, followed by a header comment that says what the file is for:
  - `// ===== LV0 BASEMENT =====`
  - `// ===== LV1 LOBBY =====`
  - `// ===== LV2 DIRECTORY =====`
  - `// ===== LV3 PENTHOUSE =====`

  A file's banner must match the folder it sits in.
- **Comments:** explain why and what the contract is, and keep them in plain English. Each public method's contract is documented in its package README or API reference, and that reference is updated in the same commit as the code.

---

## 6. Where a new file goes

Ask these questions in order. The first "yes" decides.

1. Does it advance time, own the frame or step order, or schedule updates? → **Lobby**.
2. Would any game use it unchanged, and does it contain no game name? → **Basement**. If the folder it should live in doesn't exist yet, create the package; don't put it elsewhere "for now".
3. Is it a ready-made, reusable thing built only from Basement parts and Directory data? → **Penthouse**.
4. Is it only data, parameters, a catalog, or a pure one-time reshaping of data? → **Directory**.
5. Otherwise it is **game** code: a mechanic, a game entity, a level, presentation, UI, story or boot.

A file that seems to fit two answers is really two files. Split it. Example: `directory/apartment-definition.mjs` holds the apartment's data, which belongs to the Directory, and a `decorate` behaviour plus a builder call, which belong to the game's apartment level.

---

## 7. The single-file build, `main`, and the classic code

- **Single-file build.** `node tools/build.mjs` builds `DFAB V8.html`, the whole game in one offline file. It concatenates the classic scripts listed in `SCRIPTS` and bundles the new modules through `@native` (`directory/native-entry.mjs`). CI runs `node tools/build.mjs --check`, so a change to `src` must be committed together with the rebuilt HTML.
- **`main` is the original.** `main` holds the original classic code. Compare against it whenever you need to know what the game did before, for example how hinged doors swung. Don't change behaviour silently: if the new engine changes how something feels, say so and get ETERNAL's agreement.
- **Pull request 178 is intentionally unmerged.** It began the native engine, but parts of its layering break these rules (see section 9). Work stacked on it must fix those breaches, not copy them.
- **Classic code** consists of the `.js` scripts in `app/`, `core/`, `engine/`, `world/`, `ui/`, `story/`, `buildings/`, and loose in the engine folders. It runs on the old `GameEngine`. Every classic script has exactly one row in `docs/migration/inventory.json` saying where it goes, and CI fails if a row is missing (`node tools/migration-inventory.mjs --check`). Classic code is migrated by moving it properly to its level. **No band-aid adapters** that make classic code look native.

---

## 8. Target folder structure

The level folders already exist and keep their names. The game currently has no single root folder.

> **Proposed, awaiting ETERNAL's confirmation:** gather all game code under one root, `src/game/`, so that the source tree reads engine | directory | game. Until that is confirmed, game code stays in `gameplay/`, `entities/`, `presentation/`, `levels/` and `traffic/`, and those folders count as "the game" for every rule above.

```
src/
  basement/                LV0  engine systems, one package per folder, each with README + tests
    physics/               bodies, collision, constraints, motors, motion, particles, spatial,
                           navigation, traffic primitives, animation (rigs), attachments
    maps/                  map builder, mapInstance (interior/exterior streaming), roomGraph
    rendering/             render system and canvas backend; consumes render packets
    controls/              input devices and bindings
    assets/                (to build) generic asset loading: libraries, extends, placements
    audio/ ui/ lighting/ timers/ saves/   (to build) the services the migration still lacks
  lobby/                   LV1  levelLobby (clock) + the runtime coordinator (now in src/runtime/)
  directory/               LV2  data only: JSON, catalogs, parameters, data-structure modules
    game-db/  game-assets/  humanoid/  ...
  penthouse/               LV3  prefabs: humanoid/ (rig + body + artist), foliage/ (future)
  game/                    (proposed) Dimensions Freelancer
    boot/                  composes the runtime: registers entity types, systems, levels
    mechanics/             combat, abilities, AI, encounters, venue life, crowds, story
    entities/              the game's entity classes
    levels/                one module per map: which data, which systems, which policies
    presentation/          appearance producers -> render packets
    ui/                    HUD, menus, phone, inventory, dialogue
```

---

## 9. Known mismatches today

Audited on 2026-11-12 by tracing every relative import of the new `.mjs` files. These are recorded so nobody copies them. Each one is to be fixed by moving code to its level, not by adding exceptions.

**Correct and standalone:**
- `basement/physics`, `basement/rendering` and `basement/controls` import nothing outside themselves.
- `basement/maps` imports only `physics`.
- `lobby/level-lobby.mjs` imports nothing.
- `runtime/` imports only the Basement and the Lobby.
- None of these files contain game names.

**Mismatches:**
1. `src/runtime/` (`game-engine.mjs`, `game-level.mjs`) is the Lobby's coordinator, but it lives in its own folder. It belongs in `lobby/`. Its example pages also import Directory files.
2. **Game composition sits in the Directory:**
   - `native-entry.mjs` imports every layer, including `gameplay`, `entities`, `levels` and `presentation`;
   - `game-runtime.mjs` composes the runtime;
   - `game-actor-factory.mjs` and `game-vehicle-factory.mjs` are factories;
   - `game-entity-types.mjs`, `game-street.mjs` and `game-abilities.mjs` import game folders.

   All of these belong in game boot or mechanics.
3. **Behaviour sits in the Directory:**
   - `venue-crowd.js`, `cafe-life.js`, `club-life.js` and `lobby-life.js`;
   - `game-sound.js`, `effects-system.js`, `collision-system.js`, `world-session.js` and `world-query.js`;
   - `game-controls.js` and `new-game-state.js`;
   - the `decorate` hook in `apartment-definition.mjs`.
4. **Generic loading sits in the Directory.** The resolution logic in `game-maps.mjs` and `game-assets.mjs` should become a Basement asset system, leaving the Directory with the data and the list of files.
5. **Drawing code sits in the Directory.** `directory/weapon-appearance.mjs` draws (and a file with the same name exists in `presentation/`). It belongs in presentation, or in a Penthouse prefab.
6. **Tools and examples sit in the Directory:** `validate-boss-records.mjs`, `runtime-example.mjs` and `rendering-example.mjs`.
7. **Classic kits sit loose in `basement/`:** 22 classic `.js` files at the top level (sound, ui, timer, canvas and others). Two classic files read game globals: `basement/controls-system.js` and `lobby/level-lobby.js`.
8. **The humanoid is half migrated:**
   - Motion is native: the Basement rig, Directory data in `directory/humanoid/`, and the game's clip choice in `gameplay/animation/humanoid-system.mjs`.
   - Drawing is classic: `penthouse/procedural-humanoid.js`, `gl-humanoid.js` and `garment-kit.js`, plus `ui/humanoid-render.js`, `bodies.js`, `wardrobe.js` and `poses.js`.
   - The Penthouse has no native module yet.
9. **Naming.** Some native systems use `update()` or `updateDoors()` instead of `updateState()`, for example `roomGraph.update()` and `mapInstance.updateDoors()`. Most new files lack their level banner.
10. **A behaviour regression from PR 178:** hinged doors. In `main`, every interior hinged door, including the apartment's, was a physical swinging leaf with a spring. PR 178 made them kinematic and auto-opening. Restore the swinging behaviour.

When one of these is fixed, remove it from this list in the same commit.

---

## 10. Checks that enforce this

Already in CI (`.github/workflows/build.yml`):
- the build check;
- the physics tests;
- the map tests, including the game-neutral import check;
- the migration-inventory check.

To be added, as agreed in planning:
- **A layering check over every `src` file.** It applies the table in section 3, the game-name ban in the Basement, Lobby and Penthouse, and banner-matches-folder.
- **A standalone check.** It runs the engine tests with the game folders absent.

Until those exist, reviewers apply sections 3 and 6 by hand.

---

## 11. Glossary

- **Element:** a thing in the world, made by a `create…` factory.
- **System:** a service kept current by `updateState()`, which the Lobby calls.
- **Tool:** a helper with no world state of its own, such as a timer, recorder or debugger.
- **Packet:** a plain snake_case data object describing an entity or a frame.
- **Template:** a named packet base that other packets and templates `extend`.
- **Library:** a Directory catalog of parameters. It has no behaviour.
- **Mechanic:** game code that defines and runs behaviour.
- **Prefab:** a Penthouse toy made only from Basement mechanisms and Directory data.
- **Host:** which runtime owns a map today. A map file's `"host"` field says `native` or `classic`.
- **Classic:** the original engine and scripts that `main` holds, and that the playable build still links.
