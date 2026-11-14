import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameRuntime } from '../src/game/boot/game-runtime.mjs';
import { createGameAssetLibrary } from '../src/game/data/game-assets.mjs';
import { gameEngine } from '../src/engine/lobby/runtime/game-engine.mjs';
import { gameLevel } from '../src/engine/lobby/runtime/game-level.mjs';
import { gameSession } from '../src/game/mechanics/game-session.mjs';
import { PlayerStateSystem } from '../src/game/mechanics/player-state-system.mjs';
import { Player } from '../src/game/entities/player.mjs';
import rules from '../src/game/data/game-player-rules.json' with {type:'json'};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
class Room extends gameLevel {}
async function ready(){const engine=createGameRuntime({schedule_frame:null});engine.registerLevel('a',Room).registerLevel('b',Room);await engine.loadLevel('a');engine.start();return engine;}
const steps=(engine,n)=>{for(let i=0;i<n;i++)engine.updateState();};
const tap=(engine,key)=>{engine.api.controls.setInput('keyboard',key,true);engine.updateState();engine.api.controls.setInput('keyboard',key,false);};

test('Directory installs exactly one official persistent player and shared services, without copying physical or health state',async()=>{
 const e=await ready(),{session}=e.api,p=session.player,body=p.body,grid=e.api.physics.spatial_grid;
 assert.ok(p instanceof Player);assert.equal(e.api.physics.getStatistics().bodies,1);
 assert.equal(p.hp,100);assert.equal(p.maxHp,100);assert.equal(p.attunement,120);
 const snapshot=session.snapshot();assert.equal(snapshot.player_entity_id,p.entity_id);assert.ok(!('health' in snapshot));assert.ok(!('position' in snapshot));
 p.takeDamage(35);p.addBuff('tea',{duration_seconds:8,modifiers:{speed:{multiply:1.5}}});
 await e.loadLevel('b');assert.equal(session.player,p);assert.equal(p.body,body);assert.equal(e.api.physics.spatial_grid,grid);assert.equal(p.hp,65);assert.equal(p.getStat('speed',10),15);assert.equal(e.api.physics.getStatistics().bodies,1);e.dispose();
});
test('session records have explicit validated mutations and snapshots cannot mutate live records',()=>{
 const s=new gameSession();let changed=0;const unsubscribe=s.on('session:changed',()=>changed++);
 assert.equal(s.changeCurrency(20),20);assert.equal(s.items.grantItem('consumable:bubbleTea',{quantity:2}).quantity,2);s.setRecord('quests','search',{stage:2});
 const snapshot=s.snapshot();snapshot.quests.search.stage=99;assert.equal(s.getRecord('quests','search').stage,2);
 assert.throws(()=>s.changeCurrency(-21));assert.throws(()=>s.items.grantItem('consumable:bubbleTea',{quantity:-3}));assert.throws(()=>s.items.grantItem('__proto__'));assert.throws(()=>s.setRecord('roster','friend',{hp:Infinity}));assert.throws(()=>s.setRecord('inventory','stims',9));
 assert.equal(changed,3);unsubscribe();s.changeCurrency(1);assert.equal(changed,3);
 assert.deepEqual(new gameSession({state:s.snapshot()}).snapshot(),s.snapshot());
});
test('keyboard intent uses native motor, sneak toggles once per press and blocks compose without stale held actions',async()=>{
 const e=await ready(),p=e.api.session.player,c=e.api.controls,system=e.api.player_controls;
 c.setInput('keyboard','d',true);steps(e,15);assert.ok(p.position[0]>20);
 tap(e,'c');assert.equal(p.sneaking,true);near(e.api.player_state.movement_speed,rules.movement_speed*.55);
 const menu=system.block('menu'),dialogue=system.block('dialogue');const before=p.position[0];steps(e,30);assert.ok(p.position[0]-before<80);
 menu();c.setInput('keyboard','e',true);let interactions=0;e.api.session.on('player:interact',()=>interactions++);e.updateState();assert.equal(interactions,0);
 dialogue();e.updateState();assert.equal(interactions,0);c.setInput('keyboard','e',false);tap(e,'e');assert.equal(interactions,1);e.dispose();
});
test('fire is a held gameplay intent, interact is an edge, and disabled or mounted players cannot produce either',async()=>{
 const e=await ready(),{session,controls}=e.api,p=session.player;let fire=0,interact=0;
 session.on('player:fire',()=>fire++);session.on('player:interact',()=>interact++);
 controls.setInput('keyboard','space',true);controls.setInput('keyboard','e',true);steps(e,3);assert.equal(fire,3);assert.equal(interact,1);
 p.isHidden=true;steps(e,3);assert.equal(fire,3);p.isHidden=false;
 const car=e.createEntity({entity_type:'vehicle',position:[100,100]});e.api.physics.attachBody(p,{parent_body:car});steps(e,3);assert.equal(fire,3);assert.equal(interact,1);e.dispose();
});
test('damage, healing, death and native impulses have one health owner and explicit events',async()=>{
 const e=await ready(),{session}=e.api,p=session.player;const events=[];
 for(const name of ['player:damaged','player:healed','player:died'])session.on(name,event=>events.push(event));
 const speed=p.linear_velocity[0];assert.equal(p.takeDamage(20,{impulse:[15,0]}),true);assert.ok(p.linear_velocity[0]>speed);assert.equal(p.hp,80);
 assert.equal(p.heal(5),5);p.makeInvulnerable(.1);assert.equal(p.takeDamage(10),false);assert.equal(p.takeDamage(10,{bypass_invulnerability:true}),true);
 assert.throws(()=>p.takeDamage(-1));assert.throws(()=>p.heal(NaN));p.takeDamage(999,{bypass_invulnerability:true});assert.equal(p.hp,0);assert.equal(p.dead,true);assert.equal(p.heal(100),0);assert.equal(p.takeDamage(5),false);
 assert.deepEqual(events.map(e=>e.event),['player:damaged','player:healed','player:damaged','player:damaged','player:died']);assert.equal(events.at(-2).amount,75);e.dispose();
});
test('regeneration and buff durations advance once per fixed step, stop while paused, and damage restarts the delay',async()=>{
 const e=await ready(),p=e.api.session.player;
 p.takeDamage(40);p.addBuff('tea',{duration_seconds:1,modifiers:{speed:{add:10,multiply:2}}});assert.equal(p.getStat('speed',20),60);
 steps(e,30);const state=structuredClone(p.data.player_state),resume=e.pause('inventory');steps(e,120);assert.deepEqual(p.data.player_state,state);resume();
 steps(e,30);assert.equal(p.getStat('speed',20),20);steps(e,540);assert.equal(p.hp,65);
 p.takeDamage(5);steps(e,599);assert.equal(p.hp,60);steps(e,1);assert.equal(p.hp,65);steps(e,60);assert.equal(p.hp,70);e.dispose();
});
test('Flit uses native bounded placement, spends only successful landings and protects during the active interval',async()=>{
 const e=await ready(),p=e.api.session.player,state=e.api.player_state;
 const narrow={left:0,top:0,right:10,bottom:10};assert.equal(state.tryFlit({placement_bounds:narrow}),false);assert.equal(p.attunement,120);
 const grid=e.api.physics.spatial_grid;assert.equal(state.tryFlit({direction:[1,0]}),true);near(p.position[0],120);assert.equal(p.attunement,80);assert.equal(p.takeDamage(10),false);assert.equal(state.tryFlit(),false);
 steps(e,15);assert.equal(p.flitting,false);assert.equal(p.takeDamage(10),true);assert.equal(e.api.physics.spatial_grid,grid);
 // A zero-length direction is a rejected landing, not an attunement sink.
 const energy=p.attunement;assert.equal(state.tryFlit({direction:[0,0]}),false);assert.equal(p.attunement,energy);e.dispose();
});
test('respawn changes gameplay and native placement only on success and preserves the original body',async()=>{
 const e=await ready(),p=e.api.session.player,body=p.body;
 p.takeDamage(100);p.addBuff('burden',{duration_seconds:30,modifiers:{speed:{multiply:.5}}});
 assert.equal(e.api.player_state.respawn({position:[0,0],placement_bounds:{left:0,top:0,right:10,bottom:10}}),false);assert.equal(p.dead,true);
 assert.equal(e.api.player_state.respawn({position:[200,200]}),true);assert.equal(p.body,body);assert.deepEqual(p.position,[200,200]);assert.equal(p.hp,100);assert.equal(p.attunement,120);assert.equal(p.getStat('speed',10),10);e.dispose();
});
test('native player gameplay data round trips with physical snapshots and reconnects by official entity ID without a surrogate',()=>{
 const source=createGameRuntime({schedule_frame:null}),p=source.api.session.player;
 p.takeDamage(30);p.addBuff('tea',{duration_seconds:20,modifiers:{speed:{multiply:2}}});source.api.items.grantItem('consumable:bubbleTea',{quantity:3});
 const physical=source.api.physics.savePhysicsState(),saved=source.api.session.snapshot();source.dispose();
 const session=new gameSession({state:saved}),e=new gameEngine({schedule_frame:null,asset_library:createGameAssetLibrary(),services:{session}});
 e.api.elements.registerEntityType(Player.entity_type,Player);e.api.physics.loadPhysicsState(physical);
 const restored=e.api.elements.fetchEntity(saved.player_entity_id),body=restored.body;
 e.registerSystem('session',session);e.registerSystem('player-state',new PlayerStateSystem({session,rules}));
 assert.equal(session.player,restored);assert.equal(restored.body,body);assert.equal(e.api.physics.getStatistics().bodies,1);assert.equal(restored.hp,70);assert.equal(restored.getStat('speed',10),20);assert.equal(session.items.findItem('consumable:bubbleTea').quantity,3);
 let hit=false;session.on('player:damaged',()=>hit=true);restored.takeDamage(5);assert.equal(hit,true);assert.equal(restored.hp,65);e.dispose();
});
test('bad session/player snapshots reject and cannot silently spawn a replacement player',()=>{
 const saved=new gameSession().snapshot();saved.player_entity_id=999;
 assert.throws(()=>createGameRuntime({schedule_frame:null,session_state:saved}),/Failed to attach/);
 const e=createGameRuntime({schedule_frame:null}),p=e.api.session.player;p.data.player_state.flit_remaining=NaN;
 assert.throws(()=>p.initializeState(rules),/finite JSON/);e.dispose();
 assert.throws(()=>new gameSession({state:{...new gameSession().snapshot(),health:90}}),/Unsupported/);
});
test('gameplay conversion has no legacy host, DOM, Canvas, private grid or collision math dependency',()=>{
 for(const path of ['game/entities/player.mjs','game/mechanics/game-session.mjs','game/mechanics/player-state-system.mjs','game/mechanics/player-control-system.mjs']){
  const code=readFileSync(new URL(`../src/${path}`,import.meta.url),'utf8');
  assert.doesNotMatch(code,/engineMixin|GameEngine|document\.|window\.|getContext\(|Math\.(atan2|hypot|sin|cos)|new (?:Spatial|spatial)|CollisionSystem|\.playerHealth/);
 }
 assert.throws(()=>new gameEngine({services:{physics:{}}}),/must not replace/);
});

test('ability requests cannot consume energy while paused or mutate physical state during rendering',async()=>{
 const e=await ready(),p=e.api.session.player,resume=e.pause('menu');
 assert.equal(e.api.player_state.tryFlit(),false);assert.equal(p.attunement,120);resume();
 e.registerSystem('invalid-render',{render(){e.api.player_state.tryFlit();}});
 assert.throws(()=>e.render(),/gameplay boundary/);assert.equal(p.attunement,120);assert.equal(e.running,false);e.dispose();
});

test('logical Flit bindings request one ability per press and stale presses cannot cross a level boundary',async()=>{
 const e=await ready(),p=e.api.session.player,input=e.api.controls;let flits=0;e.api.session.on('player:flitted',()=>flits++);
 input.setInput('keyboard','Shift',true);steps(e,30);assert.equal(flits,1);near(p.position[0],rules.flit.distance);
 await e.loadLevel('b');steps(e,2);assert.equal(flits,1);
 input.setInput('keyboard','Shift',false);tap(e,'Shift');assert.equal(flits,2);near(p.position[0],rules.flit.distance*2);e.dispose();
});
