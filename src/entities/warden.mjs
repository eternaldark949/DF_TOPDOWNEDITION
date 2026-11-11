import {GatlingGunner} from './gatling-gunner.mjs';
import {nonnegative,jsonCopy} from '../gameplay/values.mjs';
const stateFor=actor=>actor.data.warden_state??={format_version:1,target_id:null,seen_position:null,hidden_seconds:0,next_special_at:2,flank_position:null,flank_retry:0,eye:1,rise:1};
export function validateWardenData(data,entity_type){if(!['vesper','matins','compline'].includes(data.persona))throw new TypeError('Invalid Warden persona');const expected={df_vesper:'vesper',df_matins:'matins',df_compline:'compline'}[entity_type];if(expected&&data.persona!==expected)throw new TypeError('Warden persona does not match its class');const state=data.warden_state;if(!state)return data;jsonCopy(state);if(!['vesper','matins','compline'].includes(data.persona)||state.format_version!==1||state.target_id!==null&&(!Number.isSafeInteger(state.target_id)||state.target_id<1))throw new TypeError('Invalid Warden state');for(const key of ['hidden_seconds','next_special_at','flank_retry','eye','rise'])nonnegative(state[key],key);for(const key of ['seen_position','flank_position'])if(state[key]!==null&&(!Array.isArray(state[key])||state[key].length!==2||!state[key].every(Number.isFinite)))throw new TypeError('Invalid Warden target point');return data;}
/** The shared Sanctum actor. Persona selects registered attacks and authored presentation. */
export class Warden extends GatlingGunner{
 static entity_type='df_warden';
 get gunnerRules(){const rules=this.getAsset('actor_rules').data;return {...rules.gunner,reload_seconds:rules.bosses.warden.RELOAD/60,tell_seconds:.5};}
 get warden_state(){return stateFor(this);}
 get persona(){return this.data.persona;}
 get canBeExecuted(){return false;}
 makeDormant(){super.makeDormant();stateFor(this).eye=0;stateFor(this).rise=0;}
 advanceActor(seconds){super.advanceActor(seconds);const state=stateFor(this);state.eye+=(Number(!this.dormant)-state.eye)*Math.min(1,seconds*9);state.rise+=(Number(!this.dormant)-state.rise)*Math.min(1,seconds*4.8);}
 awaken(hold_seconds=1){super.awaken(hold_seconds+this.data.formation_order*this.getAsset('actor_rules').data.bosses.warden.STAGGER/60);const state=stateFor(this),rules=this.getAsset('actor_rules').data.bosses.warden,every=rules[{vesper:'CENSER_EVERY',matins:'HYMN_EVERY',compline:'HOOK_EVERY'}[this.persona]];state.next_special_at=(this.data.weapon_state?.elapsed??0)+2+every*(.3+.25*this.data.formation_order);}
 validateGunner(){super.validateGunner();stateFor(this);validateWardenData(this.data,this.entity_type);return this;}
 updateBehavior(seconds,{player,attacks,abilities,encounters,formation={index:0,count:1}}={}){
  if(this.dead||!this.active||this.dormant||this.physics_system.getAttachmentState(this)){this.cancelMovement();return;}
  const state=stateFor(this),clock=this.data.weapon_state?.elapsed??0;state.target_id=player?.entity_id??null;
  if(!player||player.dead||player.visible===false||this.data.combat_state?.stagger_remaining>0){this.cancelMovement();if(this.data.ability_action_state)this.data.ability_action_state.cancel_requested=true;return;}
  const world=this.physics_system,rules=this.getAsset('actor_rules').data.gunner,order=encounters.getWardenOrders(this),view=world.observeTarget(this,player),aim=order?.aim??player.entity_id;
  this.lookAtTarget(aim);
  if(order?.flank&&state.seen_position){state.flank_retry=Math.max(0,state.flank_retry-seconds);if(!state.flank_retry){state.flank_position=world.findFiringPlacement(this,state.seen_position)?.position??null;state.flank_retry=1;}if(state.flank_position)this.moveTo(state.flank_position,{speed:144,face_movement:false});else this.followTarget(state.seen_position,{speed:144,arrival_distance:140,face_movement:false});}
  else if(!order?.sight)this.followTarget(aim,{speed:120,arrival_distance:180,face_movement:false});
  else this.orbitTarget(player,{radius:280,angular_speed:.5,slot_count:formation.count,slot_index:formation.index,speed:90,personal_space:90,avoid_groups:2,face_movement:false});
  if(clock<this.gunner_state.hold_until)return;
  const special={vesper:'warden_censer',matins:'warden_hymn',compline:'warden_hook'}[this.persona],definition=abilities.getLoadout(this).getDefinition(special),maySpecial=this.persona==='matins'||view.distance<=definition.range&&(order?.sight||order?.revealed||state.seen_position&&state.hidden_seconds<(this.persona==='vesper'?4:2));
  if(clock>=state.next_special_at&&maySpecial&&(this.persona!=='compline'||!this.data.ability_action_state)&&abilities.cast(this,special,{target:aim},{channel:this.persona==='compline'?'primary':'secondary'})){state.next_special_at=clock+definition.cooldown_seconds;return;}
  if(this.data.ability_action_state)return;
  if(order&&(order.sight||order.cover||order.revealed)&&attacks.canAttack(this,{attack_id:'ability:warden_burst'}))attacks.requestAttack(this,{attack_id:'ability:warden_burst',target:aim});
 }
}
export class Vesper extends Warden{static entity_type='df_vesper';}
export class Matins extends Warden{static entity_type='df_matins';}
export class Compline extends Warden{static entity_type='df_compline';}
