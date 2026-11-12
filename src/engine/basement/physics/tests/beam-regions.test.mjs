// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import {physicsSystem,BODY_GROUP} from '../index.mjs';
test('native finite-width beams clip cover or penetrate explicitly through the shared grid',()=>{
 const p=new physicsSystem(),a=p.createCharacter({position:[0,0]}),b=p.createCharacter({position:[100,5]}),wall=p.elements.createStatic({position:[50,0],collision_shape:{shape_type:'box',dimensions:[5,100]}});const clipped=p.castBeamFrom(a,{range:150,width:10,angle:0});assert.ok(clipped.to[0]<50);assert.equal(clipped.hits.length,0);const beam=p.castBeamFrom(a,{range:150,width:10,angle:0,penetrating:true});assert.equal(beam.hits[0].entity,b);assert.equal(p.getStatistics().bodies,3);assert.throws(()=>p.castBeamFrom(a,{range:NaN}));assert.throws(()=>p.castBeamFrom(a,{range:1,width:0}));
});
test('local hit regions rotate with real bodies and detached motion cannot move the source',()=>{
 const p=new physicsSystem(),a=p.createCharacter({position:[10,10],rotation:Math.PI/2});const region={shape_type:'circle',radius:3,local_position:[10,0]};assert.equal(p.testBodyRegion(a,{collision_shape:region,point:[10,20]}),true);assert.equal(p.testBodyRegion(a,{collision_shape:region,point:[20,10]}),false);a.setMovement([1,0],{speed:60,acceleration:3600});p.updateState();const motion=p.getBodyMotion(a);assert.ok(motion.distance>0);motion.distance=999;assert.notEqual(p.getBodyMotion(a).distance,999);assert.throws(()=>a.setMovement([1,0],{acceleration:-1}));
});
test('annular placement bounds and direct constraint lookup require no second registry',()=>{
 const p=new physicsSystem(),a=p.createCharacter({position:[0,0]}),b=p.createCharacter({position:[200,200]});const spot=p.findWanderPlacement(a,{origin:[0,0],inner_range:100,near_range:200,radius_sample:0,angle_sample:0});assert.deepEqual(spot.position,[100,0]);assert.throws(()=>p.findWanderPlacement(a,{inner_range:201,near_range:200}));const c=p.createConstraint({constraint_type:'spring',body_a:a,body_b:b});assert.equal(p.getConstraint(c.constraint_id),c);p.removeConstraint(c);assert.equal(p.getConstraint(c),null);
});
