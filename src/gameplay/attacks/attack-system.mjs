import attackRules from '../../directory/game-attack-rules.json' with {type:'json'};
import {getCombatProfile} from '../../directory/combat-profiles.mjs';
import {prepareMountedAttack,mountedAttackState,validateMountedAttack} from './mounted-attacks.mjs';
import combatRules from '../../directory/game-combat-rules.json' with {type:'json'};
import {gameCharacter} from '../../basement/physics/index.mjs';
import {actorItems} from '../actors/actor-inventory.mjs';
import {attackRegistry,validateAttackState} from './attack-registry.mjs';
import {jsonCopy} from '../values.mjs';

/** Universal character attack entry point. Reuses existing execution, ownership and physics. */
export class attackSystem{
 #context=null;#weapons;#abilities;#combat;#session;#player;#items;#actors=new Map();#pending=new Map();#lastAim=new Map();#off=[];
 constructor({weapons,abilities,combat,session,get_player=()=>session?.player,items=session?.items,definitions={}}={}){
  if(!weapons||!abilities||!combat)throw new TypeError('Attacks require shared weapon, ability and combat services');
  this.#weapons=weapons;this.#abilities=abilities;this.#combat=combat;this.#session=session;this.#player=get_player;this.#items=items;
  this.registry=new attackRegistry({assert_boundary:()=>this.#configurationBoundary()});
  const weaponType={validateDefinition:definition=>{if(definition.attack_id==='unarmed:punch'){if(definition.attack_type!=='melee'||definition.item_id)throw new TypeError('Invalid unarmed attack');}else {if(typeof definition.item_id!=='string'||!definition.item_id)throw new TypeError('Weapon attacks require item_id');const item=this.#items.getDefinition(definition.item_id),type=['melee','fists'].includes(item.weaponMode)?'melee':'firearm';if(item.type!=='weapon'||definition.attack_type!==type)throw new TypeError('Attack type must match its weapon definition');}},canUse:({definition,items})=>definition.item_id?items.getEquippedWeapon()?.definition_id===definition.item_id:!items.getEquippedWeapon(),execute:({controller,aim})=>controller.fire(aim)};
  this.registry.registerAttackType('firearm',weaponType).registerAttackType('melee',weaponType).registerAttackType('ability',{
   validateDefinition:definition=>{if(typeof definition.ability_id!=='string'||!definition.ability_id)throw new TypeError('Ability attacks require ability_id');if(this.#context&&!Object.hasOwn(this.#context.api.physics.elements.asset_library.getResource('df:abilities').data,definition.ability_id))throw new TypeError('Unknown ability attack definition');},
   canUse:({actor,definition})=>this.#abilities.getLoadout(actor).hasAbility(definition.ability_id),
   execute:({actor,definition,aim})=>this.#abilities.cast(actor,definition.ability_id,aim)
  });
  for(const definition of Object.values(definitions))this.registry.registerAttack(definition);
 }
 #configurationBoundary(){if(this.#context&&!['idle','registration'].includes(this.#context.engine?.phase??'idle'))throw new Error('Register attacks at an idle runtime boundary');}
 #writable(){if(!this.#context)throw new Error('Attacks are detached');if(this.#context.engine?.phase==='render')throw new Error('Rendering cannot mutate attacks');}
 #official(actor){if(!this.#context||!(actor instanceof gameCharacter)||actor.destroyed||this.#context.api.elements.fetchEntity(actor.entity_id)!==actor)throw new TypeError('Attack with an official character in this runtime');return actor;}
 #state(actor){return actor.data.attack_state??{format_version:1,selected_id:null};}
 getItems(actor){this.#official(actor);return actor===this.#player?.()?this.#items:actor.items??actorItems(actor.data,`actor:${actor.entity_id}`,this.#context.api.physics.elements.asset_library.getResource('df:actor_items').data);}
 registerActor(actor,{items,policy={}}={}){
  this.#writable();this.#official(actor);validateMountedAttack(actor.data.mounted_attack_state);if(actor.data.mounted_attack_state&&!this.registry.hasAttack(actor.data.mounted_attack_state.attack_id))throw new TypeError('Unknown mounted attack');validateAttackState(this.#state(actor),id=>this.registry.hasAttack(id));actor.data.attack_state??={format_version:1,selected_id:null};this.#abilities.getLoadout(actor);
  if(actor===this.#player?.())return this.#weapons;
  const previous=this.#actors.get(actor.entity_id);if(previous?.actor===actor)return previous.controller;
  if(previous)this.unregisterActor(actor.entity_id);
  const owned=this.getItems(actor);if(items&&items!==owned)throw new Error('Register the character’s canonical inventory');let controller;
  controller=this.#weapons.registerActor(actor,{items:owned,policy:{roll_crit:()=>1,stat:(name,base)=>name==='spread'?base*(actor.data.accuracy_mod??1):base,
   can_fire:()=>actor.active&&!actor.dead&&!(actor.data.combat_state?.stagger_remaining>0)&&!(actor.data.ganger_state?.interrupt_remaining>0),
   on_fired:()=>actor.onWeaponFired?.(controller),...policy}});
  this.#actors.set(actor.entity_id,{actor,controller,items,policy});return controller;
 }
 unregisterActor(actor){const id=typeof actor==='number'?actor:actor.entity_id;this.cancelAttack(id);this.#lastAim.delete(id);this.#abilities.cancelCast(id);this.#weapons.unregisterActor(id);return this.#actors.delete(id);}
 configureActor(actor,options={}){this.#writable();this.#official(actor);if(actor===this.#player?.())throw new Error('Configure player execution policies in Directory');this.unregisterActor(actor);return this.registerActor(actor,options);}
 reconnectActor(actor){const old=this.#actors.get(actor.entity_id),options=old?{items:old.items,policy:old.policy}:{};this.unregisterActor(actor);return this.registerActor(actor,options);}
 getController(actor){this.#official(actor);if(actor===this.#player?.())return this.#weapons;const entry=this.#actors.get(actor.entity_id);return entry?.actor===actor?entry.controller:this.registerActor(actor);}
 #execution(actor,definition,aim={}){if(!Object.keys(aim).length&&this.#context.api.physics.getAttachmentState(actor)){const mounted=this.getMountedAttackState(actor);if(mounted.aiming&&mounted.attack_id===definition.attack_id)aim=mounted.aim;}return {actor,definition,aim,items:this.getItems(actor),controller:this.getController(actor),api:this.#context.api};}
 #available(actor,definition){const execution=this.#execution(actor,definition);return !!this.registry.getAttackType(definition.attack_type).canUse(execution);}
 getAvailableAttacks(actor){this.#official(actor);const owned=this.getItems(actor),loadout=this.#abilities.getLoadout(actor);
  return this.registry.listAttacks().filter(definition=>definition.item_id?owned.hasItem(definition.item_id):definition.ability_id?loadout.hasAbility(definition.ability_id):true);
 }
 getSelectedAttack(actor){
  this.#official(actor);const state=this.#state(actor);
  if(state.selected_id){const selected=this.registry.getAttack(state.selected_id);if(this.#available(actor,selected))return selected;}
  const weapon=this.getItems(actor).getEquippedWeapon();if(weapon)return this.registry.getAttack(`weapon:${weapon.definition_id}`);
  const ability=this.#abilities.getLoadout(actor).equipped_id;if(ability)return this.registry.getAttack(`ability:${ability}`);
  return this.registry.getAttack('unarmed:punch');
 }
 getAttackProfile(actor){const definition=this.getSelectedAttack(actor);if(!definition.item_id)return definition;const stats=this.getItems(actor).getEquippedWeapon().stats;return Object.freeze({...definition,range:definition.attack_type==='firearm'&&this.#context.api.physics.getAttachmentState(actor)?attackRules.mounted.firearm_range:definition.range,projectile_speed:(stats.projectileSpeed??25)*combatRules.authoring_hz,cooldown_seconds:(stats.fireRate??20)/combatRules.authoring_hz,penetrating:!!stats.penetrating});}
 #mountedLaunch(actor,definition,aim,options={}){
  if(!['firearm','ability'].includes(definition.attack_type))return {allowed:false,reason:'unsupported_mounted_attack'};
  const spell=definition.ability_id?this.#abilities.getLoadout(actor).getDefinition(definition.ability_id):null;
  if(spell?.allow_mounted===false)return {allowed:false,reason:'unsupported_mounted_attack'};
  return this.#context.api.physics.getMountedLaunchState(actor,{...aim,local_position:spell?.local_position??getCombatProfile(definition.item_id).local_muzzle,collision_shape:{shape_type:'circle',radius:spell?.radius??combatRules.projectile.radius},...options});
 }
 getMountedAttackState(actor){this.#official(actor);return mountedAttackState(actor,this.getController(actor),this.#context.api.physics.getAttachmentState(actor));}
 getMountedAttackPose(actor,{blend=1}={}){const state=this.getMountedAttackState(actor);if(!state.aiming||state.attack_id!==this.getSelectedAttack(actor).attack_id)return null;const definition=this.registry.getAttack(state.attack_id),pose=this.#mountedLaunch(actor,definition,state.aim,{blend,check_clearance:false});return pose.allowed?{...pose,lean:state.lean}:null;}
 canTarget(actor,target){this.#official(actor);const profile=this.getAttackProfile(actor),world=this.#context.api.physics;
  const sight=world.getAttachmentState(actor)?this.#mountedLaunch(actor,profile,{target},{near_range:profile.range,line_of_sight:true}):world.observeTarget(actor,target,{near_range:profile.range});
  return sight.allowed!==false&&sight.in_range&&(sight.line_clear||profile.penetrating===true);
 }
 #prepareMounted(execution){const mount=this.#context.api.physics.getAttachmentState(execution.actor);if(!mount)return true;
  const state=this.#mountedLaunch(execution.actor,execution.definition,execution.aim,{check_clearance:false});if(!state.allowed)return false;
  prepareMountedAttack(execution.actor,execution.definition,execution.aim,execution.controller,mount,attackRules.mounted);return true;
 }
 selectAttack(actor,attack_id,{instance_id}={}){
  this.#writable();this.#official(actor);const definition=this.registry.getAttack(attack_id),owned=this.getItems(actor),controller=this.getController(actor),hadQuickDraw=!!controller.quick_draw;
  if(definition.item_id){const item=instance_id?owned.getItem(instance_id):owned.getEquippedWeapon()?.definition_id===definition.item_id?owned.getEquippedWeapon():owned.findItem(definition.item_id);if(!item||item.definition_id!==definition.item_id)throw new Error('Select an owned instance of this attack weapon');owned.equipItem(item.instance_id);}
  else if(definition.ability_id){const loadout=this.#abilities.getLoadout(actor);if(!loadout.hasAbility(definition.ability_id))throw new Error('Learn this attack ability before selecting it');loadout.equipAbility(definition.ability_id);}
  else if(attack_id==='unarmed:punch')owned.unequipSlot('weapon');
  if(!this.#available(actor,definition))throw new Error('Attack is unavailable to this character');
  if(hadQuickDraw){controller.cancelQuickDraw();controller.setHolstered(false);}
  actor.data.mounted_attack_state=null;actor.data.attack_state={format_version:1,selected_id:attack_id};this.cancelAttack(actor);return definition;
 }
 useDefaultAttack(actor){this.#writable();this.#official(actor);actor.data.mounted_attack_state=null;actor.data.attack_state={format_version:1,selected_id:null};this.cancelAttack(actor);}
 #binding(actor){const mount=this.#context.api.physics.getAttachmentState(actor);return [this.#state(actor).selected_id,this.getItems(actor).equipped_weapon_id,this.#abilities.getLoadout(actor).equipped_id,mount?.attachment_id??null,mount?.revision??null,mount?.pending??false,mount?.detaching??false];}
 #request(request){const copy=jsonCopy(request);if(!copy||Object.keys(copy).some(key=>!['attack_id','target','direction','angle'].includes(key)))throw new TypeError('Attack requests accept only attack_id and logical aim');const {attack_id,...aim}=copy;return {attack_id,aim};}
 requestAttack(actor,request={}){
  this.#writable();this.#official(actor);if(this.#context.engine?.paused)return false;
  const {attack_id,aim}=this.#request(request),definition=attack_id?this.registry.getAttack(attack_id):this.getSelectedAttack(actor);
  if(!this.#available(actor,definition)||!this.#prepareMounted(this.#execution(actor,definition,aim)))return false;
  this.#lastAim.set(actor.entity_id,aim);this.#pending.set(actor.entity_id,{attack_id:definition.attack_id,aim,binding:this.#binding(actor)});return true;
 }
 #ready(execution,{check_clearance=true}={}){
  if(this.#context.engine?.paused||!execution.controller.canExecute()||execution.actor.data.combat_state?.stagger_remaining>0||!this.registry.getAttackType(execution.definition.attack_type).canUse(execution))return false;
  if(this.#context.api.physics.getAttachmentState(execution.actor)){const state=this.getMountedAttackState(execution.actor);return state.ready&&state.attack_id===execution.definition.attack_id&&this.#mountedLaunch(execution.actor,execution.definition,Object.keys(execution.aim).length?execution.aim:state.aim,{check_clearance}).allowed;}
  return true;
 }
 canAttack(actor,request={}){this.#official(actor);const {attack_id,aim}=this.#request(request),definition=attack_id?this.registry.getAttack(attack_id):this.getSelectedAttack(actor);return this.#ready(this.#execution(actor,definition,aim));}
 getCooldown(actor){return this.getController(actor).cooldown_seconds;}
 executeAttack(actor,request={}){
  this.#writable();this.#official(actor);const {attack_id,aim}=this.#request(request),definition=attack_id?this.registry.getAttack(attack_id):this.getSelectedAttack(actor),execution=this.#execution(actor,definition,aim);
  if(!execution.controller.canExecute()||actor.data.combat_state?.stagger_remaining>0||!this.registry.getAttackType(definition.attack_type).canUse(execution))return false;
  if(!this.#prepareMounted(execution)||!this.#ready(execution,{check_clearance:false}))return false;
  const result=this.registry.getAttackType(definition.attack_type).execute(execution);
  if(result)this.#combat.emit('attack:executed',{entity_id:actor.entity_id,attack_id:definition.attack_id,attack_type:definition.attack_type,...(typeof result==='object'&&result.entity_id?{projectile_id:result.entity_id}:{})});return result;
 }
 cancelAttack(actor){return this.#pending.delete(typeof actor==='number'?actor:actor.entity_id);}
 attach(context){
  if(this.#context)throw new Error('Attacks already attached');this.#context=context;
  this.#off.push(context.api.physics.on('entityRegistered',event=>{if(event.entity instanceof gameCharacter&&!event.entity.destroyed)this.registerActor(event.entity);}),context.api.physics.on('entityRemoved',event=>this.unregisterActor(event.entity.entity_id)));
  if(this.#session)this.#off.push(this.#session.on('player:fire',event=>{const player=this.#player();if(player)this.requestAttack(player,event.aim??{});}),this.#session.on('player:fire-released',event=>{const player=this.#player(),controller=player&&this.getController(player);if(controller?.quick_draw&&this.getSelectedAttack(player).attack_type==='firearm')controller.requestQuickDraw(Object.keys(event.aim??{}).length?event.aim:this.#lastAim.get(player.entity_id)??{});else if(player)this.cancelAttack(player);}),this.#session.on('player:controls-blocked',()=>{const player=this.#player();if(player)this.cancelAttack(player);}));
  this.reconnectGameplay();
 }
 beforePhysics(){this.#writable();if(this.#context.engine?.paused){this.#pending.clear();return;}const pending=[...this.#pending];this.#pending.clear();for(const [id,request] of pending){const actor=this.#context.api.elements.fetchEntity(id);if(actor&&!actor.destroyed){const binding=this.#binding(actor);if(request.binding.every((value,index)=>value===binding[index])){const result=this.executeAttack(actor,{attack_id:request.attack_id,...request.aim});if(!result){const mounted=this.getMountedAttackState(actor);if(actor.active&&!actor.dead&&this.getController(actor).canExecute()&&mounted.aiming&&!mounted.ready)this.#pending.set(id,request);}}}}}
 gameplayPaused(){this.#pending.clear();this.#lastAim.clear();}
 reconnectGameplay(){for(const id of [...this.#actors.keys()])this.unregisterActor(id);this.#pending.clear();this.#lastAim.clear();for(const actor of this.#context.api.elements.getEntities())if(actor instanceof gameCharacter)this.registerActor(actor);}
 levelLeaving(){this.gameplayPaused();for(const id of [...this.#actors.keys()])this.unregisterActor(id);}
 levelEntered(){this.reconnectGameplay();}
 detach(){for(const off of this.#off.splice(0))off();for(const id of [...this.#actors.keys()])this.unregisterActor(id);this.gameplayPaused();this.#context=null;}
}
