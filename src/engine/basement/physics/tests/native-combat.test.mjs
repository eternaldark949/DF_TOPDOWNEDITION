// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import {physicsSystem,BODY_GROUP} from '../index.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('native launch and redirection resolve target, offsets, reverse heading and owner validation',()=>{
 const w=new physicsSystem(),owner=w.createCharacter({position:[0,0]}),target=w.createCharacter({position:[100,0]});
 const p=w.createProjectileFrom(owner,{direction:[1,0],angle_offset:Math.PI/2,speed:60});near(p.linear_velocity[0],0);near(p.linear_velocity[1],60);
 p.redirectProjectile(undefined,{target,owner_id:target.entity_id});near(p.linear_velocity[0],60);near(p.linear_velocity[1],0);
 p.redirectProjectile(undefined,{reverse:true});near(p.linear_velocity[0],-60);
 const state=p.getState();assert.throws(()=>p.redirectProjectile([0,0]));assert.deepEqual(p.getState(),state);assert.throws(()=>p.redirectProjectile([1,0],{owner_id:999}));assert.deepEqual(p.getState(),state);
});
test('local swept geometry transforms and occlusion are resolved by the engine using its existing grid',()=>{
 const w=new physicsSystem(),owner=w.createCharacter({position:[100,100],rotation:Math.PI/2}),enemy=w.createCharacter({position:[100,140]});
 const query={collision_shape:{shape_type:'capsule',points:[[0,0],[24,0]],radius:2},from_local_position:[16,0],include_groups:BODY_GROUP.CHARACTER,line_of_sight:true};
 const hit=w.sweepAttachedShape(owner,query);assert.equal(hit[0].entity,enemy);w.elements.createStatic({position:[100,125],collision_shape:{shape_type:'box',dimensions:[50,2]}});assert.equal(w.sweepAttachedShape(owner,query).length,0);
});
test('predicted local shape casts find a projectile crossing cells in the next step without advancing it',()=>{
 const w=new physicsSystem({cell_size:16}),owner=w.createCharacter({position:[0,0]}),shot=w.createProjectile({position:[200,0],direction:[-1,0],speed:12000,collision_shape:{shape_type:'circle',radius:1}}),before=shot.position;
 const hits=w.sweepAttachedShape(owner,{collision_shape:{shape_type:'circle',radius:10},include_groups:BODY_GROUP.PROJECTILE,predict_seconds:1/60});assert.equal(hits[0].entity,shot);assert.deepEqual(shot.position,before);assert.equal(w.simulation_tick,0);
});
test('checked advance stops at thin obstacles; directed impulses are calculated once by native mass response',()=>{
 const w=new physicsSystem(),owner=w.createCharacter({position:[0,0],collision_shape:{shape_type:'circle',radius:2}});w.elements.createStatic({position:[8,0],collision_shape:{shape_type:'box',dimensions:[1,20]}});
 const distance=w.advanceBody(owner,{distance:20});assert.ok(distance>5&&distance<6);assert.equal(w.advanceBody(owner,{distance:20,direction:[0,0]}),0);
 const prop=w.elements.createProp({position:[owner.position[0],10],mass:2});w.applyImpulseBetween(owner,prop,{strength:20});near(prop.linear_velocity[0],0);near(prop.linear_velocity[1],10);
});
test('pre-contact rules redirect before impact and ignore selected contacts without a second collision implementation',()=>{
 const w=new physicsSystem(),defender=w.createCharacter({position:[40,0]}),source=w.createCharacter({position:[100,0]});let hits=0,redirects=0;
 w.on('projectileHit',()=>hits++);w.on('projectileRedirected',()=>redirects++);
 const off=w.onProjectileContact(event=>event.target_entity===defender?{action:'redirect',target:source,owner_id:defender.entity_id}:null);
 const shot=w.createProjectileFrom(source,{direction:[-1,0],speed:6000,lifetime:1,impact_strength:100});w.updateState();assert.equal(hits,0);assert.equal(redirects,1);assert.ok(shot.linear_velocity[0]>0);near(defender.linear_velocity[0],0);off();w.updateState();assert.equal(hits,1);
});

test('scheduled interceptions round trip and an earlier wall wins travel order',()=>{
 const world=new physicsSystem(),source=world.createCharacter({position:[100,0]}),shot=world.createProjectileFrom(source,{direction:[-1,0],speed:6000,lifetime:1});
 shot.redirectProjectile(undefined,{at_fraction:.8,target:[100,0],owner_id:source.entity_id,min_lifetime:.75});const saved=world.savePhysicsState();const copy=new physicsSystem();copy.loadPhysicsState(saved);const restored=copy.elements.fetchEntity(shot.entity_id);copy.updateState();assert.ok(restored.linear_velocity[0]>0);near(restored.position[0],20);
 world.elements.createStatic({position:[60,0],collision_shape:{shape_type:'box',dimensions:[2,60]}});let redirects=0;world.on('projectileRedirected',()=>redirects++);world.updateState();world.commitCommands();assert.equal(shot.destroyed,true);assert.equal(redirects,0);
});

test('an interception outlives a removed deflector without retaining or recreating its body',()=>{
 const w=new physicsSystem(),owner=w.createCharacter({position:[100,0]}),shot=w.createProjectile({position:[0,0],direction:[1,0],speed:60});shot.redirectProjectile(undefined,{at_fraction:.5,target:[0,0],owner_id:owner.entity_id});owner.destroy();const saved=w.savePhysicsState(),restored=new physicsSystem();restored.loadPhysicsState(saved);let newOwner=99;restored.on('projectileRedirected',event=>newOwner=event.owner_id);restored.updateState();assert.equal(newOwner,null);assert.equal(restored.getStatistics().bodies,1);assert.ok(restored.elements.fetchEntity(shot.entity_id).linear_velocity[0]<0);
});
