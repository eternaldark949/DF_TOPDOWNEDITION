import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameRuntime} from '../src/game/boot/game-runtime.mjs';
import {gameLevel} from '../src/engine/lobby/runtime/game-level.mjs';
import {Marionette} from '../src/game/entities/marionette.mjs';
class Room extends gameLevel{}
async function setup(){const engine=createGameRuntime({schedule_frame:null,actor_policy:{random:()=>.5},player:{template:'df:player_949',entity_type:'df_player',position:[100,100]}});engine.registerLevel('a',Room).registerLevel('b',Room);await engine.loadLevel('a');engine.start();return {engine,api:engine.api,player:engine.api.session.player,tick:(n=1)=>{for(let i=0;i<n;i++)engine.updateState();}};}
test('native Marionette owns one official body, canonical capability and no weapon surrogate',async()=>{
 const {engine,api}=await setup(),actor=api.actors.spawn({kind:'marionette',position:[200,100]});assert.ok(actor instanceof Marionette);assert.equal(actor.hp,30);assert.equal(actor.radius,11);assert.equal(actor.silent,true);assert.equal(api.physics.getStatistics().bodies,2);assert.equal(api.attacks.getSelectedAttack(actor).attack_id,'ability:marionette_lunge');assert.ok(api.abilities.getLoadout(actor).hasAbility('marionette_lunge'));assert.equal(api.attacks.getItems(actor).getEquippedWeapon(),null);engine.dispose();
});
test('automatic tell, native lunge, one hit and recovery use the existing weapon clock',async()=>{
 const {engine,api,player,tick}=await setup(),actor=api.actors.spawn({kind:'marionette',position:[140,100],rotation:Math.PI});let casts=0,hits=0;api.session.on('ability:cast',()=>casts++);api.session.on('combat:hit',event=>{if(event.ability_id==='marionette_lunge')hits++;});tick(40);actor.marionette_state.initial_delay=100;assert.equal(actor.state,'tell');assert.equal(player.hp,100);tick(30);assert.equal(casts,1);assert.equal(hits,1);assert.equal(player.hp,91);assert.ok(['lunge','recover'].includes(actor.state));assert.equal(actor.data.ability_action_state.started_at<=actor.data.weapon_state.elapsed,true);tick(55);assert.equal(actor.state,'stalk');engine.dispose();
});
test('wood resistance is game damage policy; damage interrupts the tell without adding physical knockback math',async()=>{
 const {engine,api,player,tick}=await setup(),actor=api.actors.spawn({kind:'marionette',position:[140,100],rotation:Math.PI});actor.takeDamage(10,{type:'ballistic'});assert.equal(actor.hp,23);actor.takeDamage(10,{type:'melee'});assert.equal(actor.hp,13);assert.ok(api.attacks.executeAttack(actor,{attack_id:'ability:marionette_lunge',target:player.entity_id}));actor.takeDamage(1,{type:'ballistic'});tick();assert.equal(actor.state,'recover');tick(45);assert.equal(player.hp,100);engine.dispose();
});
test('lunge capability is available to player and plain native characters and blocks concurrent fire',async()=>{
 const {engine,api,player,tick}=await setup();api.abilities.getLoadout(player).learnAbility('marionette_lunge');api.attacks.selectAttack(player,'ability:marionette_lunge');const actor=api.actors.spawn({kind:'actor',position:[140,100],data:{alliance:'hostile'}});assert.ok(api.attacks.executeAttack(player,{target:actor.entity_id}));assert.equal(api.weapons.fire({angle:0}),false);assert.equal(api.abilities.cast(player,'marionette_lunge'),false);tick(40);assert.equal(actor.hp,91);engine.dispose();
});
test('native lunge cannot damage through a thin wall, mount or bypass a lost target/stagger',async()=>{
 const {engine,api,player,tick}=await setup(),actor=api.actors.spawn({kind:'marionette',position:[140,100],rotation:Math.PI});actor.updateBehavior=()=>{};api.physics.elements.createStatic({position:[120,100],collision_shape:{shape_type:'box',dimensions:[1,200]}});assert.ok(api.attacks.executeAttack(actor,{target:player.entity_id}));tick(50);assert.equal(player.hp,100);assert.ok(actor.position[0]>130);tick(50);const parent=api.physics.createVehicle({position:[400,100]});api.physics.attachBody(actor,{parent_body:parent,emitter:{half_angle:Math.PI}});assert.equal(api.abilities.cast(actor,'marionette_lunge'),false);engine.dispose();
});
test('snapshot preserves actual class, action phase, hit ledger and single cooldown without constructors',async()=>{
 const {engine,api,player,tick}=await setup(),actor=api.actors.spawn({kind:'marionette',position:[140,100],rotation:Math.PI});actor.marionette_state.initial_delay=100;assert.ok(api.attacks.executeAttack(actor,{target:player.entity_id}));tick(30);assert.equal(player.hp,91);const id=actor.entity_id,state=structuredClone(actor.data.ability_action_state),snapshot=api.physics.savePhysicsState();api.physics.loadPhysicsState(snapshot);api.weapons.reconnectGameplay();api.actors.reconnectGameplay();api.combat.reconnectGameplay();const restored=api.elements.fetchEntity(id);assert.ok(restored instanceof Marionette);assert.deepEqual(restored.data.ability_action_state,state);tick(20);assert.equal(api.session.player.hp,91);assert.equal(api.physics.getStatistics().bodies,2);engine.dispose();
});
test('pause freezes actions, rendering is read-only and departure cancels a retained action',async()=>{
 const {engine,api,player,tick}=await setup(),actor=api.actors.spawn({kind:'marionette',position:[140,100],rotation:Math.PI});engine.retainEntity(actor);api.attacks.executeAttack(actor,{target:player.entity_id});const before=JSON.stringify(api.physics.savePhysicsState()),resume=engine.pause('check');tick(30);engine.render(.5);assert.equal(JSON.stringify(api.physics.savePhysicsState()),before);resume();await engine.loadLevel('b');assert.equal(actor.destroyed,false);assert.equal(actor.data.ability_action_state,null);assert.equal(actor.state,'stalk');engine.dispose();
});

test('lost tell targets and forgotten capabilities cancel into recovery without damage',async()=>{
 const {engine,api,tick}=await setup(),actor=api.actors.spawn({kind:'marionette',position:[300,100]}),target=api.actors.spawn({kind:'actor',position:[340,100],data:{alliance:'friendly'}});actor.marionette_state.initial_delay=100;api.attacks.executeAttack(actor,{target:target.entity_id});target.destroy();tick();assert.equal(actor.state,'recover');tick(90);api.attacks.executeAttack(actor,{angle:0});api.abilities.getLoadout(actor).forgetAbility('marionette_lunge');tick();assert.equal(actor.state,'recover');engine.dispose();
});
test('malformed/future action records reject registration and leave no bodies/controllers',async()=>{
 const {engine,api}=await setup(),base=api.physics.getStatistics().bodies;assert.throws(()=>api.actors.spawn({kind:'marionette',data:{weapon_state:{elapsed:0},ability_action_state:{format_version:1,ability_id:'marionette_lunge',phase:'tell',started_at:10,phase_started_at:10,heading:0,aim:{angle:0},hit_ids:[],cancel_requested:false}}}));assert.equal(api.physics.getStatistics().bodies,base);engine.dispose();
});

test('a hit may remove its defeated target synchronously without stale-body impulse commands',async()=>{
 const {engine,api,player,tick}=await setup();api.abilities.getLoadout(player).learnAbility('marionette_lunge');const target=api.actors.spawn({kind:'actor',position:[140,100],data:{health:5,max_health:5,alliance:'hostile'}});target.onDefeated=()=>target.destroy();assert.ok(api.attacks.executeAttack(player,{attack_id:'ability:marionette_lunge',target:target.entity_id}));tick(40);assert.equal(target.destroyed,true);assert.equal(api.physics.getStatistics().bodies,1);engine.dispose();
});
