import {createAttackCatalog} from './game-attacks.mjs';
import progression from './game-db/progression.json' with {type:'json'};
import {createAbilityCatalog} from './game-abilities.mjs';
import actorRules from './game-actor-rules.json' with {type:'json'};
import {createItemCatalog} from './game-items.mjs';
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
    definition.resources.abilities={kind:'ability_catalog',data:createAbilityCatalog(game_db.progression?.abilities??progression.abilities)};
    definition.resources.actor_rules={kind:'actor_rules',data:actorRules};
    definition.resources.actor_items={kind:'item_catalog',data:createItemCatalog(game_db.items,{enemy_kinds:game_db.enemies.kinds})};
    definition.resources.actor_appearances={kind:'appearance_catalog',data:game_db.cast.appearances};
    definition.resources.attacks={kind:'attack_catalog',data:createAttackCatalog({items:definition.resources.actor_items.data,abilities:definition.resources.abilities.data})};
    const ganger=game_db.enemies.kinds.ganger;Object.assign(definition.templates.ganger,{mass:ganger.mass,collision_shape:{shape_type:'circle',radius:ganger.radius}});
    Object.assign(definition.templates.ganger.data,{health:ganger.hp,max_health:ganger.hp,move_speed:ganger.speed*60,damage_grace_seconds:ganger.invincible_frames/60,vision_range:ganger.vision_range,telegraph_seconds:ganger.telegraph_frames/60});
    return new assetLibrary({ libraries: [definition, streetDefinitions] });
}
