import {Ganger} from './ganger.mjs';
import {nonnegative,jsonCopy} from '../gameplay/values.mjs';
const stateFor=actor=>actor.data.hunter_state??={format_version:1,dash_remaining:actor.getAsset('actor_rules').data.hunter.dash_initial,chain:0,evade_requested:false};
/** Hunter decisions only. Native motors own blink clearance, evasion and all motion. */
export class Hunter extends Ganger{
 static entity_type='df_hunter';
 get hunterRules(){return this.getAsset('actor_rules').data.hunter;}
 get clawAttackId(){return 'hunter_claw';}
 get ignoresConcealment(){return true;}
 get minimumVisibility(){return this.getAsset('actor_rules').data.hunter.minimum_visibility;}
 get hunter_state(){return stateFor(this);}
 onDamaged(detail){super.onDamaged(detail);stateFor(this).evade_requested=true;}
 updateBehavior(seconds,options={}){
  super.updateBehavior(seconds,options);
  if(this.dead||!this.active||this.physics_system.getAttachmentState(this))return;
  const state=stateFor(this),rules=this.hunterRules,{player,attacks,random=Math.random}=options;
  state.dash_remaining=Math.max(0,state.dash_remaining-seconds);
  const evade=state.evade_requested;state.evade_requested=false;
  if(!player||player.dead||player.visible===false||this.ganger_state.interrupt_remaining||this.data.combat_state?.stagger_remaining>0)return;
  const world=this.physics_system,view=world.observeTarget(this,player,{near_range:rules.claw_range});
  if(evade&&state.dash_remaining>rules.evade_min_cooldown&&state.dash_remaining<(this.data.dash_cooldown??rules.dash_cooldown)&&random()<rules.evade_chance){
   if(this.evadeBody(player,{distance:rules.evade_distance,speed:rules.evade_speed,teleport:true})){state.dash_remaining=Math.max(state.dash_remaining,rules.evade_cooldown);this.emitActor('hunter:evaded');return;}
  }
  if(!['ALERT','SUPPRESSING'].includes(this.state))return;
  if(!state.dash_remaining&&view.distance>rules.dash_min_range&&view.distance<rules.dash_max_range){
   const from=[...this.position];
   if(this.teleportToward(player,{stop_distance:rules.dash_stop_distance})){
    state.chain++;const maximum=this.data.dash_max??rules.dash_max;
    state.dash_remaining=state.chain<maximum?rules.dash_chain_delay:(this.data.dash_cooldown??rules.dash_cooldown)*(.8+random()*.4);
    if(state.chain>=maximum)state.chain=0;
    this.emitActor('hunter:dashed',{from,position:[...this.position]});
   }else state.dash_remaining=rules.dash_retry;
  }
  // The common attack queue replaces a pending sidearm intent; there is still one cooldown owner.
  const close=world.observeTarget(this,player,{near_range:rules.claw_range});
  if(close.in_range&&close.line_clear&&attacks.canAttack(this,{attack_id:`ability:${this.clawAttackId}`}))attacks.requestAttack(this,{attack_id:`ability:${this.clawAttackId}`,target:close.position});
 }
 validateHunter(){this.validateGanger();const state=stateFor(this),maximum=this.data.dash_max??this.getAsset('actor_rules').data.hunter.dash_max;jsonCopy(state);if(state.format_version!==1||!Number.isInteger(maximum)||maximum<1||!Number.isInteger(state.chain)||state.chain<0||state.chain>=maximum||typeof state.evade_requested!=='boolean')throw new TypeError('Invalid saved Hunter state');nonnegative(state.dash_remaining,'dash_remaining');if(this.data.dash_cooldown!==undefined)nonnegative(this.data.dash_cooldown,'dash_cooldown');return this;}
}
