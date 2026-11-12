# src/engine: the engine

The four engine levels. Everything here runs standalone: nothing in `src/engine/` may import `src/game/`, `src/legacy/` or any other folder outside `src/engine/`. Read [READ-FIRST/ENGINE-ARCHITECTURE.md](../../READ-FIRST/ENGINE-ARCHITECTURE.md) before adding anything.

| Folder | Level | Holds |
|---|---|---|
| [basement/](basement/) | LV0 | Base engine systems: physics, forces, joints, rigs, maths, spatial queries, maps, rooms, rendering, controls, audio service |
| [lobby/](lobby/) | LV1 | The game loop: the clock, the update order, the runtime coordinator |
| [directory/](directory/) | LV2 | The data layer: data structures, the registry, loading, the engine's default libraries |
| [penthouse/](penthouse/) | LV3 | Prefab toys built only from the Basement and the Directory: the humanoid, foliage |

`tools/check-layout.mjs` (run in CI) enforces the import rules and the level banners.
