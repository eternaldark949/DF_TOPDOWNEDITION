import {createBossRules,createDemonessAppearance} from './game-bosses.mjs';
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
import { assetLibrary } from '../../engine/directory/index.mjs';
import playerRules from './game-player-rules.json' with { type: 'json' };
import definitions from './game-assets/entities.json' with { type: 'json' };
import streetDefinitions from './game-assets/street-population.json' with { type: 'json' };
import { createMapLibraries } from './game-maps.mjs';
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
    definition.resources.abilities={kind:'ability_catalog',data:createAbilityCatalog(game_db.progression?.abilities??progression.abilities,{hunter_kind:game_db.enemies.kinds.hunter,gunner_kind:game_db.enemies.kinds.gatling_gunner,drone_definition:game_db.enemies.drone,boss_definitions:game_db.enemies})};
    definition.resources.actor_rules={kind:'actor_rules',data:{...actorRules,hunter:createHunterRules(game_db.enemies.kinds.hunter),marionette:createMarionetteRules(),gunner:createGunnerRules(game_db.enemies.kinds.gatling_gunner),drone:createDroneRules(game_db.enemies.drone,game_db.enemies.kinds.drone),velvet_cat:velvetRules,bosses:createBossRules(game_db.enemies),elites:game_db.enemies.elites,demoness_hunter:createHunterRules(game_db.enemies.kinds.demoness)}};
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
    const boss=game_db.enemies.kinds.demoness;
    definition.templates.demoness={extends:'hunter',entity_type:'df_demoness',render_shape:{shape_type:'circle',radius:90},data:{boss:true,boss_name:'Lilitu, the Demoness',health:boss.hp,max_health:boss.hp,move_speed:boss.speed*60,vision_range:boss.vision_range,dash_max:boss.dashes,dash_cooldown:boss.dash_cd/60,telegraph_seconds:boss.telegraph_frames/60,weapon_definition_id:null,appearance:createDemonessAppearance(),solo:false,decoy:false,dormant:false,abilities:{format_version:1,known_ids:['demoness_claw','demoness_whip','demoness_whip_double','demoness_bolts','demoness_sigils','demoness_step','demoness_gale','demoness_mirror','demoness_rite'],equipped_id:null}}};
    definition.templates.warden={extends:'gatling_gunner',entity_type:'df_warden',mass:gunner.mass,collision_shape:{shape_type:'circle',radius:30},render_shape:{shape_type:'circle',radius:120},data:{boss:true,health:game_db.enemies.warden.HP,max_health:game_db.enemies.warden.HP,persona:'vesper',squad_id:'sanctum',abilities:{format_version:1,known_ids:['warden_burst','warden_censer','warden_hymn','warden_hook'],equipped_id:null}}};
    for(const persona of ['vesper','matins','compline'])definition.templates[persona]={extends:'warden',entity_type:`df_${persona}`,data:{persona,boss_name:game_db.enemies.wardens[persona].name,formation_order:['vesper','matins','compline'].indexOf(persona)}};
    definition.templates.boss_effect={entity_type:'df_boss_effect',physics_type:'kinematic',ghost:true,mass:1,collision_group:32,collision_mask:0,collision_shape:{shape_type:'circle',radius:1},data:{role:'boss_effect'}};
    return new assetLibrary({ libraries: [definition, streetDefinitions, ...createMapLibraries()] });
}
