# Working-game relationship audit

This is the reference for separating the existing game into four engine levels and Game content. **No gameplay or playable HTML changed in this audit.** The existing hotel demonstration remains the current rewrite build; this documentation does not imply the rest of the game has been ported.

The original was pinned to [`e597475d679c60d58c8f78121f10a597cc0f2800`](https://github.com/eternaldark949/DF_TOPDOWNEDITION/tree/e597475d679c60d58c8f78121f10a597cc0f2800). Every inspected input was checked against its Git blob identity. The original playable artifact is `DFAB V8.html`, blob `bc4056f5032e9cc955d1a01e4d89a99a66078036`.

Start with these readable documents:

- [How the working game connects](RELATIONSHIP_MAP.md): construction, clocks/frame loop, entities/collision, map activation, rendering/glow, mechanics, story/UI, assets/audio/weather and persistence.
- [Four-level ownership plan](OWNERSHIP_PLAN.md): what belongs to Basement, Lobby, Directory, Penthouse and Game; shared ownership contracts.
- [All 177 runtime JavaScript modules](MODULE_CATALOG.md): original source links, declaration/call counts, cross-file global dependencies and proposed destinations.
- [All 1,124 GameEngine prototype contributions](ENGINE_METHODS.md): exact source locations in build order, including constructor/accessors.
- [All 21 static map definitions](MAP_CATALOG.md): sizes, spawns and declared transitions; generated city content and runtime attachments remain additional relationships.
- [State and save compatibility](STATE_AND_SAVE.md): shared state evidence, authoritative ownership proposals and the original save field paths.
- [Migration order and verification gates](MIGRATION_SEQUENCE.md): dependency order, current foundation gaps and what must be checked before calling a concern complete.
- [Evidence, reproduction and limits](VALIDATION.md): precise counts, querying and verification boundaries.

## Evidence behind the prose

`relationships.json.gz` contains source-level facts, not executable game code. It records definitions and parameters, global references/access, call/new expressions, conservative target candidates, property reads/writes, mutation candidates, inheritance, prototype assembly, events/timers, DOM selectors/markup handlers, storage operations, registry/data references, arithmetic expressions, save/serialization fields, assets and build order. Use the query tool to inspect individual owners without opening a huge generated file.

The source inventory covers all runtime JavaScript files and includes development tooling and HTML inline handlers. **A complete source inventory is not complete dynamic execution coverage.** Computed keys, object aliases, callback timing, prototype wrappers and data-driven dispatch need runtime/source follow-up at migration boundaries. Calls without a static target include normal browser, Canvas, Math, collection and local callback calls; they are not evidence of missing code.

The original regression suite passed **117 scenarios, 1,426 assertions, zero failures**. That is a useful Node/VM baseline. It does not establish whole-game visual parity, real phone input or phone performance.

## The main architectural finding

Most engine concerns already exist, but their ownership is mixed. Methods spread across files still share a large GameEngine instance and globals. Game-specific locations, characters, quest gates and UI are interwoven with general geometry, scheduling and world services. The cleanup must separate these responsibilities and their state, not merely relocate files. Shared engine fixes should reach every consumer through common contracts.
