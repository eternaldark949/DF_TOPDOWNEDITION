import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameRuntime} from '../src/game/boot/game-runtime.mjs';
import {gameLevel} from '../src/engine/lobby/runtime/game-level.mjs';
import {GatlingGunner} from '../src/game/entities/gatling-gunner.mjs';
class Room extends gameLevel{}
async function setup({weapon_policy={}}={}){const engine=createGameRuntime({schedule_frame:null,weapon_policy,player:{template:'df:player_949',entity_type:'df_player',position:[500,500]}});engine.registerLevel('a',Room).registerLevel('b',Room);await engine.loadLevel('a');engine.start();const api=engine;api.game.session.player.maxHp=10000;api.game.session.player.hp=10000;return {engine,api,player:api.game.session.player,tick:(n=1)=>{for(let i=0;i<n;i++)engine.updateState();}};}
const spawn=(api,data={})=>api.game.actors.spawn({kind:'gatling_gunner',position:[740,500],rotation:Math.PI,data});
test('ordinary gunner is one native actor with real owned rotary weapon and registered burst capability',async()=>{
 const {engine,api}=await setup(),gunner=spawn(api);assert.ok(gunner instanceof GatlingGunner);assert.equal(gunner.hp,200);assert.equal(gunner.mass,25);assert.equal(gunner.items.getEquippedWeapon().definition_id,'gatling_gunner');assert.ok(api.game.abilities.getLoadout(gunner).hasAbility('gatling_burst'));assert.equal(api.basement.physics.getStatistics().bodies,2);assert.throws(()=>spawn(api,{persona:'unknown'}));assert.equal(api.basement.physics.getStatistics().bodies,2);engine.dispose();
});
test('gunner telegraphs, fires exactly ten shared projectiles, then reloads on the one cooldown clock',async()=>{
 const {engine,api,player,tick}=await setup(),gunner=spawn(api);let rounds=0;api.game.session.on('weapon:fired',event=>{if(event.entity_id===gunner.entity_id)rounds++;});tick(6);assert.equal(gunner.state,'tell');assert.equal(rounds,0);tick(70);assert.equal(rounds,10);assert.equal(gunner.state,'reload');assert.ok(player.hp<10000);const cooldown=api.game.attacks.getCooldown(gunner);tick(60);assert.equal(rounds,10);assert.ok(Math.abs(cooldown-api.game.attacks.getCooldown(gunner)-1)<1e-8);assert.ok(gunner.gunner_state.barrel_heat>=0);engine.dispose();
});
test('burst uses the same owned gun and readiness API for player and any registered character',async()=>{
 const {engine,api,player,tick}=await setup();api.game.abilities.getLoadout(player).learnAbility('gatling_burst');assert.equal(api.game.abilities.cast(player,'gatling_burst',{angle:0}),false);assert.equal(api.game.attacks.getAvailableAttacks(player).some(a=>a.attack_id==='ability:gatling_burst'),false);const selected=api.game.abilities.getLoadout(player).equipped_id;assert.throws(()=>api.game.attacks.selectAttack(player,'ability:gatling_burst'));assert.equal(api.game.abilities.getLoadout(player).equipped_id,selected);const gun=api.game.items.grantItem('gatling_gunner');api.game.attacks.selectAttack(player,'ability:gatling_burst');assert.equal(api.game.items.getEquippedWeapon().instance_id,gun.instance_id);let shots=0;api.game.session.on('weapon:fired',event=>{if(event.entity_id===player.entity_id)shots++;});assert.ok(api.game.attacks.executeAttack(player,{angle:0}));assert.equal(api.game.weapons.fire({angle:0}),false);tick(80);assert.equal(shots,10);assert.equal(player.data.ability_action_state.phase,'reload');engine.dispose();
});
test('equipment instance changes interrupt into reload without stale rounds',async()=>{
 const {engine,api,player,tick}=await setup(),gunner=spawn(api);tick(23);let shots=0;api.game.session.on('weapon:fired',event=>{if(event.entity_id===gunner.entity_id)shots++;});const replacement=gunner.items.grantItem('gatling_gunner');gunner.items.equipItem(replacement.instance_id);tick(20);assert.equal(shots,0);assert.equal(gunner.state,'reload');engine.dispose();
});
test('dormancy and waking hold are real game policy; enrage changes the next common burst',async()=>{
 const {engine,api,tick}=await setup(),gunner=spawn(api);gunner.makeDormant();const position=[...gunner.position];let shots=0;api.game.session.on('weapon:fired',()=>shots++);tick(90);assert.equal(shots,0);assert.deepEqual(gunner.position,position);gunner.awaken(.5);tick(20);assert.equal(shots,0);gunner.enrage();tick(15);assert.equal(gunner.data.ability_action_state.burst_limit,13);assert.ok(Math.abs(gunner.data.burst_tuning.round_seconds-5/60)<1e-9);tick(85);assert.equal(shots,13);engine.dispose();
});
test('formations share logical squad membership and native orbit intent, update safely after defeat/reassignment',async()=>{
 const {engine,api,tick}=await setup(),a=spawn(api,{formation_order:2}),b=api.game.actors.spawn({kind:'gatling_gunner',position:[260,500],data:{formation_order:1}});tick(2);let saved=api.basement.physics.savePhysicsState(),record=saved.bodies.find(e=>e.body_id===a.body_id);assert.equal(record.motor.intent.slot_count,2);assert.equal(record.motor.intent.slot_index,1);b.die();tick();saved=api.basement.physics.savePhysicsState();record=saved.bodies.find(e=>e.body_id===a.body_id);assert.equal(record.motor.intent.slot_count??1,1);api.game.actors.setSquad(a,{squad_id:'other',formation_order:0});assert.equal(a.data.squad_id,'other');assert.throws(()=>api.game.actors.setSquad(a,{squad_id:''}));engine.dispose();
});
test('blocked gunner paths/sight use native queries and cannot fire through a separating wall',async()=>{
 const {engine,api,player,tick}=await setup(),gunner=spawn(api);api.basement.physics.elements.createStatic({position:[620,500],collision_shape:{shape_type:'box',dimensions:[2,2000]}});let fired=0;api.game.session.on('weapon:fired',()=>fired++);tick(100);assert.equal(fired,0);assert.equal(player.hp,10000);assert.ok(gunner.position[0]>620);engine.dispose();
});
test('snapshots preserve class, exact item instance, burst counts, reload clock and barrel state',async()=>{
 const {engine,api,tick}=await setup(),gunner=spawn(api);tick(30);const id=gunner.entity_id,item=gunner.items.equipped_weapon_id,state=structuredClone(gunner.data.ability_action_state),visual=structuredClone(gunner.gunner_state),snapshot=api.basement.physics.savePhysicsState();api.basement.physics.loadPhysicsState(snapshot);api.game.weapons.reconnectGameplay();api.game.actors.reconnectGameplay();api.game.combat.reconnectGameplay();const restored=api.basement.elements.fetchEntity(id);assert.ok(restored instanceof GatlingGunner);assert.equal(restored.items.equipped_weapon_id,item);assert.deepEqual(restored.data.ability_action_state,state);assert.deepEqual(restored.gunner_state,visual);let fired=0;api.game.session.on('weapon:fired',event=>{if(event.entity_id===id)fired++;});tick(70);assert.equal(fired,10-state.shots_fired);engine.dispose();
});
test('pause freezes body, visual state and burst clock; leaving cancels a retained action',async()=>{
 const {engine,api,tick}=await setup(),gunner=spawn(api);engine.retainEntity(gunner);tick(25);const before=JSON.stringify(api.basement.physics.savePhysicsState()),resume=engine.pause('check');tick(40);engine.render(.5);assert.equal(JSON.stringify(api.basement.physics.savePhysicsState()),before);resume();await engine.loadLevel('b');assert.equal(gunner.destroyed,false);assert.equal(gunner.data.ability_action_state,null);engine.dispose();
});

test('a sight blocker interrupts an in-flight burst without further rounds',async()=>{
 const {engine,api,player,tick}=await setup(),gunner=spawn(api);tick(23);let shots=0;api.game.session.on('weapon:fired',event=>{if(event.entity_id===gunner.entity_id)shots++;});api.basement.physics.elements.createStatic({position:[620,500],collision_shape:{shape_type:'box',dimensions:[2,2000]}});tick(20);assert.equal(shots,0);assert.equal(gunner.state,'reload');engine.dispose();
});
test('action reads are detached and copied action records cannot invoke internal rounds',async()=>{
 const {engine,api,tick}=await setup(),gunner=spawn(api);tick(4);const state=api.game.abilities.getActionState(gunner);state.shots_fired=999;assert.equal(api.game.abilities.getActionState(gunner).shots_fired,0);assert.equal(api.game.attacks.getController(gunner).fireActionRound(state,{angle:0}),false);assert.equal(api.game.abilities.cancelAction(gunner),true);tick();assert.equal(gunner.state,'reload');engine.dispose();
});
test('invalid saved burst counts fail actor registration without leaving bodies or controllers',async()=>{
 const {engine,api}=await setup();const before=api.basement.physics.getStatistics().bodies;assert.throws(()=>spawn(api,{weapon_state:{elapsed:0},ability_action_state:{format_version:1,ability_id:'gatling_burst',phase:'tell',started_at:0,phase_started_at:0,heading:0,aim:{angle:0},weapon_instance_id:'fake',shots_fired:11,burst_limit:10,reload_seconds:3.5,round_seconds:.1,cancel_requested:false}}));assert.equal(api.basement.physics.getStatistics().bodies,before);engine.dispose();
});

test('holster, mounting and forgotten capabilities preserve common burst readiness and reload',async()=>{
 const {engine,api,tick}=await setup(),gunner=spawn(api),controller=api.game.attacks.getController(gunner);gunner.updateBehavior=()=>{};controller.setHolstered(true);assert.equal(api.game.abilities.cast(gunner,'gatling_burst',{angle:0}),false);controller.setHolstered(false);const parent=api.basement.physics.createVehicle({position:[100,100]});api.basement.physics.attachBody(gunner,{parent_body:parent,emitter:{half_angle:Math.PI}});assert.equal(api.game.abilities.cast(gunner,'gatling_burst',{angle:0}),false);api.basement.physics.detachBody(gunner,{exit_points:[[0,80]]});assert.ok(api.game.abilities.cast(gunner,'gatling_burst',{angle:0}));api.game.abilities.getLoadout(gunner).forgetAbility('gatling_burst');tick();assert.equal(gunner.state,'reload');assert.equal(controller.fire({angle:0}),false);engine.dispose();
});

test('shared burst rounds preserve the player weapon backend cooldown modifiers',async()=>{
 const {engine,api,player,tick}=await setup({weapon_policy:{fast_reload:()=>true}});const gun=api.game.items.grantItem('gatling_gunner');api.game.items.equipItem(gun.instance_id);api.game.abilities.getLoadout(player).learnAbility('gatling_burst');const times=[];api.game.session.on('weapon:fired',event=>{if(event.entity_id===player.entity_id)times.push(api.game.weapons.state.elapsed);});api.game.attacks.executeAttack(player,{attack_id:'ability:gatling_burst',angle:0});tick(35);assert.ok(times.length>2);assert.ok(times[1]-times[0]<=5/60+1e-9);engine.dispose();
});

test('companion AI burst counters cannot replace a registered action firing cycle',async()=>{
 const {engine,api,tick}=await setup(),npc=api.game.actors.spawn({kind:'npc',role:'teammate',position:[200,200],data:{weapon_definition_id:'gatling_gunner',burst_size:3}});npc.updateBehavior=()=>{};api.game.abilities.getLoadout(npc).learnAbility('gatling_burst');const times=[];api.game.session.on('weapon:fired',event=>{if(event.entity_id===npc.entity_id)times.push(api.game.attacks.getController(npc).state.elapsed);});assert.ok(api.game.attacks.executeAttack(npc,{attack_id:'ability:gatling_burst',angle:0}));tick(80);assert.equal(times.length,10);assert.ok(Math.abs(times[1]-times[0]-.1)<1e-8);engine.dispose();
});

test('empty actor inventories do not regenerate starter weapons during reconnect or restore',async()=>{
 const {engine,api}=await setup(),actors=[spawn(api),api.game.actors.spawn({kind:'ganger',position:[900,900]}),api.game.actors.spawn({kind:'npc',position:[200,200],data:{weapon_definition_id:'pistol_fpx'}})];const ids=actors.map(actor=>actor.entity_id),items=[];for(const actor of actors){const item=actor.items.getEquippedWeapon();items.push(item.instance_id);api.game.items.receiveBundle(actor.items.extractItem(item.instance_id));}api.game.actors.reconnectGameplay();for(const actor of actors)assert.equal(actor.items.snapshot().order.length,0);const snapshot=api.basement.physics.savePhysicsState();api.basement.physics.loadPhysicsState(snapshot);api.game.weapons.reconnectGameplay();api.game.actors.reconnectGameplay();for(const id of ids)assert.equal(api.basement.elements.fetchEntity(id).items.snapshot().order.length,0);for(const id of items)assert.ok(api.game.items.hasInstance(id));engine.dispose();
});
