# LV1 Lobby: the game loop

The clock, the fixed timestep, pausing and slow motion, the update order (`input` → `beforePhysics` → `physics` → `afterPhysics` → `camera`, then `render(blend)`), and the runtime coordinator that registers levels and systems. The Lobby runs the clock, so it updates everything; nothing else may run its own loop.

- **May import:** `src/engine/basement/` and `src/engine/lobby/`.
- **Must never:** know the game, contain game rules, or keep its own world or spatial index.
- **Banner:** every `.mjs` file starts with `// ===== LV1 LOBBY =====`.

Section 2 of [READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md) has the full rules.
