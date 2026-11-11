import {createItemCatalog} from './game-items.mjs';
import {createAbilityCatalog} from './game-abilities.mjs';
import combatRules from './game-combat-rules.json' with {type:'json'};
import rules from './game-attack-rules.json' with {type:'json'};

/** References to existing item/capability definitions, not a second balance/ownership ledger. */
export function createAttackCatalog({items=createItemCatalog(),abilities=createAbilityCatalog()}={}){
 const catalog={'unarmed:punch':{attack_id:'unarmed:punch',attack_type:'melee',name:'Bare hands',range:rules.unarmed_range}};
 for(const [id,item] of Object.entries(items))if(item.type==='weapon'){
  const melee=['melee','fists'].includes(item.weaponMode),stats=item.stats??{};
  catalog[`weapon:${id}`]={attack_id:`weapon:${id}`,attack_type:melee?'melee':'firearm',item_id:id,name:item.name,range:melee?rules.melee_range:rules.firearm_range,projectile_speed:(stats.projectileSpeed??25)*combatRules.authoring_hz,cooldown_seconds:(stats.fireRate??20)/combatRules.authoring_hz,penetrating:!!stats.penetrating};
 }
 for(const [id,ability] of Object.entries(abilities))catalog[`ability:${id}`]={attack_id:`ability:${id}`,attack_type:'ability',ability_id:id,...(ability.required_weapon_id?{required_weapon_id:ability.required_weapon_id}:{}),name:ability.name,range:ability.range,projectile_speed:ability.speed,cooldown_seconds:ability.cooldown_seconds,penetrating:false};
 return catalog;
}
