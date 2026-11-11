import {BODY_GROUP} from '../../basement/physics/index.mjs';
import {actorAbilities} from './ability-loadout.mjs';
import {jsonCopy,nonnegative} from '../values.mjs';

/** Shared spell requests. The existing attack controller owns the single cooldown clock. */
export class abilitySystem{
 #context=null;#weapons;#combat;#player;#pending=new Map();#policy;
 constructor({weapons,combat,get_player,policy={}}={}){if(!weapons||!combat)throw new TypeError('Abilities require shared attack and combat services');this.#weapons=weapons;this.#combat=combat;this.#player=get_player;this.#policy=policy;}
 attach(context){if(this.#context)throw new Error('Abilities already attached');this.#context=context;}
 detach(){this.#pending.clear();this.#context=null;}
 #official(actor){if(!this.#context||!actor||actor.destroyed||this.#context.api.elements.fetchEntity(actor.entity_id)!==actor)throw new TypeError('Cast from an official actor in this runtime');return actor;}
 getLoadout(actor){this.#official(actor);return actorAbilities(actor.data,this.#context.api.physics.elements.asset_library.getResource('df:abilities').data);}
 getAttackController(actor){this.#official(actor);return actor===this.#player?.()?this.#weapons:this.#weapons.getActorController(actor);}
 getRange(actor){const loadout=this.getLoadout(actor);return loadout.getEquippedAbility()?.range??0;}
 requestCast(actor,ability_id,aim={}){
  this.#official(actor);if(this.#context.engine?.phase==='render')throw new Error('Rendering cannot request abilities');if(this.#context.engine?.paused)return false;
  const loadout=this.getLoadout(actor);if(ability_id===undefined)ability_id=loadout.equipped_id;if(!ability_id||!loadout.hasAbility(ability_id))return false;const copy=jsonCopy(aim);this.#pending.set(actor.entity_id,{ability_id,aim:copy,equipped_id:loadout.equipped_id});return true;
 }
 cancelCast(actor){return this.#pending.delete(typeof actor==='number'?actor:actor.entity_id);}
 cast(actor,ability_id,aim={}){
  this.#official(actor);const context=this.#context;
  if(context.engine?.phase==='render')throw new Error('Rendering cannot cast abilities');
  const loadout=this.getLoadout(actor);if(ability_id===undefined)ability_id=loadout.equipped_id;const controller=this.getAttackController(actor);
  if(!controller?.canExecute()||controller.quick_draw||actor.data.combat_state?.stagger_remaining>0||this.#policy.can_cast?.(actor,ability_id)===false||!ability_id||!loadout.hasAbility(ability_id))return false;
  const definition=loadout.getDefinition(ability_id);if(definition.allow_mounted===false&&context.api.physics.getAttachmentState(actor))return false;const spread=this.#policy.spread?.(actor,definition.spread)??definition.spread;nonnegative(spread,'ability spread');
  // Allow only aim keywords, never a caller-supplied physical packet or source/owner override.
  const {target,direction,angle}=jsonCopy(aim),projectile=context.api.physics.createProjectileFrom(actor,{template:'df:projectile',local_position:definition.local_position,...(target===undefined?{}:{target}),...(direction===undefined?{}:{direction}),...(angle===undefined?{}:{angle}),angle_offset:spread?((this.#policy.random??Math.random)()-.5)*spread:0,speed:definition.speed,lifetime:definition.lifetime,collision_shape:{shape_type:'circle',radius:definition.radius},collision_mask:BODY_GROUP.STATIC|BODY_GROUP.CHARACTER|BODY_GROUP.PROP|BODY_GROUP.VEHICLE,penetration_count:0,impact_strength:definition.impact_strength,data:{role:'projectile',ability_id,source_id:actor.entity_id,source_alliance:actor.alliance??actor.data.alliance??null,damage:definition.damage,damage_type:definition.damage_type,color:definition.color,flash_color:definition.flash_color,flash_radius:definition.flash_radius,visual_radius:definition.radius}});
  if(!projectile)return false;
  controller.setCooldown(definition.cooldown_seconds);this.#combat.emit('ability:cast',{entity_id:actor.entity_id,ability_id,projectile_id:projectile.entity_id});return projectile;
 }
 beforePhysics(){if(this.#context?.engine?.phase==='render')throw new Error('Rendering cannot advance abilities');if(this.#context?.engine?.paused){this.#pending.clear();return;}const pending=[...this.#pending];this.#pending.clear();for(const [id,request] of pending){const actor=this.#context.api.elements.fetchEntity(id);if(actor&&!actor.destroyed&&this.getLoadout(actor).equipped_id===request.equipped_id)this.cast(actor,request.ability_id,request.aim);}}
 gameplayPaused(){this.#pending.clear();}
 levelLeaving(){this.#pending.clear();}
 reconnectGameplay(){this.#pending.clear();}
}
