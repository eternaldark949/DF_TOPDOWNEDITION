# src

Read [READ-FIRST/ENGINE-ARCHITECTURE.md](../READ-FIRST/ENGINE-ARCHITECTURE.md) first.

| Folder | What it is |
|---|---|
| [engine/](engine/) | **The new engine**, by level: `basement/` (LV0), `lobby/` (LV1), `directory/` (LV2), `penthouse/` (LV3). Runs standalone. |
| [../reference/classic/](../reference/classic/) | **Classic code, read-only**, moved out of `src/`. Nothing in `src/` may import it; read it only for how things looked and felt. |

`tools/check-layout.mjs` (CI) enforces the quarantine and the engine's import rules, and that `src/` holds only `engine/`. The old `src/game/` was cut: a game is written again on the engine, to its rules.
