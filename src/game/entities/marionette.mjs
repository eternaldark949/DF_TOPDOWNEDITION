import {gameActor} from './game-actor.mjs';
import {nonnegative,jsonCopy} from '../mechanics/values.mjs';
const stateFor=actor=>actor.data.marionette_state??={format_version:1,initial_delay:.6,yank_remaining:0};
/** Silent puppet policy. Spacing, following, wall response and strikes use shared native services. */
export class Marionette extends gameActor{
 static entity_type='df_marionette';
 get state(){return this.data.ability_action_state?.phase??'stalk';}
 get silent(){return true;}
 get marionette_state(){return stateFor(this);}
 takeDamage(amount,options={}){nonnegative(amount,'damage');if(!amount)return false;const multiplier=options.type==='ballistic'?this.getAsset('actor_rules').data.marionette.ballistic_multiplier:1;return super.takeDamage(Math.max(1,Math.round(amount*multiplier)),options);}
 onDamaged(){const action=this.data.ability_action_state;if(action?.phase==='tell')action.cancel_requested=true;this.emitActor('marionette:hit');}
 updateBehavior(seconds,{player,attacks,random=Math.random}={}){
  if(this.dead||!this.active||this.physics_system.getAttachmentState(this))return;
  const state=stateFor(this),rules=this.getAsset('actor_rules').data.marionette;state.initial_delay=Math.max(0,state.initial_delay-seconds);state.yank_remaining=Math.max(0,state.yank_remaining-seconds);
  if(this.data.ability_action_state)return;
  if(!player||player.dead||player.visible===false||this.data.combat_state?.stagger_remaining>0){this.cancelMovement();return;}
  const view=this.physics_system.observeTarget(this,player,{near_range:rules.sight});if(!view.in_range){this.cancelMovement();return;}
  this.lookAtTarget(player);
  if(view.distance<rules.reach&&view.line_clear&&!state.initial_delay&&attacks.canAttack(this,{attack_id:'ability:marionette_lunge'})){attacks.requestAttack(this,{attack_id:'ability:marionette_lunge',target:player.entity_id});this.cancelMovement();return;}
  if(!state.yank_remaining){state.yank_remaining=rules.yank_interval*(.75+random()*.5);this.emitActor('marionette:yanked');}
  this.followTarget(player,{speed:state.yank_remaining>rules.yank_interval-rules.yank_seconds?rules.yank_speed:rules.drift_speed,arrival_distance:rules.reach*.7,personal_space:rules.space,avoid_groups:2,target_offset:view.distance>rules.flank_range?this.data.flank_offset:[0,0],face_movement:false});
 }
 validateMarionette(){const state=stateFor(this);jsonCopy(state);if(state.format_version!==1)throw new TypeError('Invalid saved Marionette state');nonnegative(state.initial_delay,'initial delay');nonnegative(state.yank_remaining,'yank remaining');if(!Array.isArray(this.data.flank_offset)||this.data.flank_offset.length!==2||!this.data.flank_offset.every(Number.isFinite))throw new TypeError('Invalid flank offset');return this;}
}
