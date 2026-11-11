import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameRuntime} from '../src/directory/game-runtime.mjs';
import {gameLevel} from '../src/runtime/game-level.mjs';
import {actorVitals} from '../src/gameplay/actors/actor-vitals.mjs';
import {playerVitals} from '../src/gameplay/player-vitals.mjs';
import {gameActor} from '../src/entities/game-actor.mjs';
import {NPC} from '../src/entities/npc.mjs';
import {Ganger} from '../src/entities/ganger.mjs';
class Room extends gameLevel{}
async function setup(){const e=createGameRuntime({schedule_frame:null,actor_policy:{random:()=>.5},player:{template:'df:player_949',entity_type:'df_player',position:[100,100]}});e.registerLevel('a',Room).registerLevel('b',Room);await e.loadLevel('a');e.start();const a=e.api;return {e,a,p:a.session.player,tick:(n=1)=>{for(let i=0;i<n;i++)e.updateState();}};}
test('shared vitals are the actual health owner for actors and player extensions',()=>{const data={health:30,max_health:100},v=new actorVitals(data);v.damage(10);assert.equal(data.health,20);assert.equal(v.heal(200),80);const saved=v.snapshot();assert.throws(()=>v.load({health:101,max_health:100}));assert.deepEqual(v.snapshot(),saved);const p=new playerVitals();assert.ok(p instanceof actorVitals);p.damage(20);assert.equal(p.health,80);});
test('official NPC and Ganger inherit the same actor foundation and have one real body and owned weapon instances',async()=>{
 const {e,a}=await setup();const npc=a.actors.spawn({kind:'npc',name:'Victoria',role:'teammate',position:[50,100],data:{recruited:true,weapon_definition_id:'pistol_fpx',hireType:'permanent'}}),ganger=a.actors.spawn({kind:'ganger',position:[300,100]});assert.ok(npc instanceof NPC&&npc instanceof gameActor);assert.ok(ganger instanceof Ganger&&ganger instanceof gameActor);assert.equal(a.physics.getStatistics().bodies,3);assert.equal(npc.items.getEquippedWeapon().definition_id,'pistol_fpx');assert.equal(ganger.items.getEquippedWeapon().definition_id,'pistol_ganger');assert.notEqual(npc.items.equipped_weapon_id,ganger.items.equipped_weapon_id);assert.equal(a.weapons.getActorController(npc).state,npc.data.weapon_state);assert.equal(a.actors.getActors().length,2);e.dispose();
});
test('actor health/grace, damage attribution and defeat are centralized without physical knockback mirrors',async()=>{
 const {e,a,p,tick}=await setup();const target=a.actors.spawn({kind:'actor',position:[200,100],data:{health:100,max_health:100,damage_grace_seconds:.5}});assert.ok(target.takeDamage(10));assert.equal(target.takeDamage(10),false);assert.ok(a.combat.damage(target,20,{source_id:p.entity_id,type:'ballistic'}));assert.equal(target.hp,70);tick(30);assert.ok(target.takeDamage(10));assert.ok(a.combat.damage(target,999,{source_id:p.entity_id}));assert.equal(target.dead,true);assert.equal(target.active,false);assert.equal(target.data.last_hit.source_id,p.entity_id);assert.equal('knockbackVx' in target,false);assert.ok(target.revive());assert.equal(target.hp,100);assert.equal(target.active,true);e.dispose();
});
test('NPC follows through the existing motor, automatically heals and holds fire on neutral/friendly characters',async()=>{
 const {e,a,p,tick}=await setup();const npc=a.actors.spawn({kind:'npc',role:'teammate',position:[350,100],data:{recruited:true,weapon_definition_id:'pistol_fpx',health:20,max_health:100,hireType:'permanent'}});const civilian=a.actors.spawn({kind:'npc',position:[200,100]});tick();assert.equal(npc.hp,70);assert.equal(npc.teammateStims,2);tick(90);assert.ok(npc.position[0]<300);assert.equal(civilian.hp,5000000);assert.equal(a.physics.elements.getEntities({entity_type:'projectile'}).length,0);e.dispose();
});
test('NPC and enemy weapon controllers share one global impact listener, so each projectile damages only once',async()=>{
 const {e,a,tick}=await setup();const npc=a.actors.spawn({kind:'npc',role:'teammate',position:[50,100],data:{recruited:true,weapon_definition_id:'pistol_fpx',hireType:'permanent'}}),enemy=a.actors.spawn({kind:'ganger',position:[180,100],data:{health:1000,max_health:1000}});let fired=0,hits=0;a.session.on('weapon:fired',event=>{if(event.entity_id===npc.entity_id)fired++;});a.session.on('combat:hit',event=>{if(event.target_id===enemy.entity_id)hits++;});tick(5);assert.equal(fired,1);assert.equal(hits,1);assert.equal(enemy.hp,965);e.dispose();
});
test('permanent teammates down, stay registered and revive using checked native placement',async()=>{
 const {e,a,tick}=await setup();const npc=a.actors.spawn({kind:'npc',role:'teammate',position:[250,100],data:{recruited:true,hireType:'permanent'}});npc.takeDamage(999,{type:'ballistic'});tick();assert.equal(npc.downed,true);assert.equal(a.elements.fetchEntity(npc.entity_id),npc);a.physics.elements.createStatic({position:[250,100],collision_shape:{shape_type:'box',dimensions:[50,50]}});assert.equal(npc.revive(),false);assert.equal(npc.downed,true);assert.ok(npc.revive({position:[350,100]}));assert.equal(npc.downed,false);assert.equal(npc.hp,100);e.dispose();
});
test('ganger perception requires native cone/range/occlusion; telegraph and contact-driven shots use native bodies',async()=>{
 const {e,a,p,tick}=await setup();const ganger=a.actors.spawn({kind:'ganger',position:[200,100],rotation:Math.PI});p.hp=p.maxHp=10000;tick(120);assert.equal(ganger.state,'ALERT');assert.ok(p.hp<10000);assert.equal(ganger.data.last_hit,undefined);p.isHidden=true;tick();assert.equal(ganger.state,'SUPPRESSING');tick(100);assert.equal(ganger.state,'SEARCHING');e.dispose();
});
test('noise, stagger interruption and saved actor IDs remain real game policy with no position integration',async()=>{
 const {e,a,p,tick}=await setup();const ganger=a.actors.spawn({kind:'ganger',position:[300,100],rotation:0});p.isHidden=true;assert.equal(a.actors.hearNoise([250,100],{near_range:100}),1);assert.equal(ganger.state,'SEARCHING');assert.ok(ganger.interruptMelee());assert.equal(ganger.interruptMelee(),false);tick(40);assert.ok(ganger.interruptMelee());const id=ganger.entity_id,world=a.physics.savePhysicsState();a.physics.loadPhysicsState(world);a.weapons.reconnectGameplay();a.actors.reconnectGameplay();a.combat.reconnectGameplay();const restored=a.elements.fetchEntity(id);assert.ok(restored instanceof Ganger);assert.equal(restored.entity_id,id);assert.equal(a.actors.getActors().length,1);assert.equal(a.weapons.getActorController(restored).state,restored.data.weapon_state);e.dispose();
});
test('typed NPC inventories and equipped upgrades survive roster transfer and source destruction',async()=>{
 const {e,a}=await setup();const npc=a.actors.spawn({kind:'npc',name:'Victoria',role:'teammate',position:[250,100],data:{recruited:true,weapon_definition_id:'pistol_fpx'}});const item=npc.items.getEquippedWeapon();npc.items.setItemState(item.instance_id,{ammo:7});const saved=npc.inventory;npc.destroy();a.physics.commitCommands();const replacement=a.actors.spawn({kind:'npc',name:'Victoria',role:'teammate',position:[300,100],data:{inventory:saved,recruited:true}});assert.equal(replacement.items.getEquippedWeapon().instance_id,item.instance_id);assert.equal(replacement.items.getEquippedWeapon().state.ammo,7);e.dispose();
});
test('level changes retire actor controllers and callbacks without touching the persistent player body',async()=>{
 const {e,a,p}=await setup(),body=p.body;const npc=a.actors.spawn({kind:'npc',position:[250,100]});await e.loadLevel('b');assert.equal(npc.destroyed,true);assert.equal(a.weapons.getActorController(npc),null);assert.equal(a.actors.getActors().length,0);assert.equal(a.session.player.body,body);e.dispose();
});

test('an already queued enemy shot is discarded when melee interruption or stagger starts',async()=>{
 const {e,a,p,tick}=await setup();p.isHidden=true;const enemy=a.actors.spawn({kind:'ganger',position:[200,100]});let shots=0;a.session.on('weapon:fired',event=>{if(event.entity_id===enemy.entity_id)shots++;});a.weapons.requestActorFire(enemy,{target:[100,100]});enemy.interruptMelee();tick();assert.equal(shots,0);tick(40);a.weapons.requestActorFire(enemy,{target:[100,100]});a.combat.haymaker(enemy,{damage:20,source_id:p.entity_id});tick();assert.equal(shots,0);e.dispose();
});
test('hire duration, NPC speech and snapshot-resumed perception advance on the single runtime clock',async()=>{
 const {e,a,tick}=await setup();const npc=a.actors.spawn({kind:'npc',name:'Victoria',position:[250,100]});npc.hire({minutes:.01});npc.say('Here.',1);const resume=e.pause('test'),snapshot=a.physics.savePhysicsState();tick(30);assert.deepEqual(a.physics.savePhysicsState(),snapshot);resume();tick(40);assert.equal(npc.recruited,false);assert.equal(npc.npc_state.quip,'Here.');tick(30);assert.equal(npc.npc_state.quip,null);e.dispose();
});

test('recruited companions keep their exact body across levels, released contracts return to level lifetime',async()=>{
 const {e,a}=await setup();const companion=a.actors.spawn({kind:'npc',role:'teammate',data:{recruited:true,hireType:'permanent'},position:[250,100]}),body=companion.body;
 await e.loadLevel('b');assert.equal(a.elements.fetchEntity(companion.entity_id),companion);assert.equal(companion.body,body);assert.ok(a.weapons.getActorController(companion));
 companion.release();await e.loadLevel('a');assert.equal(companion.destroyed,true);
 const hired=a.actors.spawn({kind:'npc',position:[250,100]});hired.hire();await e.loadLevel('b');assert.equal(hired.destroyed,false);e.dispose();
});
test('an invalid actor spawn rolls back registration, weapon controller and body',async()=>{
 const {e,a}=await setup(),before=a.physics.getStatistics().bodies;assert.throws(()=>a.actors.spawn({kind:'npc',data:{npc_state:{format_version:999}}}));assert.equal(a.physics.getStatistics().bodies,before);assert.equal(a.actors.getActors().length,0);e.dispose();
});

test('Directory imports burst/accuracy/cooldown aliases once and burst shots use the shared controller clock',async()=>{
 const {e,a,tick}=await setup();const npc=a.actors.spawn({kind:'npc',role:'teammate',position:[50,100],data:{recruited:true,weapon_definition_id:'pistol_fpx',burstSize:3,burstDelay:2,accuracyMod:0,cooldown:12,shotsLeftInBurst:2}});
 a.actors.spawn({kind:'ganger',position:[180,100],data:{health:100000,max_health:100000}});
 assert.equal(npc.burstSize,3);assert.equal(npc.accuracyMod,0);assert.equal(npc.cooldown,12);assert.equal(npc.shotsLeftInBurst,2);assert.equal(Object.hasOwn(npc.data,'cooldown'),false);assert.equal(Object.hasOwn(npc.data,'burstSize'),false);
 const times=[];a.session.on('weapon:fired',event=>{if(event.entity_id===npc.entity_id)times.push(a.physics.simulation_tick);});tick(20);assert.equal(times.length,2);assert.equal(times[1]-times[0],2);assert.ok(npc.cooldown>0);e.dispose();
});
test('a projectile retains friendly-fire exclusions after its source body is removed',async()=>{
 const {e,a,tick}=await setup();const source=a.actors.spawn({kind:'npc',role:'teammate',position:[50,0],data:{weapon_definition_id:'pistol_fpx'}}),friend=a.actors.spawn({kind:'actor',position:[200,0],data:{alliance:'friendly'}}),enemy=a.actors.spawn({kind:'actor',position:[300,0],data:{alliance:'hostile'}});
 const shot=a.weapons.getActorController(source).fire({direction:[1,0]});assert.ok(shot);source.destroy();tick(20);assert.equal(friend.hp,100);assert.equal(enemy.hp,65);e.dispose();
});
