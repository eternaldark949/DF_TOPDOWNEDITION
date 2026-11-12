# src/game: Dimensions Freelancer

The game's own modules, on top of the engine. The game may import any engine level; nothing in `src/engine/` may import the game. Nothing here may import `src/legacy/`. Read [READ-FIRST/ENGINE-ARCHITECTURE.md](../../READ-FIRST/ENGINE-ARCHITECTURE.md) before adding anything.

| Folder | Holds |
|---|---|
| [boot/](boot/) | Composes the runtime: `native-entry.mjs` (the entry of the `DFNative` bundle), `game-runtime.mjs`, entity-type registration, actor and vehicle factories |
| [mechanics/](mechanics/) | Game behaviour: abilities, actors, attacks, combat, encounters, items, player control and state, the session, traffic, animation choice |
| [entities/](entities/) | The game's entity classes |
| [levels/](levels/) | One module per map, with its map definition |
| [presentation/](presentation/) | Appearance producers that submit render packets |
| [audio/](audio/) | The game's sounds and music, played through the Basement audio service |
| [data/](data/) | The game's content (`GAME_DB`, props, maps, builds, rules, catalogs), registered into the Directory at boot |
| [examples/](examples/) | Browser pages that boot the game runtime |
