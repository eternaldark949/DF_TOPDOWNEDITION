import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameRuntime} from '../src/directory/game-runtime.mjs';
import {gameLevel} from '../src/runtime/game-level.mjs';
import {Hunter} from '../src/entities/hunter.mjs';
import {Ganger} from '../src/entities/ganger.mjs';
class Room extends gameLevel{}
async function setup(){const engine=createGameRuntime({schedule_frame:null,actor_policy:{random:()=>.5},player:{template:'df:player_949',entity_type:'df_player',position:[100,100]}});engine.registerLevel('a',Room).registerLevel('b',Room);await engine.loadLevel('a');engine.start();return {engine,api:engine.api,player:engine.api.session.player,tick:(n=1)=>{for(let i=0;i<n;i++)engine.updateState();}};}
test('Hunter factory creates one official native identity with Directory tuning and owned sidearm/claw capability',async()=>{
 const {engine,api}=await setup();const hunter=api.actors.spawn({kind:'hunter',position:[300,100],data:{alpha:true}});assert.ok(hunter instanceof Hunter&&hunter instanceof Ganger);assert.equal(hunter.hp,70);assert.equal(hunter.data.move_speed,168);assert.equal(hunter.data.dash_max,2);assert.equal(hunter.items.getEquippedWeapon().definition_id,'pistol_ganger');assert.ok(api.abilities.getLoadout(hunter).hasAbility('hunter_claw'));assert.equal(api.physics.getStatistics().bodies,2);assert.equal(api.attacks.getController(hunter).state,hunter.data.weapon_state);engine.dispose();
});
test('night vision ignores concealment but still requires native line of sight',async()=>{
 const {engine,api,player,tick}=await setup();player.isHidden=true;const hunter=api.actors.spawn({kind:'hunter',position:[250,100],rotation:Math.PI});const wall=api.physics.elements.createStatic({position:[175,100],collision_shape:{shape_type:'box',dimensions:[5,300]}});tick(30);assert.equal(hunter.suspicion,0);wall.destroy();tick(120);assert.equal(hunter.state,'ALERT');engine.dispose();
});
test('Hunter dash respects swept walls and alpha chains use saved cooldowns',async()=>{
 const {engine,api,player}=await setup();const hunter=api.actors.spawn({kind:'hunter',position:[350,100],rotation:Math.PI,data:{alpha:true}});hunter.setBehavior('ALERT');hunter.hunter_state.dash_remaining=0;const wall=api.physics.elements.createStatic({position:[250,100],collision_shape:{shape_type:'box',dimensions:[2,200]}});
 hunter.updateBehavior(1/60,{player,attacks:api.attacks,random:()=>.5});assert.deepEqual(hunter.position,[350,100]);assert.equal(hunter.hunter_state.chain,0);assert.equal(hunter.hunter_state.dash_remaining,.5);wall.destroy();hunter.setBehavior('ALERT');hunter.hunter_state.dash_remaining=0;hunter.updateBehavior(1/60,{player,attacks:api.attacks,random:()=>.5});assert.deepEqual(hunter.position,[170,100]);assert.equal(hunter.hunter_state.chain,1);assert.equal(hunter.hunter_state.dash_remaining,22/60);engine.dispose();
});
test('claw is a universal learned attack, hits through native contacts once and shares sidearm cooldown',async()=>{
 const {engine,api,player,tick}=await setup();player.maxHp=1000;player.hp=1000;const hunter=api.actors.spawn({kind:'hunter',position:[140,100],rotation:Math.PI});hunter.updateBehavior=()=>{};const projectile=api.attacks.executeAttack(hunter,{attack_id:'ability:hunter_claw',target:player.position});assert.ok(projectile);assert.equal(projectile.data.damage_type,'melee');assert.equal(api.attacks.executeAttack(hunter,{attack_id:'weapon:pistol_ganger',target:player.position}),false);tick(5);assert.equal(player.hp,986);
 const loadout=api.abilities.getLoadout(player);loadout.learnAbility('hunter_claw');api.attacks.selectAttack(player,'ability:hunter_claw');assert.ok(api.attacks.executeAttack(player,{target:[500,100]}));engine.dispose();
});
test('claw cannot hit through walls, cast from a mount or bypass stagger',async()=>{
 const {engine,api,player,tick}=await setup();const hunter=api.actors.spawn({kind:'hunter',position:[140,100],rotation:Math.PI});hunter.updateBehavior=()=>{};api.physics.elements.createStatic({position:[120,100],collision_shape:{shape_type:'box',dimensions:[1,100]}});assert.ok(api.attacks.executeAttack(hunter,{attack_id:'ability:hunter_claw',target:player.position}));tick(50);assert.equal(player.hp,100);
 hunter.data.combat_state={stagger_remaining:1};assert.equal(api.attacks.executeAttack(hunter,{attack_id:'ability:hunter_claw'}),false);hunter.data.combat_state.stagger_remaining=0;const parent=api.physics.createVehicle({position:[400,100]});api.physics.attachBody(hunter,{parent_body:parent,emitter:{half_angle:Math.PI}});assert.equal(api.attacks.canAttack(hunter,{attack_id:'ability:hunter_claw'}),false);assert.equal(api.abilities.cast(hunter,'hunter_claw'),false);engine.dispose();
});
test('snapshot restores the actual Hunter prototype, canonical clocks/loadout and continued behavior',async()=>{
 const {engine,api,player,tick}=await setup();const hunter=api.actors.spawn({kind:'hunter',position:[350,100],data:{alpha:true}});hunter.hunter_state.dash_remaining=2;hunter.hunter_state.chain=1;const id=hunter.entity_id;const snapshot=api.physics.savePhysicsState();api.physics.loadPhysicsState(snapshot);api.weapons.reconnectGameplay();api.actors.reconnectGameplay();api.combat.reconnectGameplay();const restored=api.elements.fetchEntity(id);assert.ok(restored instanceof Hunter);assert.equal(restored.hunter_state.chain,1);assert.equal(restored.hunter_state.dash_remaining,2);assert.ok(api.abilities.getLoadout(restored).hasAbility('hunter_claw'));assert.equal(api.physics.getStatistics().bodies,2);tick(2);assert.ok(restored.hunter_state.dash_remaining<2);assert.throws(()=>api.actors.spawn({kind:'hunter',data:{hunter_state:{format_version:1,dash_remaining:0,chain:3,evade_requested:false}}}));assert.equal(api.physics.getStatistics().bodies,2);engine.dispose();
});
test('automatic claw intent uses the shared queue and hit reaction evades with native clearance',async()=>{
 const {engine,api,player,tick}=await setup();player.maxHp=1000;player.hp=1000;const hunter=api.actors.spawn({kind:'hunter',position:[140,100],rotation:Math.PI});hunter.setBehavior('ALERT');let claws=0;api.session.on('attack:executed',event=>{if(event.attack_id==='ability:hunter_claw')claws++;});tick(5);assert.equal(claws,1);assert.equal(player.hp,986);
 hunter.onDamaged({source:player.entity_id,type:'ballistic'});hunter.hunter_state.dash_remaining=2;const before=[...hunter.position];hunter.updateBehavior(1/60,{player,attacks:api.attacks,random:()=>0});assert.notDeepEqual(hunter.position,before);assert.ok(api.physics.isPlacementClear(hunter,hunter.position));assert.equal(hunter.hunter_state.evade_requested,false);engine.dispose();
});
test('pause, render and level departure cannot advance or retain a level-owned Hunter',async()=>{
 const {engine,api,tick}=await setup();const hunter=api.actors.spawn({kind:'hunter',position:[350,100]});const state=JSON.stringify(hunter.data),resume=engine.pause('hunter-check');tick(20);engine.render(.5);assert.equal(JSON.stringify(hunter.data),state);resume();await engine.loadLevel('b');assert.equal(hunter.destroyed,true);assert.equal(api.actors.getActors().length,0);engine.dispose();
});
