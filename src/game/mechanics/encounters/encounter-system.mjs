import {BossEffect} from '../../entities/boss-effect.mjs';
import {BODY_GROUP} from '../../../engine/basement/physics/index.mjs';
import { jsonCopy } from '../../../engine/directory/index.mjs';
/** Shared encounter policy over registered effects, native queries and one simulation clock. */
export class encounterSystem{
 #context=null;#combat;#random;#actors=null;#effects=new Map();#owners=new Map();#off=[];#wardens=new Map();#orders=new Map();#squads=new Map();#decoys=new Map();
 constructor({combat,random=Math.random}={}){this.#combat=combat;this.#random=random;}
 setActors(actors){this.#actors=actors;}
 attach(context){this.#context=context;this.#off.push(context.api.physics.on('entityRegistered',({entity})=>this.#track(entity)),context.api.physics.on('entityRemoved',({entity})=>{this.clearOwner(entity.entity_id);this.#drop(entity.entity_id);this.untrackActor(entity);}));this.reconnectGameplay();}
 detach(){this.levelLeaving();for(const off of this.#off.splice(0))off();this.#context=null;}
 #writable(){if(this.#context?.engine?.phase==='render')throw new Error('Rendering cannot change encounters');}
 #rules(){return this.#context.api.physics.elements.asset_library.getResource('df:actor_rules').data.bosses;}
 #track(entity){if(!(entity instanceof BossEffect)||entity.destroyed||this.#effects.has(entity.entity_id))return;entity.validateEffect();this.#effects.set(entity.entity_id,entity);let ids=this.#owners.get(entity.data.owner_id);if(!ids)this.#owners.set(entity.data.owner_id,ids=new Set());ids.add(entity.entity_id);}
 #drop(id){const effect=this.#effects.get(id);if(!effect)return;this.#owners.get(effect.data.owner_id)?.delete(id);this.#effects.delete(id);if(!this.#owners.get(effect.data.owner_id)?.size)this.#owners.delete(effect.data.owner_id);}
 addEffect(owner,kind,position,extra={}){
  this.#writable();if(!owner||owner.destroyed||owner.physics_system!==this.#context.api.physics)throw new TypeError('Use an official live effect owner');const H=this.#rules().hazards;
  const specs={sigil:{radius:H.SIGIL_R,duration:H.SIGIL_ARM,damage:H.SIGIL_HIT},fire:{radius:H.SIGIL_R*.8,duration:H.FIRE_SECS,burn_dps:8},smoke:{radius:H.CENSER_SMOKE_R,duration:H.CENSER_SMOKE_SECS},censer:{radius:H.CENSER_FIRE_R,duration:H.CENSER_FLIGHT,damage:H.CENSER_HIT},hymn:{radius:0,radius_to:H.HYMN_RANGE,duration:H.HYMN_SECS,damage:H.HYMN_HIT},rite:{radius:this.#rules().duel.RITE_R0,radius_to:this.#rules().duel.RITE_R1,duration:H.RITE_SECS,burn_dps:H.RITE_DPS}};
  if(!specs[kind])throw new TypeError('Unknown encounter effect');const data={format_version:1,role:'boss_effect',kind,owner_id:owner.entity_id,owner_alliance:owner.alliance,age:0,next_tick:0,hit_ids:[],radius:0,radius_to:0,damage:0,burn_dps:0,...specs[kind],...jsonCopy(extra)};
  const effect=this.#context.createEntity({template:'df:boss_effect',position,collision_shape:{shape_type:'circle',radius:Math.max(1,data.radius,data.radius_to)},render_shape:{shape_type:'circle',radius:Math.max(1,data.radius,data.radius_to)},data});try{this.#track(effect);return effect;}catch(error){effect.destroy();throw error;}
 }
 getEffects(){return [...this.#effects.values()];}
 clearOwner(owner){const id=typeof owner==='number'?owner:owner.entity_id;for(const effectId of [...(this.#owners.get(id)??[])]){const effect=this.#effects.get(effectId);this.#drop(effectId);if(effect&&!effect.destroyed)effect.destroy();}}
 smokeBlocks(source,target){const world=this.#context.api.physics,to=Array.isArray(target)?target:target.position;return world.shapeCast({from:source.position,to,collision_shape:{shape_type:'circle',radius:.001},include_groups:BODY_GROUP.SENSOR,include_ghosts:true,ignore_body:source}).some(hit=>hit.entity instanceof BossEffect&&hit.entity.data.kind==='smoke'&&hit.entity.data.age<hit.entity.data.duration);}
 #eligible(owner,target){return target&&!target.destroyed&&!target.dead&&!(target.data.player_state?.flit_remaining>0)&&!this.#context.api.physics.getAttachmentState(target)&&this.#combat.canDamage(owner,target);}
 #burn(owner,target,dps,seconds){this.#combat.attachOrb(target,{damage:dps*.5,interval_seconds:.5,ticks:Math.ceil(seconds/.5),max_orbs:1,source_id:owner.entity_id,extinguish_on_flit:true});}
 executePattern(actor,definition,state){
  this.#writable();const world=this.#context.api.physics,target=state.aim.target===undefined?null:Array.isArray(state.aim.target)?state.aim.target:world.elements.fetchEntity(state.aim.target),point=Array.isArray(target)?target:target?.position??world.getBodyPoint(actor,[definition.range,0]).position,D=this.#rules().duel;
  switch(definition.effect){
   case 'fan':for(let i=0;i<definition.count;i++)world.createProjectileFrom(actor,{template:'df:projectile',local_position:[16,0],angle:state.heading,angle_offset:(i-(definition.count-1)/2)*definition.spread,speed:definition.speed,lifetime:definition.lifetime,collision_shape:{shape_type:'circle',radius:definition.radius},collision_mask:BODY_GROUP.STATIC|BODY_GROUP.PROP|BODY_GROUP.VEHICLE|BODY_GROUP.CHARACTER,data:{role:'projectile',source_id:actor.entity_id,source_alliance:actor.alliance,damage:definition.damage,damage_type:'energy',color:'#ff5a1a',ability_id:state.ability_id}});break;
   case 'whip':case 'gale':{
    const cone=definition.effect==='gale';for(const hit of world.sweepAttachedShape(actor,{collision_shape:{shape_type:'circle',radius:definition.range},include_groups:BODY_GROUP.CHARACTER,line_of_sight:true})){const victim=hit.entity;if(!this.#eligible(actor,victim))continue;const view=world.observeTarget(actor,victim,{near_range:definition.range});if(!view.in_range||cone&&!world.observeTarget(actor,victim,{fov:definition.half_angle*2}).in_cone)continue;if(this.#combat.damage(victim,definition.damage,{source_id:actor.entity_id,type:'melee',ability_id:state.ability_id})){if(cone&&!victim.destroyed){world.applyImpulseBetween(actor,victim,{strength:definition.impact_strength,if_supported:true});this.#combat.breakGuard(victim,definition.guard_seconds);victim.suspendMovement?.(.2);}if(actor.data.demoness_state)actor.data.demoness_state.last_strike={at:actor.data.weapon_state.elapsed,position:[...victim.position]};actor.emitActor('boss:struck',{ability_id:state.ability_id,target_id:victim.entity_id});}}
    break;
   }
   case 'step':if(state.planned_position&&world.isPlacementClear(actor,state.planned_position,{ignore_body:actor,include_ghosts:false})&&actor.teleportTo(state.planned_position,{min_distance:1})){actor.emitActor('hunter:dashed',{position:actor.position});if(target&&!Array.isArray(target)&&!target.destroyed){actor.lookAtTarget(target);for(const hit of world.sweepAttachedShape(actor,{collision_shape:{shape_type:'circle',radius:definition.hit_range},include_groups:BODY_GROUP.CHARACTER,line_of_sight:true})){if(hit.entity===target&&this.#eligible(actor,target))this.#combat.damage(target,definition.damage,{source_id:actor.entity_id,type:'melee'});}}}break;
   case 'sigils':{const count=actor.data.solo?D.SIGILS[actor.data.demoness_state?.phase??1]:definition.count;for(let i=0;i<count;i++){const spot=i?world.findWanderPlacement(actor,{origin:point,near_range:definition.spread,inner_range:definition.spread*.6,angle_sample:i/count,radius_sample:.5,include_ghosts:false}):{position:point};if(spot)this.addEffect(actor,'sigil',spot.position);}break;}
   case 'rite':this.addEffect(actor,'rite',point);break;
   case 'censer':this.addEffect(actor,'censer',point,{from_position:[...actor.position]});break;
   case 'hymn':this.addEffect(actor,'hymn',actor.position);break;
   case 'mirror':{
    if(!this.#actors)throw new Error('Mirror requires the registered actor factory');const spots=[[-Math.PI/2],[Math.PI/2]].map(angle_offsets=>world.findRelativePlacement(actor,actor,{distance:definition.distance,angle_offsets})).filter(Boolean);if(!spots.length)break;
    const places=[[...actor.position],...spots.map(spot=>spot.position)];for(let i=places.length-1;i>0;i--){const j=Math.floor(this.#random()*(i+1));[places[i],places[j]]=[places[j],places[i]];}const chosen=places.shift();if(!actor.teleportTo(chosen))break;
    for(const position of places)this.#actors.spawn({kind:'demoness',position,rotation:actor.rotation,data:{decoy:true,mirror_owner_id:actor.entity_id,decoy_remaining:definition.lifetime,ganger_state:{...jsonCopy(actor.ganger_state),origin:position},actor_loadout_initialized:true}});
    actor.emitActor('demoness:mirror');break;
   }
  }
 }
 beforePhysics(context,seconds=context.api.physics.config.fixed_step){
  if(context.engine?.paused)return;this.#writable();this.#updateOrders();
  const world=context.api.physics,H=this.#rules().hazards;
  for(const effect of [...this.#effects.values()]){
   if(effect.destroyed){this.#drop(effect.entity_id);continue;}const d=effect.data,owner=world.elements.fetchEntity(d.owner_id);if(!owner||owner.dead){this.clearOwner(d.owner_id);continue;}const previous=d.age;d.age=Math.min(d.duration,d.age+seconds);let hits=[];
   if(d.kind==='hymn')hits=world.queryRadialRegion(effect,{radius:0,radius_to:d.radius_to,progress:d.age/d.duration,previous_progress:previous/d.duration,thickness:22}).hits;
   else if(d.kind==='rite'&&d.age>H.RITE_WARN)hits=world.queryRadialRegion(effect,{radius:d.radius,radius_to:d.radius_to,progress:Math.min(1,(d.age-H.RITE_WARN)/(d.duration-H.RITE_WARN)),outside:true,limit_radius:this.#rules().rite_limit_radius}).hits;
   else if(d.kind==='fire'||['sigil','censer'].includes(d.kind)&&d.age>=d.duration)hits=world.queryRadialRegion(effect,{radius:d.radius}).hits;
   const periodic=d.kind==='fire'||d.kind==='rite';
   if(!periodic||d.age>=d.next_tick){if(periodic)d.next_tick=d.age+.5;for(const hit of hits){const victim=hit.entity;if(!this.#eligible(owner,victim)||!periodic&&d.hit_ids.includes(victim.entity_id))continue;if(periodic)this.#burn(owner,victim,d.burn_dps,d.kind==='rite'?.8:1.2);else if(this.#combat.damage(victim,d.damage,{source_id:owner.entity_id,type:'energy'})){d.hit_ids.push(victim.entity_id);if(victim.destroyed)continue;if(d.kind==='sigil')this.#burn(owner,victim,6,2);if(d.kind==='hymn')this.#combat.reveal(victim,H.REVEAL_SECS);}}}
   if(d.age>=d.duration){if(d.kind==='sigil')this.addEffect(owner,'fire',effect.position);if(d.kind==='censer'){this.addEffect(owner,'fire',effect.position,{radius:H.CENSER_FIRE_R,duration:H.CENSER_FIRE_SECS,burn_dps:9});this.addEffect(owner,'smoke',effect.position);}this.#drop(effect.entity_id);effect.destroy();}
  }
 }
 trackActor(actor){if(actor.data.mirror_owner_id){let decoys=this.#decoys.get(actor.data.mirror_owner_id);if(!decoys)this.#decoys.set(actor.data.mirror_owner_id,decoys=new Map());decoys.set(actor.entity_id,actor);}if(!actor.data.persona||!['df_vesper','df_matins','df_compline','df_warden'].includes(actor.entity_type))return;this.#wardens.set(actor.entity_id,actor);let group=this.#squads.get(actor.data.squad_id);if(!group)this.#squads.set(actor.data.squad_id,group=new Map());group.set(actor.entity_id,actor);}
 untrackActor(actor){const decoys=this.#decoys.get(actor.data.mirror_owner_id);decoys?.delete(actor.entity_id);if(decoys&&!decoys.size)this.#decoys.delete(actor.data.mirror_owner_id);this.#wardens.delete(actor.entity_id);this.#orders.delete(actor.entity_id);const squad=this.#squads.get(actor.data.squad_id);squad?.delete(actor.entity_id);if(squad&&!squad.size)this.#squads.delete(actor.data.squad_id);}
 actorDefeated(actor){this.clearOwner(actor.entity_id);if(actor.data.decoy)return;if(this.#wardens.has(actor.entity_id)){for(const other of this.#squads.get(actor.data.squad_id)?.values()??[])if(other!==actor&&!other.dead)other.enrage();}if(actor.entity_type==='df_demoness')for(const decoy of this.#decoys.get(actor.entity_id)?.values()??[])if(!decoy.destroyed)decoy.die();}
 #updateOrders(){
  const world=this.#context.api.physics,W=this.#rules().warden;this.#orders.clear();
  for(const squad of this.#squads.values()){
   let flanker=null,hiddenFor=Infinity,notReloading=0;const living=[];
   for(const actor of squad.values())if(!actor.destroyed&&!actor.dead&&!actor.dormant){living.push(actor);const state=actor.warden_state,target=world.elements.fetchEntity(state.target_id);if(!target||target.dead||target.visible===false)continue;const view=world.observeTarget(actor,target,{near_range:900}),revealed=(target.data.combat_state?.revealed_remaining??0)>0,sight=view.line_clear&&!this.smokeBlocks(actor,target);if(sight||revealed){state.seen_position=[...target.position];state.hidden_seconds=0;}else state.hidden_seconds+=world.config.fixed_step;if(state.seen_position)hiddenFor=Math.min(hiddenFor,state.hidden_seconds);if(actor.data.ability_action_state?.phase!=='reload')notReloading++;this.#orders.set(actor.entity_id,{sight,revealed,cover:!sight&&!!state.seen_position&&(revealed||actor.data.ability_action_state?.phase==='burst'&&state.hidden_seconds<W.COVER_FIRE),aim:sight||revealed?target.entity_id:state.seen_position,flank:false,extend:false});}
   for(const actor of living){const order=this.#orders.get(actor.entity_id);if(!order)continue;const state=actor.warden_state;if(state.seen_position&&hiddenFor>=W.FLANK_AFTER){if(flanker===null)flanker=actor.entity_id;order.flank=flanker===actor.entity_id;}order.extend=living.length>1&&notReloading-Number(actor.data.ability_action_state?.phase!=='reload')===0;}
  }
 }
 getWardenOrders(actor){return this.#orders.get(actor.entity_id)??null;}
 getBurstPolicy(actor){if(!this.#wardens.has(actor.entity_id))return null;const order=this.getWardenOrders(actor);return {blocked:!order||!(order.sight||order.cover||order.revealed),aim:order?.aim===null?undefined:{target:order?.aim},bypass_sight:!!(order?.cover||order?.revealed),extend:!!order?.extend,extend_by:this.#rules().warden.EXTEND};}
 reconnectGameplay(){this.#effects.clear();this.#owners.clear();if(this.#context)for(const entity of this.#context.api.elements.getEntities())this.#track(entity);this.#orders.clear();}
 levelEntered(){this.reconnectGameplay();}
 levelLeaving(){for(const effect of [...this.#effects.values()]){this.#drop(effect.entity_id);if(!effect.destroyed)effect.destroy();}this.#wardens.clear();this.#squads.clear();this.#decoys.clear();this.#orders.clear();}
}
