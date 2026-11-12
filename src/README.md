# src

Read [READ-FIRST/ENGINE-ARCHITECTURE.md](../READ-FIRST/ENGINE-ARCHITECTURE.md) first.

| Folder | What it is |
|---|---|
| [engine/](engine/) | **The new engine**, by level: `basement/` (LV0), `lobby/` (LV1), `directory/` (LV2), `penthouse/` (LV3). Runs standalone. |
| [game/](game/) | **The game**: `boot/`, `mechanics/`, `entities/`, `levels/`, `presentation/`, `audio/`, `data/`, `examples/`. Uses the engine. |
| [legacy/](legacy/) | **Quarantined classic code**, at its original paths. Nothing outside it may import it. |

`tools/check-layout.mjs` (CI) enforces the quarantine and the engine's import rules, and that `src/` holds only these three folders.
