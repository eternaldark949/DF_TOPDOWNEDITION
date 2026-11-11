import {Hunter} from './hunter.mjs';
import {nonnegative,jsonCopy} from '../gameplay/values.mjs';
const stateFor=actor=>actor.data.demoness_state??={format_version:1,phase:1,heard_position:null,heard_at:0,next_sigil:2,next_bolt:1.5,next_step:4,next_gale:3,next_mirror:2,next_rite:1,eye:1,rise:1,flash:0,last_strike:null,decoy_remaining:actor.data.decoy_remaining??9};
export function validateDemonessData(data){if(['solo','decoy','dormant'].some(key=>typeof data[key]!=='boolean')||data.decoy&&data.max_health!==1)throw new TypeError('Invalid Demoness flags/decoy health');const state=data.demoness_state;if(!state)return data;jsonCopy(state);if(state.format_version!==1||![1,2,3].includes(state.phase)||typeof data.solo!=='boolean'||typeof data.decoy!=='boolean'||typeof data.dormant!=='boolean')throw new TypeError('Invalid Demoness state');for(const key of ['heard_at','next_sigil','next_bolt','next_step','next_gale','next_mirror','next_rite','eye','rise','flash','decoy_remaining'])nonnegative(state[key],key);if(state.heard_at>(data.actor_state?.elapsed??0)||['eye','rise','flash'].some(key=>state[key]>1)||state.heard_position!==null&&(!Array.isArray(state.heard_position)||state.heard_position.length!==2||!state.heard_position.every(Number.isFinite)))throw new TypeError('Invalid Demoness clock/appearance');if(state.last_strike!==null&&(!state.last_strike||!Number.isFinite(state.last_strike.at)||state.last_strike.at<0||!Array.isArray(state.last_strike.position)||state.last_strike.position.length!==2||!state.last_strike.position.every(Number.isFinite)))throw new TypeError('Invalid Demoness strike record');return data;}
/** Lilitu's policy and duel phases; every attack is a reusable registered capability. */
export class Demoness extends Hunter{
 static entity_type='df_demoness';
 get usesSidearm(){return false;}
 get clawAttackId(){return this.decoy?'demoness_decoy_claw':'demoness_claw';}
 get hunterRules(){return this.getAsset('actor_rules').data.demoness_hunter;}
 get demoness_state(){return stateFor(this);}
 get phase(){return stateFor(this).phase;}
 get solo(){return !!this.data.solo;}
 get decoy(){return !!this.data.decoy;}
 get dormant(){return !!this.data.dormant;}
 get canBeExecuted(){return false;}
 get isTelegraphing(){return this.data.ability_action_state?.phase==='tell'||super.isTelegraphing;}
 makeDormant(){this.data.dormant=true;stateFor(this).eye=0;stateFor(this).rise=0;this.cancelMovement();if(this.data.ability_action_state)this.data.ability_action_state.cancel_requested=true;}
 awaken(){this.data.dormant=false;this.setBehavior('SEARCHING');this.ganger_state.suspicion=70;this.emitActor('boss:awakened');}
 hearNoise(position,options){const heard=super.hearNoise(position,options);if(heard){stateFor(this).heard_position=jsonCopy(position);stateFor(this).heard_at=this.actor_state.elapsed;}return heard;}
 advanceActor(seconds){super.advanceActor(seconds);const state=stateFor(this);state.eye+=(Number(!this.dormant)-state.eye)*Math.min(1,seconds*4.8);state.rise+=(Number(!this.dormant)-state.rise)*Math.min(1,seconds*3);state.flash=Math.max(0,state.flash-seconds*1.8);if(this.decoy&&!this.dead&&!this.dormant){state.decoy_remaining=Math.max(0,state.decoy_remaining-seconds);if(!state.decoy_remaining)this.die({type:'expired'});}}
 validateDemoness(){this.validateHunter();stateFor(this);validateDemonessData(this.data);return this;}
 updateBehavior(seconds,options={}){
  const {player,attacks,abilities}=options,state=stateFor(this),rules=this.getAsset('actor_rules').data.bosses,D=rules.duel,clock=this.data.weapon_state?.elapsed??0;
  if(this.dead||!this.active||this.dormant||this.physics_system.getAttachmentState(this)){this.cancelMovement();return;}
  const phase=!this.solo?1:this.hp/this.maxHp>D.P2?1:this.hp/this.maxHp>D.P3?2:3;
  if(phase>state.phase){state.phase=phase;state.flash=1;if(this.data.ability_action_state)abilities.cancelAction(this);if(phase===2){state.next_mirror=clock+1.5;state.next_step=clock+3;}if(phase===3){state.next_rite=clock+1;this.data.dash_cooldown=D.DASH_CD_P3/60;this.hunter_state.dash_remaining=Math.min(this.hunter_state.dash_remaining,.5);}this.emitActor('demoness:phase-changed',{phase});}
  if(this.data.combat_state?.stagger_remaining>0){if(this.data.ability_action_state)abilities.cancelAction(this);this.cancelMovement();return;}
  if(this.data.ability_action_state)return;
  if(player&&this.state==='SEARCHING'&&!this.ganger_state.investigate_position)this.hearNoise(player.position,{strength:1});
  super.updateBehavior(seconds,options);
  if(!player||player.dead||player.visible===false||this.ganger_state.interrupt_remaining>0)return;
  const world=this.physics_system,view=world.observeTarget(this,player),engaged=['ALERT','SUPPRESSING'].includes(this.state);
  // While searching she can blink toward the real heard point through native clearance.
  if(this.state==='SEARCHING'&&this.ganger_state.investigate_position&&!this.hunter_state.dash_remaining){const heard=world.observeTarget(this,this.ganger_state.investigate_position);if(heard.distance>160&&heard.distance<460&&this.teleportToward(this.ganger_state.investigate_position,{stop_distance:0})){this.hunter_state.dash_remaining=this.data.dash_cooldown;this.emitActor('hunter:dashed',{position:this.position});}}
  const cast=(id,aim={target:player.entity_id})=>{if(!attacks.canAttack(this,{attack_id:`ability:${id}`}))return false;attacks.cancelAttack(this);return !!abilities.cast(this,id,aim);};
  if(!this.solo){if(engaged&&view.distance>55&&view.distance<120&&view.line_clear)cast(this.decoy?'demoness_decoy_whip':'demoness_whip');return;}
  // Long-running fields and summons retain independent cadence, while one common action owns each tell.
  if(phase>=3&&clock>=state.next_rite&&engaged&&cast('demoness_rite')){state.next_rite=clock+D.RITE_EVERY;return;}
  if(phase>=2&&clock>=state.next_mirror&&engaged&&cast('demoness_mirror')){state.next_mirror=clock+D.MIRROR_EVERY;return;}
  if(phase>=2&&clock>=state.next_gale&&view.distance<D.GALE_REACH*.85&&view.line_clear&&engaged&&cast('demoness_gale')){state.next_gale=clock+D.GALE_EVERY;return;}
  if(phase>=2&&clock>=state.next_step&&view.distance>90&&view.distance<520&&engaged&&cast('demoness_step')){state.next_step=clock+D.STEP_EVERY*(phase>=3?.7:1);return;}
  if(clock>=state.next_sigil){const fresh=engaged?player.entity_id:state.heard_position&&this.actor_state.elapsed-state.heard_at<6?state.heard_position:null;if(fresh&&world.observeTarget(this,fresh,{near_range:700}).in_range&&cast('demoness_sigils',{target:fresh})){state.next_sigil=clock+D.SIGIL_EVERY[phase];return;}}
  if(engaged&&view.distance>55&&view.distance<120&&view.line_clear&&cast(phase>=3?'demoness_whip_double':'demoness_whip'))return;
  if(clock>=state.next_bolt&&engaged&&view.line_clear&&view.distance>140&&view.distance<560&&cast('demoness_bolts'))state.next_bolt=clock+D.BOLT_EVERY*(phase>=3?.75:1);
 }
}
