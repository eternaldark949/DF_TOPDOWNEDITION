import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameRuntime} from '../src/directory/game-runtime.mjs';
import {createAbilityCatalog} from '../src/directory/game-abilities.mjs';
import {abilityLoadout} from '../src/gameplay/abilities/ability-loadout.mjs';
import {gameLevel} from '../src/runtime/game-level.mjs';
class Room extends gameLevel{}
async function setup(){const engine=createGameRuntime({schedule_frame:null,ability_policy:{random:()=>.5},actor_policy:{random:()=>.5},player:{template:'df:player_949',entity_type:'df_player',position:[100,100]}});engine.registerLevel('a',Room).registerLevel('b',Room);await engine.loadLevel('a');engine.start();const api=engine.api;return {engine,api,player:api.session.player,tick:(n=1)=>{for(let i=0;i<n;i++)engine.updateState();}};}
const caster=(api,extra={})=>api.actors.spawn({kind:'npc',name:'Scarlet',role:'red_demon_dancer',position:[50,100],data:{recruited:true,hireType:'permanent',alliance:'friendly',...extra}});
test('authored ability definitions use engine units and immutable Directory data',()=>{
 const catalog=createAbilityCatalog();assert.deepEqual(Object.keys(catalog),['fireball','shadow_bolt','ember_burst','hunter_claw']);assert.equal(catalog.fireball.damage,50);assert.equal(catalog.fireball.speed,1080);assert.equal(catalog.fireball.radius,8);assert.equal(catalog.shadow_bolt.range,500);assert.equal(catalog.ember_burst.cooldown_seconds,25/60);assert.throws(()=>catalog.fireball.damage=1);assert.throws(()=>createAbilityCatalog({bad:{stats:{}}}));
});
test('learned abilities are canonical capabilities, with atomic validated load and explicit equip/forget',()=>{
 const data={},loadout=new abilityLoadout(data,createAbilityCatalog());assert.equal(loadout.equipped_id,null);assert.throws(()=>loadout.equipAbility('fireball'));loadout.learnAbility('fireball');loadout.equipAbility('fireball');const before=loadout.snapshot();for(const invalid of [{},{...before,known_ids:['fireball','fireball']},{...before,equipped_id:'missing'}]){assert.throws(()=>loadout.load(invalid));assert.deepEqual(loadout.snapshot(),before);}assert.equal(loadout.learnAbility('fireball'),false);assert.equal(loadout.forgetAbility('fireball'),true);assert.equal(loadout.equipped_id,null);
});
test('native red demon NPC casts Fireball through the existing projectile/body/contact pipeline exactly once',async()=>{
 const {engine,api,tick}=await setup(),npc=caster(api),target=api.actors.spawn({kind:'actor',position:[180,100],data:{alliance:'hostile'}});let casts=0,hits=0;api.session.on('ability:cast',()=>casts++);api.session.on('combat:hit',event=>{if(event.target_id===target.entity_id){hits++;assert.equal(event.type,'energy');assert.equal(event.ability_id,'fireball');}});tick(8);assert.equal(casts,1);assert.equal(hits,1);assert.equal(target.hp,50);assert.equal(npc.items.snapshot().order.length,0);assert.equal(npc.equippedAbilityId,'fireball');assert.equal(Object.hasOwn(npc.data,'equippedAbilityId'),false);engine.dispose();
});
test('native ability targeting honors authored range, shared-grid team policy and static occlusion',async()=>{
 const {engine,api,tick}=await setup(),npc=caster(api);npc.equippedAbilityId='shadow_bolt';const target=api.actors.spawn({kind:'actor',position:[500,100],data:{alliance:'hostile'}});let casts=0;api.session.on('ability:cast',()=>casts++);const wall=api.physics.elements.createStatic({position:[250,100],collision_shape:{shape_type:'box',dimensions:[5,150]}});tick(5);assert.equal(casts,0);wall.destroy();tick(25);assert.equal(casts,1);assert.equal(target.hp,80);engine.dispose();
});
test('weapon priority is preserved; changing from weapon to ability cannot bypass the single attack cooldown',async()=>{
 const {engine,api,tick}=await setup(),npc=caster(api,{weapon_definition_id:'pistol_fpx'});api.actors.spawn({kind:'actor',position:[180,100],data:{alliance:'hostile',health:1000,max_health:1000}});let weapons=0,abilities=0;api.session.on('weapon:fired',event=>{if(event.entity_id===npc.entity_id)weapons++;});api.session.on('ability:cast',()=>abilities++);tick(3);assert.equal(weapons,1);assert.equal(abilities,0);const controller=api.weapons.getActorController(npc);npc.equippedWeaponId=null;assert.equal(api.abilities.cast(npc,'fireball'),false);assert.ok(controller.cooldown_seconds>0);tick(60);assert.ok(abilities>=1);assert.equal(weapons,1);engine.dispose();
});
test('casts share attack readiness and cannot bypass holster, mounting, stagger, interruption or pause',async()=>{
 const {engine,api,tick}=await setup(),npc=caster(api),controller=api.weapons.getActorController(npc);controller.setHolstered(true);assert.equal(api.abilities.cast(npc,'fireball'),false);controller.setHolstered(false);api.combat.haymaker(npc,{damage:1});assert.equal(api.abilities.cast(npc,'fireball'),false);tick(40);const parent=api.physics.elements.createProp({position:[50,100]});api.physics.attachBody(npc,{parent_body:parent});assert.equal(api.abilities.cast(npc,'fireball'),false);api.physics.detachBody(npc,{exit_points:[[0,-50]]});const resume=engine.pause('test');assert.equal(api.abilities.requestCast(npc,'fireball'),false);assert.equal(api.abilities.cast(npc,'fireball'),false);resume();assert.ok(api.abilities.cast(npc,'fireball'));engine.dispose();
});
test('queued casts are discarded by pause, defeat, loadout changes and level departure',async()=>{
 const {engine,api,tick}=await setup(),npc=caster(api);let casts=0;api.session.on('ability:cast',()=>casts++);
 api.abilities.requestCast(npc,'fireball');const resume=engine.pause('test');resume();tick();assert.equal(casts,0);
 api.abilities.requestCast(npc,'fireball');npc.equippedAbilityId='shadow_bolt';tick();assert.equal(casts,0);
 api.abilities.requestCast(npc,'shadow_bolt');await engine.loadLevel('b');tick();assert.equal(casts,0);
 api.abilities.requestCast(npc,'shadow_bolt');npc.takeDamage(npc.maxHp,{type:'ballistic'});tick();assert.equal(casts,0);engine.dispose();
});
test('failed native launch spends no cooldown and leaves no extra physical body',async()=>{
 const {engine,api}=await setup(),npc=caster(api),count=api.physics.getStatistics().bodies;assert.throws(()=>api.abilities.cast(npc,'fireball',{direction:[NaN,0]}));assert.equal(api.physics.getStatistics().bodies,count);assert.equal(npc.cooldown,0);
 const original=api.physics.createProjectileFrom;api.physics.createProjectileFrom=()=>{throw new Error('launch rejected');};try{assert.throws(()=>api.abilities.cast(npc,'fireball'),/launch rejected/);assert.equal(npc.cooldown,0);}finally{api.physics.createProjectileFrom=original;}engine.dispose();
});
test('all abilities can be cast by the real persistent player without granting an inventory item',async()=>{
 const {engine,api,player,tick}=await setup(),loadout=api.abilities.getLoadout(player),before=api.items.snapshot();for(const id of ['fireball','shadow_bolt','ember_burst']){loadout.learnAbility(id);loadout.equipAbility(id);const shot=api.abilities.cast(player,id,{direction:[1,0]});assert.equal(shot.data.ability_id,id);assert.equal(shot.physics_system,api.physics);assert.equal(api.weapons.fire({direction:[1,0]}),false);tick(80);}assert.deepEqual(api.items.snapshot(),before);engine.dispose();
});
test('raw snapshot restores ability ownership, exact caster/projectile IDs and shared cooldown without constructors',async()=>{
 const {engine,api,tick}=await setup(),npc=caster(api);npc.equippedAbilityId='ember_burst';const shot=api.abilities.cast(npc,'ember_burst',{direction:[1,0]}),id=npc.entity_id,projectile=shot.entity_id,cooldown=npc.cooldown,snapshot=api.physics.savePhysicsState();api.physics.loadPhysicsState(snapshot);api.weapons.reconnectGameplay();api.actors.reconnectGameplay();api.abilities.reconnectGameplay();api.combat.reconnectGameplay();const restored=api.elements.fetchEntity(id);assert.equal(restored.equippedAbilityId,'ember_burst');assert.deepEqual(restored.abilities.snapshot().known_ids,['fireball','ember_burst']);assert.equal(restored.cooldown,cooldown);assert.equal(api.elements.fetchEntity(projectile).data.ability_id,'ember_burst');tick();assert.ok(restored.cooldown<cooldown);engine.dispose();
});
test('renderer cannot cast/request spells or advance their queue',async()=>{
 const {engine,api}=await setup(),npc=caster(api);let checked=false;engine.registerSystem('bad-render',{render(){assert.throws(()=>api.abilities.cast(npc,'fireball'),/Rendering/);assert.throws(()=>api.abilities.requestCast(npc,'fireball'),/Rendering/);assert.throws(()=>api.abilities.beforePhysics(),/Rendering/);checked=true;}});engine.render(1);assert.equal(checked,true);engine.dispose();
});

test('ability presentation emits renderer-neutral packets without touching attack or body state',async()=>{
 const {abilityPresentation}=await import('../src/presentation/ability-presentation.mjs');const {engine,api}=await setup(),npc=caster(api);npc.equippedAbilityId='shadow_bolt';const shot=api.abilities.cast(npc,'shadow_bolt',{direction:[1,0]}),before=api.physics.savePhysicsState(),packets=[];engine.api.camera.setView({position:[100,100]});engine.api.render.resize({width:640,height:360});new abilityPresentation().render({api},1,{submit:packet=>packets.push(packet)});assert.equal(packets.length,1);assert.equal(packets[0].material.fill,shot.data.color);assert.equal(packets[0].type,'shape');assert.deepEqual(api.physics.savePhysicsState(),before);engine.dispose();
});
