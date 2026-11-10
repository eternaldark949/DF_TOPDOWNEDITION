import {jsonCopy} from '../gameplay/values.mjs';
/** Definitions and explicit old-roster import live in Directory, never in physics. */
export function createActorPacket(world,{kind='npc',name='',role='civilian',position=[0,0],rotation=0,data={},...packet}={}){
 if(!['npc','ganger','actor'].includes(kind))throw new TypeError('Unknown actor kind');const record=jsonCopy(data);
 if(kind==='npc'){
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
 return {template:`df:${kind}`,name,position,rotation,data:record,...packet};
}
