import { assetLibrary } from '../basement/physics/index.mjs';
import playerRules from './game-player-rules.json' with { type: 'json' };
import definitions from './game-assets/entities.json' with { type: 'json' };
import streetDefinitions from './game-assets/street-population.json' with { type: 'json' };
import cast from './game-db/cast.json' with { type: 'json' };
import vehicles from './game-db/vehicles.json' with { type: 'json' };
import enemies from './game-db/enemies.json' with { type: 'json' };
import places from './game-db/places.json' with { type: 'json' };
import items from './game-db/items.json' with { type: 'json' };

/** Game data is wired here, never imported by the reusable Basement package. */
export function createGameAssetLibrary({ game_db = { cast, vehicles, enemies, places, items } } = {}) {
    const definition = structuredClone(definitions);
    definition.templates.player_949.data={health:playerRules.max_health,max_health:playerRules.max_health};
    for (const resource of Object.values(definition.resources)) {
        let data = game_db;
        for (const key of resource.source) {
            if (data == null || !Object.hasOwn(data, key)) throw new Error(`Missing Directory resource: ${resource.source.join('.')}`);
            data = data[key];
        }
        resource.data = data;
    }
    return new assetLibrary({ libraries: [definition, streetDefinitions] });
}
