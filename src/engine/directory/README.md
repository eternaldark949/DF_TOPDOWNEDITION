# LV2 Directory: the data layer

The libraries every engine level reads from. Four jobs:

1. **Data structures:** what each kind of data looks like (prop type, map layout, skeleton, clip, material, vehicle model, sound bank, plant species), with validation.
2. **The registry:** the one place data is looked up by qualified id `library:local`, with templates and `extends`.
3. **Loading:** reading library files and resolving defaults, placements and `extends` once, at load time.
4. **Default libraries:** the data the engine needs to run with no game installed (default entity kinds, materials, a default humanoid skeleton and clips, default plants).

- **May import:** `src/engine/directory/`, and types and constants from `src/engine/basement/`.
- **Must never:** contain behaviour, contain game content or a game name (the game's data lives in `src/game/data/`), import the Lobby, the Penthouse or the game, or create entities or worlds.
- **Banner:** every `.mjs` file starts with `// ===== LV2 DIRECTORY =====`.

Section 2 of [READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md) has the full rules.
