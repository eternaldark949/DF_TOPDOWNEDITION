# LV2 Directory: the data layer

The libraries every engine level reads from. Four jobs:

1. **Data structures** (`structures.mjs`): what each kind of data looks like, with validation.
2. **The registry** (`registry.mjs`): the one place data is looked up by qualified id `library:local`, with templates and `extends`.
3. **Loading** (`loading.mjs`): turning authored library data into ready-to-use data once, at load time.
4. **Default libraries** *(to build)*: the data the engine needs to run with no game installed (default entity kinds, materials, a default humanoid skeleton and clips, default plants).

- **May import:** `src/engine/directory/`, and types and constants from `src/engine/basement/`.
- **Must never:** contain behaviour, contain game content or a game name (a game's data lives in its own data folder, here `src/game/data/`), import the Lobby, the Penthouse or the game, or create entities or worlds.
- **Banner:** every `.mjs` file starts with `// ===== LV2 DIRECTORY =====`.

Section 2 of [READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md) has the full rules. Import everything from `index.mjs`. Tests: `node --test src/engine/directory/tests/*.test.mjs`.

## How the levels use it

The boot code creates the registry, registers the game's libraries into it, and hands it to the world:

```js
import { assetLibrary } from '../../engine/directory/index.mjs';
const registry = new assetLibrary({ libraries: [...] });
const physics = new physicsSystem({ asset_library: registry });   // or new gameEngine({ asset_library: registry })
```

The Basement never imports the Directory. It defines the contract it needs (a *data source*: `resolveTemplate()` and `getResource()`, see the physics API reference) and the registry provides it.

## Registry: `assetLibrary`

`new assetLibrary({libraries=[]}={})` accepts data-only library packets `{library_id, resources?, templates?}`. Ids are `library_id:local_id`; local keys use letters, digits, underscores, dots or hyphens. Libraries contain plain JSON only (no class instances, no non-finite numbers, no `__proto__`, `prototype` or `constructor` keys).

| Method | Contract |
|---|---|
| `registerLibrary(definition)` | Atomically resolve and validate resources and template inheritance; returns the registry. Duplicate library ids, cycles, missing parents or resources and unsafe data throw and leave nothing registered. |
| `hasTemplate(template_id)` | Boolean. |
| `getTemplate(template_id)` | Immutable, fully resolved template; an unknown id throws. |
| `resolveTemplate(template_id, overrides={})` | Detached copy of the template merged with `overrides`, resource bindings validated. With no id, `overrides` is used alone. |
| `listTemplates({entity_type?}={})` | Qualified template ids. |
| `getResource(resource_id)` | Immutable resource `{kind, ...}`; an unknown id throws. |
| `listResources({kind?}={})` | Qualified resource ids. |
| `exportLibraries()` | Detached copies of the registered library packets. |

`mergeDefinition(base, changes)` is the merge rule templates use: plain objects merge recursively, arrays and other values replace, nothing shared is mutated.

A template needs `entity_type`; its `assets` map slots to resource ids, qualified against its own library when written bare.

## Structures

| Kind | Shape |
|---|---|
| `prop_catalog` | `{ types: { <type>: { defaults: {...authored options}, movable?: boolean } } }` |
| `map_layout` | `{ map_id?, props: [{ type, x, y, ...fields }], ...other per-map lists }`. A placement's fields override its type's defaults; a field set to `null` removes that default. |

`validatePropCatalog(data, where?)` and `validateMapLayout(layout, types?, where?)` throw a `TypeError` naming the first problem, and return their input when it is well formed. `STRUCTURES` describes each kind in one line.

## Loading

| Function | Result |
|---|---|
| `resolvePlacement(placement, types)` | The placement's full options: its type's defaults, then its own fields, `null` removing a default. An unknown type throws. |
| `resolveLayout(layout, types, {omit=[]})` | `{ props, prop_types, ...other fields }`: every placement resolved, `prop_types[i]` naming the type of `props[i]`, every other field copied in authored order except those in `omit`. |
| `isMovable(type, types)` | The catalog's `movable` flag for the type (false when unknown). |

Every result is a detached copy. Loading keeps no state and never touches a world.

## Data checks

| Function | Result |
|---|---|
| `identifier(value)` | Returns `value` when it is a non-empty string other than `__proto__`, `prototype` or `constructor`; otherwise throws. |
| `nonnegative(value, name)` | Returns `value` when it is a finite number of zero or more; otherwise throws, naming `name`. |
| `jsonCopy(value)` | A deep copy that refuses anything JSON would drop or change (non-finite numbers, class instances, sparse arrays, cycles, unsafe keys), so the result survives a save file. |
