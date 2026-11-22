# reference/classic: the classic code, read-only

Every classic script, stylesheet and the page shell of the original game, quarantined unchanged in `src/legacy/` on 2026-11-12 and moved out of `src/` to here on 2026-11-15. Paths inside this folder are the original paths, so `reference/classic/engine/loop.js` is `src/engine/loop.js` on `main`. `MAP.md` is the classic source map (its paths are relative to this folder). The shipped build still reads these scripts (`classic/...` in `tools/build.mjs`).

This is a reference for how things looked, sounded and felt, never for how to build them. New code follows [READ-FIRST/ENGINE-API.md](../../READ-FIRST/ENGINE-API.md).

The rules (enforced by `tools/check-layout.mjs` in CI):

1. Nothing in `src/` imports from here.
2. Classic code reaches nothing new: the playable `DFAB V8.html` at the repo root is its last build, frozen.
3. No new code is added here, and classic files may not be added anywhere else.
4. A file leaves only by being rewritten to the API at its proper level in `src/engine/` or in a game written on it, after which it is deleted here and its row is removed from `docs/migration/inventory.json`. Nothing is ever moved back as it is.

`game-db/` holds the classic game's `GAME_DB` (items, enemies, places, story and the rest) as it last shipped, for reference.
