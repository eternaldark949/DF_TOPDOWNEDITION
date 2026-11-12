# src/game: Dimensions Freelancer

The game's own modules, on top of the engine. The game may import any engine level; nothing in `src/engine/` may import the game. Nothing here may import `src/legacy/`. Read [READ-FIRST/ENGINE-ARCHITECTURE.md](../../READ-FIRST/ENGINE-ARCHITECTURE.md) before adding anything.

| Folder | Holds |
|---|---|
| [mechanics/](mechanics/) | Game behaviour: combat, abilities, AI, encounters, venue life, crowds, story, missions |
| [audio/](audio/) | The game's sounds and music, played through the Basement audio service |
| [data/](data/) | The game's content (props, maps, `GAME_DB`, builds, items, balance), registered into the Directory at boot |

More folders (entities, levels, presentation, UI, boot) are proposed in section 8 of the architecture file and are added once confirmed.
