import {jsonCopy,nonnegative} from '../values.mjs';
/** Logical firing cycle over the same owned weapon, launch backend and cooldown clock. */
export function validateBurstAction(state,catalog,{clock}={}){
 jsonCopy(state);if(state.format_version!==1||catalog[state.ability_id]?.delivery!=='burst'||!['tell','burst','reload'].includes(state.phase)||typeof state.weapon_instance_id!=='string'||!state.weapon_instance_id||typeof state.cancel_requested!=='boolean')throw new TypeError('Invalid saved burst action');
 const fields=['format_version','ability_id','phase','started_at','phase_started_at','heading','aim','weapon_instance_id','shots_fired','burst_limit','reload_seconds','round_seconds','cancel_requested','extensions'];if(Object.keys(state).some(key=>!fields.includes(key)))throw new TypeError('Invalid burst action fields');
 for(const key of ['started_at','phase_started_at','reload_seconds'])nonnegative(state[key],key);
 if(state.phase_started_at<state.started_at||!Number.isFinite(state.heading)||!Number.isInteger(state.burst_limit)||state.burst_limit<1||state.burst_limit>1000||!Number.isInteger(state.shots_fired)||state.shots_fired<0||state.shots_fired>state.burst_limit||state.round_seconds!==null&&(!Number.isFinite(state.round_seconds)||state.round_seconds<=0))throw new TypeError('Invalid burst action counts/times');
 if(clock!==undefined&&(!Number.isFinite(clock)||clock<state.phase_started_at-1e-9))throw new TypeError('Ability action exceeds its shared clock');
 if(state.extensions!==undefined&&(!Number.isInteger(state.extensions)||state.extensions<0||state.extensions>2))throw new TypeError('Invalid burst extensions');
 const aim=state.aim;if(!aim||Object.keys(aim).some(key=>!['target','direction','angle'].includes(key))||aim.angle!==undefined&&!Number.isFinite(aim.angle)||aim.direction!==undefined&&(!Array.isArray(aim.direction)||aim.direction.length!==2||!aim.direction.every(Number.isFinite)||!aim.direction.some(n=>n!==0))||aim.target!==undefined&&!(Number.isSafeInteger(aim.target)&&aim.target>0||Array.isArray(aim.target)&&aim.target.length===2&&aim.target.every(Number.isFinite)))throw new TypeError('Invalid burst aim');return state;
}
export function beginBurst(actor,definition,ability_id,aim,controller,items,api,combat){
 const weapon=items.getEquippedWeapon();if(weapon?.definition_id!==definition.required_weapon_id)return false;
 const logical=Object.fromEntries(['target','direction','angle'].filter(key=>aim[key]!==undefined).map(key=>[key,aim[key]])),heading=api.physics.resolveAim(actor,logical).rotation,now=controller.state.elapsed,tuning=actor.data.burst_tuning??{};
 const state={format_version:1,ability_id,phase:'tell',started_at:now,phase_started_at:now,heading,aim:jsonCopy(logical),weapon_instance_id:weapon.instance_id,shots_fired:0,burst_limit:tuning.burst_count??definition.burst_count,reload_seconds:tuning.reload_seconds??definition.reload_seconds,round_seconds:tuning.round_seconds??null,cancel_requested:false};
 validateBurstAction(state,{[ability_id]:definition},{clock:now});actor.data.ability_action_state=state;controller.setCooldown(definition.tell_seconds);combat.emit('ability:cast',{entity_id:actor.entity_id,ability_id,action:true});return jsonCopy(state);
}
export function advanceBurst(actor,definition,controller,items,api,combat,{known=true,policy=null}={}){
 const state=actor.data.ability_action_state;if(!state)return false;
 if(actor.destroyed||actor.dead||!actor.active){actor.data.ability_action_state=null;return false;}
 const now=controller.state.elapsed,world=api.physics,weapon=items.getEquippedWeapon();
 const reload=()=>{state.phase='reload';state.phase_started_at=now;state.cancel_requested=false;controller.setCooldown(Math.max(controller.cooldown_seconds,state.reload_seconds));};
 if(state.phase!=='reload'&&(state.cancel_requested||!known||policy?.blocked||actor.data.dormant||world.getAttachmentState(actor)||actor.data.combat_state?.stagger_remaining>0||controller.holstered||weapon?.instance_id!==state.weapon_instance_id))reload();
 let aim;
 if(state.phase!=='reload')try{
  aim=policy?.aim??state.aim;
  if(aim.target!==undefined){
   const target=Array.isArray(aim.target)?null:api.elements.fetchEntity(aim.target);
   if(target&&(target.dead||target.visible===false))reload();else{
    const view=world.observeTarget(actor,aim.target,{near_range:definition.range});
    if(definition.require_sight&&(!policy?.bypass_sight&&!view.line_clear||!view.in_range))reload();else{const lead=Array.isArray(aim.target)?view:world.predictTargetPosition(actor,aim.target,{projectile_speed:(weapon.stats.projectileSpeed??24)*60});aim={target:lead.position};}
   }
  }
  if(state.phase!=='reload'){const resolved=world.resolveAim(actor,aim);state.heading=resolved.rotation;actor.lookInDirection(resolved.direction);}
 }catch{reload();}
 if(state.phase==='tell'&&now-state.phase_started_at>=definition.tell_seconds-1e-9){state.phase='burst';state.phase_started_at=now;}
 if(state.phase==='burst'&&controller.cooldown_seconds<=1e-9){
  const projectile=controller.fireActionRound(state,aim);
  if(projectile){state.shots_fired++;combat.emit('ability:round-fired',{entity_id:actor.entity_id,ability_id:state.ability_id,shot:state.shots_fired,projectile_id:projectile.entity_id});if(state.shots_fired>=state.burst_limit){if(policy?.extend&&(state.extensions??0)<2&&state.burst_limit+policy.extend_by<=1000){state.burst_limit+=policy.extend_by;state.extensions=(state.extensions??0)+1;}else reload();}if(state.phase==='burst'&&state.round_seconds!==null){const base=(weapon.stats.fireRate??20)/60;controller.setCooldown(state.round_seconds*(base>0?controller.cooldown_seconds/base:1));}}
  else reload();
 }
 if(state.phase==='reload'&&now-state.phase_started_at>=state.reload_seconds-1e-9&&controller.cooldown_seconds<=1e-9){const id=state.ability_id;actor.data.ability_action_state=null;combat.emit('ability:finished',{entity_id:actor.entity_id,ability_id:id});return false;}return true;
}
