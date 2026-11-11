import test from 'node:test';
import assert from 'node:assert/strict';
import {physicsSystem} from '../index.mjs';
test('target-relative teleport leaves the requested standoff and updates the one grid immediately',()=>{
 const world=new physicsSystem(),actor=world.createCharacter({position:[0,0],collision_shape:{shape_type:'circle',radius:5}}),target=world.createCharacter({position:[200,0],collision_shape:{shape_type:'circle',radius:5}});
 assert.ok(actor.teleportToward(target,{stop_distance:70}));
 assert.deepEqual(actor.position,[130,0]);assert.ok(world.peruseNearbyEntities([130,0],{near_range:10}).some(hit=>hit.entity===actor));assert.equal(actor.teleportToward(target,{stop_distance:70}),null);
});
test('a clear landing cannot allow target-relative teleport through a thin wall',()=>{
 const world=new physicsSystem(),actor=world.createCharacter({collision_shape:{shape_type:'circle',radius:5}}),target=world.createCharacter({position:[200,0]});
 world.elements.createStatic({position:[100,0],collision_shape:{shape_type:'box',dimensions:[1,100]}});
 assert.equal(actor.teleportToward(target,{stop_distance:70}),null);assert.deepEqual(actor.position,[0,0]);
});
test('teleportToward rejects invalid distances, insufficient travel and mounted sources',()=>{
 const world=new physicsSystem(),actor=world.createCharacter(),parent=world.createVehicle({position:[0,100]});
 assert.throws(()=>actor.teleportToward([100,0],{stop_distance:-1}));assert.throws(()=>actor.teleportToward([100,0],{min_distance:NaN}));assert.equal(actor.teleportToward([100,0],{min_distance:101}),null);
 world.attachBody(actor,{parent_body:parent});assert.equal(actor.teleportToward([200,100]),null);
});
test('instant evade reuses swept side clearance and rejects invalid mode flags',()=>{
 const world=new physicsSystem(),actor=world.createCharacter({position:[100,0],collision_shape:{shape_type:'circle',radius:5}}),threat=world.createCharacter({position:[0,0],rotation:0});
 assert.throws(()=>actor.evadeBody(threat,{teleport:'yes'}));world.elements.createStatic({position:[100,20],collision_shape:{shape_type:'box',dimensions:[100,2]}});
 assert.ok(actor.evadeBody(threat,{distance:90,teleport:true}));assert.ok(actor.position[1]<20);assert.ok(world.isPlacementClear(actor,actor.position));
});
