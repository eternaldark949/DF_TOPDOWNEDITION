import { jsonCopy, nonnegative } from '../../../engine/directory/index.mjs';
export function validatePatternAction(state,catalog,{clock}={}){
 jsonCopy(state);const definition=catalog[state.ability_id];
 if(definition?.delivery!=='pattern'||state.format_version!==1||!['tell','repeat'].includes(state.phase)||typeof state.cancel_requested!=='boolean'||!Number.isFinite(state.heading)||Object.keys(state).some(key=>!['format_version','ability_id','phase','started_at','phase_started_at','heading','aim','planned_position','executions','cancel_requested'].includes(key)))throw new TypeError('Invalid pattern action');
 for(const key of ['started_at','phase_started_at'])nonnegative(state[key],key);if(state.phase_started_at<state.started_at||clock!==undefined&&(!Number.isFinite(clock)||clock<state.phase_started_at-1e-9))throw new TypeError('Pattern action exceeds its shared clock');
 if(!Number.isSafeInteger(state.executions)||state.executions<0||state.executions>=(definition.repetitions??1)||state.phase==='tell'&&state.executions!==0||state.phase==='repeat'&&state.executions===0)throw new TypeError('Invalid pattern executions');
 const point=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite),aim=state.aim;
 if(!aim||Object.keys(aim).some(key=>!['target','direction','angle'].includes(key))||aim.target!==undefined&&!(Number.isSafeInteger(aim.target)&&aim.target>0||point(aim.target))||aim.direction!==undefined&&(!point(aim.direction)||!aim.direction.some(n=>n!==0))||aim.angle!==undefined&&!Number.isFinite(aim.angle)||state.planned_position!==null&&!point(state.planned_position))throw new TypeError('Invalid pattern aim');return state;
}
export function beginPattern(actor,definition,ability_id,aim,controller,api,combat,encounters,{slot='ability_action_state'}={}){
 if(!encounters)throw new Error('Pattern abilities require the encounter service');
 const logical=Object.fromEntries(['target','direction','angle'].filter(key=>aim[key]!==undefined).map(key=>[key,aim[key]])),now=controller.state.elapsed,heading=api.physics.resolveAim(actor,logical).rotation;
 const state={format_version:1,ability_id,phase:'tell',started_at:now,phase_started_at:now,heading,aim:logical,planned_position:null,executions:0,cancel_requested:false};
 if(definition.effect==='step'){
  if(logical.target===undefined||Array.isArray(logical.target))return false;const target=api.elements.fetchEntity(logical.target);if(!target)return false;
  const spot=api.physics.findRelativePlacement(actor,target,{distance:definition.distance,angle_offsets:[Math.PI,Math.PI*.7,-Math.PI*.7,Math.PI/2,-Math.PI/2]});if(!spot)return false;state.planned_position=spot.position;
 }
 validatePatternAction(state,{[ability_id]:definition},{clock:now});actor.data[slot]=state;controller.setCooldown(definition.cooldown_seconds);if(definition.locks_movement!==false)actor.cancelMovement();combat.emit('ability:cast',{entity_id:actor.entity_id,ability_id,action:true});return jsonCopy(state);
}
export function clearPattern(actor,slot='ability_action_state'){if(!actor.destroyed&&slot==='ability_action_state'){actor.cancelMovement();actor.clearFacing();}actor.data[slot]=null;}
export function advancePattern(actor,definition,controller,api,combat,encounters,{known=true,slot='ability_action_state'}={}){
 const state=actor.data[slot];
 const finish=()=>{const ability_id=state.ability_id;clearPattern(actor,slot);combat.emit('ability:finished',{entity_id:actor.entity_id,ability_id});return false;};
 if(actor.destroyed||actor.dead||!actor.active||controller.holstered||actor.data.dormant||state.cancel_requested||!known||api.physics.getAttachmentState(actor)||actor.data.combat_state?.stagger_remaining>0)return finish();
 if(definition.locks_movement!==false)actor.cancelMovement();
 try{if(state.aim.target!==undefined&&!Array.isArray(state.aim.target)){const target=api.elements.fetchEntity(state.aim.target);if(!target||target.dead||target.visible===false)return finish();}if(definition.effect!=='gale'&&state.phase==='tell')state.heading=api.physics.resolveAim(actor,state.aim).rotation;actor.lookInDirection(api.physics.resolveAim(actor,{angle:state.heading}).direction);}catch{return finish();}
 if(controller.state.elapsed-state.phase_started_at+1e-9<(state.phase==='tell'?definition.tell_seconds:definition.repeat_delay))return true;
 encounters.executePattern(actor,definition,state);if(actor.destroyed||actor.dead)return finish();state.executions++;
 if(state.executions>=(definition.repetitions??1))return finish();state.phase='repeat';state.phase_started_at=controller.state.elapsed;return true;
}

export function validateSecondaryAction(state,catalog,options){if(state==null)return state;if(!catalog[state.ability_id]?.allow_secondary)throw new TypeError('Ability does not support a secondary channel');return validatePatternAction(state,catalog,options);}
