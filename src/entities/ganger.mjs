import {gameActor} from './game-actor.mjs';
import {actorItems,restoreActorItems} from '../gameplay/actors/actor-inventory.mjs';
import {nonnegative,jsonCopy} from '../gameplay/values.mjs';
const states=['IDLE','SUSPICIOUS','ALERT','SUPPRESSING','SEARCHING'];
const stateFor=actor=>actor.data.ganger_state??={format_version:1,state:'IDLE',suspicion:0,drain_remaining:0,suppression_remaining:0,look_elapsed:0,wander_remaining:0,investigate_position:null,wander_position:null,origin:[...actor.position],search_positions:[],search_elapsed:0,interrupt_remaining:0,resistance_remaining:0,telegraphing:false,aim_position:null,shot_delay:actor.data.telegraph_seconds??.15,bumped:false};
/** Native stealth/combat policy. Awareness, leading, pathing and contact response stay in Basement. */
export class Ganger extends gameActor{
 static entity_type='df_ganger';
 get items(){return actorItems(this.data,`actor:${this.entity_id}`,this.getAsset('items').data);}
 get state(){return stateFor(this).state;}
 get suspicion(){return stateFor(this).suspicion;}
 get isTelegraphing(){return stateFor(this).telegraphing;}
 get ganger_state(){return stateFor(this);}
 restoreInventory(snapshot){restoreActorItems(this.data,snapshot,this.getAsset('items').data);this.emitActor('actor:inventory-loaded');}
 hearNoise(position,{strength=1}={}){nonnegative(strength,'noise strength');if(this.dead||['ALERT','SUPPRESSING'].includes(this.state))return false;const state=stateFor(this),rules=this.getAsset('actor_rules').data.ganger;state.investigate_position=jsonCopy(position);state.search_positions=[];state.search_elapsed=0;state.suspicion=Math.min(99,Math.max(45,state.suspicion)+35*strength);state.drain_remaining=rules.noise_decay_delay;this.setBehavior('SEARCHING');this.lookAtTarget(position);return true;}
 setBehavior(value){if(!states.includes(value))throw new TypeError('Invalid ganger behavior');const state=stateFor(this);if(state.state!==value){state.state=value;this.emitActor('ganger:state-changed',{state:value});}}
 onDamaged({source,type}){const state=stateFor(this),actor=source==null?null:this.physics_system.elements.fetchEntity(source);state.suspicion=100;if(actor){state.investigate_position=[...actor.position];this.lookAtTarget(actor);}this.setBehavior('ALERT');if(type==='melee')this.interruptMelee();}
 interruptMelee(){const state=stateFor(this),rules=this.getAsset('actor_rules').data.ganger;if(this.dead||state.resistance_remaining>0)return false;state.interrupt_remaining=rules.interrupt_seconds;state.resistance_remaining=rules.interrupt_resistance;state.telegraphing=false;state.aim_position=null;state.shot_delay=Math.max(state.shot_delay,(this.data.telegraph_seconds??.15)+1/60);return true;}
 updateBehavior(seconds,{player,attacks,random=Math.random,visibility=1,search_points=[]}={}){
  if(this.dead||!this.active||this.physics_system.getAttachmentState(this))return;
  const state=stateFor(this),rules=this.getAsset('actor_rules').data.ganger,world=this.physics_system;
  for(const key of ['drain_remaining','suppression_remaining','wander_remaining','interrupt_remaining','resistance_remaining','shot_delay'])state[key]=Math.max(0,state[key]-seconds);
  const view=player&&!player.dead?world.observeTarget(this,player,{near_range:this.data.vision_range,fov:rules.vision_fov,personal_space:rules.personal_space,touch_distance:rules.touch_distance}):null;
  const hidden=!player||player.visible===false||player.isHidden;const sneaking=view?.behind&&!!player?.sneaking;
  const sees=!!view&&!hidden&&view.line_clear&&(view.touching||view.close&&!sneaking||view.in_range&&view.in_cone);
  const previous=state.state;
  if(sees){state.investigate_position=[...view.position];state.search_positions=[];state.search_elapsed=0;state.drain_remaining=rules.suspicion_decay_delay;state.suspicion=Math.min(100,state.suspicion+(view.close?rules.suspicion_near_per_second:Math.max(.1,1-view.distance/this.data.vision_range)*Math.max(.1,visibility)*rules.suspicion_sight_per_second)*seconds);if(view.touching&&!state.bumped){state.suspicion=Math.max(state.suspicion,70);state.bumped=true;this.emitActor('ganger:bumped');}}
  else{if(!view?.touching)state.bumped=false;if(!state.drain_remaining&&state.state!=='SUPPRESSING')state.suspicion=Math.max(0,state.suspicion-(state.state==='SEARCHING'?rules.suspicion_search_drain_per_second:rules.suspicion_idle_drain_per_second)*seconds);}
  if(sees&&state.suspicion>=100)this.setBehavior('ALERT');else if(previous==='ALERT'&&!sees&&state.investigate_position){this.setBehavior('SUPPRESSING');state.suppression_remaining=rules.suppression_seconds;this.emitActor('ganger:last-known',{position:state.investigate_position});}
  else if(!['ALERT','SUPPRESSING','SEARCHING'].includes(state.state))this.setBehavior(state.suspicion>0?'SUSPICIOUS':'IDLE');
  if(state.state==='ALERT'&&!view)this.setBehavior(state.investigate_position?'SEARCHING':'IDLE');
  if(state.state==='ALERT'&&view&&player){
   this.lookAtTarget(player);if(view.distance>rules.engage_distance)this.followTarget(player,{speed:this.data.move_speed,arrival_distance:rules.engage_distance,face_movement:false});else if(view.distance<rules.retreat_distance)this.fleeTarget(player,{speed:rules.retreat_speed,safety_distance:rules.retreat_distance});else this.cancelMovement();
   const stats=this.items.getEquippedWeapon()?.stats??{},attack=attacks.getAttackProfile(this),lead=world.predictTargetPosition(this,player,{projectile_speed:attack.projectile_speed??(stats.projectileSpeed??24)*60});
   state.telegraphing=sees&&state.shot_delay>0&&state.shot_delay<=this.data.telegraph_seconds&&!state.interrupt_remaining;state.aim_position=state.telegraphing?lead.position:state.aim_position;
   if(sees&&!state.shot_delay&&!state.interrupt_remaining){attacks.requestAttack(this,{target:state.aim_position??lead.position});state.shot_delay=(attack.cooldown_seconds??(stats.fireRate??45)/60)+random()*rules.shot_jitter_seconds;state.telegraphing=false;}
  }else if(state.state==='SUPPRESSING'){
   this.cancelMovement();state.telegraphing=false;
   if(state.investigate_position){this.lookAtTarget(state.investigate_position);const clear=world.observeTarget(this,state.investigate_position).line_clear;if((clear||attacks.getAttackProfile(this).penetrating)&&!state.shot_delay&&!state.interrupt_remaining){attacks.requestAttack(this,{target:state.investigate_position});state.shot_delay=rules.suppression_cooldown;}}
   if(!state.suppression_remaining){this.setBehavior('SEARCHING');state.search_elapsed=0;state.search_positions=jsonCopy(search_points);}
  }else if(state.state==='SEARCHING'){
   state.telegraphing=false;state.search_elapsed+=seconds;
   const target=state.investigate_position;if(!target){this.setBehavior('IDLE');return;}
   const found=world.observeTarget(this,target,{near_range:rules.search_arrival});
   if(!found.in_range&&state.search_elapsed<rules.search_timeout)this.moveTo(target,{speed:rules.search_speed,face_movement:true});else{this.cancelMovement();state.look_elapsed+=seconds;if(state.look_elapsed>=rules.search_look_seconds||state.search_elapsed>=rules.search_timeout){state.look_elapsed=0;state.search_elapsed=0;state.investigate_position=state.search_positions.shift()??null;if(!state.investigate_position){state.suspicion=0;this.setBehavior('IDLE');}}}
  }else if(state.state==='SUSPICIOUS'){this.cancelMovement();if(sees)this.lookAtTarget(player);}
  else{
   state.telegraphing=false;if(!state.wander_remaining){const placement=world.findWanderPlacement(this,{origin:state.origin,near_range:rules.wander_radius,angle_sample:random(),radius_sample:random()});state.wander_position=placement?.position??null;state.wander_remaining=rules.wander_min_seconds+random()*rules.wander_random_seconds;}
   if(state.wander_position)this.moveTo(state.wander_position,{speed:rules.wander_speed,face_movement:true});else this.cancelMovement();
  }
 }
 validateGanger(){for(const key of ['vision_range','move_speed','telegraph_seconds'])nonnegative(this.data[key],key);const state=stateFor(this);jsonCopy(state);if(state.format_version!==1||!states.includes(state.state))throw new TypeError('Invalid saved ganger state');for(const key of ['suspicion','drain_remaining','suppression_remaining','look_elapsed','wander_remaining','search_elapsed','interrupt_remaining','resistance_remaining','shot_delay'])nonnegative(state[key],key);if(state.suspicion>100)throw new TypeError('Invalid suspicion');this.items;return this;}
}
