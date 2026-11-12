# src

Read [READ-FIRST/ENGINE-ARCHITECTURE.md](../READ-FIRST/ENGINE-ARCHITECTURE.md) first.

| Folder | What it is |
|---|---|
| [engine/](engine/) | **The new engine**, by level: `basement/` (LV0), `lobby/` (LV1), `directory/` (LV2), `penthouse/` (LV3). Runs standalone. |
| [game/](game/) | **The new game**: `mechanics/`, `audio/`, `data/`. Uses the engine. |
| [legacy/](legacy/) | **Quarantined classic code**, at its original paths. Nothing outside it may import it. |
| `basement/`, `lobby/`, `runtime/`, `directory/`, `penthouse/`, `gameplay/`, `entities/`, `presentation/`, `levels/`, `traffic/` | **Native code written before the new structure** (PR 178 and its follow-ups). It is not legacy, but it is not sorted yet. Each file moves into `engine/` or `game/` at its proper level, split where it mixes levels, using the audit in section 9 of the architecture file. Add no new files here. |

`tools/check-layout.mjs` (CI) enforces the quarantine and the engine's import rules.
