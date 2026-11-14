import {createDemonessAppearance} from '../data/game-bosses.mjs';
import {createHunterAppearance} from '../data/game-hunters.mjs';
import {validateAttackState} from '../mechanics/attacks/attack-registry.mjs';
import {importActorAbilities} from '../mechanics/abilities/ability-loadout.mjs';
import { jsonCopy } from '../../engine/directory/index.mjs';
/** Definitions and explicit old-roster import live in Directory, never in physics. */
export function createActorPacket(world,{kind='npc',name='',role='civilian',position=[0,0],rotation=0,data={},...packet}={}){
 if(!['npc','ganger','hunter','marionette','gatling_gunner','demoness','warden','vesper','matins','compline','drone','velvet_cat','actor'].includes(kind))throw new TypeError('Unknown actor kind');const record=jsonCopy(data);if(['npc','ganger','hunter','gatling_gunner','demoness','warden','vesper','matins','compline'].includes(kind))record.actor_loadout_initialized??=record.inventory!=null;
 if(record.attackSelection!=null)record.attack_state=validateAttackState(record.attackSelection,()=>true);delete record.attackSelection;
 if(kind==='hunter'){if(record.alpha&&record.dash_max===undefined)record.dash_max=2;record.appearance??=createHunterAppearance({alpha:!!record.alpha});}
 if(kind==='marionette'){const rules=world.elements.asset_library.getResource('df:actor_rules').data.marionette;record.flank_offset??=rules.flank_offsets[Math.floor(Math.random()*rules.flank_offsets.length)];record.cloth??=rules.cloth[Math.floor(Math.random()*rules.cloth.length)];record.appearance_seed??=Math.random()*1000;}
 if(kind==='gatling_gunner'&&record.persona||kind==='warden'){if(!['vesper','matins','compline'].includes(record.persona))throw new TypeError('Choose a valid Warden persona');kind=record.persona;}
 if(kind==='demoness'){record.appearance??=createDemonessAppearance({decoy:!!record.decoy});if(record.decoy){const rules=world.elements.asset_library.getResource('df:actor_rules').data.bosses;Object.assign(record,{health:1,max_health:1,boss:false,solo:false,boss_name:null});record.decoy_remaining??=rules.duel.MIRROR_SECS;record.abilities??={format_version:1,known_ids:['demoness_decoy_claw','demoness_decoy_whip'],equipped_id:null};}}

 if(kind==='npc'){
  importActorAbilities(record,world.elements.asset_library.getResource('df:abilities').data,{default_id:role==='red_demon_dancer'?'fireball':null});
  for(const [old,key] of Object.entries({burstSize:'burst_size',burstDelay:'burst_delay_ticks',accuracyMod:'accuracy_mod'}))if(record[old]!=null){record[key]=record[old];delete record[old];}
  if(record.cooldown!=null){record.weapon_cooldown_seconds=record.cooldown/60;delete record.cooldown;}
  const shots=record.shotsLeftInBurst;delete record.shotsLeftInBurst;
  const teammate=role==='teammate',maximum=record.max_health??record.maxHp??(teammate?100:5000000),health=record.health??record.hp??maximum;
  if(shots!=null)record.npc_state??={format_version:1,stim_remaining:0,out_of_combat:0,regen_elapsed:0,aura_elapsed:0,quip:null,quip_remaining:0,quip_delay:0,contract_remaining:record.hireType==='contract'?(record.hireDuration??0):0,shots_left:shots};
  Object.assign(record,{role,health,max_health:maximum,alliance:record.alliance??(teammate?'friendly':'neutral'),appearance:record.appearance??world.elements.asset_library.getResource('df:actor_appearances').data[name]??null});delete record.hp;delete record.maxHp;
  if(record.inventory){record.actor_key=record.inventory.owner_id;delete record.equippedWeaponId;delete record.weaponId;}
  else record.weapon_definition_id=record.weapon_definition_id??record.equippedWeaponId??record.weaponId??null;
  delete record.equippedWeaponId;delete record.weaponId;
  return {template:'df:npc',name,position,rotation,mass:teammate?12:8,collision_shape:{shape_type:'circle',radius:teammate?14:15},data:record,...packet};
 }
 if(record.elite){const elites=world.elements.asset_library.getResource('df:actor_rules').data.elites;if(!['ganger','hunter'].includes(kind)||!Object.hasOwn(elites.marks,record.elite))throw new TypeError('Invalid elite actor');const base=world.elements.asset_library.resolveTemplate(`df:${kind}`);if(!record.elite_state){record.elite_state={format_version:1,ward:record.elite==='warded'?Math.round((record.max_health??base.data.max_health)*elites.ward.HP):0};if(record.elite==='armored')packet.mass=(packet.mass??base.mass)*2.5;if(record.elite==='swift'){record.move_speed=(record.move_speed??base.data.move_speed)*1.3;if(kind==='hunter')record.dash_cooldown=(record.dash_cooldown??base.data.dash_cooldown)*.7;}}}
 return {template:`df:${kind}`,name,position,rotation,data:record,...packet};
}
