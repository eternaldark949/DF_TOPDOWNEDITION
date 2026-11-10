import rules from '../../directory/game-combat-rules.json' with {type:'json'};
import {BODY_GROUP} from '../../basement/physics/index.mjs';
import {nonnegative,jsonCopy} from '../values.mjs';

export const isCombatDead=entity=>!entity||entity.destroyed||entity.dead===true||entity.data?.state==='dead'||typeof entity.data?.health==='number'&&entity.data.health<=0;
const stateFor=entity=>entity.data.combat_state??=( {bleed:null,orbs:[],stagger_remaining:0,boss_resist_remaining:0,slam:null} );
const team=entity=>entity?.alliance??entity?.data?.alliance??entity?.data?.team??null;

/** Damage and timed game rules. Contact detection, velocities and impulses are engine-owned. */
export class combatSystem{
 #context=null;#targets=new Set();#session;#rules;#policy;
 constructor({session,rules:settings=rules,policy={}}={}){this.#session=session;this.#rules=jsonCopy(settings);this.#policy=policy;}
 attach(context){if(this.#context)throw new Error('Combat is already attached');this.#context=context;context.defer(context.api.physics.on('contactBegin',event=>this.#contact(event)));this.reconnectGameplay();}
 detach(){this.#targets.clear();this.#context=null;}
 emit(event,detail){this.#session?.emit(event,detail);this.#policy.on_event?.(event,detail);}
 canDamage(source,target,{source_alliance}={}){if(!target||isCombatDead(target)||source===target)return false;if(this.#policy.can_damage)return !!this.#policy.can_damage(source,target);const a=team(source)??source_alliance,b=team(target);if(target.data?.player_protected&&a==='friendly')return false;return !(a&&b&&a===b)&& (typeof target.takeDamage==='function'||typeof target.data?.health==='number');}
 damage(target,amount,{source_id=null,type='ballistic',crit=false,bypass_invulnerability=false,...detail}={}){
  if(this.#context?.engine?.phase==='render')throw new Error('Rendering cannot deal damage');
  nonnegative(amount,'damage');if(isCombatDead(target)||!amount)return false;
  amount*=this.#policy.incoming_multiplier?.(target,type)??1;nonnegative(amount,'modified damage');
  const source=source_id===null?null:this.#context.api.elements.fetchEntity(source_id);
  let applied;if(typeof target.takeDamage==='function')applied=target.takeDamage(amount,{source:source_id,type,crit,bypass_invulnerability});else if(typeof target.data.health==='number'){target.data.health=Math.max(0,target.data.health-amount);applied=true;}else return false;
  if(applied===false)return false;target.data.last_hit={source_id,type,crit};
  this.emit('combat:hit',{target_id:target.entity_id,source_id,amount,type,crit,...detail});
  if(isCombatDead(target))this.emit(target.downed?'combat:downed':'combat:killed',{target_id:target.entity_id,source_id,type});return true;
 }
 applyBleed(target,{dps,seconds=3,max_stacks=this.#rules.bleed.max_stacks,source_id=null}={}){
  nonnegative(dps,'bleed DPS');nonnegative(seconds,'bleed duration');if(!Number.isSafeInteger(max_stacks)||max_stacks<1)throw new TypeError('Invalid bleed stack limit');if(isCombatDead(target))return false;
  const state=stateFor(target),prior=state.bleed;state.bleed={dps:Math.max(dps,prior?.dps??0),remaining:seconds,next:prior?.next??this.#rules.bleed.interval_seconds,stacks:Math.min(max_stacks,(prior?.stacks??0)+1),source_id:source_id??prior?.source_id??null};this.#targets.add(target.entity_id);return true;
 }
 attachOrb(target,{damage,interval_seconds,ticks=12,max_orbs=4,source_id=null}={}){
  nonnegative(damage,'orb damage');nonnegative(interval_seconds,'orb interval');if(!interval_seconds||!Number.isSafeInteger(ticks)||ticks<1||!Number.isSafeInteger(max_orbs)||max_orbs<1)throw new TypeError('Invalid orb timing/limit');if(isCombatDead(target))return false;
  const state=stateFor(target);let next=interval_seconds;
  if(state.orbs.length>=max_orbs){const oldest=state.orbs.shift();next=oldest.next/oldest.interval_seconds*interval_seconds;}
  state.orbs.push({damage,interval_seconds,next,ticks,source_id});this.#targets.add(target.entity_id);return true;
 }
 haymaker(target,{damage,source_id,boss=!!target.data.boss}={}){
  if(isCombatDead(target))return;const state=stateFor(target),R=this.#rules.knuckles;
  if(!boss||state.boss_resist_remaining<=0){const seconds=boss?R.boss_stagger_seconds:R.stagger_seconds;state.stagger_remaining=Math.max(state.stagger_remaining,seconds);target.cancelMovement?.();target.suspendMovement?.(seconds);if(boss)state.boss_resist_remaining=R.boss_resist_seconds;this.emit('combat:stagger',{target_id:target.entity_id,seconds});}
  state.slam={remaining:R.slam_seconds,damage:Math.round(damage*R.slam_multiplier),source_id};this.#targets.add(target.entity_id);
 }
 #contact(event){for(const [entity,other]of [[event.entity_a,event.body_b],[event.entity_b,event.body_a]]){
  const state=entity?.data.combat_state,slam=state?.slam;if(!slam||isCombatDead(entity)||!other||event.normal_impulse<=0)continue;
  const obstacle=other.getState();if(obstacle.physics_type!=='static'&&!(obstacle.collision_group&BODY_GROUP.PROP))continue;
  state.slam=null;this.damage(entity,slam.damage,{source_id:slam.source_id,type:'slam',bypass_invulnerability:true});this.emit('combat:slam',{target_id:entity.entity_id});
 }}
 afterPhysics(context){this.advance(context.api.physics.config.fixed_step);}
 advance(seconds){nonnegative(seconds,'combat step');if(this.#context?.engine?.phase==='render')throw new Error('Rendering cannot advance combat');if(this.#context?.engine?.paused)return;for(const id of this.#targets){const target=this.#context.api.elements.fetchEntity(id);if(isCombatDead(target)){this.#targets.delete(id);continue;}const state=stateFor(target),b=state.bleed;
  if(b){b.remaining-=seconds;b.next-=seconds;while(b.next<=1e-9&&b.remaining-b.next>=-1e-9){b.next+=this.#rules.bleed.interval_seconds;this.damage(target,b.dps*this.#rules.bleed.interval_seconds*b.stacks,{source_id:b.source_id,type:'bleed',bypass_invulnerability:true});if(isCombatDead(target))break;}if(b.remaining<=1e-9)state.bleed=null;}
  for(const orb of state.orbs){orb.next-=seconds;while(orb.next<=1e-9&&orb.ticks>0&&!isCombatDead(target)){orb.next+=orb.interval_seconds;orb.ticks--;this.damage(target,orb.damage,{source_id:orb.source_id,type:'burn',bypass_invulnerability:true});}}state.orbs=state.orbs.filter(orb=>orb.ticks>0);
  state.stagger_remaining=Math.max(0,state.stagger_remaining-seconds);state.boss_resist_remaining=Math.max(0,state.boss_resist_remaining-seconds);if(state.slam){state.slam.remaining-=seconds;if(state.slam.remaining<=0)state.slam=null;}
  if(!state.bleed&&!state.orbs.length&&!state.stagger_remaining&&!state.boss_resist_remaining&&!state.slam)this.#targets.delete(id);
 }}
 reconnectGameplay(){this.#targets.clear();for(const entity of this.#context.api.elements.getEntities())if(entity.data.combat_state){const state=entity.data.combat_state;jsonCopy(state);if(!Array.isArray(state.orbs))throw new TypeError('Invalid orb state');
  for(const key of ['stagger_remaining','boss_resist_remaining'])nonnegative(state[key],key);
  if(state.bleed){nonnegative(state.bleed.dps,'bleed DPS');nonnegative(state.bleed.remaining,'bleed duration');if(!Number.isSafeInteger(state.bleed.stacks)||state.bleed.stacks<1||!Number.isFinite(state.bleed.next))throw new TypeError('Invalid bleed state');}
  for(const orb of state.orbs){nonnegative(orb.damage,'orb damage');nonnegative(orb.interval_seconds,'orb interval');if(!orb.interval_seconds||!Number.isSafeInteger(orb.ticks)||orb.ticks<1||!Number.isFinite(orb.next))throw new TypeError('Invalid orb state');}
  if(state.slam){nonnegative(state.slam.damage,'slam damage');nonnegative(state.slam.remaining,'slam timer');}this.#targets.add(entity.entity_id);
 }}
 levelEntered(){this.reconnectGameplay();}
 levelLeaving(){this.#targets.clear();}
}
