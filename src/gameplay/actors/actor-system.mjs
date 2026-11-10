import {gameActor} from '../../entities/game-actor.mjs';
import {NPC} from '../../entities/npc.mjs';
import {Ganger} from '../../entities/ganger.mjs';
import {BODY_GROUP} from '../../basement/physics/index.mjs';
import {createActorPacket} from '../../directory/game-actor-factory.mjs';

/** Registered actor lifetimes and policy updates in the existing fixed step. No second world or index. */
export class actorSystem{
 #context=null;#actors=new Map();#weapons;#abilities;#combat;#player;#session;#policy;#off=[];#pendingLifetime=new Map();
 constructor({weapons,combat,abilities,session,get_player=()=>session?.player,policy={}}={}){this.#weapons=weapons;this.#abilities=abilities;this.#combat=combat;this.#player=get_player;this.#session=session;this.#policy=policy;}
 attach(context){if(this.#context)throw new Error('Actors already attached');this.#context=context;this.#off.push(context.api.physics.on('entityRegistered',event=>this.#track(event.entity)),context.api.physics.on('entityRemoved',event=>this.#untrack(event.entity.entity_id)));this.reconnectGameplay();}
 detach(){for(const off of this.#off.splice(0))off();for(const id of [...this.#actors.keys()])this.#untrack(id);this.#context=null;}
 #lifetime(actor,retain){if(this.#context.engine?.phase==='physics'){this.#pendingLifetime.set(actor.entity_id,retain);return;}this.#context.engine?.[retain?'retainEntity':'releaseEntity']?.(actor);}
 #event(event,detail){const actor=this.#actors.get(detail.entity_id);if(event==='npc:hired'&&actor)this.#lifetime(actor,true);if(event==='npc:released'&&actor)this.#lifetime(actor,false);if(event==='actor:cooldown-requested'&&actor){this.#weapons.getActorController(actor)?.setCooldown(detail.seconds);delete actor.data.weapon_cooldown_seconds;}this.#session?.emit(event,detail);this.#policy.on_event?.(event,detail);if(event==='actor:inventory-loaded'){const actor=this.#actors.get(detail.entity_id);if(actor)this.#bindWeapon(actor);}}
 #bindWeapon(actor){this.#weapons.unregisterActor(actor.entity_id);let controller;controller=this.#weapons.registerActor(actor,{policy:{roll_crit:()=>1,stat:(name,base)=>name==='spread'?base*(actor.data.accuracy_mod??1):base,can_fire:()=>actor.active&&!actor.dead&&!(actor.data.combat_state?.stagger_remaining>0)&&!(actor instanceof Ganger&&actor.ganger_state.interrupt_remaining>0),on_fired:()=>{if(actor instanceof NPC)actor.onWeaponFired(controller);}}});return controller;}
 #track(actor){if(!(actor instanceof gameActor)||actor.entity_type==='df_player'||actor.destroyed||this.#actors.get(actor.entity_id)===actor)return;
  actor.connectActor({emit:(event,detail)=>this.#event(event,detail)});
  if(actor instanceof NPC)actor.validateNPC();if(actor instanceof Ganger)actor.validateGanger();
  if(actor instanceof NPC||actor instanceof Ganger){
   if(!actor.data.inventory?.order.length&&actor.data.weapon_definition_id){const item=actor.items.grantItem(actor.data.weapon_definition_id);actor.items.equipItem(item.instance_id);}
   this.#bindWeapon(actor);
  }
  if(actor.data.weapon_cooldown_seconds!==undefined){this.#weapons.getActorController(actor)?.setCooldown(actor.data.weapon_cooldown_seconds);delete actor.data.weapon_cooldown_seconds;}
  this.#actors.set(actor.entity_id,actor);
  if(actor instanceof NPC&&actor.recruited)this.#lifetime(actor,true);
 }
 #untrack(id){const actor=this.#actors.get(id);if(!actor)return;this.#weapons.unregisterActor(id);this.#abilities?.cancelCast(id);if(!actor.destroyed)actor.cancelMovement();actor.disconnectActor();this.#actors.delete(id);this.#pendingLifetime.delete(id);}
 getActors(){return [...this.#actors.values()];}
 spawn(packet={},options={}){if(!this.#context)throw new Error('Actor system is detached');const actor=this.#context.createEntity(createActorPacket(this.#context.api.physics,packet),options);try{this.#track(actor);return actor;}catch(error){this.#weapons.unregisterActor(actor.entity_id);actor.disconnectActor();this.#context.engine?.releaseEntity?.(actor);actor.destroy();throw error;}}
 beforePhysics(context,seconds=context.api.physics.config.fixed_step){
  if(context.engine?.phase==='render')throw new Error('Rendering cannot advance actors');if(context.engine?.paused)return;
  this.#flushLifetimes();
  const player=this.#player(),world=context.api.physics;
  for(const actor of this.#actors.values()){
   if(actor.destroyed){this.#untrack(actor.entity_id);continue;}actor.advanceActor(seconds);
   if(actor.dead||!actor.active)continue;
   if(actor instanceof NPC){const rules=actor.getAsset('actor_rules').data.npc;const targets=world.peruseNearbyEntities(actor,{near_range:actor.equippedWeaponId?rules.combat_range:actor.abilities.getEquippedAbility()?.range??rules.combat_range,include_groups:BODY_GROUP.CHARACTER}).filter(hit=>hit.entity?.alliance==='hostile'&&this.#combat.canDamage(actor,hit.entity));
    actor.updateBehavior(seconds,{player,targets,weapons:this.#weapons,abilities:this.#abilities,stationary:!!this.#policy.stationary?.(actor,context),world_minutes_delta:this.#policy.world_minutes_delta?.(seconds)??seconds/60,may_engage:this.#policy.may_engage??(()=>true),aura_interval:this.#policy.aura_interval?.(actor)});
   }else if(actor instanceof Ganger)actor.updateBehavior(seconds,{player,weapons:this.#weapons,random:this.#policy.random??Math.random,visibility:this.#policy.visibility?.(player)??player?.data.visibility??1,search_points:this.#policy.search_points?.(actor)??[]});
  }
 }
 #flushLifetimes(){for(const [id,retain] of this.#pendingLifetime){const actor=this.#actors.get(id);if(actor&&!actor.destroyed)this.#lifetime(actor,retain);}this.#pendingLifetime.clear();}
 afterPhysics(){this.#flushLifetimes();}
 hearNoise(position,{near_range=400,strength=1}={}){if(this.#context.engine?.paused)return 0;let heard=0;for(const hit of this.#context.api.physics.peruseNearbyEntities(position,{near_range,include_groups:BODY_GROUP.CHARACTER}))if(hit.entity instanceof Ganger&&hit.entity.hearNoise(position,{strength}))heard++;return heard;}
 reconnectGameplay(){for(const id of [...this.#actors.keys()])this.#untrack(id);for(const actor of this.#context.api.elements.getEntities())this.#track(actor);}
 levelEntered(){this.reconnectGameplay();}
 levelLeaving(){this.#flushLifetimes();for(const id of [...this.#actors.keys()])this.#untrack(id);}
}
