import velvetRules from './game-velvet-rules.json' with {type:'json'};
import {createDroneRules} from './game-drones.mjs';
import {createGunnerRules} from './game-gunners.mjs';
import {createMarionetteRules} from './game-marionettes.mjs';
import {createHunterRules} from './game-hunters.mjs';
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
    definition.resources.abilities={kind:'ability_catalog',data:createAbilityCatalog(game_db.progression?.abilities??progression.abilities,{hunter_kind:game_db.enemies.kinds.hunter,gunner_kind:game_db.enemies.kinds.gatling_gunner,drone_definition:game_db.enemies.drone})};
    definition.resources.actor_rules={kind:'actor_rules',data:{...actorRules,hunter:createHunterRules(game_db.enemies.kinds.hunter),marionette:createMarionetteRules(),gunner:createGunnerRules(game_db.enemies.kinds.gatling_gunner),drone:createDroneRules(game_db.enemies.drone,game_db.enemies.kinds.drone),velvet_cat:velvetRules}};
    definition.resources.actor_items={kind:'item_catalog',data:createItemCatalog(game_db.items,{enemy_kinds:game_db.enemies.kinds})};
    definition.resources.actor_appearances={kind:'appearance_catalog',data:game_db.cast.appearances};
    definition.resources.attacks={kind:'attack_catalog',data:createAttackCatalog({items:definition.resources.actor_items.data,abilities:definition.resources.abilities.data})};
    const ganger=game_db.enemies.kinds.ganger;Object.assign(definition.templates.ganger,{mass:ganger.mass,collision_shape:{shape_type:'circle',radius:ganger.radius}});
    Object.assign(definition.templates.ganger.data,{health:ganger.hp,max_health:ganger.hp,move_speed:ganger.speed*60,damage_grace_seconds:ganger.invincible_frames/60,vision_range:ganger.vision_range,telegraph_seconds:ganger.telegraph_frames/60});
    const hunter=game_db.enemies.kinds.hunter;
    definition.templates.hunter={extends:'ganger',entity_type:'df_hunter',tags:['enemy','hunter'],data:{health:hunter.hp,max_health:hunter.hp,move_speed:hunter.speed*60,vision_range:hunter.vision_range,weapon_definition_id:hunter.weapon,dash_max:hunter.dashes,dash_cooldown:hunter.dash_cd/60,abilities:{format_version:1,known_ids:['hunter_claw'],equipped_id:null}}};
    const marionette=createMarionetteRules();
    definition.templates.marionette={extends:'actor',entity_type:'df_marionette',tags:['enemy','marionette'],mass:marionette.mass,collision_shape:{shape_type:'circle',radius:marionette.radius},render_shape:{shape_type:'box',dimensions:[80,160],local_position:[0,-55]},data:{health:marionette.health,max_health:marionette.health,damage_grace_seconds:marionette.damage_grace_seconds,alliance:'hostile',flank_offset:marionette.flank_offsets[0],cloth:marionette.cloth[0],appearance_seed:0,abilities:{format_version:1,known_ids:['marionette_lunge'],equipped_id:'marionette_lunge'}}};
    const gunner=game_db.enemies.kinds.gatling_gunner;
    definition.templates.gatling_gunner={extends:'actor',entity_type:'df_gatling_gunner',mass:gunner.mass,collision_shape:{shape_type:'circle',radius:gunner.radius},render_shape:{shape_type:'circle',radius:65},data:{health:gunner.hp,max_health:gunner.hp,damage_grace_seconds:gunner.invincible_frames/60,alliance:'hostile',weapon_definition_id:'gatling_gunner',squad_id:'default',formation_order:0,dormant:false,abilities:{format_version:1,known_ids:['gatling_burst'],equipped_id:null}}};
    const drone=createDroneRules(game_db.enemies.drone,game_db.enemies.kinds.drone);
    definition.templates.drone={extends:'actor',entity_type:'df_drone',mass:drone.mass,collision_shape:{shape_type:'circle',radius:drone.radius},render_shape:{shape_type:'box',dimensions:[160,700],local_position:[0,-100]},data:{health:drone.health,max_health:drone.health,damage_grace_seconds:drone.damage_grace_seconds,alliance:'hostile',drone_kind:'lancer',appearance_seed:0,abilities:{format_version:1,known_ids:['drone_lance','drone_grapple','drone_beam','drone_bolt','drone_landing'],equipped_id:null}}};
    definition.templates.velvet_cat={extends:'actor',entity_type:'df_velvet_cat',mass:3,collision_shape:{shape_type:'circle',radius:8},render_shape:{shape_type:'circle',radius:45},data:{health:999999,max_health:999999,damage_grace_seconds:999/60,alliance:'friendly',adopted:false,coat_palette:'default'}};
    return new assetLibrary({ libraries: [definition, streetDefinitions] });
}
