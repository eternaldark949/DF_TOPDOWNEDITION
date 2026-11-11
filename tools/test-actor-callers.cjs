'use strict';
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const env=runtime(resolve(__dirname,'../DFAB V8.html'),{affine:true});
const run=source=>structuredClone(env.run(`(()=>{${source}})()`));let passed=0;
const check=(name,source,verify)=>{verify(run(source));passed++;console.log('Passed: '+name);};
check('legacy actors use canonical shared vitals and owned NPC item instances',`
 const npc=new NPC(0,0,'Actor test','teammate',{weaponId:'pistol_fpx'});npc.takeDamage(10);const record=npc.items.getEquippedWeapon();npc.items.setItemState(record.instance_id,{ammo:7});
 const result={health:npc.vitals instanceof DFNative.actorVitals,hp:npc.hp,healthData:npc.data.health,ownHealth:['hp','maxHp','dead','invincibleTimer'].filter(k=>Object.hasOwn(npc,k)),ownEquipment:Object.hasOwn(npc,'equippedWeaponId'),definition:npc.equippedWeaponId,unique:record.instance_id!==record.definition_id};npc.destroy();return result;`,r=>assert.deepEqual(r,{health:true,hp:90,healthData:90,ownHealth:[],ownEquipment:false,definition:'pistol_fpx',unique:true}));
env.run("game.story.update=()=>{};game._doLoadMap('apt_949');game.running=true;game.paused=false;game.hud.revealAll();game.furniture.release();");
check('actual apartment companions are official NPC actors and registered with the actor service',`
 const npc=game.teammates[0];return {npc:npc instanceof DFNative.NPC,actor:npc instanceof DFNative.gameActor,player:game.player instanceof DFNative.gameActor,registered:game.actors.getActors().includes(npc),controller:!!game.weapons.getActorController(npc),retired:typeof DFNative.ApartmentCompanion,legacy:GameEntity.registry.all.length};`,r=>assert.deepEqual(r,{npc:true,actor:true,player:true,registered:true,controller:true,retired:'undefined',legacy:0}));
check('native NPC behavior and presentation never enter legacy movement or collision',`
 const saved=[];for(const [o,key] of [[ActorEntity.prototype,'update'],[CollisionSystem,'update'],[_physicsSpatial,'query']]){saved.push([o,key,o[key]]);o[key]=()=>{throw new Error('Legacy actor called');};}
 try{const npc=game.teammates[0];npc.recruited=true;npc.hireType='permanent';npc.hp=20;npc.teammateStims=3;game.update();game.update();game.draw();return {hp:npc.hp,stims:npc.teammateStims,legacy:GameEntity.registry.all.length};}finally{for(const [o,key,value] of saved)o[key]=value;}`,r=>{assert.equal(r.hp,70);assert.equal(r.stims,2);assert.equal(r.legacy,0);} );
check('typed companion equipment survives the actual save/load caller with exact item state and identity',`
 const npc=game.teammates[0];npc.equippedWeaponId='pistol_fpx';const item=npc.items.getEquippedWeapon();npc.items.setItemState(item.instance_id,{ammo:7});const expected={entity:npc.entity_id,item:item.instance_id};game.saveGame({auto:true});const loaded=game.loadGame(AUTOSAVE_KEY),restored=game.teammates.find(t=>t.entity_id===expected.entity),actual=restored.items.getEquippedWeapon();return {loaded,expected,actual:{entity:restored.entity_id,item:actual.instance_id},ammo:actual.state.ammo,controller:game.weapons.getActorController(restored).state===restored.data.weapon_state};`,r=>{assert.equal(r.loaded,true);assert.deepEqual(r.actual,r.expected);assert.equal(r.ammo,7);assert.equal(r.controller,true);} );
check('classic scene boundary transfers owned items once and destroys the departed native body',`
 const npc=game.teammates[0],name=npc.name,item=npc.items.getEquippedWeapon(),id=item.instance_id;game._doLoadMap('hotel_lobby');const legacy=game.teammates.find(t=>t.name===name),legacyId=legacy.items.getEquippedWeapon().instance_id;game._doLoadMap('apt_949');const restored=game.teammates.find(t=>t.name===name);return {retired:npc.destroyed,id,legacyId,restoredId:restored.items.getEquippedWeapon().instance_id,ammo:restored.items.getEquippedWeapon().state.ammo,legacyBodies:GameEntity.registry.all.length};`,r=>{assert.equal(r.retired,true);assert.equal(r.legacyId,r.id);assert.equal(r.restoredId,r.id);assert.equal(r.ammo,7);assert.equal(r.legacyBodies,0);} );
check('old apartment companion snapshots migrate in place to the official NPC class',`
 const snapshot=game.activeLevel.saveState(),npc=snapshot.entities.find(t=>t.entity_type==='df_npc'),id=npc.entity_id??npc.body_id;
 npc.entity_type='df_apartment_companion';npc.data.hp=63;npc.data.maxHp=100;delete npc.data.health;delete npc.data.max_health;
 const level=new DFNative.ApartmentLevel({game_db:GAME_DB});try{level.loadState(snapshot);const restored=level.companions.find(t=>t.entity_id===id)??level.companions[0];return {native:restored instanceof DFNative.NPC,hp:restored.hp,id:restored.entity_id,expected:id,oldField:Object.hasOwn(restored.data,'hp')};}finally{level.destroy();}`,r=>{assert.equal(r.native,true);assert.equal(r.hp,63);assert.equal(r.id,r.expected);assert.equal(r.oldField,false);} );
assert.deepEqual(env.errors,[]);console.log(JSON.stringify({passed}));
