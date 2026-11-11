import {Demoness} from '../../entities/demoness.mjs';
import {Warden} from '../../entities/warden.mjs';
import {Drone} from '../../entities/drone.mjs';
import {VelvetCat} from '../../entities/velvet-cat.mjs';
import {GatlingGunner} from '../../entities/gatling-gunner.mjs';
import {Marionette} from '../../entities/marionette.mjs';
import {gameActor} from '../../entities/game-actor.mjs';
import {NPC} from '../../entities/npc.mjs';
import {Hunter} from '../../entities/hunter.mjs';
import {Ganger} from '../../entities/ganger.mjs';
import {BODY_GROUP} from '../../basement/physics/index.mjs';
import {createActorPacket} from '../../directory/game-actor-factory.mjs';

/** Registered actor lifetimes and policy updates in the existing fixed step. No second world or index. */
export class actorSystem{
 #context=null;#actors=new Map();#attacks;#abilities;#encounters;#combat;#player;#session;#policy;#off=[];#pendingLifetime=new Map();#squads=new Map();
 constructor({attacks,abilities,encounters,combat,session,get_player=()=>session?.player,policy={}}={}){this.#attacks=attacks;this.#abilities=abilities;this.#encounters=encounters;this.#combat=combat;this.#player=get_player;this.#session=session;this.#policy=policy;}
 attach(context){if(this.#context)throw new Error('Actors already attached');this.#context=context;this.#off.push(context.api.physics.on('contactBegin',event=>{if(event.sensor_only)return;for(const [actor,other] of [[event.entity_a,event.entity_b],[event.entity_b,event.entity_a]])if(actor instanceof VelvetCat&&(other?.collision_group&BODY_GROUP.VEHICLE))actor.onVehicleImpact(event.relative_speed);}),context.api.physics.on('entityRegistered',event=>this.#track(event.entity)),context.api.physics.on('entityRemoved',event=>this.#untrack(event.entity.entity_id)));this.reconnectGameplay();}
 detach(){for(const off of this.#off.splice(0))off();for(const id of [...this.#actors.keys()])this.#untrack(id);this.#context=null;}
 #lifetime(actor,retain){if(this.#context.engine?.phase==='physics'){this.#pendingLifetime.set(actor.entity_id,retain);return;}this.#context.engine?.[retain?'retainEntity':'releaseEntity']?.(actor);}
 #event(event,detail){const actor=this.#actors.get(detail.entity_id);if(event==='actor:defeated'&&actor)this.#encounters?.actorDefeated(actor);if(['npc:hired','cat:adopted'].includes(event)&&actor)this.#lifetime(actor,true);if(['actor:defeated','actor:revived'].includes(event)&&actor instanceof GatlingGunner){const squad=this.#squads.get(actor.data.squad_id);if(squad){squad.alive.set(actor.entity_id,!actor.dead);squad.dirty=true;}}if(['npc:released','cat:released'].includes(event)&&actor)this.#lifetime(actor,false);if(event==='actor:cooldown-requested'&&actor){this.#attacks.getController(actor)?.setCooldown(detail.seconds);delete actor.data.weapon_cooldown_seconds;}this.#session?.emit(event,detail);this.#policy.on_event?.(event,detail);if(event==='actor:inventory-loaded'){const actor=this.#actors.get(detail.entity_id);if(actor)this.#attacks.reconnectActor(actor);}}
 #track(actor){if(!(actor instanceof gameActor)||actor.entity_type==='df_player'||actor.destroyed||this.#actors.get(actor.entity_id)===actor)return;
  actor.connectActor({emit:(event,detail)=>this.#event(event,detail)});
  if(actor instanceof NPC)actor.validateNPC();if(actor instanceof Demoness)actor.validateDemoness();else if(actor instanceof Hunter)actor.validateHunter();else if(actor instanceof Ganger)actor.validateGanger();
  if(actor instanceof NPC||actor instanceof Ganger||actor instanceof GatlingGunner){
   if(actor.data.actor_loadout_initialized!==true){if(!actor.data.inventory?.order.length&&actor.data.weapon_definition_id){const item=actor.items.grantItem(actor.data.weapon_definition_id);actor.items.equipItem(item.instance_id);}actor.data.actor_loadout_initialized=true;}
  }
  if(actor instanceof Marionette)actor.validateMarionette();
  if(actor instanceof Drone)actor.validateDrone();if(actor instanceof VelvetCat)actor.validateCat();
  if(actor instanceof GatlingGunner)actor.validateGunner();
  this.#attacks.registerActor(actor);
  if(actor.data.weapon_cooldown_seconds!==undefined){this.#attacks.getController(actor)?.setCooldown(actor.data.weapon_cooldown_seconds);delete actor.data.weapon_cooldown_seconds;}
  this.#actors.set(actor.entity_id,actor);this.#encounters?.trackActor(actor);if(actor instanceof GatlingGunner)this.#joinSquad(actor);
  if(actor instanceof NPC&&actor.recruited||actor instanceof VelvetCat&&actor.adopted)this.#lifetime(actor,true);
 }
 #untrack(id){const actor=this.#actors.get(id);if(!actor)return;this.#encounters?.untrackActor(actor);if(actor instanceof GatlingGunner)this.#leaveSquad(actor);this.#attacks.unregisterActor(id);if(!actor.destroyed)actor.cancelMovement();actor.disconnectActor();this.#actors.delete(id);this.#pendingLifetime.delete(id);}
 #joinSquad(actor){let squad=this.#squads.get(actor.data.squad_id);if(!squad){squad={members:new Map(),alive:new Map(),slots:new Map(),dirty:true};this.#squads.set(actor.data.squad_id,squad);}squad.members.set(actor.entity_id,actor);squad.alive.set(actor.entity_id,!actor.dead);squad.dirty=true;}
 #leaveSquad(actor){const squad=this.#squads.get(actor.data.squad_id);if(!squad)return;squad.members.delete(actor.entity_id);squad.alive.delete(actor.entity_id);squad.dirty=true;if(!squad.members.size)this.#squads.delete(actor.data.squad_id);}
 setSquad(actor,{squad_id,formation_order=actor.data.formation_order}={}){if(!(actor instanceof GatlingGunner)||this.#actors.get(actor.entity_id)!==actor||typeof squad_id!=='string'||!squad_id||!Number.isFinite(formation_order))throw new TypeError('Use a registered gunner and valid squad');if(this.#context.engine?.phase==='render')throw new Error('Rendering cannot change squads');this.#encounters?.untrackActor(actor);this.#leaveSquad(actor);Object.assign(actor.data,{squad_id,formation_order});this.#joinSquad(actor);this.#encounters?.trackActor(actor);}
 #formation(actor){const squad=this.#squads.get(actor.data.squad_id);if(squad.dirty){const order=[...squad.members.values()].filter(member=>!member.dead).sort((a,b)=>a.data.formation_order-b.data.formation_order||a.entity_id-b.entity_id);squad.slots=new Map(order.map((member,index)=>[member.entity_id,{index,count:order.length}]));squad.dirty=false;}return squad.slots.get(actor.entity_id)??{index:0,count:1};}
 getActors(){return [...this.#actors.values()];}
 spawn(packet={},options={}){if(!this.#context)throw new Error('Actor system is detached');const actor=this.#context.createEntity(createActorPacket(this.#context.api.physics,packet),options);try{this.#track(actor);return actor;}catch(error){this.#attacks.unregisterActor(actor.entity_id);actor.disconnectActor();this.#context.engine?.releaseEntity?.(actor);actor.destroy();throw error;}}
 beforePhysics(context,seconds=context.api.physics.config.fixed_step){
  if(context.engine?.phase==='render')throw new Error('Rendering cannot advance actors');if(context.engine?.paused)return;
  this.#flushLifetimes();
  const player=this.#player(),world=context.api.physics;
  for(const actor of this.#actors.values()){
   if(actor.destroyed){this.#untrack(actor.entity_id);continue;}actor.advanceActor(seconds);
   if(actor instanceof GatlingGunner){const squad=this.#squads.get(actor.data.squad_id),alive=!actor.dead;if(squad&&squad.alive.get(actor.entity_id)!==alive){squad.alive.set(actor.entity_id,alive);squad.dirty=true;}}
   if(actor.dead||!actor.active)continue;
   if(actor instanceof NPC){const targets=world.peruseNearbyEntities(actor,{near_range:this.#attacks.getSelectedAttack(actor).range,include_groups:BODY_GROUP.CHARACTER}).filter(hit=>hit.entity?.alliance==='hostile'&&this.#combat.canDamage(actor,hit.entity));
    actor.updateBehavior(seconds,{player,targets,attacks:this.#attacks,stationary:!!this.#policy.stationary?.(actor,context),world_minutes_delta:this.#policy.world_minutes_delta?.(seconds)??seconds/60,may_engage:this.#policy.may_engage??(()=>true),aura_interval:this.#policy.aura_interval?.(actor)});
   }else if(actor instanceof Demoness)actor.updateBehavior(seconds,{player,attacks:this.#attacks,abilities:this.#abilities,encounters:this.#encounters,random:this.#policy.random??Math.random,visibility:this.#policy.visibility?.(player)??1});
   else if(actor instanceof Warden)actor.updateBehavior(seconds,{player,attacks:this.#attacks,abilities:this.#abilities,encounters:this.#encounters,formation:this.#formation(actor)});
   else if(actor instanceof Drone||actor instanceof VelvetCat)actor.updateBehavior(seconds,{player,attacks:this.#attacks,abilities:this.#abilities,random:this.#policy.random??Math.random});
   else if(actor instanceof GatlingGunner)actor.updateBehavior(seconds,{player,attacks:this.#attacks,formation:this.#formation(actor)});
   else if(actor instanceof Ganger||actor instanceof Marionette)actor.updateBehavior(seconds,{player,attacks:this.#attacks,random:this.#policy.random??Math.random,visibility:this.#policy.visibility?.(player)??player?.data.visibility??1,search_points:this.#policy.search_points?.(actor)??[]});
  }
 }
 #flushLifetimes(){for(const [id,retain] of this.#pendingLifetime){const actor=this.#actors.get(id);if(actor&&!actor.destroyed)this.#lifetime(actor,retain);}this.#pendingLifetime.clear();}
 afterPhysics(context,seconds=context.api.physics.config.fixed_step){this.#flushLifetimes();for(const actor of this.#actors.values())if(actor instanceof VelvetCat)actor.advanceAnimation(seconds,this.#player());}
 hearNoise(position,{near_range=400,strength=1}={}){if(this.#context.engine?.paused)return 0;let heard=0;for(const hit of this.#context.api.physics.peruseNearbyEntities(position,{near_range,include_groups:BODY_GROUP.CHARACTER}))if(hit.entity instanceof Ganger&&hit.entity.hearNoise(position,{strength}))heard++;return heard;}
 reconnectGameplay(){for(const id of [...this.#actors.keys()])this.#untrack(id);for(const actor of this.#context.api.elements.getEntities())this.#track(actor);}
 levelEntered(){this.reconnectGameplay();}
 levelLeaving(){this.#flushLifetimes();for(const id of [...this.#actors.keys()])this.#untrack(id);}
}
