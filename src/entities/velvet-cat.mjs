import {gameActor} from './game-actor.mjs';
import {createVelvetAnimation,advanceVelvetAnimation} from '../presentation/velvet-cat.mjs';
import {nonnegative,jsonCopy} from '../gameplay/values.mjs';
const stateFor=actor=>actor.data.cat_state??={format_version:1,mode:'idle',dash:false,idle_seconds:0,rest:null,rest_remaining:0};
/** Official companion body; animation records contain cosmetic state only. */
export class VelvetCat extends gameActor{
 static entity_type='df_velvet_cat';
 get cat_state(){return stateFor(this);}
 get state(){return stateFor(this).mode;}
 get adopted(){return !!this.data.adopted;}
 get inCar(){return !!this.physics_system.getAttachmentState(this);}
 adopt(){if(this.adopted)return false;this.data.adopted=true;this.emitActor('cat:adopted');return true;}
 release(){if(!this.adopted)return false;this.data.adopted=false;this.cancelMovement();this.emitActor('cat:released');return true;}
 boardVehicle(vehicle,{combine_mass=false}={}){return vehicle.assignPassenger(this,{combine_mass});}
 leaveVehicle(vehicle,options){return vehicle.releasePassenger(this,options);}
 onVehicleImpact(speed){if(speed<30||this.inCar)return;this.suspendMovement(10/60);const state=stateFor(this);state.mode='following';state.rest=null;state.idle_seconds=0;this.emitActor('cat:vehicle-impact',{speed});}
 setRestPose(pose=null){if(![null,'sitting','sleeping'].includes(pose))throw new TypeError('Unknown feline pose');stateFor(this).mode=pose??'idle';this.cancelMovement();}
 validateCat(){const state=stateFor(this);jsonCopy(state);if(typeof this.data.adopted!=='boolean'||state.format_version!==1||!['idle','following','sitting','sleeping'].includes(state.mode)||typeof state.dash!=='boolean'||![null,'sit','groom','look','loaf','sleep','stretch'].includes(state.rest))throw new TypeError('Invalid cat state');for(const key of ['idle_seconds','rest_remaining'])nonnegative(state[key],key);this.data.velvet_animation??=createVelvetAnimation(this.entity_id);const visual=this.data.velvet_animation,defaults=createVelvetAnimation(1);if(Object.keys(visual).length!==Object.keys(defaults).length||Object.keys(defaults).some(key=>!Object.hasOwn(visual,key)))throw new TypeError('Invalid feline appearance');const sameShape=(value,example)=>typeof example==='number'?typeof value==='number'&&Number.isFinite(value):Array.isArray(example)?Array.isArray(value)&&value.length===example.length&&value.every((entry,i)=>sameShape(entry,example[i])):example&&typeof example==='object'?!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===Object.keys(example).length&&Object.keys(example).every(key=>sameShape(value[key],example[key])):typeof value===typeof example;for(const key of Object.keys(defaults))if(key==='idleBehavior'?![null,'sit','groom','look','loaf','sleep','stretch'].includes(visual[key]):!sameShape(visual[key],defaults[key]))throw new TypeError('Invalid feline animation');return this;}
 updateBehavior(seconds,{player,random=Math.random}={}){
  const state=stateFor(this),rules=this.getAsset('actor_rules').data.velvet_cat;
  if(this.dead||!this.active||!this.visible||this.inCar){this.cancelMovement();return;}
  if(!this.adopted||!player||player.dead||['sitting','sleeping'].includes(state.mode)){this.cancelMovement();return;}
  const view=this.physics_system.observeTarget(this,player);
  if(view.distance>rules.sprint_start)state.dash=true;else if(view.distance<rules.sprint_stop)state.dash=false;
  if(view.distance>rules.start_distance||state.mode==='following'&&view.distance>rules.stop_distance){state.mode='following';state.rest=null;state.idle_seconds=0;this.followTarget(player,{target_offset:rules.follow_offset,speed:state.dash?rules.sprint_speed:view.distance>120?rules.trot_speed:rules.walk_speed,arrival_distance:16,personal_space:18});}
  else{state.mode='idle';this.cancelMovement();state.idle_seconds+=seconds;state.rest_remaining=Math.max(0,state.rest_remaining-seconds);if(state.rest&&state.rest_remaining===0){state.rest=state.rest==='stretch'?'sit':null;state.idle_seconds=1.667;}if(!state.rest&&state.idle_seconds>=rules.rest_after){const sample=random();state.rest=sample<.28?'sit':sample<.48?'groom':sample<.62?'look':sample<.78?'loaf':sample<.9?'sleep':'stretch';state.rest_remaining=state.rest==='sleep'?25:state.rest==='loaf'?15:state.rest==='stretch'?260/60:9;}}
 }
 advanceAnimation(seconds,player){if(this.active&&this.visible&&!this.inCar)advanceVelvetAnimation(this,player,seconds);}
}
