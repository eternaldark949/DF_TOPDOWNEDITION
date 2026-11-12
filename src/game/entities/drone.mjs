import {gameActor} from './game-actor.mjs';
import {nonnegative,jsonCopy} from '../mechanics/values.mjs';
const stateFor=actor=>actor.data.drone_state??={format_version:1,flight:'descend',phase_started_at:actor.data.actor_state?.elapsed??0,alt:1,lost_seconds:0,next_bolt_at:2.2,next_special_at:3};
/** Flight and attack decisions. Basement owns movement, impacts, eye geometry and tether forces. */
export class Drone extends gameActor{
 static entity_type='df_drone';
 get drone_state(){return stateFor(this);}
 get state(){const state=stateFor(this),action=this.data.ability_action_state;if(state.flight!=='hover')return state.flight;if(!action)return 'hover';return action.phase==='lunge'?'dive':action.phase==='held'||action.phase==='flight'?'tether':action.phase==='flash'?'beam':action.phase;}
 get isTelegraphing(){return this.data.ability_action_state?.phase==='tell';}
 validateDrone(){const state=stateFor(this);jsonCopy(state);if(!['lancer','seer','grappler'].includes(this.data.drone_kind)||state.format_version!==1||!['descend','hover','rise'].includes(state.flight))throw new TypeError('Invalid Drone state');for(const key of ['phase_started_at','alt','lost_seconds','next_bolt_at','next_special_at'])nonnegative(state[key],key);if(state.alt>1||state.flight==='hover'&&state.alt!==0||state.phase_started_at>(this.data.actor_state?.elapsed??0))throw new TypeError('Invalid Drone flight clock');this.updateBody({ghost:state.alt>.15});return this;}
 takeDamage(amount,options={}){const state=stateFor(this);if(state.alt>.15)return false;const rules=this.getAsset('actor_rules').data.drone.flight,eye=options.hit_position&&this.physics_system.testBodyRegion(this,{collision_shape:{shape_type:'circle',radius:rules.EYE_R,local_position:[rules.EYE_FWD,0]},point:options.hit_position,radius:options.hit_radius??0});return super.takeDamage(amount*(eye?rules.EYE_MULT:options.type==='melee'?rules.BLADE:this.state==='recover'?rules.OPEN:rules.ARMOR),options);}
 updateBehavior(seconds,{player,attacks,abilities,random=Math.random}={}){
  if(this.dead||!this.active||this.physics_system.getAttachmentState(this)){this.cancelMovement();return;}
  const world=this.physics_system,state=stateFor(this),rules=this.getAsset('actor_rules').data.drone,flight=rules.flight,now=this.data.actor_state.elapsed,clock=this.data.weapon_state?.elapsed??0,age=now-state.phase_started_at;
  if(state.flight==='descend'||state.flight==='rise'){
   this.cancelMovement();const wasHigh=state.alt>.15;state.alt=state.flight==='descend'?Math.max(0,1-age/flight.DESCENT):Math.min(1,age/flight.RISE);if(wasHigh!==(state.alt>.15))this.updateBody({ghost:state.alt>.15});
   if(player&&!player.dead)this.lookAtTarget(player);
   if(state.flight==='descend'&&state.alt===0){state.flight='hover';state.phase_started_at=now;abilities.cast(this,'drone_landing');this.emitActor('drone:landed');}
   else if(state.flight==='rise'&&state.alt===1&&player){const spot=world.findWanderPlacement(this,{origin:player.position,inner_range:130,near_range:220,angle_sample:random(),radius_sample:random(),include_ghosts:false});if(spot){this.teleportTo(spot.position,{include_ghosts:false});state.flight='descend';state.phase_started_at=now;}}
   return;
  }
  if(this.data.ability_action_state)return;
  if(!player||player.dead||player.visible===false){this.cancelMovement();return;}
  const view=world.observeTarget(this,player,{near_range:640,occlusion_groups:1});state.lost_seconds=view.line_clear?0:state.lost_seconds+seconds;
  if(state.lost_seconds>=flight.LOST){state.flight='rise';state.phase_started_at=now;state.lost_seconds=0;this.cancelMovement();return;}
  this.lookAtTarget(player);const keep=flight.KEEP[this.data.drone_kind];
  if(!view.line_clear)this.followTarget(player,{speed:rules.speed,arrival_distance:keep,face_movement:false});
  else if(view.distance<keep-25)this.fleeTarget(player,{speed:rules.speed*.6,safety_distance:keep});
  else this.orbitTarget(player,{radius:keep,angular_speed:.2,speed:rules.speed,face_movement:false});
  const special=this.data.drone_kind==='lancer'?'drone_lance':this.data.drone_kind==='seer'?'drone_beam':'drone_grapple',definition=abilities.getLoadout(this).getDefinition(special);
  if(clock>=state.next_special_at&&view.distance<=definition.range&&(view.line_clear||this.data.drone_kind==='seer')&&attacks.canAttack(this,{attack_id:`ability:${special}`})){
   if(abilities.cast(this,special,{target:player.entity_id}))state.next_special_at=clock+definition.cooldown_seconds;
  }else if(this.data.drone_kind!=='seer'&&view.line_clear&&view.distance<500&&clock>=state.next_bolt_at&&abilities.cast(this,'drone_bolt',{target:player.entity_id}))state.next_bolt_at=clock+flight.BOLT_EVERY;
 }
}
