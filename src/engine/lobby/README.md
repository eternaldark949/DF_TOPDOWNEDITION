# LV1 Lobby: the game loop

The clock, the fixed timestep, pausing and slow motion, the update order (`input` → `beforePhysics` → `physics` → `afterPhysics` → `camera`, then `render(blend)`), and the loading of levels between ticks. The Lobby runs the clock, so it updates everything; nothing else may run its own loop.

- `game-loop.mjs`: `gameLoop`, the loop itself: levels, systems and their hooks in order, pausing, entity lifetimes across level changes, start and stop. The engine (`src/engine/game-engine.mjs`) builds one and exposes it as `engine.lobby`.
- `level-lobby.mjs`: `levelLobby`, the clock: fixed steps, the frame-rate limit, and the blend between steps (`engine.lobby.clock`).
- `runtime/game-level.mjs`: `gameLevel`, the contract every level fills in.

- **May import:** `src/engine/basement/` and `src/engine/lobby/`.
- **Must never:** know the game, contain game rules, or keep its own world or spatial index.
- **Banner:** every `.mjs` file starts with `// ===== LV1 LOBBY =====`.

Section 2 of [READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md) has the full rules.
