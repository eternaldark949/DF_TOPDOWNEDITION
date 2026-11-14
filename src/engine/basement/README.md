# LV0 Basement: base engine systems

The mechanisms any game could use: physics, forces, joints, motors, rigs and animation, maths, the world's one spatial grid, navigation, maps and rooms, rendering, controls, and the services still to build (audio, UI layer, lighting, timers, saves).

- **May import:** only `src/engine/basement/`.
- **Must never:** import another level or the game, contain a game name, read game globals, or advance itself. Each system exposes `updateState()` and the Lobby calls it.
- **Layout:** one package per folder, each with its own `README.md` (API), `tests/` and, where useful, `examples/` and `benchmarks/`.
- **Banner:** every `.mjs` file starts with `// ===== LV0 BASEMENT =====`.

Section 2 of [READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md) has the full rules.
