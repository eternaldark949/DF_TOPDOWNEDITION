import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameRuntime} from '../src/directory/game-runtime.mjs';
import {gameLevel} from '../src/runtime/game-level.mjs';
import {BODY_GROUP} from '../src/basement/physics/index.mjs';
class Room extends gameLevel{}
async function setup(policy={}){const e=createGameRuntime({schedule_frame:null,weapon_policy:{random:()=>.99,...policy},player:{template:'df:player_949',entity_type:'df_player',position:[100,100]}});e.registerLevel('a',Room);await e.loadLevel('a');e.start();const a=e.api,p=a.session.player;p.lookInDirection([1,0]);const target=(position=[180,100],data={})=>a.physics.createCharacter({template:'df:character',position,data:{health:5000,alliance:'hostile',...data},movement:{max_speed:0}});const equip=id=>{const item=a.items.findItem(id)??a.items.grantItem(id);a.items.equipItem(item.instance_id);a.weapons.setHolstered(false);a.weapons.setCooldown(0);return item;};return {e,a,p,target,equip,tick:(n=1)=>{for(let i=0;i<n;i++)e.updateState();}};}
test('Directory installs executable combat and item services in the same world and snapshots store rule state on official entities',async()=>{const {e,a,p}=await setup();assert.equal(a.items,a.session.items);assert.equal(a.weapons.state,p.data.weapon_state);assert.equal(a.physics.getStatistics().bodies,1);assert.ok(e.listSystems().includes('loot'));e.dispose();});
test('every firearm creates official projectiles, native clearance and hits consume one seconds-based cooldown',async()=>{
 for(const id of ['pistol_fpx','sniper_sara','rifle_rb98','pistol_anavia','sniper_sr86','golden_child']){const {e,a,p,target,equip,tick}=await setup();const enemy=target();equip(id);const shot=a.weapons.fire({direction:[1,0]});assert.ok(shot.body);assert.equal(shot.data.source_id,p.entity_id);assert.equal(a.weapons.fire(),false);tick(8);assert.ok(enemy.data.health<5000,id);assert.ok(a.weapons.cooldown_seconds>=0);tick(61);assert.equal(a.physics.elements.getEntities().filter(x=>x.data.role==='projectile').length,0,id);e.dispose();}
});
test('native muzzle clearance prevents spawning beyond point-blank bodies and walls, and allies do not absorb shots',async()=>{
 const {e,a,target,equip,tick}=await setup();equip('sniper_sara');const ally=target([125,100],{alliance:'friendly'}),enemy=target([180,100]);const shot=a.weapons.fire({direction:[1,0]});assert.equal(shot.position[0],100);tick(2);assert.equal(ally.data.health,5000);assert.ok(enemy.data.health<5000);e.dispose();
 const f=await setup();f.equip('pistol_fpx');f.a.physics.elements.createStatic({position:[120,100],collision_shape:{shape_type:'box',dimensions:[2,80]}});const blocked=f.target();f.a.weapons.fire({direction:[1,0]});f.tick(10);assert.equal(blocked.data.health,5000);f.e.dispose();
});
test('swept blades cut once per target, respect occlusion, bleed and heal without a private collision list',async()=>{
 const {e,a,p,target,equip,tick}=await setup();p.hp=50;const enemy=target([138,110]);equip('maiden_kukri');assert.ok(a.weapons.fire());tick(20);assert.equal(enemy.data.health,4972);assert.equal(p.hp,51);assert.equal(enemy.data.combat_state.bleed.stacks,1);tick(20);assert.equal(enemy.data.health,4969);e.dispose();
 const f=await setup();f.equip('blood_pact');const behind=f.target([155,100]);f.a.physics.elements.createStatic({position:[125,100],collision_shape:{shape_type:'box',dimensions:[2,80]}});f.a.weapons.fire();f.tick(30);assert.equal(behind.data.health,5000);assert.equal(f.p.position[0],100);f.e.dispose();
});
test('three knuckle strikes produce a haymaker, native impulse, stagger and vampiric healing',async()=>{
 const {e,a,p,target,equip,tick}=await setup();p.hp=40;equip('golden_retribution');const vamp=a.items.grantItem('vampiric_fists');a.items.equipItem(vamp.instance_id);const damage=[];
 for(let i=0;i<3;i++){const enemy=target([145,100]);a.weapons.setCooldown(0);const shot=a.weapons.fire();tick(4);damage.push(5000-enemy.data.health);assert.equal(shot.data.haymaker,i===2);if(i===2){assert.ok(enemy.data.combat_state.stagger_remaining>0);assert.ok(enemy.data.combat_state.bleed);}enemy.destroy();}
 assert.deepEqual(damage,[16,16,40]);assert.equal(p.hp,56);e.dispose();
});
test('Golden Child caps independent orbs and refreshing a full target preserves its next burn',async()=>{
 const {e,a,p,target}=await setup();const enemy=target();for(let i=0;i<4;i++)a.combat.attachOrb(enemy,{damage:8,interval_seconds:1,ticks:3,max_orbs:4,source_id:p.entity_id});a.combat.advance(.9);a.combat.attachOrb(enemy,{damage:28,interval_seconds:1,ticks:3,max_orbs:4,source_id:p.entity_id});assert.equal(enemy.data.combat_state.orbs.length,4);a.combat.advance(.1);assert.equal(enemy.data.health,4948);a.combat.advance(2);assert.equal(enemy.data.health,4844);assert.equal(enemy.data.combat_state.orbs.length,0);e.dispose();
});
test('Mirrored Glass redirects a fast incoming shot before damage, spends charge and recharges on game time',async()=>{
 const {e,a,p,target,tick}=await setup({mirror_glass:()=>true});const source=target([250,100]);const shot=a.physics.createProjectileFrom(source,{template:'df:projectile',direction:[-1,0],speed:12000,lifetime:1,data:{source_id:source.entity_id,damage:100}});tick();assert.equal(p.hp,100);assert.equal(shot.data.source_id,p.entity_id);assert.equal(shot.data.deflected,'glass');assert.ok(shot.linear_velocity[0]>0);assert.equal(a.weapons.state.shield.spent,true);tick(180);assert.equal(a.weapons.state.shield.spent,false);assert.equal(a.weapons.state.shield.charge,90);e.dispose();
});
test('loot owns the exact removed bundle, uses an official rigid body and picks up through the shared grid',async()=>{
 const {e,a,p,equip,tick}=await setup();const gun=equip('pistol_fpx'),laser=a.items.grantItem('laser_sight');a.items.attachToWeapon(gun.instance_id,laser.instance_id);a.items.setItemState(gun.instance_id,{ammo:7});const loot=a.loot.dropItem(gun.instance_id);assert.equal(loot.physics_system,a.physics);assert.equal(loot.physics_type,'rigid');assert.equal(a.items.hasInstance(gun.instance_id),false);assert.equal(a.items.hasInstance(laser.instance_id),false);assert.equal(a.loot.pickup(loot.entity_id),false);tick(30);assert.equal(loot.destroyed,true);assert.equal(a.items.getItem(gun.instance_id).state.ammo,7);assert.equal(a.items.getParentWeapon(laser.instance_id).instance_id,gun.instance_id);assert.equal(a.loot.getEntities().length,0);e.dispose();
});
test('full bags and walls preserve world ownership; successful pickup cannot create two owners',async()=>{
 const {e,a,p,equip,tick}=await setup();equip('pistol_fpx');const loot=a.loot.spawnItem('sniper_sara',{position:[120,100],delay_seconds:0});while(a.items.grantItem('pistol_fpx'));assert.equal(a.loot.pickup(loot.entity_id),false);assert.equal(loot.destroyed,false);a.items.removeItem(a.items.listItems()[0].instance_id);
 a.physics.elements.createStatic({position:[110,100],collision_shape:{shape_type:'box',dimensions:[2,80]}});assert.equal(a.loot.pickup(loot.entity_id),false);assert.equal(loot.destroyed,false);p.setPosition([140,100]);assert.ok(a.loot.pickup(loot.entity_id));assert.equal(loot.destroyed,true);assert.equal(a.loot.pickup(loot.entity_id),false);e.dispose();
});
test('native snapshots restore weapon, statuses and loot without constructors or replacement bodies',async()=>{
 const {e,a,p,target,equip}=await setup();equip('blood_pact');const enemy=target();a.combat.applyBleed(enemy,{dps:6,seconds:3,source_id:p.entity_id});const loot=a.loot.spawnItem('pistol_fpx',{position:[250,100]});a.weapons.fire();const saved=a.physics.savePhysicsState(),pid=p.entity_id,tid=enemy.entity_id,lid=loot.entity_id;a.physics.loadPhysicsState(saved);a.combat.reconnectGameplay();a.loot.reconnectGameplay();assert.equal(a.session.player.entity_id,pid);assert.equal(a.weapons.active_swing.definition_id,'blood_pact');assert.equal(a.loot.getEntities()[0].entity_id,lid);a.combat.advance(.5);assert.equal(a.elements.fetchEntity(tid).data.health,4997);e.dispose();
});

test('native quick draw fires on release after the draw, recovers, cancels stale shots across pause and control blocks',async()=>{
 const {e,a,equip,tick}=await setup();equip('sniper_sara');let shots=0;a.session.on('weapon:fired',()=>shots++);
 assert.ok(a.weapons.armQuickDraw());assert.equal(a.weapons.fire(),false);assert.ok(a.weapons.requestQuickDraw({angle:0}));tick(6);assert.equal(shots,0);tick();assert.equal(shots,1);assert.ok(a.weapons.cooldown_seconds>1);tick(10);assert.equal(a.weapons.quick_draw.phase,'ready');assert.equal(a.weapons.holstered,true);
 a.weapons.setCooldown(0);a.weapons.requestQuickDraw({angle:0});tick(2);const resume=e.pause('menu');assert.equal(a.weapons.quick_draw.phase,'ready');resume();tick(20);assert.equal(shots,1);
 a.weapons.setCooldown(0);a.weapons.requestQuickDraw({angle:0});const release=a.player_controls.block('dialogue');tick(10);release();tick(10);assert.equal(shots,1);e.dispose();
});
test('native blade reflection uses predicted engine sweeps and preserves the projectile body',async()=>{
 const {e,a,p,target,equip,tick}=await setup();equip('maiden_kukri');const mirror=a.items.grantItem('mirror_blade');a.items.equipItem(mirror.instance_id);const source=target([300,100]);a.weapons.fire();tick(2);
 const shot=a.physics.createProjectileFrom(source,{template:'df:projectile',direction:[-1,0],speed:12000,lifetime:1,data:{source_id:source.entity_id,damage:20}}),body=shot.body;tick();assert.equal(shot.data.deflected,'blade');assert.equal(shot.data.source_id,p.entity_id);assert.equal(shot.body,body);assert.ok(shot.linear_velocity[0]>0);e.dispose();
});
test('a haymaker slam is a real contact event, applies once, and cannot trigger on nearby geometry alone',async()=>{
 const {e,a,p,target,tick}=await setup();const enemy=target([180,100]);a.combat.haymaker(enemy,{damage:40,source_id:p.entity_id});tick();assert.equal(enemy.data.health,5000);
 a.physics.elements.createStatic({position:[210,100],collision_shape:{shape_type:'box',dimensions:[4,70]}});a.physics.applyImpulseBetween(p,enemy,{strength:12000});tick(10);assert.equal(enemy.data.health,4980);tick(30);assert.equal(enemy.data.health,4980);e.dispose();
});
test('loot rejects duplicate ownership and discards no item when native creation fails',async()=>{
 const {e,a,equip}=await setup();const gun=equip('pistol_fpx'),before=a.items.snapshot();const bundle={format_version:1,root_instance_id:gun.instance_id,records:[before.records[gun.instance_id]]};assert.throws(()=>a.loot.spawnBundle(bundle),/Extract/);assert.deepEqual(a.items.snapshot(),before);
 assert.throws(()=>a.loot.dropItem(gun.instance_id,{position:[NaN,0]}));assert.deepEqual(a.items.snapshot(),before);assert.equal(a.loot.getEntities().length,0);
 const loot=a.loot.dropItem(gun.instance_id,{position:[250,100]});assert.throws(()=>a.loot.spawnBundle(loot.bundle),/already present/);assert.equal(a.loot.getEntities().length,1);e.dispose();
});
test('presentation cannot fire, deal damage or advance native combat time',async()=>{
 const {e,a,p,equip}=await setup();equip('pistol_fpx');const before=a.physics.savePhysicsState(),state=a.weapons.state.elapsed;
 e.registerSystem('bad-artist',{render(){assert.throws(()=>a.weapons.fire(),/Rendering/);assert.throws(()=>a.weapons.advance(1),/Rendering/);assert.throws(()=>a.combat.damage(p,1),/Rendering/);assert.throws(()=>a.loot.advance(1),/Rendering/);}});e.render();assert.equal(a.weapons.state.elapsed,state);assert.deepEqual(a.physics.savePhysicsState(),before);e.dispose();
});

test('failed native launch does not spend a first-shot damage bonus or cooldown',async()=>{
 const {e,a,equip}=await setup({quick_draw_window:()=>2,quick_draw_multiplier:()=>2});equip('pistol_fpx');a.weapons.setHolstered(true);a.weapons.setHolstered(false);const before=structuredClone(a.weapons.state),bodies=a.physics.getStatistics().bodies;
 assert.throws(()=>a.weapons.fire({direction:[0,0]}));assert.deepEqual(a.weapons.state,before);assert.equal(a.physics.getStatistics().bodies,bodies);const shot=a.weapons.fire({direction:[1,0]});assert.equal(shot.data.damage,70);assert.equal(a.weapons.state.draw_shot_used,true);e.dispose();
});
test('short-lived gameplay lists and source files cannot hide alternate physical math or a second grid',async()=>{
 const {readFile}=await import('node:fs/promises');for(const file of ['combat/weapon-system.mjs','combat/combat-system.mjs','items/loot-system.mjs']){const source=await readFile(new URL('../src/gameplay/'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/Math\.(?:atan2|hypot|cos|sin)\(|collisionDetector|shapeKit|new spatialGrid|\.linear_velocity\s*=|\.velocity\s*=|ProjectileEntity|GameEntity\.registry/);}
});
