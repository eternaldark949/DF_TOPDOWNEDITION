import rules from '../../directory/game-combat-rules.json' with {type:'json'};
import {getCombatProfile} from '../../directory/combat-profiles.mjs';
import {BODY_GROUP} from '../../basement/physics/index.mjs';
import {sampleMeleeSwing,swingPhases} from './melee-poses.mjs';
import {isCombatDead} from './combat-system.mjs';
import {jsonCopy,nonnegative} from '../values.mjs';

const stateFor=(player,settings=rules)=>player.data.weapon_state??={format_version:1,elapsed:0,cooldown:0,holstered:false,drawn_at:null,draw_shot_used:false,quick_draw:null,punch_side:'right',haymaker:false,combo:0,last_punch_at:-99,swing:null,side:1,shield:{charge:settings.mirror.shield,spent:false,since_hit:999}};
/** One executable weapon policy. Native physics owns every trajectory, sweep, contact and impulse. */
export class weaponSystem{
 #items;#combat;#session;#player;#rules;#policy;#context=null;#pending=false;#lastAim={};#quickFiring=false;#unsubscribes=[];#controllers=new Map();#projectileEvents;#inputEvents;
 constructor({items,combat,session,get_player=()=>session?.player,rules:settings=rules,policy={},projectile_events=true,input_events=true}={}){if(!items||!combat)throw new TypeError('Weapons require item and combat services');this.#items=items;this.#combat=combat;this.#session=session;this.#player=get_player;this.#rules=jsonCopy(settings);this.#policy=policy;this.#projectileEvents=projectile_events;this.#inputEvents=input_events;}
 get state(){return this.#player()?.data.weapon_state??null;}
 get quick_draw(){return this.state?.quick_draw??null;}
 get cooldown_seconds(){return this.state?.cooldown??0;}
 get holstered(){return this.state?.holstered??false;}
 get active_swing(){return this.state?.swing??null;}
 get guarding(){const state=this.state;return !!state?.swing&&!state.holstered&&state.elapsed-state.swing.started<=state.swing.seconds;}
 attach(context){if(this.#context)throw new Error('Weapons already attached');this.#context=context;this.reconnectGameplay();
  if(this.#projectileEvents)this.#unsubscribes.push(context.api.physics.on('projectileHit',event=>this.#projectileHit(event)),context.api.physics.on('projectileRedirected',event=>{const data=event.projectile?.data;if(!data)return;data.source_id=event.owner_id;const owner=context.api.elements.fetchEntity(event.owner_id);data.source_alliance=owner?.alliance??owner?.data.alliance??null;if(data.pending_deflection){data.deflected=data.pending_deflection;delete data.pending_deflection;this.#emit('weapon:deflected',{projectile_id:event.projectile.entity_id,by:data.deflected});}}),context.api.physics.onProjectileContact(event=>this.#contactPolicy(event)));
  if(this.#session&&this.#inputEvents)this.#unsubscribes.push(this.#session.on('player:fire',event=>this.requestFire(event.aim??{})),this.#session.on('player:fire-released',event=>{if(this.quick_draw)this.requestQuickDraw(Object.keys(event.aim??{}).length?event.aim:this.#lastAim);}));
  if(this.#session)this.#unsubscribes.push(this.#session.on('player:controls-blocked',()=>this.gameplayPaused()));
  for(const event of ['items:equipped','items:unequipped','items:loaded'])this.#unsubscribes.push(this.#items.on(event,()=>{const s=this.state;if(s){s.swing=null;s.quick_draw=null;s.drawn_at=s.elapsed;s.draw_shot_used=false;}this.#pending=false;}));
 }
 detach(){for(const id of [...this.#controllers.keys()])this.unregisterActor(id);for(const off of this.#unsubscribes.splice(0))off();this.#context=null;this.#pending=false;}
 #emit(event,detail={}){this.#combat.emit(event,detail);}
 #stat(name,base){const value=this.#policy.stat?.(name,base)??base;return nonnegative(value,name);}
 #effect(effect){return this.#items.getEquippedAttachments().find(item=>item.effect===effect)?.stats??null;}
 #glass(){return !!this.#policy.mirror_glass?.();}
 #multiplier(){return this.#glass()?this.#rules.mirror.damage_multiplier:1;}
 #flit(player){return this.#policy.flit_active?.(player)??false;}
 #crit(stats={},forced=false){const roll=this.#policy.roll_crit?.(stats)??((this.#policy.random??Math.random)()<(stats.critChance??this.#rules.crit_chance)?stats.critMult??this.#rules.crit_multiplier:1);return forced?Math.max(roll,stats.critMult??this.#rules.crit_multiplier):roll;}
 #cooldown(stats,base){const ticks=Math.max(this.#rules.minimum_cooldown_ticks,Math.round(this.#stat('fireCooldown',stats.fireRate??base)*(this.#policy.fast_reload?.() ? .8 : 1)));return ticks/this.#rules.authoring_hz;}
 setHolstered(value){const state=this.state;if(!state)return false;const was=state.holstered;state.holstered=!!value;if(was&&!value){state.drawn_at=state.elapsed;state.draw_shot_used=false;}if(value)state.swing=null;return true;}
 setCooldown(seconds){nonnegative(seconds,'weapon cooldown');if(this.state)this.state.cooldown=seconds;}
 getSwingPose(){const state=this.state,s=state?.swing;return s?sampleMeleeSwing(state.elapsed-s.started,s.side,{},s.seconds,s.style):null;}
 armQuickDraw(){const player=this.#player(),weapon=this.#items.getEquippedWeapon();if(!player||isCombatDead(player)||this.#context.api.physics.getAttachmentState(player)||!weapon||!['normal','sniper'].includes(weapon.weaponMode)||this.#context.engine?.paused||this.#policy.can_fire?.()===false)return false;this.state.quick_draw={weapon_instance_id:weapon.instance_id,phase:'ready',remaining:0,aim:null};this.setHolstered(true);this.#pending=false;return true;}
 cancelQuickDraw(){if(!this.quick_draw)return false;this.state.quick_draw=null;this.setHolstered(true);this.#pending=false;return true;}
 interruptQuickDraw(){const q=this.quick_draw;if(!q)return false;q.phase='ready';q.remaining=0;q.aim=null;this.setHolstered(true);this.#pending=false;return true;}
 requestQuickDraw(aim={}){const q=this.quick_draw;if(!q||q.phase!=='ready'||this.cooldown_seconds>1e-9||this.#context.engine?.paused||this.#policy.can_fire?.()===false)return false;q.aim=jsonCopy(aim);q.phase='draw';q.remaining=this.#rules.quick_draw.draw_seconds;this.setHolstered(false);return true;}
 requestFire(aim={}){if(this.#context?.engine?.paused)return false;this.#lastAim=jsonCopy(aim);this.#pending=true;return true;}
 beforePhysics(context){this.advance(context.api.physics.config.fixed_step);if(this.#pending){this.#pending=false;this.fire(this.#lastAim);}for(const [id,entry] of this.#controllers){if(entry.actor.destroyed){this.unregisterActor(id);continue;}entry.controller.beforePhysics(context);}}
 advance(seconds){nonnegative(seconds,'weapon step');if(this.#context?.engine?.phase==='render')throw new Error('Rendering cannot advance weapons');if(this.#context?.engine?.paused)return;const player=this.#player();if(!player||!this.#context)return;const state=stateFor(player,this.#rules);state.elapsed+=seconds;state.cooldown=Math.max(0,state.cooldown-seconds);state.shield.since_hit+=seconds;
  if(this.#glass()&&(state.shield.spent||state.shield.since_hit>=this.#rules.mirror.regen_delay_seconds)){state.shield.charge=Math.min(this.#rules.mirror.shield,state.shield.charge+this.#rules.mirror.shield/this.#rules.mirror.recharge_seconds*seconds);if(state.shield.charge>=this.#rules.mirror.shield-1e-8){state.shield.charge=this.#rules.mirror.shield;state.shield.spent=false;}}
  const q=state.quick_draw;if(q){
   if(isCombatDead(player)||this.#items.equipped_weapon_id!==q.weapon_instance_id||this.#context.api.physics.getAttachmentState(player))this.cancelQuickDraw();
   else if(q.phase!=='ready'){
    if(q.aim?.target)player.lookAtTarget(q.aim.target);else if(q.aim?.angle!==undefined)player.setRotation(q.aim.angle,{preserve_velocity:true});else if(q.aim?.direction)player.lookInDirection(q.aim.direction);
    q.remaining-=seconds;if(q.remaining<=1e-9){if(q.phase==='draw'){
      this.#quickFiring=true;let fired;try{fired=this.fire(q.aim??{});}finally{this.#quickFiring=false;}
      if(fired){state.cooldown=Math.max(this.#rules.quick_draw.minimum_cooldown_seconds,state.cooldown+this.#rules.quick_draw.extra_cooldown_seconds);q.phase='shot';q.remaining=this.#rules.quick_draw.recover_seconds;}else this.interruptQuickDraw();
    }else this.interruptQuickDraw();}
   }
  }
  this.#updateSwing(player,state,seconds);
 }
 canExecute(){
  const actor=this.#player(),state=this.state,context=this.#context;
  return !!context&&context.engine?.running!==false&&context.engine?.active_level!==null&&(!state?.quick_draw||this.#quickFiring)&&!!actor&&!isCombatDead(actor)&&!actor.data.ability_action_state&&actor.active!==false&&actor.visible!==false&&state.cooldown<=1e-9&&!state.holstered&&!context.engine?.paused&&this.#policy.can_fire?.()!==false&&(!context.api.physics.getAttachmentState(actor)||context.api.physics.getMountedLaunchState(actor,{check_clearance:false}).allowed);
 }
 fire(aim={}){
  if(this.#context?.engine?.phase==='render')throw new Error('Rendering cannot fire weapons');
  const player=this.#player(),state=this.state,context=this.#context;
  if(!this.canExecute())return false;
  const weapon=this.#items.getEquippedWeapon(),stats=weapon?.stats??{},mode=weapon?.weaponMode??'none',flit=this.#flit(player);
  if(context.api.physics.getAttachmentState(player)&&['melee','none','fists'].includes(mode))return false;
  if(mode==='melee')return this.#startSwing(player,state,weapon,stats,flit);
  const punch=mode==='none'||mode==='fists',R=this.#rules,world=context.api.physics;
  let hay=false,damage,crit,nextCombo=state.combo,consumeDrawBonus=false;
  if(punch){
   if(state.elapsed-state.last_punch_at>R.knuckles.combo_reset_seconds)nextCombo=0;nextCombo++;
   hay=mode==='fists'&&(flit||nextCombo%(stats.haymakerEvery??R.knuckles.every)===0);if(hay)nextCombo=0;
   damage=this.#stat('punchDamage',stats.damage??R.bare_punch.damage)*this.#multiplier()*(hay?(stats.haymakerMult??R.knuckles.haymaker_multiplier):1);
   if(flit)damage*=this.#policy.flit_multiplier?.()??1;crit=this.#crit(stats);
  }else{
   damage=this.#stat('gunDamage',stats.damage??35)*this.#multiplier()*(this.#effect('blood_muzzle')?.gunDamageMult??1);
   if(flit)damage*=this.#policy.flit_multiplier?.()??1;
   if(!state.draw_shot_used&&state.drawn_at!==null&&state.elapsed-state.drawn_at<=(this.#policy.quick_draw_window?.()??0)){damage*=this.#policy.quick_draw_multiplier?.()??1;consumeDrawBonus=true;}
   crit=this.#crit(stats);
  }
  const spread=punch?0:this.#stat('spread',stats.spread??(weapon.definition_id==='pistol_anavia'?.22:0));
  if(mode==='fists')this.#stepIn(player,{blade_shape:{shape_type:'circle',radius:R.bare_punch.radius}});
  const projectile=world.createProjectileFrom(player,{template:'df:projectile',local_position:punch?R.bare_punch.local_position:getCombatProfile(weapon.definition_id).local_muzzle,...aim,
   angle_offset:spread?((this.#policy.random??Math.random)()-.5)*spread:0,
   speed:punch?R.bare_punch.speed:(stats.projectileSpeed??25)*R.authoring_hz,lifetime:punch?R.bare_punch.lifetime:(stats.projectileLife??60)/R.authoring_hz,
   collision_shape:{shape_type:'circle',radius:punch?R.bare_punch.radius:R.projectile.radius},
   collision_mask:BODY_GROUP.STATIC|BODY_GROUP.CHARACTER|BODY_GROUP.PROP|BODY_GROUP.VEHICLE,
   penetration_count:stats.penetrating?R.projectile.penetration_count:0,penetration_loss:stats.penetrating?R.projectile.penetration_loss:0,
   impact_strength:punch?(hay?R.knuckles.haymaker_impulse:R.knuckles.jab_impulse):R.projectile.impact_strength,
   data:{role:'projectile',weapon_instance_id:weapon?.instance_id??null,definition_id:weapon?.definition_id??null,source_id:player.entity_id,source_alliance:player.alliance??player.data.alliance??null,damage:Math.round(damage*crit),crit:crit>1,melee:punch,knuckles:mode==='fists',haymaker:hay,color:punch?'transparent':stats.projectileColor??'#00f3ff',penetrating:!!stats.penetrating,sticky:!!stats.sticky,dot_damage:Math.round((stats.dotDamage??5)*damage*crit/(stats.damage??35)),dot_interval:(stats.dotInterval??10)/R.authoring_hz,dot_ticks:stats.dotTicks??12,max_orbs:stats.maxOrbs??4}});
  if(!projectile)return false;
  if(consumeDrawBonus)state.draw_shot_used=true;
  if(punch){state.combo=nextCombo;state.last_punch_at=state.elapsed;state.haymaker=hay;state.punch_side=state.punch_side==='right'?'left':'right';}
  state.cooldown=punch&&mode==='none'?R.bare_punch.duration_ticks/R.authoring_hz:this.#cooldown(stats,punch?15:20);if(punch)state.punch_duration=state.cooldown;
  this.#emit('weapon:fired',{entity_id:player.entity_id,projectile_id:projectile.entity_id,definition_id:weapon?.definition_id??null,mode,haymaker:hay,crit:crit>1});this.#policy.on_fired?.(projectile);return projectile;
 }
 #stepIn(player,profile){const world=this.#context.api.physics;const hits=world.sweepAttachedShape(player,{collision_shape:profile.blade_shape,from_local_position:[20,0],to_local_position:[46,0],include_groups:BODY_GROUP.CHARACTER,line_of_sight:true});if(hits.some(hit=>this.#combat.canDamage(player,hit.entity)))world.advanceBody(player,{distance:this.#rules.blade.step_distance});}
 #startSwing(player,state,weapon,stats,flit){
  const profile=getCombatProfile(weapon.definition_id),edge=this.#effect('crimson_edge');state.side=-state.side;
  state.swing={weapon_instance_id:weapon.instance_id,definition_id:weapon.definition_id,started:state.elapsed,seconds:stats.swingSecs??this.#rules.blade.duration_seconds,side:state.side,style:profile.swing_style,next_sample:0,struck:[],damage:(stats.damage??25)*this.#multiplier()*(edge?.bladeDamageMult??1)*(flit?(this.#policy.flit_multiplier?.()??1):1),flit,bleed_max:edge?.bleedMax??this.#rules.bleed.max_stacks,stats:jsonCopy(stats)};
  this.#stepIn(player,profile);state.cooldown=this.#cooldown(stats,16);this.#emit('weapon:swing',{entity_id:player.entity_id,definition_id:weapon.definition_id,seconds:state.swing.seconds,side:state.side});return true;
 }
 #updateSwing(player,state,seconds){
  const swing=state.swing;if(!swing)return;
  if(isCombatDead(player)||state.holstered||this.#items.equipped_weapon_id!==swing.weapon_instance_id||this.#context.api.physics.getAttachmentState(player)){state.swing=null;return;}
  const ph=swingPhases(swing.style),age=state.elapsed-swing.started,progress=(age/swing.seconds-ph.windup)/(ph.cutEnd-ph.windup),samples=this.#rules.blade.samples,world=this.#context.api.physics,profile=getCombatProfile(swing.definition_id);
  for(;swing.next_sample<=samples&&swing.next_sample<=progress*samples+1e-9;swing.next_sample++){
   const k=swing.next_sample,sample=index=>sampleMeleeSwing((ph.windup+(ph.cutEnd-ph.windup)*index/samples)*swing.seconds,swing.side,{},swing.seconds,swing.style),from=sample(Math.max(0,k-1)),to=sample(k);
   const packet={collision_shape:profile.blade_shape,from_local_position:[from.handX,from.handY],to_local_position:[to.handX,to.handY],from_local_rotation:from.a,to_local_rotation:to.a,line_of_sight:true};
   if(this.#effect('mirror_blade'))for(const hit of world.sweepAttachedShape(player,{...packet,line_of_sight:false,include_groups:BODY_GROUP.PROJECTILE,predict_seconds:seconds}))this.#reflect(hit.entity,player,'blade',hit.fraction);
   for(const hit of world.sweepAttachedShape(player,{...packet,include_groups:BODY_GROUP.CHARACTER|BODY_GROUP.PROP})){
    const target=hit.entity;if(!this.#combat.canDamage(player,target)||swing.struck.includes(target.entity_id))continue;swing.struck.push(target.entity_id);
    const crit=this.#crit(swing.stats,swing.flit),damage=Math.round(swing.damage*crit);
    if(!this.#combat.damage(target,damage,{source_id:player.entity_id,type:swing.stats.damageType??'melee',crit:crit>1,bypass_invulnerability:true}))continue;
    world.applyImpulseBetween(player,target,{strength:this.#rules.blade.impact_strength,world_point:hit.world_point});player.heal?.(Math.max(1,Math.round(damage*this.#rules.blade.lifesteal)));
    if(swing.stats.bleedDps)this.#combat.applyBleed(target,{dps:swing.stats.bleedDps*this.#multiplier(),seconds:swing.stats.bleedSecs??3,max_stacks:swing.bleed_max,source_id:player.entity_id});
   }
  }
  if(age>swing.seconds)state.swing=null;
 }
 #contactPolicy(event){const child=this.#controllers.get(event.target_entity?.entity_id)?.controller;return child?child.#applyContactPolicy(event):this.#applyContactPolicy(event);}
 #applyContactPolicy({projectile,target_entity}){
  if(!projectile)return null;const player=this.#player(),data=projectile.data,source=this.#context.api.elements.fetchEntity(data.source_id);
  if(target_entity&&!this.#combat.canDamage(source,target_entity,{source_alliance:data.source_alliance})&&target_entity.collision_group&BODY_GROUP.CHARACTER)return {action:'ignore'};
  if(target_entity===player&&source!==player&&this.#glass()&&!this.state.shield.spent){
   const shield=this.state.shield;shield.charge=Math.max(0,shield.charge-(data.damage??0));shield.spent=shield.charge<=0;shield.since_hit=0;
   data.source_id=player.entity_id;data.source_alliance=player.alliance??player.data.alliance??null;data.deflected='glass';this.#emit('weapon:deflected',{projectile_id:projectile.entity_id,by:'glass'});
   return {action:'redirect',...(source&&!isCombatDead(source)?{target:source}:{}),owner_id:player.entity_id,min_lifetime:this.#rules.mirror.minimum_projectile_lifetime};
  }if(data.penetrating&&target_entity?.data.role==='door')return {action:'hit',penetration_loss:.5};return null;
 }
 #reflect(projectile,player,by,fraction){
  if(!projectile||projectile.destroyed||projectile.data.source_id===player.entity_id)return false;
  const source=this.#context.api.elements.fetchEntity(projectile.data.source_id);if(source&&!this.#combat.canDamage(source,player))return false;
  projectile.redirectProjectile(undefined,{...(source&&!isCombatDead(source)?{target:source}:{reverse:true}),owner_id:player.entity_id,at_fraction:fraction,min_lifetime:this.#rules.mirror.minimum_projectile_lifetime});projectile.data.pending_deflection=by;
  return true;
 }
 #projectileHit(event){const child=this.#controllers.get(event.projectile?.data.source_id)?.controller;return child?child.#applyProjectileHit(event):this.#applyProjectileHit(event);}
 #applyProjectileHit(event){
  if(event.sensor_only)return;const data=event.projectile?.data,target=event.target_entity;if(!data||!target||!Number.isFinite(data.damage))return;
  const source=this.#context.api.elements.fetchEntity(data.source_id);if(!this.#combat.canDamage(source,target,{source_alliance:data.source_alliance}))return;
  const damage=Math.round(data.damage*event.impact_scale);if(!this.#combat.damage(target,damage,{source_id:data.source_id,type:data.damage_type??(data.melee?'melee':'ballistic'),crit:data.crit,bypass_invulnerability:!!data.melee,...(data.ability_id?{ability_id:data.ability_id}:{})}))return;
  if(data.sticky)this.#combat.attachOrb(target,{damage:data.dot_damage,interval_seconds:data.dot_interval,ticks:data.dot_ticks,max_orbs:data.max_orbs,source_id:data.source_id});
  if(data.knuckles&&data.haymaker)this.#combat.haymaker(target,{damage,source_id:data.source_id});
  if(data.melee&&source===this.#player()){
   const vamp=this.#effect('vampiric_fists');if(vamp){source.heal?.(Math.max(1,Math.round(damage*(data.haymaker?vamp.haymakerLifesteal:vamp.lifesteal))));if(data.haymaker)this.#combat.applyBleed(target,{dps:vamp.bleedDps*this.#multiplier(),seconds:vamp.bleedSecs,source_id:data.source_id});}
  }
 }
 registerActor(actor,{items=actor.items,policy={}}={}){
  if(!this.#projectileEvents)throw new Error('Register actors through the world weapon service');if(actor===this.#player())throw new Error('The controlled player already has a weapon controller');
  if(!this.#context||!actor||actor.destroyed||actor.physics_system!==this.#context.api.physics)throw new TypeError('Register an actor in this weapon world');
  if(this.#controllers.has(actor.entity_id))throw new Error('Actor already has a weapon controller');
  const controller=new weaponSystem({items,combat:this.#combat,get_player:()=>actor,rules:this.#rules,policy:{random:this.#policy.random,...policy},projectile_events:false});controller.attach(this.#context);this.#controllers.set(actor.entity_id,{actor,controller});return controller;
 }
 unregisterActor(id){const entry=this.#controllers.get(id);if(!entry)return false;entry.controller.detach();this.#controllers.delete(id);return true;}
 getActorController(actor){return this.#controllers.get(typeof actor==='number'?actor:actor.entity_id)?.controller??null;}
 requestActorFire(actor,aim={}){const controller=this.getActorController(actor);if(!controller)return false;return controller.requestFire(aim);}
 reconnectGameplay(){
  const player=this.#player();if(player){const state=stateFor(player,this.#rules);jsonCopy(state);if(state.format_version!==1)throw new TypeError('Unsupported weapon state');
   for(const key of ['elapsed','cooldown','combo'])nonnegative(state[key],key);nonnegative(state.shield.charge,'shield charge');nonnegative(state.shield.since_hit,'shield timer');
   if(state.quick_draw){if(!['ready','draw','shot'].includes(state.quick_draw.phase))throw new TypeError('Invalid quick draw phase');nonnegative(state.quick_draw.remaining,'quick draw timer');}
   if(state.swing){nonnegative(state.swing.started,'swing start');nonnegative(state.swing.seconds,'swing duration');if(!state.swing.seconds||!Array.isArray(state.swing.struck)||!Number.isSafeInteger(state.swing.next_sample)||state.swing.next_sample<0)throw new TypeError('Invalid swing state');}
  }this.#pending=false;
 }
 gameplayPaused(){this.#pending=false;this.interruptQuickDraw();for(const entry of this.#controllers.values())entry.controller.gameplayPaused();}
 levelLeaving(){for(const entry of this.#controllers.values())entry.controller.levelLeaving();this.#pending=false;if(this.state){this.state.swing=null;this.cancelQuickDraw();}}
}
