# src/legacy: quarantined classic code

Every classic script, stylesheet and the page shell of the original game, moved here unchanged on 2026-11-12. Paths inside `legacy/` are the original paths, so `legacy/engine/loop.js` is `src/engine/loop.js` on `main`. `MAP.md` is the classic source map (its paths are relative to this folder).

The quarantine rules (enforced by `tools/check-layout.mjs` in CI):

1. Nothing outside `src/legacy/` imports from it.
2. Legacy code reaches the new engine only through the bundled `DFNative` object.
3. No new code is added here, and classic files may not be added anywhere else.
4. A file leaves quarantine only by being rewritten at its proper level in `src/engine/` or `src/game/`, after which it is deleted here and its row is removed from `docs/migration/inventory.json`. Nothing is ever moved back out as it is.

Fixes to the playable game that cannot wait for a rewrite may still be made here; keep them minimal and mention them in the commit.
