import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameRuntime} from '../src/directory/game-runtime.mjs';
import {createGameVehicle} from '../src/directory/game-vehicle-factory.mjs';
import {gameLevel} from '../src/runtime/game-level.mjs';
import {Drone} from '../src/entities/drone.mjs';
import {VelvetCat} from '../src/entities/velvet-cat.mjs';
import {dronePresentation} from '../src/presentation/drone.mjs';
import {velvetPresentation} from '../src/presentation/velvet-cat.mjs';
class Room extends gameLevel{}
async function setup(){const engine=createGameRuntime({schedule_frame:null,player:{template:'df:player_949',entity_type:'df_player',position:[500,500]}});engine.registerLevel('a',Room).registerLevel('b',Room);await engine.loadLevel('a');engine.start();const api=engine.api;api.session.player.maxHp=10000;api.session.player.hp=10000;return {engine,api,player:api.session.player,tick:(n=1)=>{for(let i=0;i<n;i++)engine.updateState();}};}
function drone(api,kind='lancer',position=[740,500]){return api.actors.spawn({kind:'drone',position,rotation:Math.PI,data:{drone_kind:kind}});}
function ground(actor){Object.assign(actor.drone_state,{flight:'hover',alt:0});actor.updateBody({ghost:false});actor.updateBehavior=()=>{};}
test('both concrete types register one real body and survive constructor-free restoration',async()=>{
 const {engine,api,tick}=await setup(),d=drone(api),cat=api.actors.spawn({kind:'velvet_cat',position:[300,500]});tick(2);const ids=[d.entity_id,cat.entity_id],snapshot=api.physics.savePhysicsState();api.physics.loadPhysicsState(snapshot);api.weapons.reconnectGameplay();api.actors.reconnectGameplay();assert.ok(api.elements.fetchEntity(ids[0]) instanceof Drone);assert.ok(api.elements.fetchEntity(ids[1]) instanceof VelvetCat);assert.equal(api.physics.getStatistics().bodies,3);engine.dispose();
});
test('descent gates damage and lands through shared area attack without shadow hit bodies',async()=>{
 const {engine,api,player,tick}=await setup(),d=drone(api,'lancer',[535,500]);assert.equal(d.takeDamage(10),false);const before=player.hp;tick(56);assert.equal(d.drone_state.alt,0);assert.equal(d.drone_state.flight,'hover');assert.ok(player.hp<before);assert.equal(api.physics.getStatistics().bodies,2);engine.dispose();
});
test('shell, seam, recovery and authored eye region use native impact geometry',async()=>{
 const {engine,api}=await setup(),d=drone(api);ground(d);const damage=(options={})=>{d.actor_state.invulnerable_remaining=0;const before=d.hp;assert.equal(d.takeDamage(10,options),true);return before-d.hp;};assert.ok(Math.abs(damage()-3)<1e-8);assert.ok(Math.abs(damage({type:'melee'})-6)<1e-8);const eye=api.physics.getBodyPoint(d,[15,0]).position;assert.ok(Math.abs(damage({hit_position:eye,hit_radius:1})-18)<1e-8);engine.dispose();
});
test('registered beam works for player, damages once through cover, retains endpoints then finishes',async()=>{
 const {engine,api,player,tick}=await setup(),d=drone(api,'seer',[800,500]);ground(d);api.abilities.getLoadout(player).learnAbility('drone_beam');api.physics.elements.createStatic({position:[650,500],collision_shape:{shape_type:'box',dimensions:[10,200]}});assert.ok(api.attacks.executeAttack(player,{attack_id:'ability:drone_beam',target:d.entity_id}));tick(73);assert.equal(player.data.ability_action_state.phase,'flash');assert.ok(d.hp<110);assert.ok(player.data.ability_action_state.beam.to[0]>800);tick(20);assert.equal(player.data.ability_action_state,null);engine.dispose();
});
test('grapple owns a real projectile and spring, ticks damage, Flit breaks and removes the joint',async()=>{
 const {engine,api,player,tick}=await setup(),d=drone(api,'grappler',[700,500]);ground(d);assert.ok(api.abilities.cast(d,'drone_grapple',{target:player.entity_id}));tick(31);assert.equal(d.data.ability_action_state.phase,'flight');const projectile_id=d.data.ability_action_state.projectile_id;assert.equal(api.elements.fetchEntity(projectile_id).data.role,'grapple');tick(20);assert.equal(d.data.ability_action_state.phase,'held');assert.equal(api.physics.getStatistics().constraints,1);const hp=player.hp;tick(31);assert.ok(player.hp<hp);player.data.player_state.last_flit_at=(player.data.player_state.last_flit_at??0)+1;tick();assert.equal(d.data.ability_action_state,null);assert.equal(api.physics.getStatistics().constraints,0);engine.dispose();
});
test('walls stop grapple, cancelled tells emit no projectile, losing a target cleans the spring',async()=>{
 const {engine,api,player,tick}=await setup(),d=drone(api,'grappler',[700,500]);ground(d);api.physics.elements.createStatic({position:[600,500],collision_shape:{shape_type:'box',dimensions:[10,200]}});api.abilities.cast(d,'drone_grapple',{target:player.entity_id});tick(60);assert.equal(d.data.ability_action_state,null);assert.equal(api.physics.getStatistics().constraints,0);api.attacks.getController(d).setCooldown(0);api.abilities.cast(d,'drone_grapple',{target:player.entity_id});api.abilities.cancelAction(d);tick();assert.equal(d.data.ability_action_state,null);engine.dispose();
});
test('lancer locks its final aim and native lunge damages/burns without local velocity math',async()=>{
 const {engine,api,player,tick}=await setup(),d=drone(api);ground(d);api.abilities.cast(d,'drone_lance',{target:player.entity_id});tick(32);const heading=d.data.ability_action_state.heading;player.setPosition([500,530]);tick(6);assert.equal(d.data.ability_action_state.heading,heading);tick(30);assert.ok(player.hp<10000);assert.ok(['lunge','recover'].includes(d.data.ability_action_state.phase));engine.dispose();
});
test('adopted cat follows with native offset motor, idles, changes cosmetic gait from actual travel',async()=>{
 const {engine,api,tick}=await setup(),cat=api.actors.spawn({kind:'velvet_cat',position:[200,500]});const initial=cat.position;assert.equal(cat.adopt(),true);tick(20);assert.equal(cat.state,'following');assert.ok(cat.position[0]>initial[0]);assert.ok(cat.data.velvet_animation.walkPhase>0);tick(300);assert.equal(cat.state,'idle');assert.ok(cat.cat_state.rest);const phase=cat.data.velvet_animation.walkPhase;tick(20);assert.ok(Math.abs(cat.data.velvet_animation.walkPhase-phase)<.1);engine.dispose();
});
test('cat adoption retains actual identity between native levels, release restores level ownership',async()=>{
 const {engine,api}=await setup(),cat=api.actors.spawn({kind:'velvet_cat',position:[300,500]});cat.adopt();const body=cat.body_id;await engine.loadLevel('b');assert.equal(api.elements.fetchEntity(cat.entity_id),cat);assert.equal(cat.body_id,body);cat.release();await engine.loadLevel('a');assert.equal(cat.destroyed,true);engine.dispose();
});
test('pause freezes both physical and cosmetic records; presentation packets are detached',async()=>{
 const {engine,api,tick}=await setup(),d=drone(api),cat=api.actors.spawn({kind:'velvet_cat',position:[250,500]});cat.adopt();tick(5);const snapshot=JSON.stringify(api.physics.savePhysicsState()),resume=engine.pause('test');tick(50);const c=velvetPresentation(cat),p=dronePresentation(d);c._tail[0]=99;p.x=999;engine.render(.5);assert.equal(JSON.stringify(api.physics.savePhysicsState()),snapshot);resume();engine.dispose();
});
test('invalid saved flight, appearance and timed-action clocks rollback new actors',async()=>{
 const {engine,api}=await setup(),before=api.physics.getStatistics().bodies;assert.throws(()=>drone(api,'bad'));assert.throws(()=>api.actors.spawn({kind:'velvet_cat',data:{velvet_animation:{}}}));const d=drone(api);ground(d);api.abilities.cast(d,'drone_grapple',{angle:0});const state=structuredClone(d.data.ability_action_state);state.phase_started_at=100;assert.throws(()=>api.actors.spawn({kind:'drone',data:{ability_action_state:state,weapon_state:{elapsed:0}}}));assert.equal(api.physics.getStatistics().bodies,before+1);engine.dispose();
});
test('held grapple restores its exact native constraint and leaving a level removes owned resources',async()=>{
 const {engine,api,player,tick}=await setup(),d=drone(api,'grappler',[700,500]);ground(d);engine.retainEntity(d);api.abilities.cast(d,'drone_grapple',{target:player.entity_id});tick(50);const saved=structuredClone(d.data.ability_action_state),id=d.entity_id;assert.equal(saved.phase,'held');const snapshot=api.physics.savePhysicsState();api.physics.loadPhysicsState(snapshot);api.weapons.reconnectGameplay();api.actors.reconnectGameplay();const restored=api.elements.fetchEntity(id);restored.updateBehavior=()=>{};assert.equal(restored.data.ability_action_state.constraint_id,saved.constraint_id);assert.ok(api.physics.getConstraint(saved.constraint_id));tick(2);api.abilities.cancelAction(restored);tick();assert.equal(api.physics.getStatistics().constraints,0);api.attacks.getController(restored).setCooldown(0);api.abilities.cast(restored,'drone_grapple',{target:player.entity_id});tick(50);assert.equal(api.physics.getStatistics().constraints,1);await engine.loadLevel('b');assert.equal(api.physics.getStatistics().constraints,0);engine.dispose();
});
test('source and held-target removal cannot leak projectile or joint ownership',async()=>{
 const {engine,api,player,tick}=await setup(),d=drone(api,'grappler',[700,500]);ground(d);api.abilities.cast(d,'drone_grapple',{target:player.entity_id});tick(31);const projectile=d.data.ability_action_state.projectile_id;d.destroy();tick();assert.equal(api.elements.fetchEntity(projectile),null);assert.equal(api.physics.getStatistics().constraints,0);const second=drone(api,'grappler',[700,500]);ground(second);api.abilities.cast(second,'drone_grapple',{target:player.entity_id});tick(50);assert.equal(api.physics.getStatistics().constraints,1);player.destroy();tick();assert.equal(api.physics.getStatistics().constraints,0);engine.dispose();
});
test('cat seats attach the same body with optional combined mass and checked native exit',async()=>{
 const {engine,api}=await setup(),cat=api.actors.spawn({kind:'velvet_cat',position:[200,200]});const vehicle=createGameVehicle(api.physics,{purpose:'owned',control_mode:'PLAYER',position:[300,300]});
 // Seat layout and mass assembly are owned by the existing native vehicle class.
 assert.equal(typeof vehicle.assignPassenger,'function');const body=cat.body_id,seat=cat.boardVehicle(vehicle,{combine_mass:true});assert.ok(seat>=1);assert.equal(cat.inCar,true);assert.equal(api.physics.getAttachmentState(cat).combine_mass,true);assert.equal(cat.body_id,body);assert.ok(cat.leaveVehicle(vehicle));assert.equal(cat.inCar,false);engine.dispose();
});
test('cosmetic RNG is independent of game random and sleeping never moves a cat',async()=>{
 let calls=0;const {engine,api,tick}=await setup(),cat=api.actors.spawn({kind:'velvet_cat',position:[300,500]});cat.adopt();cat.setRestPose('sleeping');const before=cat.position;const old=Math.random;try{Math.random=()=>{calls++;return .5;};tick(10);}finally{Math.random=old;}assert.deepEqual(cat.position,before);assert.equal(calls,0);assert.ok(cat.data.velvet_animation._poses.sleep>0);engine.dispose();
});
test('ordinary violet bolts share the visible tell and projectile damage pipeline',async()=>{
 const {engine,api,player,tick}=await setup(),d=drone(api,'lancer',[700,500]);ground(d);api.abilities.cast(d,'drone_bolt',{target:player.entity_id});assert.equal(d.isTelegraphing,true);tick(10);assert.equal(player.hp,10000);assert.equal(d.data.ability_action_state.phase,'tell');tick(25);assert.equal(d.data.ability_action_state,null);assert.equal(player.hp,9990);engine.dispose();
});
test('native vehicle contact drives the cat impact reaction without a second collision pass',async()=>{
 const {engine,api,tick}=await setup(),cat=api.actors.spawn({kind:'velvet_cat',position:[390,300]}),car=createGameVehicle(api.physics,{purpose:'owned',control_mode:'PLAYER',position:[300,300]});let impacts=0;api.session.on('cat:vehicle-impact',()=>impacts++);car.body.setLinearVelocity([360,0]);tick(20);assert.ok(impacts>0);assert.ok(cat.position[0]>390);engine.dispose();
});
