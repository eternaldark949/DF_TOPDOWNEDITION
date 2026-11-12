# LV3 Penthouse: prefab toys

The proof that the levels below work. A prefab invents no mechanism: it is built only from Basement systems and Directory data, and boots on the Directory's default libraries with no game present. Planned: `humanoid/` (body, rig and artist) and `foliage/`.

- **May import:** `src/engine/basement/`, `src/engine/directory/` and `src/engine/penthouse/`.
- **Must never:** import the Lobby or the game, contain game rules, or contain a mechanism the Basement lacks. A missing mechanism is added to the Basement first.
- **Banner:** every `.mjs` file starts with `// ===== LV3 PENTHOUSE =====`.

Section 2 of [READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md) has the full rules.
