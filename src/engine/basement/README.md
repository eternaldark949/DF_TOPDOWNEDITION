# LV0 Basement: base engine systems

The mechanisms any game could use: physics, forces, joints, motors, rigs and animation, maths, the world's one spatial grid, navigation, maps and rooms, rendering, controls, the UI overlay, and the services still to build (audio, lighting, saves).

- **May import:** only `src/engine/basement/`.
- **Must never:** import another level or the game, contain a game name, read game globals, or advance itself. Each system exposes `updateState()` and the Lobby calls it.
- **Timers:** the world's clock, [`timers/`](timers/README.md): the date and time of day, the day's phases and how dark each is, stepped by the Lobby.
- **Weather:** the world's weather, [`weather/`](weather/README.md): named states and intensities as data, fading from one to the next, stepped by the Lobby.
- **Agents:** street life, [`agents/`](agents/README.md): cars and people on foot as one kind of agent on a map's street network, the junctions' lights, kept round a focus.
- **UI:** one overlay for every screen, [`ui/`](ui/README.md): screens as data on a stack, focus and the menu actions through Controls' `menu` context, live values, transitions, drawn as page elements with CSS.
- **Units:** one length unit everywhere, the world unit; [`units/`](units/README.md) says how many make a metre and reads `"3 m"` or `"24 cm"` in data.
- **Layout:** one package per folder, each with its own `README.md` (API), `tests/` and, where useful, `examples/` and `benchmarks/`.
- **Banner:** every `.mjs` file starts with `// ===== LV0 BASEMENT =====`.

Section 2 of [READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md) has the full rules.
