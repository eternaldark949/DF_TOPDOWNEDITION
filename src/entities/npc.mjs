import {resolveEmoteLines,NPC_EMOTE_REACTIONS} from '../directory/npc-reactions.mjs';
import {gameActor} from './game-actor.mjs';
import {actorItems,restoreActorItems} from '../gameplay/actors/actor-inventory.mjs';
import {nonnegative,jsonCopy} from '../gameplay/values.mjs';
const actorContract=npc=>npc.data.hireType==='contract'?(npc.data.contract_remaining??npc.data.hireDuration??0):0;
const stateFor=npc=>npc.data.npc_state??={format_version:1,stim_remaining:0,out_of_combat:0,regen_elapsed:0,aura_elapsed:0,quip:null,quip_remaining:0,quip_delay:0,contract_remaining:actorContract(npc)};
export const ROSTER_FIELDS=['recruited','downed','teammateStims','maxTeammateStims','relationship','hireType','hireDuration','hireTime','hireCost','hired','role','bio','alliance','burstSize','burstDelay','accuracyMod','equippedAbilityId','cooldown','shotsLeftInBurst'];
/** Full native NPC identity. Role/hiring/following are game rules; the inherited motor owns movement. */
export class NPC extends gameActor{
 static entity_type='df_npc';
 get items(){return actorItems(this.data,this.data.actor_key??`actor:${this.entity_id}`,this.getAsset('items').data);}
 get inventory(){return this.items.snapshot();}
 set inventory(value){this.restoreInventory(value);}
 get equippedWeaponId(){return this.items.getEquippedWeapon()?.definition_id??null;}
 set equippedWeaponId(id){if(id===null){this.items.unequipSlot('weapon');return;}const item=this.items.findItem(id)??this.items.grantItem(id);if(!item||item.type!=='weapon')throw new TypeError('NPC equipment must be a weapon');this.items.equipItem(item.instance_id);}
 get weaponId(){return this.equippedWeaponId;}
 set weaponId(id){this.equippedWeaponId=id;}
 get inCar(){return !!this.physics_system.getAttachmentState(this);}
 get seatIndex(){const mount=this.physics_system.getAttachmentState(this);if(!mount)return -1;const parent=this.physics_system.elements.fetchEntity(mount.parent_body_id);return parent?.data.occupants?.indexOf(this.entity_id)??-1;}
 get downed(){return !!this.data.downed;}
 set downed(value){this.data.downed=!!value;}
 get role(){return this.data.role??'civilian';}
 set role(value){this.data.role=String(value);}
 get recruited(){return !!this.data.recruited;}
 set recruited(value){this.data.recruited=!!value;}
 get cooldown(){return (this.data.weapon_state?.cooldown??this.data.weapon_cooldown_seconds??0)*60;}
 set cooldown(ticks){nonnegative(ticks,'NPC cooldown');this.data.weapon_cooldown_seconds=ticks/60;this.emitActor('actor:cooldown-requested',{seconds:ticks/60});}
 get shotsLeftInBurst(){return stateFor(this).shots_left??this.data.burst_size??1;}
 set shotsLeftInBurst(value){nonnegative(value,'burst shots');stateFor(this).shots_left=value;}
 get npc_state(){return stateFor(this);}
 getRenderConfig(){return this.data.appearance;}
 restoreInventory(snapshot){restoreActorItems(this.data,snapshot,this.getAsset('items').data);this.emitActor('actor:inventory-loaded');}
 onDefeated(){if(this.data.hireType==='permanent'&&this.role==='teammate'){this.data.downed=true;this.visible=false;this.emitActor('npc:downed');}}
 revive(options={}){const revived=super.revive(options);if(revived){this.data.downed=false;this.visible=true;}return revived;}
 hire({kind='contract',cost,minutes,world_minutes=0}={}){
  if(!['contract','permanent'].includes(kind))throw new TypeError('Invalid hire type');const rules=this.getAsset('actor_rules').data.npc;
  nonnegative(cost??rules.hire_cost,'hire cost');nonnegative(minutes??rules.hire_minutes,'hire duration');nonnegative(world_minutes,'world minutes');
  this.data.hireType=kind;this.data.hireCost=cost??rules.hire_cost;this.data.hireDuration=kind==='permanent'?0:minutes??rules.hire_minutes;this.data.hireTime=world_minutes;this.data.hired=true;this.recruited=true;this.data.alliance='friendly';stateFor(this).contract_remaining=this.data.hireDuration;this.emitActor('npc:hired',{kind});return true;
 }
 release(){this.data.hired=false;this.recruited=false;this.data.hireType='none';this.data.alliance='neutral';this.cancelMovement();this.emitActor('npc:released');}
 say(text,seconds=2,delay=0){nonnegative(delay,'quip delay');nonnegative(seconds,'quip duration');const state=stateFor(this);state.quip=String(text);state.quip_remaining=seconds+delay;state.quip_delay=delay;this.emitActor('actor:said',{text:state.quip,seconds});}
 reactToEmote(emote,{tier=0,random=Math.random}={}){const state=stateFor(this);if(this.dead||state.quip_remaining>0)return false;const category={smile:'reactSmile',zany:'reactZany',cry:'reactCry',frown:'reactFrown'}[emote],lines=resolveEmoteLines(NPC_EMOTE_REACTIONS[this.name],category,tier);if(!lines)return false;this.say(lines[Math.floor(random()*lines.length)],2,.4);return true;}
 onWeaponFired(controller){const state=stateFor(this),burst=this.data.burst_size??1;state.shots_left=(state.shots_left??burst)-1;if(state.shots_left>0)controller.setCooldown((this.data.burst_delay_ticks??10)/60);else{state.shots_left=burst;controller.setCooldown((this.items.getEquippedWeapon()?.stats.fireRate??20)/60*Math.max(2,burst));}}
 updateBehavior(seconds,{player,targets,weapons,stationary=false,world_minutes_delta=0,may_engage=()=>true,aura_interval}={}){
  const state=stateFor(this),rules=this.getAsset('actor_rules').data.npc;
  for(const key of ['stim_remaining','quip_remaining','quip_delay'])state[key]=Math.max(0,state[key]-seconds);if(!state.quip_remaining)state.quip=null;
  if(this.data.hireType==='contract'&&this.recruited){state.contract_remaining=Math.max(0,state.contract_remaining-world_minutes_delta);if(!state.contract_remaining){this.release();return;}}
  if(this.dead||!this.active||!this.recruited)return;
  const world=this.physics_system,view=player?world.observeTarget(this,player,{near_range:rules.recover_distance}):null;
  const threats=targets.filter(hit=>hit.entity&&!hit.entity.dead&&may_engage(hit.entity));
  if(threats.length)state.out_of_combat=0;else state.out_of_combat+=seconds;
  if(state.out_of_combat>=rules.recovery_delay&&this.hp<this.maxHp){state.regen_elapsed+=seconds;while(state.regen_elapsed+1e-9>=rules.regeneration_interval){state.regen_elapsed-=rules.regeneration_interval;this.heal(rules.regeneration_amount);}}else state.regen_elapsed=0;
  if(this.hp<this.maxHp*rules.stim_threshold&&(this.data.teammateStims??0)>0&&!state.stim_remaining){this.data.teammateStims--;state.stim_remaining=rules.stim_cooldown;this.heal(rules.stim_heal);this.say('Still breathing.');}
  if(view&&view.distance<rules.aura_range&&this.hp<this.maxHp){state.aura_elapsed+=seconds;const interval=aura_interval??rules.aura_interval;while(state.aura_elapsed+1e-9>=interval){state.aura_elapsed-=interval;this.heal(1);}}else state.aura_elapsed=0;
  // Seating remains owned by the attachment system. Cabin/window firing is a separate vehicle contract.
  if(this.inCar)return;
  const nearest=threats.find(hit=>world.observeTarget(this,hit.entity,{near_range:rules.combat_range}).line_clear);
  if(nearest&&this.equippedWeaponId){this.lookAtTarget(nearest.entity);weapons.requestActorFire(this,{target:nearest.entity.position});}else this.clearFacing();
  if(stationary||!player){this.cancelMovement();return;}
  if(view.distance>rules.recover_distance){const spot=world.findNearbyPlacement(player,{near_range:rules.follow_distance,spacing:20,include_ghosts:false,ignore_body:[player,this]});if(spot&&world.isPlacementClear(this.collision_shape,spot.position,{ignore_body:[this,player],include_ghosts:false}))this.teleportTo(spot.position,{placement_mode:'clear'});}
  const speed=view.distance>rules.catchup_distance?rules.catchup_speed:view.distance>rules.match_distance?rules.match_speed:rules.cruise_speed;
  this.followTarget(player,{speed,arrival_distance:rules.follow_distance,personal_space:28,face_movement:!nearest});
 }
 validateNPC(){const state=stateFor(this);jsonCopy(state);if(state.format_version!==1)throw new TypeError('Invalid NPC state');for(const key of ['stim_remaining','out_of_combat','regen_elapsed','aura_elapsed','quip_remaining','quip_delay','contract_remaining'])nonnegative(state[key],key);this.items;return this;}
}
for(const key of ROSTER_FIELDS.filter(key=>!['role','recruited','downed','alliance','burstSize','burstDelay','accuracyMod','cooldown','shotsLeftInBurst'].includes(key)))Object.defineProperty(NPC.prototype,key,{get(){return this.data[key];},set(value){this.data[key]=value;}});
export function rosterRecord(entity){return {name:entity.name,...Object.fromEntries(ROSTER_FIELDS.map(key=>[key,entity[key]??null])),hp:entity.hp,maxHp:entity.maxHp,equippedWeaponId:entity.equippedWeaponId,weaponId:entity.equippedWeaponId,inventory:entity.items.snapshot()};}

for(const [key,field] of Object.entries({burstSize:'burst_size',burstDelay:'burst_delay_ticks',accuracyMod:'accuracy_mod'}))Object.defineProperty(NPC.prototype,key,{get(){return this.data[field];},set(value){nonnegative(value,key);this.data[field]=value;}});
