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
3. **Directory (LV2)** is the engine's data layer: the libraries every engine level reads from. It defines what each kind of data looks like, keeps the registry where everything is looked up by id, loads library files, and ships the engine's own default libraries. It has no behaviour. In Blender terms it is `bpy.data`: how data blocks are typed, stored and found.
4. **Penthouse (LV3)** holds prefab toys. Each one is built only from the levels below and proves that they work. Examples are the procedural humanoid and a future foliage system.
5. **The game** is its own set of modules on top of the engine. Its mechanics define and run game-specific behaviour, and its content (`game/data`: catalogs, maps, `GAME_DB`) is the `.blend` file that it registers into the Directory at boot.

The engine knows nothing about the game, and it runs standalone.

```
            ┌──────────────────────────────────────────────┐
            │  GAME  (Dimensions Freelancer)  src/game/    │  mechanics, audio, data, levels,
            │  defines and executes game behaviour         │  entities, presentation, UI, boot
            └───────────────┬──────────────────────────────┘
                            │ uses (imports) ↓    never the reverse
   ┌────────────────────────┴───────────────────────────────────────┐
   │ ENGINE  src/engine/                                             │
   │  LV3 PENTHOUSE  prefab toys built only from LV0 + LV2           │
   │  LV2 DIRECTORY  data layer: structures, registry, loading, defaults
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
- Attachments and snapshots. The Basement *uses* data from the Directory's registry, which it is handed as an object (for example `new physicsSystem({asset_library})`); it never imports the Directory.
- The map system and room graph (`basement/maps/`), rendering (`basement/rendering/`), controls (`basement/controls/`) and maths.
- Services that are still missing are Basement work too: the audio service (channels, mixing, reverb, through-door muffling), a UI layer, lighting, timers, decals and the game-wide save envelope. See `docs/migration/README.md`. Data loading is not one of them: it is the Directory's job.

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
- the application coordinator that registers levels and systems and runs their hooks in order. That coordinator is `engine/lobby/runtime/game-engine.mjs` (`gameEngine`).

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

### LV2 Directory: the engine's data layer

**What it is:** the libraries accessible to every engine level, and the one place data is defined, registered, loaded and found. It contains data and the plumbing that makes data findable. It contains no behaviour. In Blender terms the Directory is `bpy.data` (how data blocks are typed, stored and looked up), and the game's content in `game/data` is the `.blend` file.

**Its four jobs:**

1. **Data structures.** What each kind of data looks like, and the checks that a library entry is well formed: a prop type, a map layout, a room set, a skeleton, an animation clip, a material, a vehicle model, a sound bank, a plant species. A structure lists fields, units, defaults and allowed values. This is what "the Directory provides the data structure" means for a prefab: the humanoid prefab reads a skeleton, proportions and clips whose shape the Directory defines.
2. **The registry.** The one place anything asks for data by its qualified id, `library:local` (for example `df_props:catalog`). It holds the loaded libraries, their typed resources (`{kind, data}`) and their templates, and resolves template `extends`. It is `assetLibrary` in `engine/directory/registry.mjs`. Engine systems receive the registry as an object (the Basement's *data source* contract: `resolveTemplate()` and `getResource()`), so no lower level imports the Directory.
3. **Loading.** Reading library files and resolving them once, at load time: placements over their type's defaults (with `null` removing a default), whole map layouts, template `extends`, authored units converted to engine units. Loading only reshapes data and holds no world state, so it does not break the no-behaviour rule. It is `engine/directory/loading.mjs`, with the shapes it reads in `structures.mjs`.
4. **The engine's own default libraries.** The data the engine needs to run with no game installed: the default entity kinds (static, prop, ghost trigger, decoration and so on), default materials, a default humanoid skeleton, builds and base clips, and later default plant species. These are what let the Penthouse prefabs boot standalone.

**It does not hold the game's content.** Dimensions Freelancer's catalogs, maps, `GAME_DB`, character builds and balance numbers live in `game/data`. Game boot registers them into the Directory. The single-file build packs both the Directory and `game/data` into `DFAB V8.html`.

**Mechanics versus libraries.** This is the most important distinction in the project.
- **A library** is a catalog that can be used but does not define behaviour, only parameters. "A shotgun has 6 pellets, spread 0.3 and range 220" is a library entry.
- **A mechanic** defines and runs game-specific behaviour. "When the player fires, spawn pellets, apply recoil and alert the room" is a mechanic, and mechanics belong to the game.
- When data needs a behaviour, the data **names** it (for example `"behaviour": "vending_machine"`), and the game registers the mechanic under that name. This works the same way as the `entity_type` registry. Neither the Directory nor `game/data` holds the code.

**It may import:** its own data files, and **types and constants** from the Basement so that its structures match the shapes the Basement accepts (for example `rigDefinition` and `animationClip` for a clip).

**It must never:**
- contain behaviour: update functions, event handlers, AI, crowd logic, sound playback or drawing;
- contain game content or a game name: no `df_` library, no map of this game, no `GAME_DB`;
- import the Lobby, the Penthouse or the game;
- create entities or worlds, or start or compose the runtime.

**The belongs-here test:** does it say what a kind of data looks like, where data is found, how a file becomes ready-to-use data, or is it a default any game could start from? Then it is the Directory. If it is this game's particular data, it is `game/data`. If it runs every frame, reacts to events or decides what happens, it is a mechanic.

### LV3 Penthouse: prefab toys

**What it is:** the proof that the levels below work. A prefab invents no new mechanism. It is built **only** from what the Basement provides (physics, forces, joints, rigs, maths) and the data structures the Directory provides, put together into something complete that runs. If a prefab runs, the levels under it are complete.

**Examples:**
- **The procedural humanoid.** It boots with a physics body and a rig, ready to stand, walk and be posed. It reads its skeleton, proportions and clips from the Directory, and it turns rig poses into render packets.
- **A future foliage system.** Complex plant life built from joints and forces for sway and wind, with plant data from the Directory.

**It may import:** the Basement, and the Directory (its structures, registry and default libraries). A prefab boots on the Directory's defaults; the game can hand it its own data instead.

**It must never:**
- import the game;
- contain game rules. The humanoid can take a stance, but which stance a ganger takes when shot is the game's decision;
- contain a mechanism the Basement lacks. **If a prefab needs something missing, the missing piece goes into the Basement first**, and the prefab uses it.

**The belongs-here test:** is this a ready-made, reusable thing, such as a person or a tree, made entirely of engine parts and data, that a different game could drop in and configure? Then it belongs in the Penthouse.

### The game (Dimensions Freelancer)

**What it is:** the game's own modules, separate from the engine but using it. This is the layer that knows what Dimensions Freelancer is.

**It owns:**
- mechanics: combat rules, abilities, AI, encounters, venue life, crowds, story, missions and the effects of every interaction;
- audio: the game's use of the Basement audio service, meaning which music plays in which room, which sound a hit makes, and the dialogue lines;
- data (`game/data`): the game's content, registered into the Directory at boot: the prop catalog, the map layouts, `GAME_DB`, builds, items, weapons, vehicles and balance numbers;
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
| **Directory** | types and constants only | **no** | yes | **no** | **no** |
| **Penthouse** | yes | **no** (it gets stepped; it never steps) | yes | yes | **no** |

The Basement and the Lobby use the Directory's registry without importing it: the boot code creates the registry and hands it to them as an object.
| **Game** | yes | yes | yes | yes | yes |

Two consequences:
- **The engine runs standalone.** Everything in `src/engine/` (Basement, Lobby, Directory with its default libraries, Penthouse) can be loaded, stepped and tested with no `src/game/` present. Their tests and examples must prove it: `basement/maps/tests/maps.test.mjs` already rejects imports from game code.
- **The game is replaceable.** Deleting `src/game/` must leave a working engine, and the engine's tests must pass without it.

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
4. Does it define a kind of data, register or look data up, load and resolve data files, or provide a default any game could start from? → **Directory**.
5. Is it this game's own data: a catalog entry, a map, a balance number? → **`game/data`**.
6. Otherwise it is **game** code: a mechanic, audio use, a game entity, a level, presentation, UI, story or boot.

A file that seems to fit two answers is really two files. Split it. Example: `directory/apartment-definition.mjs` holds the apartment's data, which belongs in `game/data`, and a `decorate` behaviour plus a builder call, which belong to the game's apartment level.

---

## 7. The single-file build, `main`, and the classic code

- **Single-file build.** `node tools/build.mjs` builds `DFAB V8.html`, the whole game in one offline file. It concatenates the classic scripts listed in `SCRIPTS` and bundles the new modules through `@native` (`game/boot/native-entry.mjs`). CI runs `node tools/build.mjs --check`, so a change to `src` must be committed together with the rebuilt HTML.
- **`main` is the original.** `main` holds the original classic code. Compare against it whenever you need to know what the game did before, for example how hinged doors swung. Don't change behaviour silently: if the new engine changes how something feels, say so and get ETERNAL's agreement.
- **Pull request 178 is intentionally unmerged.** It began the native engine, but parts of its layering break these rules (see section 9). Work stacked on it must fix those breaches, not copy them.
- **Classic code is quarantined in `src/legacy/`.** Every classic script, stylesheet and the page shell (`legacy/index.html`) was moved there unchanged on 2026-11-12, at its original path: `legacy/engine/loop.js` is `src/engine/loop.js` on `main`. It runs on the old `GameEngine`. The quarantine rules:
  1. Nothing outside `src/legacy/` imports from it.
  2. Legacy code reaches the new engine only through the bundled `DFNative` object; legacy scripts import nothing.
  3. No classic `.js`, `.cjs` or `.css` file exists anywhere else in `src`, and no new code is added to `src/legacy/`.
  4. A file leaves quarantine only by being **rewritten** at its proper level in `src/engine/` or `src/game/`; then it is deleted from `src/legacy/` and its row is removed. Nothing is moved back out as it is.

  Every classic script has exactly one row in `docs/migration/inventory.json` saying where it goes, and CI fails if a row is missing (`node tools/migration-inventory.mjs --check`). **No band-aid adapters** that make classic code look native.

---

## 8. Folder structure

ETERNAL's layout (2026-11-12): `src/` holds two roots, `engine/` and `game/`, plus the quarantine `legacy/`. Everything native now lives in `engine/` or `game/`. Entries marked *(to build)* do not exist yet.

```
src/
  engine/                         the engine: runs standalone, knows nothing about the game
    basement/                     LV0  base systems, one package per folder, each with README + tests
      physics/                    bodies, collision, constraints, motors, motion, particles, spatial,
                                  navigation, traffic primitives, animation (rigs), attachments
      maps/                       map builder, mapInstance (interior/exterior streaming), roomGraph
      rendering/                  render system and canvas backend; consumes render packets
      controls/                   input devices and bindings
      audio/ ui/ lighting/ timers/ saves/   (to build) the services the migration still lacks
    lobby/                        LV1  level-lobby.mjs (the clock)
      runtime/                         gameEngine and gameLevel: the coordinator that runs the phases
    directory/                    LV2  the data layer: registry.mjs, structures.mjs, loading.mjs (to build: defaults)
    penthouse/                    LV3  prefabs (to build: humanoid/, foliage/)
  game/                           Dimensions Freelancer
    boot/                         composes the runtime: native-entry.mjs (the DFNative bundle's entry),
                                  game-runtime.mjs, entity-type registration, actor and vehicle factories
    mechanics/                    game systems: abilities, actors, animation choice, attacks, combat,
                                  encounters, items, player control and state, session, traffic manager
    entities/                     the game's entity classes (player, NPCs, bosses, drones, traffic vehicle)
    levels/                       one module per map: apartment.mjs and its map definition
    presentation/                 appearance producers -> render packets; weapon models
    audio/                        (empty) the game's sounds and music, through the Basement audio service
    data/                         the game's content: GAME_DB (game-db/), game-assets/ (props, maps,
                                  libraries), humanoid builds, rules JSON, catalog modules
    examples/                     runnable pages that boot the game runtime in a browser
  legacy/                         quarantined classic code at its original paths (section 7)
```

Migration notes that described earlier cutovers are in `docs/migration/cutovers/`.

## 9. Known mismatches today

Audited on 2026-11-12, after the native code was sorted into `src/engine/` and `src/game/`. `tools/check-layout.mjs` passes: every engine file carries its level banner, imports only what section 3 allows, and names no game. What remains is work that needs real changes, not moves. Each item is fixed by rewriting code at its level, never by adding an exception.

1. **`game/data` holds code that depends on mechanics.** The catalog modules are pure one-time reshaping, which is allowed, but `game-abilities.mjs` imports `game/mechanics/abilities/ability-loadout.mjs` and `mechanics/values.mjs`. Data must not depend on mechanics: the shared value helpers belong with the Directory's structures, and the loadout conversion belongs to the mechanic.
2. **The engine has no default libraries.** `engine/directory/` and `engine/penthouse/` are empty, so no prefab can boot without the game. The humanoid's skeleton and clips exist only as game data (`game/data/humanoid/`).
3. **The humanoid is half migrated:**
   - Motion is native: the Basement rig, the game's data in `game/data/humanoid/`, and the game's clip choice in `game/mechanics/animation/humanoid-system.mjs`.
   - Drawing is classic: `legacy/penthouse/procedural-humanoid.js`, `gl-humanoid.js` and `garment-kit.js`, plus `legacy/ui/humanoid-render.js`, `bodies.js`, `wardrobe.js` and `poses.js`.
   - The Penthouse prefab (body, rig and artist, booting on Directory defaults) does not exist yet.
4. **Behaviour still in classic code.** The classic Directory scripts that hold behaviour (`legacy/directory/venue-crowd.js`, `cafe-life.js`, `club-life.js`, `lobby-life.js`, `game-sound.js`, `effects-system.js`, `collision-system.js`, `world-session.js`, `world-query.js`, `game-controls.js`, `new-game-state.js`) are quarantined. They are rewritten as game mechanics, not moved.
5. **Naming.** Some native systems use `update()` or `updateDoors()` instead of `updateState()`, for example `roomGraph.update()` and `mapInstance.updateDoors()`.
6. **A behaviour regression from PR 178:** hinged doors. In `main`, every interior hinged door, including the apartment's, was a physical swinging leaf with a spring. PR 178 made them kinematic and auto-opening. Restore the swinging behaviour.

When one of these is fixed, remove it from this list in the same commit.

---

## 10. Checks that enforce this

In CI (`.github/workflows/build.yml`):
- the build check;
- the physics, maps, controls and rendering tests, including the maps package's game-neutral import check;
- the migration-inventory check;
- **the layout check, `node tools/check-layout.mjs`.** It fails when:
  - a classic `.js`, `.cjs` or `.css` file sits outside `src/legacy/`, or a page outside `src/legacy/` is not an example;
  - any file outside `src/legacy/` imports from it, or a legacy script imports a module;
  - a file in `src/engine/` imports outside `src/engine/`, or imports a level that section 3 forbids;
  - a `.mjs` file in `src/engine/` lacks its level banner on the first line, or names the game (`df_`, `apartment`, `GAME_DB`, `DFNative` and so on) outside its tests.

Still to add: **a standalone check** that runs the engine's tests with `src/game/` and `src/legacy/` absent. Inside `src/game/`, reviewers apply sections 2 and 6 by hand: the check enforces only the engine's rules and the quarantine there.

---

## 11. Glossary

- **Element:** a thing in the world, made by a `create…` factory.
- **System:** a service kept current by `updateState()`, which the Lobby calls.
- **Tool:** a helper with no world state of its own, such as a timer, recorder or debugger.
- **Packet:** a plain snake_case data object describing an entity or a frame.
- **Template:** a named packet base that other packets and templates `extend`.
- **Library:** a catalog of parameters registered in the Directory, from the engine's defaults or from `game/data`. It has no behaviour.
- **Registry:** the Directory's lookup of loaded libraries by qualified id `library:local`.
- **Mechanic:** game code that defines and runs behaviour.
- **Prefab:** a Penthouse toy made only from Basement mechanisms and Directory data.
- **Host:** which runtime owns a map today. A map file's `"host"` field says `native` or `classic`.
- **Classic:** the original engine and scripts that `main` holds, and that the playable build still links.
