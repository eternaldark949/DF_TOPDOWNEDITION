import {BODY_GROUP} from '../../../engine/basement/physics/index.mjs';
import { jsonCopy, nonnegative } from '../../../engine/directory/index.mjs';
const id=value=>Number.isSafeInteger(value)&&value>0;
export function validateTimedAction(state,catalog,{clock}={}){
 jsonCopy(state);const definition=catalog[state.ability_id];
 const keys=['format_version','ability_id','phase','started_at','phase_started_at','heading','aim','cancel_requested','projectile_id','target_id','constraint_id','next_tick_at','flit_stamp','beam'];
 if(state.format_version!==1||!['beam','grapple','bolt'].includes(definition?.delivery)||!['tell','flight','held','flash'].includes(state.phase)||Object.keys(state).some(key=>!keys.includes(key))||typeof state.cancel_requested!=='boolean'||!Number.isFinite(state.heading))throw new TypeError('Invalid timed ability action');
 for(const key of ['started_at','phase_started_at','next_tick_at'])nonnegative(state[key],key);
 if(state.phase_started_at<state.started_at||clock!==undefined&&(!Number.isFinite(clock)||clock<0||state.phase_started_at>clock+1e-9))throw new TypeError('Invalid timed action clock');
 for(const key of ['projectile_id','target_id','constraint_id'])if(state[key]!==null&&!id(state[key]))throw new TypeError('Invalid action identity');
 if(state.flit_stamp!==null&&!Number.isFinite(state.flit_stamp))throw new TypeError('Invalid Flit stamp');
 const aim=state.aim;if(!aim||Object.keys(aim).some(key=>!['angle','direction','target'].includes(key))||aim.angle!==undefined&&!Number.isFinite(aim.angle)||aim.direction!==undefined&&(!Array.isArray(aim.direction)||aim.direction.length!==2||!aim.direction.every(Number.isFinite)||!aim.direction.some(n=>n!==0))||aim.target!==undefined&&!(id(aim.target)||Array.isArray(aim.target)&&aim.target.length===2&&aim.target.every(Number.isFinite)))throw new TypeError('Invalid timed action aim');
 if(state.beam!==null&&(!state.beam||Object.keys(state.beam).some(key=>!['from','to'].includes(key))||!['from','to'].every(key=>Array.isArray(state.beam[key])&&state.beam[key].length===2&&state.beam[key].every(Number.isFinite))))throw new TypeError('Invalid beam presentation');
 if(definition.delivery==='bolt'&&(state.phase!=='tell'||state.projectile_id!==null||state.target_id!==null||state.constraint_id!==null)||definition.delivery==='beam'&&(!['tell','flash'].includes(state.phase)||state.projectile_id!==null||state.constraint_id!==null||state.target_id!==null)||definition.delivery==='grapple'&&(state.phase==='flash'||state.beam!==null)||state.phase==='held'&&(!id(state.target_id)||!id(state.constraint_id)||state.projectile_id!==null))throw new TypeError('Invalid timed action phase');
 return state;
}
export function beginTimedAction(actor,definition,ability_id,aim,controller,api,combat){
 const logical=Object.fromEntries(['target','direction','angle'].filter(key=>aim[key]!==undefined).map(key=>[key,aim[key]])),now=controller.state.elapsed;
 const state={format_version:1,ability_id,phase:'tell',started_at:now,phase_started_at:now,heading:api.physics.resolveAim(actor,logical).rotation,aim:logical,cancel_requested:false,projectile_id:null,target_id:null,constraint_id:null,next_tick_at:0,flit_stamp:null,beam:null};
 validateTimedAction(state,{[ability_id]:definition},{clock:now});actor.cancelMovement();actor.data.ability_action_state=state;controller.setCooldown(definition.cooldown_seconds);combat.emit('ability:cast',{entity_id:actor.entity_id,ability_id,action:true});return jsonCopy(state);
}
const projectileFor=(world,actor,state)=>{const p=world.elements.fetchEntity(state.projectile_id);return p?.data.role==='grapple'&&p.data.source_id===actor.entity_id&&p.data.action_started_at===state.started_at?p:null;};
export function ownedGrapple(world,actor,state){const joint=world.getConstraint(state.constraint_id),target=world.elements.fetchEntity(state.target_id),config=joint?.getState();return target&&config?.constraint_type==='spring'&&config.body_a===actor.body_id&&config.body_b===target.body_id&&config.data?.owner_entity_id===actor.entity_id&&config.data.ability_id===state.ability_id&&config.data.action_started_at===state.started_at?{joint,target}:null;}
export function clearTimedAction(actor,api){const state=actor.data.ability_action_state;if(state){const owned=ownedGrapple(api.physics,actor,state);if(owned)api.physics.removeConstraint(owned.joint);const projectile=projectileFor(api.physics,actor,state);if(projectile&&!projectile.destroyed)projectile.destroy();}if(!actor.destroyed){actor.cancelMovement();actor.clearFacing();}actor.data.ability_action_state=null;}
export function hitGrapple(event,actor,definition,controller,api,combat){
 const state=actor.data.ability_action_state,target=event.target_entity??event.target_body?.entity;
 if(!state||state.phase!=='flight'||event.projectile!==projectileFor(api.physics,actor,state))return false;
 if(!target||target.destroyed||target.data.player_state?.flit_remaining>0||api.physics.getAttachmentState(target)||!combat.canDamage(actor,target))return false;
 if(!combat.damage(target,definition.damage,{source_id:actor.entity_id,type:definition.damage_type})||actor.destroyed||target.destroyed)return false;
 const joint=api.physics.createConstraint({constraint_type:'spring',body_a:actor,body_b:target,rest_length:definition.rest_length,stiffness:definition.stiffness,damping:definition.damping,max_force:definition.max_force,data:{owner_entity_id:actor.entity_id,ability_id:state.ability_id,action_started_at:state.started_at}});
 state.phase='held';state.phase_started_at=controller.state.elapsed;state.next_tick_at=controller.state.elapsed+definition.tick_seconds;state.target_id=target.entity_id;state.constraint_id=joint.constraint_id;state.projectile_id=null;state.flit_stamp=target.data.player_state?.last_flit_at??null;target.suspendMovement?.(api.physics.config.fixed_step*2);combat.emit('ability:grappled',{entity_id:actor.entity_id,target_id:target.entity_id,ability_id:state.ability_id});return true;
}
export function advanceTimedAction(actor,definition,controller,api,combat,{known=true}={}){
 const state=actor.data.ability_action_state,world=api.physics,now=controller.state.elapsed;
 const finish=()=>{const ability_id=state.ability_id;clearTimedAction(actor,api);combat.emit('ability:finished',{entity_id:actor.entity_id,ability_id});return false;};
 if(actor.destroyed||actor.dead||!actor.active||state.cancel_requested||!known||world.getAttachmentState(actor)||actor.data.combat_state?.stagger_remaining>0)return finish();
 if(state.phase==='tell'){
  actor.cancelMovement();try{if(now-state.phase_started_at<definition.tell_seconds-definition.lock_seconds)state.heading=world.resolveAim(actor,state.aim).rotation;actor.lookInDirection(world.resolveAim(actor,{angle:state.heading}).direction);}catch{return finish();}
  if(now-state.phase_started_at>=definition.tell_seconds){
   state.phase_started_at=now;
   if(definition.delivery==='beam'){
    const beam=world.castBeamFrom(actor,{...definition,angle:state.heading});state.beam={from:beam.from,to:beam.to};state.phase='flash';
    for(const hit of beam.hits){const target=hit.entity;if(target&&!target.destroyed&&combat.canDamage(actor,target)&&combat.damage(target,definition.damage,{source_id:actor.entity_id,type:definition.damage_type,ability_id:state.ability_id})&&definition.burn&&!target.destroyed)combat.attachOrb(target,{...definition.burn,source_id:actor.entity_id});}
   }else{
    const projectile=world.createProjectileFrom(actor,{template:'df:projectile',local_position:definition.local_position,angle:state.heading,speed:definition.speed,lifetime:definition.lifetime,collision_shape:{shape_type:'circle',radius:definition.radius},collision_mask:BODY_GROUP.STATIC|BODY_GROUP.PROP|BODY_GROUP.VEHICLE|BODY_GROUP.CHARACTER,data:{role:definition.delivery==='bolt'?'projectile':'grapple',...(definition.delivery==='bolt'?{damage:definition.damage,damage_type:definition.damage_type}:{}),source_id:actor.entity_id,source_alliance:actor.alliance??actor.data.alliance,ability_id:state.ability_id,action_started_at:state.started_at,color:definition.color}});
    if(!projectile||definition.delivery==='bolt')return finish();state.projectile_id=projectile.entity_id;state.phase='flight';
   }
  }
 }else if(state.phase==='flight'){actor.cancelMovement();if(!projectileFor(world,actor,state))return finish();}
 else if(state.phase==='flash'){actor.cancelMovement();if(now-state.phase_started_at>=definition.fire_seconds)return finish();}
 else if(state.phase==='held'){
  const owned=ownedGrapple(world,actor,state),target=owned?.target;
  if(!target||target.dead||!target.active||definition.stop_when_close&&world.observeTarget(actor,target,{near_range:definition.rest_length}).in_range||target.data.player_state?.flit_remaining>0||(target.data.player_state?.last_flit_at??null)!==state.flit_stamp||world.getAttachmentState(target)||now-state.phase_started_at>=definition.hold_seconds)return finish();
  actor.fleeTarget(target,{speed:40,safety_distance:definition.rest_length*2});target.suspendMovement?.(api.physics.config.fixed_step*2);
  while(now>=state.next_tick_at){state.next_tick_at+=definition.tick_seconds;combat.damage(target,definition.tick_damage,{source_id:actor.entity_id,type:definition.damage_type,bypass_invulnerability:true});if(actor.destroyed||target.destroyed||target.dead)return finish();}
 }
 return true;
}
