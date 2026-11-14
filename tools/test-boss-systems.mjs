import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameRuntime} from '../src/game/boot/game-runtime.mjs';
import {gameLevel} from '../src/engine/lobby/runtime/game-level.mjs';
import {Demoness} from '../src/game/entities/demoness.mjs';
import {Warden,Vesper,Matins,Compline} from '../src/game/entities/warden.mjs';
import {BossEffect} from '../src/game/entities/boss-effect.mjs';
import {validateAbilityAction} from '../src/game/mechanics/abilities/lunge-actions.mjs';
class Room extends gameLevel{}
async function setup(){const engine=createGameRuntime({schedule_frame:null,actor_policy:{random:()=>.5},player:{template:'df:player_949',entity_type:'df_player',position:[500,500]}});engine.registerLevel('a',Room).registerLevel('b',Room);await engine.loadLevel('a');engine.start();const api=engine.api;api.session.player.maxHp=10000;api.session.player.hp=10000;return {engine,api,player:api.session.player,tick:(n=1)=>{for(let i=0;i<n;i++)engine.updateState();}};}
const spawn=(api,kind='demoness',data={},position=[740,500])=>api.actors.spawn({kind,position,rotation:Math.PI,data});
const freeze=actor=>{actor.updateBehavior=()=>{};};
function restore(api){const saved=api.physics.savePhysicsState();api.physics.loadPhysicsState(saved);api.weapons.reconnectGameplay();api.encounters.reconnectGameplay();api.actors.reconnectGameplay();api.combat.reconnectGameplay();api.abilities.reconnectGameplay();return saved;}
test('all remaining concrete actor types and elite variants register canonical identities',async()=>{
 const {engine,api}=await setup();for(const [kind,Class] of [['demoness',Demoness],['vesper',Vesper],['matins',Matins],['compline',Compline]]){const actor=spawn(api,kind);assert.ok(actor instanceof Class);assert.equal(actor.canBeExecuted,false);assert.equal(actor.hp,kind==='demoness'?900:1500);if(actor instanceof Warden)assert.equal(actor.items.getEquippedWeapon().definition_id,'gatling_gunner');}
 const compat=spawn(api,'gatling_gunner',{persona:'matins'});assert.ok(compat instanceof Matins);for(const elite of ['armored','swift','warded'])assert.equal(spawn(api,'hunter',{elite}).data.elite,elite);assert.throws(()=>spawn(api,'warden',{persona:'bad'}));engine.dispose();
});
test('dormancy, awaken holds and body ownership survive constructor-free snapshots',async()=>{
 const {engine,api,tick}=await setup(),d=spawn(api),w=spawn(api,'compline',{},[740,700]);d.makeDormant();w.makeDormant();const positions=[d.position,w.position];tick(20);assert.deepEqual([d.position,w.position],positions);const ids=[d.entity_id,w.entity_id];restore(api);const rd=api.elements.fetchEntity(ids[0]),rw=api.elements.fetchEntity(ids[1]);assert.ok(rd instanceof Demoness);assert.ok(rw instanceof Compline);rw.awaken(1);assert.ok(rw.gunner_state.hold_until>=1+2*40/60);rd.awaken();assert.equal(rd.dormant,false);engine.dispose();
});
test('Demoness owns boss-specific claws and whips rather than inherited pistol attacks',async()=>{
 const {engine,api,player,tick}=await setup(),d=spawn(api,'demoness',{},[570,500]);freeze(d);assert.equal(d.items.getEquippedWeapon(),null);assert.ok(api.abilities.cast(d,'demoness_whip',{target:player.entity_id}));tick();assert.equal(player.hp,9982);assert.equal(d.data.demoness_state.last_strike.position[0],500);api.attacks.getController(d).setCooldown(0);d.setPosition([545,500]);api.abilities.cast(d,'demoness_claw',{target:player.entity_id});tick(5);assert.equal(player.hp,9960);engine.dispose();
});
test('Demoness phase thresholds, phase-three dash cadence and stagger cancellation are native policy',async()=>{
 const {engine,api,player,tick}=await setup(),d=spawn(api,'demoness',{solo:true});d.hp=500;tick();assert.equal(d.phase,2);d.hp=200;tick();assert.equal(d.phase,3);assert.equal(d.data.dash_cooldown,95/60);api.attacks.getController(d).setCooldown(0);freeze(d);api.abilities.cast(d,'demoness_bolts',{target:player.entity_id});api.combat.haymaker(d,{damage:10,source_id:player.entity_id});tick(30);assert.equal(d.data.ability_action_state,null);assert.equal(api.elements.getEntities({entity_type:'projectile'}).length,0);engine.dispose();
});
test('ember fan is universal, telegraphed and uses the existing projectile hit backend',async()=>{
 const {engine,api,player,tick}=await setup(),d=spawn(api);freeze(d);api.abilities.getLoadout(player).learnAbility('demoness_bolts');assert.ok(api.attacks.executeAttack(player,{attack_id:'ability:demoness_bolts',target:d.entity_id}));tick(10);assert.equal(d.hp,900);tick(30);assert.ok(d.hp<900);assert.equal(player.data.ability_action_state,null);engine.dispose();
});
test('double whip retains its repeat across snapshots and only strikes twice',async()=>{
 const {engine,api,player,tick}=await setup(),d=spawn(api,'demoness',{},[570,500]);freeze(d);api.abilities.cast(d,'demoness_whip_double',{target:player.entity_id});tick();assert.equal(d.data.ability_action_state.phase,'repeat');assert.equal(player.hp,9982);const id=d.entity_id;restore(api);freeze(api.elements.fetchEntity(id));tick(20);assert.equal(api.session.player.hp,9964);assert.equal(api.elements.fetchEntity(id).data.ability_action_state,null);engine.dispose();
});
test('gale uses native cone/impulses and breaks melee guard only on accepted hits',async()=>{
 const {engine,api,player,tick}=await setup(),d=spawn(api,'demoness',{},[600,500]);freeze(d);api.abilities.cast(d,'demoness_gale',{target:player.entity_id});tick(31);assert.equal(player.hp,9988);assert.ok(player.data.combat_state.guard_remaining>0);assert.equal(api.weapons.fire({angle:0}),false);assert.ok(player.linear_velocity[0]<0);tick(80);assert.equal(player.data.combat_state.guard_remaining,0);engine.dispose();
});
test('shadow step checks the landing again and cannot blink into newly placed cover',async()=>{
 const {engine,api,player,tick}=await setup(),d=spawn(api);freeze(d);assert.ok(api.abilities.cast(d,'demoness_step',{target:player.entity_id}));const spot=d.data.ability_action_state.planned_position;api.physics.elements.createStatic({position:spot,collision_shape:{shape_type:'box',dimensions:[200,200]}});const start=d.position;tick(25);assert.deepEqual(d.position,start);assert.equal(player.hp,10000);engine.dispose();
});
test('blood mirror creates official one-hit decoys; they expire and owner defeat clears survivors',async()=>{
 const {engine,api,player,tick}=await setup(),d=spawn(api);freeze(d);api.abilities.cast(d,'demoness_mirror',{target:player.entity_id});tick();const decoys=api.actors.getActors().filter(a=>a.data.mirror_owner_id===d.entity_id);assert.equal(decoys.length,2);for(const decoy of decoys){assert.ok(decoy instanceof Demoness);assert.equal(decoy.hp,1);assert.equal(decoy.solo,false);freeze(decoy);}decoys[0].demoness_state.decoy_remaining=.01;tick();assert.equal(decoys[0].dead,true);d.die();assert.equal(decoys[1].dead,true);engine.dispose();
});
test('sigils arm once, turn into fire, and Flit extinguishes the shared burn status',async()=>{
 const {engine,api,player,tick}=await setup(),d=spawn(api);freeze(d);const effect=api.encounters.addEffect(d,'sigil',player.position);assert.ok(effect instanceof BossEffect);tick(61);assert.ok(player.hp<10000);assert.equal(effect.destroyed,true);assert.equal(api.encounters.getEffects().filter(e=>e.data.kind==='fire').length,1);assert.ok(player.data.combat_state.orbs.length);player.data.player_state.last_flit_at=(player.data.player_state.last_flit_at??0)+1;player.data.player_state.flit_remaining=1;tick();assert.equal(player.data.combat_state.orbs.length,0);engine.dispose();
});
test('hymn sweeps an expanding ring through cover, hits once and reveals targets',async()=>{
 const {engine,api,player,tick}=await setup(),w=spawn(api,'matins');freeze(w);api.physics.elements.createStatic({position:[620,500],collision_shape:{shape_type:'box',dimensions:[10,400]}});api.encounters.addEffect(w,'hymn',w.position);tick(25);assert.equal(player.hp,9990);assert.ok(player.data.combat_state.revealed_remaining>0);tick(25);assert.equal(player.hp,9990);engine.dispose();
});
test('censer lands as fire/smoke and smoke obstructs only native sensing queries',async()=>{
 const {engine,api,player,tick}=await setup(),w=spawn(api,'vesper');freeze(w);api.encounters.addEffect(w,'censer',[620,500],{from_position:w.position});assert.equal(api.encounters.smokeBlocks(w,player),false);tick(55);assert.ok(api.encounters.getEffects().some(e=>e.data.kind==='fire'));assert.equal(api.encounters.smokeBlocks(w,player),true);assert.equal(api.physics.observeTarget(w,player).line_clear,true);engine.dispose();
});
test('rite burns outside its bounded shrinking safe region while the center stays safe',async()=>{
 const {engine,api,player,tick}=await setup(),d=spawn(api),outside=spawn(api,'actor',{alliance:'friendly'},[1100,500]);freeze(d);freeze(outside);api.encounters.addEffect(d,'rite',player.position);tick(100);assert.equal(player.hp,10000);assert.ok(outside.hp<100);engine.dispose();
});
test('Warden sight, cover-fire grace, reveal and one-flanker coordination are shared policy',async()=>{
 const {engine,api,player,tick}=await setup(),a=spawn(api,'vesper'),b=spawn(api,'matins',{},[740,700]);for(const actor of [a,b]){freeze(actor);actor.warden_state.target_id=player.entity_id;}tick(2);assert.equal(api.encounters.getWardenOrders(a).sight,true);api.abilities.cast(a,'warden_burst',{target:player.entity_id});tick(32);api.physics.elements.createStatic({position:[620,550],collision_shape:{shape_type:'box',dimensions:[10,2000]}});tick(2);assert.equal(api.encounters.getWardenOrders(a).cover,true);tick(40);assert.equal(api.encounters.getWardenOrders(a).cover,false);api.combat.reveal(player,1);tick();assert.equal(api.encounters.getWardenOrders(a).revealed,true);tick(200);const orders=[a,b].map(actor=>api.encounters.getWardenOrders(actor));assert.equal(orders.filter(o=>o.flank).length,1);engine.dispose();
});
test('Warden defeat enrages its own surviving squad once and clears owned fields',async()=>{
 const {engine,api}=await setup(),a=spawn(api,'vesper'),b=spawn(api,'matins'),other=spawn(api,'compline');api.actors.setSquad(other,{squad_id:'other'});api.encounters.addEffect(a,'smoke',[500,500]);a.die();assert.equal(b.gunner_state.enrage_count,1);assert.equal(b.data.burst_tuning.reload_seconds,1.5);assert.equal(other.gunner_state.enrage_count,0);assert.equal(api.encounters.getEffects().length,0);a.die();assert.equal(b.gunner_state.enrage_count,1);engine.dispose();
});
test('Compline hook uses the shared physical grapple and Flit removes the owned constraint',async()=>{
 const {engine,api,player,tick}=await setup(),w=spawn(api,'compline');freeze(w);api.abilities.cast(w,'warden_hook',{target:player.entity_id});tick(60);assert.equal(w.data.ability_action_state.phase,'held');assert.equal(api.physics.getStatistics().constraints,1);player.data.player_state.last_flit_at+=1;tick();assert.equal(w.data.ability_action_state,null);assert.equal(api.physics.getStatistics().constraints,0);engine.dispose();
});
test('pause freezes boss/effect state, snapshots keep ownership, and departure removes hazards',async()=>{
 const {engine,api,player,tick}=await setup(),d=spawn(api,'demoness',{solo:true});freeze(d);api.encounters.addEffect(d,'smoke',player.position);api.abilities.cast(d,'demoness_bolts',{target:player.entity_id});tick(3);const before=JSON.stringify(api.physics.savePhysicsState()),resume=engine.pause('boss');tick(40);engine.render(.5);assert.equal(JSON.stringify(api.physics.savePhysicsState()),before);resume();const id=d.entity_id;restore(api);assert.equal(api.encounters.getEffects()[0].data.owner_id,id);engine.retainEntity(api.elements.fetchEntity(id));await engine.loadLevel('b');assert.equal(api.encounters.getEffects().length,0);assert.equal(api.elements.fetchEntity(id).data.ability_action_state,null);engine.dispose();
});
test('invalid saved pattern clocks and boss/elite state fail without retaining a body',async()=>{
 const {engine,api}=await setup(),before=api.physics.getStatistics().bodies;assert.throws(()=>spawn(api,'demoness',{demoness_state:{}}));assert.throws(()=>spawn(api,'vesper',{warden_state:{}}));assert.throws(()=>spawn(api,'hunter',{elite:'bad'}));assert.equal(api.physics.getStatistics().bodies,before);const d=spawn(api);freeze(d);api.abilities.cast(d,'demoness_bolts',{angle:0});const state=structuredClone(d.data.ability_action_state);state.phase_started_at=999;assert.throws(()=>validateAbilityAction(state,api.physics.elements.asset_library.getResource('df:abilities').data,{clock:0}));engine.dispose();
});
test('elite modifiers apply once; armored DOT resistance and swift tuning survive snapshots',async()=>{
 const {engine,api}=await setup(),a=spawn(api,'hunter',{elite:'armored'}),b=spawn(api,'hunter',{elite:'swift'});const mass=a.mass,speed=b.data.move_speed,cooldown=b.data.dash_cooldown,before=a.hp;a.takeDamage(10,{type:'burn'});assert.equal(a.hp,before-5);const ids=[a.entity_id,b.entity_id];restore(api);assert.equal(api.elements.fetchEntity(ids[0]).mass,mass);assert.equal(api.elements.fetchEntity(ids[1]).data.move_speed,speed);assert.equal(api.elements.fetchEntity(ids[1]).data.dash_cooldown,cooldown);engine.dispose();
});
test('warded elites absorb frontal shots through native impact facing, then take rear hits',async()=>{
 const {engine,api,player,tick}=await setup(),h=spawn(api,'hunter',{elite:'warded'});freeze(h);api.abilities.getLoadout(player).learnAbility('drone_bolt');api.abilities.cast(player,'drone_bolt',{target:h.entity_id});tick(40);assert.equal(h.hp,h.maxHp);assert.equal(h.data.elite_state.ward,Math.round(h.maxHp*.6)-10);api.weapons.setCooldown(0);h.setRotation(0);api.abilities.cast(player,'drone_bolt',{target:h.entity_id});tick(40);assert.equal(h.hp,h.maxHp-10);engine.dispose();
});
test('secondary pattern channel runs alongside owned-weapon burst on the same clock and restores independently',async()=>{
 const {engine,api,player,tick}=await setup(),w=spawn(api,'vesper');freeze(w);w.warden_state.target_id=player.entity_id;tick(2);api.abilities.cast(w,'warden_burst',{target:player.entity_id});assert.ok(api.abilities.cast(w,'warden_censer',{target:player.entity_id},{channel:'secondary'}));assert.equal(w.data.ability_action_state.ability_id,'warden_burst');assert.equal(w.data.ability_secondary_state.ability_id,'warden_censer');tick(10);const id=w.entity_id,primary=structuredClone(w.data.ability_action_state),secondary=api.abilities.getActionState(w,{channel:'secondary'});restore(api);const restored=api.elements.fetchEntity(id);freeze(restored);assert.deepEqual(restored.data.ability_action_state,primary);assert.deepEqual(restored.data.ability_secondary_state,secondary);tick(25);assert.equal(restored.data.ability_action_state.phase,'burst');assert.equal(restored.data.ability_secondary_state,null);assert.ok(api.encounters.getEffects().some(effect=>effect.data.kind==='censer'));assert.equal(api.abilities.cast(restored,'warden_censer',{target:api.session.player.entity_id},{channel:'secondary'}),false);engine.dispose();
});
test('secondary channel is reusable by player and rejects unsupported actions without changing primary cooldown',async()=>{
 const {engine,api,player,tick}=await setup();api.abilities.getLoadout(player).learnAbility('warden_hymn');api.abilities.getLoadout(player).learnAbility('demoness_bolts');const cooldown=api.weapons.cooldown_seconds;assert.ok(api.abilities.cast(player,'warden_hymn',{angle:0},{channel:'secondary'}));assert.equal(api.weapons.cooldown_seconds,cooldown);assert.throws(()=>api.abilities.cast(player,'demoness_bolts',{angle:0},{channel:'secondary'}));assert.equal(api.abilities.cancelAction(player,{channel:'secondary'}),true);tick();assert.equal(player.data.ability_secondary_state,null);engine.dispose();
});
test('only a Warden holding the firing line extends its burst while squadmates reload; extensions survive save',async()=>{
 const {engine,api,player,tick}=await setup(),a=spawn(api,'vesper'),b=spawn(api,'matins',{},[740,800]);for(const actor of [a,b]){freeze(actor);actor.warden_state.target_id=player.entity_id;}tick(2);api.abilities.cast(a,'warden_burst',{target:player.entity_id});api.abilities.cast(b,'warden_burst',{target:player.entity_id});api.abilities.cancelAction(b);tick(90);assert.ok(a.data.ability_action_state.extensions>=1);const state=structuredClone(a.data.ability_action_state),id=a.entity_id;restore(api);assert.deepEqual(api.elements.fetchEntity(id).data.ability_action_state,state);engine.dispose();
});
test('decoys use explicitly registered reduced attacks and cannot inherit the full duel loadout',async()=>{
 const {engine,api,player,tick}=await setup(),d=spawn(api,'demoness',{decoy:true},[545,500]);freeze(d);assert.equal(d.clawAttackId,'demoness_decoy_claw');assert.deepEqual(d.data.abilities.known_ids,['demoness_decoy_claw','demoness_decoy_whip']);api.abilities.cast(d,d.clawAttackId,{target:player.entity_id});tick(5);assert.equal(player.hp,9994);engine.dispose();
});
test('holstering interrupts both pattern channels before they can emit an attack or field',async()=>{
 const {engine,api,player,tick}=await setup();for(const id of ['demoness_bolts','warden_hymn'])api.abilities.getLoadout(player).learnAbility(id);api.abilities.cast(player,'demoness_bolts',{angle:0});api.abilities.cast(player,'warden_hymn',{angle:0},{channel:'secondary'});api.weapons.setHolstered(true);tick(50);assert.equal(player.data.ability_action_state,null);assert.equal(player.data.ability_secondary_state,null);assert.equal(api.encounters.getEffects().length,0);assert.equal(api.elements.getEntities({entity_type:'projectile'}).length,0);engine.dispose();
});
