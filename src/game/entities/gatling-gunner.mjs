import {gameActor} from './game-actor.mjs';
import {actorItems} from '../mechanics/actors/actor-inventory.mjs';
import {nonnegative,jsonCopy} from '../mechanics/values.mjs';
const stateFor=actor=>actor.data.gunner_state??={format_version:1,hold_until:0,enrage_count:0,barrel_phase:0,barrel_speed:0,barrel_heat:0};
/** Ordinary gunner decisions over native motors and the common owned-weapon burst action. */
export class GatlingGunner extends gameActor{
 static entity_type='df_gatling_gunner';
 get gunnerRules(){return this.getAsset('actor_rules').data.gunner;}
 get items(){return actorItems(this.data,`actor:${this.entity_id}`,this.getAsset('items').data);}
 get gunner_state(){return stateFor(this);}
 get dormant(){return !!this.data.dormant;}
 get state(){return this.dormant?'dormant':this.data.ability_action_state?.phase??'ready';}
 get isTelegraphing(){return this.state==='tell';}
 makeDormant(){this.data.dormant=true;this.cancelMovement();this.clearFacing();if(this.data.ability_action_state)this.data.ability_action_state.cancel_requested=true;if(this.data.ability_secondary_state)this.data.ability_secondary_state.cancel_requested=true;const state=stateFor(this);state.barrel_speed=0;state.barrel_heat=0;this.emitActor('gunner:dormant');}
 awaken(hold_seconds=1){nonnegative(hold_seconds,'hold seconds');this.data.dormant=false;stateFor(this).hold_until=(this.data.weapon_state?.elapsed??0)+hold_seconds;this.emitActor('gunner:awakened',{hold_seconds});}
 enrage(){const rules=this.gunnerRules,state=stateFor(this),prior=this.data.burst_tuning??{};state.enrage_count++;this.data.burst_tuning={burst_count:Math.min(1000,(prior.burst_count??rules.burst_count)+3),reload_seconds:Math.max(1,(prior.reload_seconds??rules.reload_seconds)*.75),round_seconds:Math.max(.05,(prior.round_seconds??rules.round_seconds)-1/60)};this.emitActor('gunner:enraged',{count:state.enrage_count});}
 advanceActor(seconds){super.advanceActor(seconds);const state=stateFor(this),rules=this.gunnerRules.visual,action=this.data.ability_action_state,clock=this.data.weapon_state?.elapsed??0;const firing=action?.phase==='burst',anticipating=!this.dormant&&(action?.phase==='tell'||action?.phase==='reload'&&action.reload_seconds-(clock-action.phase_started_at)<rules.windup_seconds),target=firing||anticipating?rules.max_speed:0;
  state.barrel_speed=target>state.barrel_speed?Math.min(target,state.barrel_speed+rules.acceleration*seconds):Math.max(target,state.barrel_speed-rules.deceleration*seconds);state.barrel_phase=(state.barrel_phase+state.barrel_speed*seconds)%(Math.PI*2);state.barrel_heat=Math.max(0,Math.min(1,state.barrel_heat+(firing?rules.heat_per_second:-rules.cool_per_second)*seconds));
 }
 updateBehavior(seconds,{player,attacks,formation={index:0,count:1}}={}){
  if(this.dead||!this.active||this.dormant||this.physics_system.getAttachmentState(this)){this.cancelMovement();return;}
  if(!player||player.dead||player.visible===false||this.data.combat_state?.stagger_remaining>0){this.cancelMovement();if(this.data.ability_action_state)this.data.ability_action_state.cancel_requested=true;if(this.data.ability_secondary_state)this.data.ability_secondary_state.cancel_requested=true;return;}
  const world=this.physics_system,rules=this.gunnerRules,m=rules.movement,view=world.observeTarget(this,player,{near_range:rules.range});this.lookAtTarget(player);
  if(!view.line_clear)this.followTarget(player,{speed:m.approach_speed,arrival_distance:m.retreat_range,personal_space:m.separation,face_movement:false});
  else if(formation.count>1)this.orbitTarget(player,{radius:m.ideal_range,angular_speed:m.angular_speed,slot_count:formation.count,slot_index:formation.index,speed:m.formation_speed,personal_space:m.separation,avoid_groups:2,face_movement:false});
  else if(view.distance<m.retreat_range)this.fleeTarget(player,{speed:m.strafe_speed,safety_distance:m.retreat_range});
  else if(view.distance>m.approach_range)this.followTarget(player,{speed:m.approach_speed,arrival_distance:m.approach_range,face_movement:false});
  else this.orbitTarget(player,{radius:m.ideal_range,angular_speed:m.angular_speed,speed:m.strafe_speed,personal_space:m.separation,avoid_groups:2,face_movement:false});
  if(view.in_range&&view.line_clear&&(this.data.weapon_state?.elapsed??0)>=stateFor(this).hold_until&&attacks.canAttack(this,{attack_id:'ability:gatling_burst'}))attacks.requestAttack(this,{attack_id:'ability:gatling_burst',target:player.entity_id});
 }
 validateGunner(){const state=stateFor(this);jsonCopy(state);if(typeof this.data.dormant!=='boolean'||state.format_version!==1||!Number.isSafeInteger(state.enrage_count)||state.enrage_count<0||typeof this.data.squad_id!=='string'||!this.data.squad_id||!Number.isFinite(this.data.formation_order))throw new TypeError('Invalid saved gunner state');for(const key of ['hold_until','barrel_phase','barrel_speed','barrel_heat'])nonnegative(state[key],key);if(state.barrel_heat>1)throw new TypeError('Invalid barrel heat');if(this.data.burst_tuning){const tuning=this.data.burst_tuning;if(Object.keys(tuning).some(key=>!['burst_count','reload_seconds','round_seconds'].includes(key)))throw new TypeError('Invalid burst tuning');if(tuning.burst_count!==undefined&&(!Number.isInteger(tuning.burst_count)||tuning.burst_count<1||tuning.burst_count>1000))throw new TypeError('Invalid burst count');for(const key of ['reload_seconds','round_seconds'])if(tuning[key]!==undefined)nonnegative(tuning[key],key);if(tuning.round_seconds===0)throw new TypeError('Round interval must be positive');}if(this.data.persona&&this.entity_type===GatlingGunner.entity_type)throw new TypeError('Warden personas require encounter conversion');this.items;return this;}
}
