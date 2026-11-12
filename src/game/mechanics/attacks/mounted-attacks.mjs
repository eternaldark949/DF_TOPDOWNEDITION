import { jsonCopy, nonnegative, identifier } from '../../../engine/directory/index.mjs';

export function validateMountedAttack(state){
 if(state==null)return;jsonCopy(state);if(Object.keys(state).some(key=>!['format_version','attachment_id','revision','attack_id','aim','started_at','ready_at','expires_at'].includes(key)))throw new TypeError('Invalid mounted attack fields');identifier(state.attack_id);if(state.format_version!==1||!Number.isSafeInteger(state.attachment_id)||state.attachment_id<1||!Number.isSafeInteger(state.revision)||state.revision<0||typeof state.attack_id!=='string')throw new TypeError('Invalid mounted attack state');
 for(const key of ['started_at','ready_at','expires_at'])nonnegative(state[key],key);if(state.ready_at<state.started_at||state.expires_at<state.ready_at)throw new TypeError('Invalid mounted aim time');
 if(!state.aim||Array.isArray(state.aim)||Object.keys(state.aim).some(key=>!['target','direction','angle'].includes(key)))throw new TypeError('Invalid mounted aim');
 for(const key of ['target','direction'])if(state.aim[key]!==undefined&&(!Array.isArray(state.aim[key])||state.aim[key].length!==2||!state.aim[key].every(Number.isFinite)))throw new TypeError('Invalid mounted aim');if(state.aim.angle!==undefined&&!Number.isFinite(state.aim.angle))throw new TypeError('Invalid mounted aim');
}
export function prepareMountedAttack(actor,definition,aim,controller,mount,rules){
 const now=controller.state.elapsed,previous=actor.data.mounted_attack_state;
 const same=previous&&previous.attachment_id===mount.attachment_id&&previous.revision===mount.revision&&previous.attack_id===definition.attack_id&&previous.expires_at>=now;
 actor.data.mounted_attack_state={format_version:1,attachment_id:mount.attachment_id,revision:mount.revision,attack_id:definition.attack_id,aim:jsonCopy(aim),started_at:same?previous.started_at:now,ready_at:same?previous.ready_at:now+rules.aim_seconds,expires_at:now+rules.hold_seconds};
}
export function mountedAttackState(actor,controller,mount){
 const state=actor.data.mounted_attack_state,now=controller.state.elapsed;
 if(!state||!mount||mount.pending||mount.detaching||state.attachment_id!==mount.attachment_id||state.revision!==mount.revision||now>state.expires_at+1e-9)return {aiming:false,ready:false,lean:0,aim:null};
 return {aiming:true,ready:now+1e-9>=state.ready_at,lean:state.ready_at===state.started_at?1:Math.min(1,Math.max(0,(now-state.started_at)/(state.ready_at-state.started_at))),aim:jsonCopy(state.aim),attack_id:state.attack_id};
}
