import {createBossAbilities} from './game-bosses.mjs';
import {createDroneAbilities} from './game-drones.mjs';
import {createGunnerAbilities} from './game-gunners.mjs';
import {createMarionetteAbilities} from './game-marionettes.mjs';
import enemies from './game-db/enemies.json' with {type:'json'};
import {createHunterAbilities} from './game-hunters.mjs';
import {abilityLoadout} from '../mechanics/abilities/ability-loadout.mjs';
import progression from './game-db/progression.json' with {type:'json'};
import rules from './game-ability-rules.json' with {type:'json'};
import {identifier,nonnegative,jsonCopy} from '../mechanics/values.mjs';

/** Existing authored balance becomes engine units once at the Directory boundary. */
export function createAbilityCatalog(definitions=progression.abilities,{hunter_kind=enemies.kinds.hunter,gunner_kind=enemies.kinds.gatling_gunner,drone_definition=enemies.drone,boss_definitions=enemies}={}){
 const catalog={};
 for(const [id,definition] of Object.entries(definitions)){
  identifier(id);const stats=definition.stats;
  for(const key of ['fireRate','damage','projectileSpeed','projectileLife','spread','range'])nonnegative(stats?.[key],`ability ${id} ${key}`);
  if(!stats.fireRate||!stats.projectileSpeed||!stats.projectileLife)throw new TypeError('Ability rate, speed and lifetime must be positive');
  catalog[id]={name:definition.name,description:definition.desc??'',cooldown_seconds:stats.fireRate/rules.authoring_hz,damage:stats.damage,speed:stats.projectileSpeed*rules.authoring_hz,lifetime:stats.projectileLife/rules.authoring_hz,spread:stats.spread,range:stats.range,color:stats.projectileColor,flash_color:stats.flashColor??stats.projectileColor,flash_radius:stats.flashRadius??0,local_position:[...rules.local_position],radius:rules.radius_overrides[id]??rules.projectile_radius,impact_strength:rules.impact_strength,damage_type:rules.damage_type};
 }
 Object.assign(catalog,createHunterAbilities(hunter_kind),createMarionetteAbilities(),createGunnerAbilities(gunner_kind),createDroneAbilities(drone_definition),createBossAbilities(boss_definitions));
 const copy=jsonCopy(catalog);const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};return freeze(copy);
}

/** One-time import of pre-loadout roster/snapshot fields. Explicit saved unequip wins over role defaults. */
export function importActorAbilities(data,catalog,{default_id=null}={}){
 const saved=data.abilities??data.abilitiesSnapshot;
 const alias=Object.hasOwn(data,'equippedAbilityId')?data.equippedAbilityId:saved?undefined:default_id;
 if(saved!==undefined&&saved!==null)data.abilities=saved;
 const loadout=new abilityLoadout(data.abilities??={},catalog);
 if(alias!==undefined){if(alias!==null)loadout.learnAbility(alias);loadout.equipAbility(alias);}
 delete data.equippedAbilityId;delete data.abilitiesSnapshot;return loadout;
}
