# Evidence and verification limits

## Pinned scope and measured counts

Original commit: `e597475d679c60d58c8f78121f10a597cc0f2800`.
Original tree: `28be92fb313c58c4426c2d76effff889fa3c8fcb`.

| Inventory | Count |
|---|---:|
| Exact Git-blob-verified inspected inputs | 231 |
| Runtime JavaScript files | 177 |
| Parsed units, including tools and HTML inline units | 215 |
| Parse failures | 0 |
| Runtime function/method/callback bodies | 6,657 |
| All inventoried declarations, including development and binding records | 8,178 |
| Runtime call/new expressions | 48,529 |
| All call/new expressions, including development | 51,479 |
| Call/new expressions without static target candidates | 43,874 |
| Cross-file global reference sites | 5,772 |
| Global accesses including same-file references | 9,722 |
| Grouped property-access records | 72,554 |
| Mutation-call candidates | 3,478 |
| Class inheritance declarations | 32 |
| GameEngine prototype contributions | 1,124 |
| Lifecycle/timer/event/promise source sites | 501 |
| DOM-related source sites | 999 |
| Storage/serialization-related source sites | 791 |
| Arithmetic-shaped expressions | 57,772 |
| Selected literal/data relationship records | 7,027 |
| Static maps | 21 |
| Asset-tree entries (11 media files, 3 README files) | 14 |

These are syntactic counts, not unique runtime objects or observed event counts. `+` may concatenate strings; arithmetic-shaped expressions are not all physics calculations. Storage-related matches include broad serialize/load/save naming and require interpretation.

## Checks actually performed

- All 231 inspected inputs matched their pinned Git blob hashes, including the 13,531,828-byte original playable HTML. Binary asset payloads were inventoried from tree metadata rather than individually downloaded/executed.
- Every runtime JavaScript file parsed; there were no parse failures. Original HTML was identity-checked, not redundantly parsed as a second copy of all source.
- Definition IDs were unique. Call target IDs and prototype registration IDs referenced real declarations. Evidence owners referenced declarations or explicitly named top-level `<script>` owners.
- All 177 runtime JavaScript files and 21 static map definitions were accounted for.
- Repeating extraction produced byte-identical compressed evidence. SHA-256: `56510b643ab4d79488669fb60dad9f9bb7ced9ba6df41352b5916057cef5c097`.
- The query tool was exercised against map-loading call records.
- The original `node tools/test-game-regressions.cjs` passed 117 scenarios and 1,426 assertions, with zero failures, against the pinned original HTML. Detailed scenario results are in `baseline-checks.json`.
- `node rewrite/tools/build.mjs --check` confirmed the existing rewrite artifact still matches its sources: 3,328,428 bytes. The audit did not change runtime sources or the artifact.

## Query the evidence

Only Node's built-in modules are needed for queries. Run from the repository root:

```sh
node rewrite/tools/query-audit.cjs --section definitions --file tiered-kit --limit 20
node rewrite/tools/query-audit.cjs --section calls --owner GameEngine.prototype._doLoadMap --limit 20
node rewrite/tools/query-audit.cjs --section members --owner GameEngine.prototype.update --limit 20
node rewrite/tools/query-audit.cjs --section globalAccesses --find _simTick --limit 20
node rewrite/tools/query-audit.cjs --section lifecycle --file map-loading --limit 20
node rewrite/tools/query-audit.cjs --section dataRelationships --find hotel_suite --limit 20
node rewrite/tools/query-audit.cjs --section saveFields --limit 5
```

`--callers Exact.Semantic.Name` returns only recorded candidate target relationships. To search unresolved dispatch as well, use `--section calls --find methodName`. `--owner` also matches nested callback owner names. Results report total matches and the limited number shown; a short display is not evidence that omitted records do not exist.

## Recreate the source extraction

Use a clean checkout of the pinned original as SOURCE_DIRECTORY, including `src`, `tools`, workflow files, README and `DFAB V8.html`. Keep the rewrite/audit tools outside that original snapshot. Install development-only `acorn@8.19.0` and `acorn-walk@8.3.5` in a separate tool directory, then run:

```sh
NODE_PATH=TOOL_DIRECTORY/node_modules node rewrite/tools/audit-relationships.cjs \
  --source SOURCE_DIRECTORY \
  --tree rewrite/audit/source-index.json \
  --commit e597475d679c60d58c8f78121f10a597cc0f2800 \
  --output OUTPUT_DIRECTORY
```

The extractor outputs `relationships.json.gz` and `coverage.json`. It verifies each inspected input against the supplied manifest. The manifest and map-definition snapshot are checked-in generated provenance/data, not runtime dependencies. Markdown catalogs and ownership proposals are documentation reviewed separately; rerunning the extractor does not rewrite them or establish their correctness automatically.

## What this does not prove

JavaScript permits runtime property assignment, arbitrary computed lookup, aliasing, prototypes, getters and callback registration. Conservative source targets are candidates, not a runtime call graph. Constructor observations do not establish every possible receiver. Inline handlers are parsed, but DOM replacement and runtime wiring can create additional relationships. Class/instance inference intentionally leaves uncertain paths unresolved.

No static extractor proves every execution path, story outcome, frame pixel, race, event ordering, alias mutation or device behavior. The readable map reviews major paths; individual feature migrations still need the source/behavior checks in MIGRATION_SEQUENCE. The original Node/VM suite uses mocks and cannot establish WebGL pixels, real touch behavior, a full playthrough or performance on the owner's phone. No new claim of complete parity is made here.
