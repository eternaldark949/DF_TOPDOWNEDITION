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
