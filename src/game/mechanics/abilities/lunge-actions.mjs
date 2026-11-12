import {validatePatternAction} from './pattern-actions.mjs';
import {validateTimedAction} from './timed-actions.mjs';
import {validateBurstAction} from './burst-actions.mjs';
import {BODY_GROUP} from '../../../engine/basement/physics/index.mjs';
import { jsonCopy, nonnegative } from '../../../engine/directory/index.mjs';
/** Persistent logical action only. Native motors, sweeps and impulses own physical work. */
export function validateAbilityAction(state,catalog,{clock}={}){
 if(state==null)return state;if(catalog[state.ability_id]?.delivery==='pattern')return validatePatternAction(state,catalog,{clock});if(['beam','grapple','bolt'].includes(catalog[state.ability_id]?.delivery))return validateTimedAction(state,catalog,{clock});if(catalog[state.ability_id]?.delivery==='burst')return validateBurstAction(state,catalog,{clock});jsonCopy(state);
 if(Object.keys(state).some(key=>!['format_version','ability_id','phase','started_at','phase_started_at','heading','aim','hit_ids','cancel_requested'].includes(key))||state.format_version!==1||!['tell','lunge','recover'].includes(state.phase)||catalog[state.ability_id]?.delivery!=='lunge'||!Array.isArray(state.hit_ids)||state.hit_ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(state.hit_ids).size!==state.hit_ids.length||typeof state.cancel_requested!=='boolean')throw new TypeError('Invalid saved ability action');
 for(const key of ['started_at','phase_started_at'])nonnegative(state[key],key);if(state.phase_started_at<state.started_at||!Number.isFinite(state.heading))throw new TypeError('Invalid ability action clock/heading');if(clock!==undefined&&(!Number.isFinite(clock)||clock<0||state.phase_started_at>clock+1e-9))throw new TypeError('Ability action exceeds its shared clock');jsonCopy(state.aim);if(!state.aim||Object.keys(state.aim).some(key=>!['target','direction','angle'].includes(key)))throw new TypeError('Invalid action aim');if(state.aim.angle!==undefined&&!Number.isFinite(state.aim.angle))throw new TypeError('Invalid action angle');if(state.aim.direction!==undefined&&(!Array.isArray(state.aim.direction)||state.aim.direction.length!==2||!state.aim.direction.every(Number.isFinite)||!state.aim.direction.some(n=>n!==0)))throw new TypeError('Invalid action direction');if(state.aim.target!==undefined&&!(Number.isSafeInteger(state.aim.target)&&state.aim.target>0||Array.isArray(state.aim.target)&&state.aim.target.length===2&&state.aim.target.every(Number.isFinite)))throw new TypeError('Invalid action target');return state;
}
export function beginLunge(actor,definition,ability_id,aim,controller,api,combat){
 const logical=Object.fromEntries(['target','direction','angle'].filter(key=>aim[key]!==undefined).map(key=>[key,aim[key]]));
 const heading=api.physics.resolveAim(actor,logical).rotation,now=controller.state.elapsed;
 const state={format_version:1,ability_id,phase:'tell',started_at:now,phase_started_at:now,heading,aim:jsonCopy(logical),hit_ids:[],cancel_requested:false};
 actor.cancelMovement();actor.data.ability_action_state=state;controller.setCooldown(definition.cooldown_seconds);combat.emit('ability:cast',{entity_id:actor.entity_id,ability_id,action:true});return jsonCopy(state);
}
export function clearLunge(actor){if(!actor.destroyed){actor.cancelMovement();actor.clearFacing();}actor.data.ability_action_state=null;}
export function advanceLunge(actor,definition,controller,api,combat,{known=true}={}){
 const state=actor.data.ability_action_state;if(!state)return false;
 if(actor.destroyed||actor.dead||!actor.active){clearLunge(actor);return false;}
 const world=api.physics,now=controller.state.elapsed;
 const recover=()=>{state.phase='recover';state.phase_started_at=now;state.cancel_requested=false;actor.cancelMovement();actor.clearFacing();};
 if(state.cancel_requested||!known||world.getAttachmentState(actor)||actor.data.combat_state?.stagger_remaining>0){if(state.phase!=='recover')recover();}
 if(state.phase==='tell'){
  actor.cancelMovement();try{if(now-state.phase_started_at<definition.tell_seconds-(definition.lock_seconds??0)){const aim=world.resolveAim(actor,state.aim);state.heading=aim.rotation;}actor.lookInDirection(world.resolveAim(actor,{angle:state.heading}).direction);}catch{recover();}
  if(state.phase==='tell'&&now-state.phase_started_at>=definition.tell_seconds){state.phase='lunge';state.phase_started_at+=definition.tell_seconds;actor.clearFacing();actor.setRotation(state.heading);}
 }
 if(state.phase==='lunge'){
  const age=now-state.phase_started_at;
  if(age>=definition.lunge_seconds)recover();else{
   if(age<definition.drive_seconds)actor.setMovement(undefined,{angle:state.heading,speed:definition.speed,...(definition.acceleration===undefined?{}:{acceleration:definition.acceleration})});else actor.cancelMovement();
   for(const hit of world.sweepAttachedShape(actor,{collision_shape:definition.hit_shape,include_groups:BODY_GROUP.CHARACTER,include_ghosts:false,line_of_sight:true})){
    const target=hit.entity;if(!target||target.destroyed||state.hit_ids.includes(target.entity_id)||!combat.canDamage(actor,target))continue;
    if(combat.damage(target,definition.damage,{source_id:actor.entity_id,type:definition.damage_type,ability_id:state.ability_id})){state.hit_ids.push(target.entity_id);if(definition.burn&&!target.destroyed)combat.attachOrb(target,{...definition.burn,source_id:actor.entity_id});if(actor.destroyed){clearLunge(actor);return false;}if(!target.destroyed){world.applyImpulseBetween(actor,target,{strength:definition.impact_strength,if_supported:true});target.suspendMovement?.(.12);}}
   }
  }
 }
 if(state.phase==='recover'){actor.cancelMovement();if(now-state.phase_started_at>=definition.recover_seconds){const id=state.ability_id;clearLunge(actor);combat.emit('ability:finished',{entity_id:actor.entity_id,ability_id:id});return false;}}
 return true;
}
