import test from 'node:test';
import assert from 'node:assert/strict';
import {physicsSystem} from '../index.mjs';
test('resolveAim and projectiles share target, angle, direction and zero-heading validation',()=>{
 const world=new physicsSystem(),actor=world.createCharacter({position:[20,20],rotation:1}),target=world.createCharacter({position:[20,100]});
 assert.ok(Math.abs(world.resolveAim(actor,{target}).rotation-Math.PI/2)<1e-9);assert.deepEqual(world.resolveAim(actor,{angle:0,direction:[0,1]}).direction,[1,0]);assert.throws(()=>world.resolveAim(actor,{direction:[0,0]}));assert.throws(()=>world.resolveAim(actor,{angle:NaN}));
 const shot=world.createProjectileFrom(actor,{target,speed:100});assert.ok(Math.abs(shot.linear_velocity[1]-100)<1e-9);
});
test('angle movement is native, stops at thin walls and retains zero-direction stopping semantics',()=>{
 const world=new physicsSystem(),actor=world.createCharacter({collision_shape:{shape_type:'circle',radius:5}});world.elements.createStatic({position:[40,0],collision_shape:{shape_type:'box',dimensions:[1,200]}});actor.setMovement(undefined,{angle:0,speed:540});for(let i=0;i<60;i++)world.updateState();assert.ok(actor.position[0]<=34.51);actor.setMovement([0,0]);for(let i=0;i<30;i++)world.updateState();assert.ok(Math.abs(actor.linear_velocity[0])<.01);
});
test('follow offsets are resolved in the target body frame and survive snapshots without a private grid',()=>{
 const world=new physicsSystem(),actor=world.createCharacter({position:[0,0]}),target=world.createCharacter({position:[200,0],rotation:Math.PI/2});actor.followTarget(target,{target_offset:[60,0],speed:100,arrival_distance:5});for(let i=0;i<180;i++)world.updateState();assert.ok(actor.position[1]>40);const snapshot=world.savePhysicsState();world.loadPhysicsState(snapshot);world.updateState();assert.ok(world.elements.fetchEntity(actor.entity_id).position[1]>40);assert.throws(()=>world.elements.fetchEntity(actor.entity_id).followTarget(target.entity_id,{target_offset:[NaN,0]}));
});
test('optional hit impulses respect native mounted force ownership without a game-side ancestor calculation',()=>{
 const world=new physicsSystem(),source=world.createCharacter(),parent=world.elements.createProp({position:[100,0]}),child=world.createCharacter({position:[100,10]});world.attachBody(child,{parent_body:parent});assert.equal(world.applyImpulseBetween(source,child,{strength:20,if_supported:true}),null);assert.throws(()=>world.applyImpulseBetween(source,child,{strength:20}));world.detachBody(child,{exit_points:[[0,40]]});world.attachBody(child,{parent_body:parent,combine_mass:true});assert.ok(world.applyImpulseBetween(source,child,{strength:20,if_supported:true}));assert.ok(parent.linear_velocity[0]>0);
});
