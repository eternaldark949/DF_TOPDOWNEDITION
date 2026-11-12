# Game asset libraries — Directory ownership

`entities.json` is the official starting library for the new entity contract. It defines game templates, shapes, tuning, tags and named resource bindings. `../game-assets.mjs` connects those resources to the existing `game-db` chapters rather than copying the cast, vehicles, enemies, items or map catalogs into another source file.

These are standalone-stage defaults, in pixels/seconds/radians/kg. They do not claim to convert the live game's full per-tick tuning, class logic or save formats yet. The current single-file game does not load this library until onboarding. Every existing world entity must eventually inherit the new `gameEntity` contract; the old classes will not be wrapped or run in parallel as substitute physics owners.

```js
import { physicsSystem } from '../../basement/physics/index.mjs';
import { createGameAssetLibrary } from '../game-assets.mjs';

const physics = new physicsSystem({ asset_library: createGameAssetLibrary() });
const player = physics.elements.createCharacter({
    template: 'df:player_949', position: [100, 100]
});
const appearance = player.getAsset('appearance').data;
player.setMovement([1, 0]);
```

The Basement knows about generic `assetLibrary` registration/resolution and `gameElements` creation. It contains no DF asset names or imports from the Directory. Inheritance resolves templates once; per-instance packets override them without modifying a shared template. Arrays replace; plain objects merge; IDs are qualified as `library_id:local_id`. Resource data and definitions are immutable to consumers.

`createGameAssetLibrary({game_db})` can use the live game's already-loaded database at integration time. The default ESM loader imports the same JSON chapters directly for independent tests/examples. Directory ESM loading requires a browser with JSON import attributes or Node 22+.

Additional image, audio, model and animation resource definitions belong here, with `kind` and their resource-specific data/URLs. The generic Basement library stores data; it does not load browser images/audio or embed game-specific factories. The existing `assets/` files and database chapters remain their source content.

Run `node --test tools/test-entity-assets.mjs` for the Directory library checks and `node --test src/basement/physics/tests/*.test.mjs` for the reusable engine contract.

The library now includes definitions for compound billboards/buildings, terrain regions, furniture, pickups, crowds/companions, traffic/driven/bumper vehicles, hinged/sliding doors, glass, scene actors/props, gondolas, lamps, foliage, markers and hazards. These instantiate official engine elements. Authored door joints use the entity spawn position by default; maps may override the world anchor explicitly. This is the native data contract, not a claim that the old classes have been rewritten.

Run `node --test tools/test-game-physics-scenarios.mjs` for six group-specific capability scenarios.

The `df_street` library adds official traffic/pedestrian templates and rules. Register their types with `registerStreetEntityTypes(world)` from `../game-street.mjs` (or construct `StreetPopulation`) before creating those templates/loading their saves. The new game-client API and cutover status are documented in `../STREET-POPULATION.md`.

Actor definitions now register `df_actor`, `df_npc` and `df_ganger` with `registerGameEntityTypes`. `createActorPacket` resolves civilian/teammate roles and imports old roster aliases once. Actor rules, appearances and the enemy weapon definition come from Directory resources and the existing enemy/item catalogs. See [actor API](../../gameplay/actors/README.md).

`df:abilities` is an immutable normalized catalog built from `game-db/progression.json` by `createAbilityCatalog`. Directory converts ticks/speeds once and supplies radius/launch defaults from `game-ability-rules.json`. Ability classes contain no copied balance table. [Ability API](../../gameplay/abilities/README.md).

`df:attacks` registers immutable firearm/melee/ability references built by `createAttackCatalog` from the same item and capability resources. Targeting defaults live in `game-attack-rules.json`. Definitions grant no inventory item or learned capability. See [universal attack API](../../gameplay/attacks/README.md).

`df:hunter` registers the real native Hunter class with inherited Ganger mechanics and a learned `hunter_claw` capability. `game-hunters.mjs` normalizes existing Hunter tuning and shares appearance authoring with the classic class. `createGameRuntime` now obtains item/attack catalogs from its single resolved asset library, so frontend, actor execution and restored capability validation use the same definitions. [Hunter API and remaining callers](../../gameplay/actors/README.md#hunter-the-first-specialized-hostile-conversion).

## Props and map layouts

`props.json` (library `df_props`, resource `catalog`) is the one prop catalog: 242 prop types used across every map, from the apartment's sofa to the cafe's counter. A type gives defaults: size, mass, colour, `decorType` (the art), `interactionType` and flags, plus `movable` when the player can push it. `maps/<map_id>.json` lists one map's placements (`{type, x, y}` plus only the fields that differ; `null` removes a default), lamps, NPC spawns and soft lights. Geometry (walls, exits, rooms, doors) stays in `game-db/places.json`.

`../game-maps.mjs` reads them: `resolveMapLayout(map_id)`, `resolvePlacement`, `isMovableProp`, `mapHost`, and `createMapLibraries()`, which `createGameAssetLibrary` registers (`df_props`, `df_maps`). The classic loader (`world/map-entities.js`) and the native apartment both build from these files. A map file's `host` is `native` once a Basement scene owns that map. The Basement map system (`src/basement/maps`) turns a layout plus geometry into a world. `node --test tools/test-map-layouts.mjs` checks the files.
