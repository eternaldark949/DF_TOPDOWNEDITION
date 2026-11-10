import {validateAttackState} from '../gameplay/attacks/attack-registry.mjs';
import {gameCharacter} from '../basement/physics/index.mjs';
import {actorVitals} from '../gameplay/actors/actor-vitals.mjs';
import {nonnegative,jsonCopy} from '../gameplay/values.mjs';
const health=new WeakMap(),hooks=new WeakMap();
const stateFor=actor=>actor.data.actor_state??={format_version:1,defeated:false,invulnerable_remaining:0,elapsed:0};
/** Common actor gameplay over a real gameCharacter. No velocity, geometry or body mirrors. */
export class gameActor extends gameCharacter{
 static entity_type='df_actor';
 get attackSelection(){return jsonCopy(this.data.attack_state??{format_version:1,selected_id:null});}
 set attackSelection(snapshot){this.data.attack_state=jsonCopy(validateAttackState(snapshot,()=>true));}
 get vitals(){let component=health.get(this);if(!component){component=new actorVitals(this.data);health.set(this,component);}return component;}
 get hp(){return this.vitals.health;}
 set hp(value){this.vitals.setHealth(value);}
 get maxHp(){return this.vitals.max_health;}
 set maxHp(value){this.vitals.setMaximumHealth(value);}
 get dead(){return this.vitals.dead||stateFor(this).defeated;}
 get visible(){return this.active&&this.data.visible!==false;}
 set visible(value){this.data.visible=!!value;}
 get alliance(){return this.data.alliance??'neutral';}
 set alliance(value){this.data.alliance=String(value);}
 get radius(){return this.collision_shape.radius;}
 get actor_state(){return stateFor(this);}
 connectActor(callbacks={}){for(const value of Object.values(callbacks))if(typeof value!=='function')throw new TypeError('Actor hooks must be functions');this.vitals.validate();const state=stateFor(this);jsonCopy(state);if(state.format_version!==1||typeof state.defeated!=='boolean')throw new TypeError('Unsupported actor state');nonnegative(state.invulnerable_remaining,'damage grace');nonnegative(state.elapsed,'actor time');hooks.set(this,callbacks);return this;}
 disconnectActor(){hooks.delete(this);}
 emitActor(event,detail={}){hooks.get(this)?.emit?.(event,{entity_id:this.entity_id,...detail});}
 takeDamage(amount,{source=null,type='contact',bypass_invulnerability=false,impulse}={}){
  nonnegative(amount,'damage');if(this.dead||!amount)return false;const state=stateFor(this),bypass=bypass_invulnerability||['ballistic','energy','melee','bleed','burn','slam'].includes(type);
  if(!bypass&&state.invulnerable_remaining>0)return false;if(impulse)this.body.applyImpulse(impulse);
  const applied=this.vitals.damage(amount);this.data.last_hit={source_id:source,type};if(!bypass)state.invulnerable_remaining=this.data.damage_grace_seconds??0;
  this.onDamaged({amount:applied,source,type});this.emitActor('actor:damaged',{amount:applied,source,type,health:this.hp});if(this.hp===0)this.die({source,type});return true;
 }
 onDamaged(){}
 die({source=null,type='contact'}={}){const state=stateFor(this);if(state.defeated)return false;state.defeated=true;this.cancelMovement();this.deactivate();this.onDefeated();this.emitActor('actor:defeated',{source,type});return true;}
 onDefeated(){}
 heal(amount){if(this.dead)return 0;const applied=this.vitals.heal(amount);if(applied)this.emitActor('actor:healed',{amount:applied,health:this.hp});return applied;}
 revive({health=this.maxHp,position}={}){
  nonnegative(health,'revive health');if(!health)throw new TypeError('Revive health must be positive');
  const at=position??this.position;if(!this.physics_system.isPlacementClear(this.collision_shape,at,{rotation:this.rotation,ignore_body:this,include_ghosts:false}))return false;
  if(position)this.setPosition(at);this.vitals.setHealth(health);stateFor(this).defeated=false;stateFor(this).invulnerable_remaining=0;this.activate();this.emitActor('actor:revived',{health:this.hp});return true;
 }
 advanceActor(seconds){nonnegative(seconds,'actor step');const state=stateFor(this);state.elapsed+=seconds;state.invulnerable_remaining=state.invulnerable_remaining<=seconds+1e-9?0:state.invulnerable_remaining-seconds;}
}
