import test from 'node:test';
import assert from 'node:assert/strict';
import {physicsSystem} from '../index.mjs';
test('native orbit goals use stable slots and preserve elapsed phase under repeated requests/snapshots',()=>{
 const w=new physicsSystem(),target=w.createCharacter(),actor=w.createCharacter({position:[100,0]});const options={radius:100,angular_speed:.5,slot_count:2,slot_index:0,speed:90};for(let i=0;i<60;i++){actor.orbitTarget(target,options);w.updateState();}const saved=w.savePhysicsState(),record=saved.bodies.find(e=>e.body_id===actor.body_id);assert.ok(Math.abs(record.motor.intent.orbit_time-1)<1e-8);assert.ok(actor.position[1]>20);w.loadPhysicsState(saved);w.elements.fetchEntity(actor.entity_id).orbitTarget(w.elements.fetchEntity(target.entity_id),options);w.updateState();assert.ok(w.elements.fetchEntity(actor.entity_id).position[1]>20);
});
test('orbit movement respects thin walls and validates slots without modifying a valid intent',()=>{
 const w=new physicsSystem(),target=w.createCharacter({position:[200,0]}),actor=w.createCharacter({collision_shape:{shape_type:'circle',radius:5}});w.elements.createStatic({position:[40,0],collision_shape:{shape_type:'box',dimensions:[1,2000]}});actor.orbitTarget(target,{radius:100,angular_speed:0,speed:300});for(let i=0;i<60;i++)w.updateState();assert.ok(actor.position[0]<35);assert.throws(()=>actor.orbitTarget(target,{radius:100,slot_count:2,slot_index:2}));assert.throws(()=>actor.orbitTarget(target,{radius:-1}));
});

test('invalid saved orbit slots and phase reject atomically before replacing the live world',()=>{
 const w=new physicsSystem(),target=w.createCharacter(),actor=w.createCharacter({position:[100,0]});actor.orbitTarget(target,{radius:100});const before=JSON.stringify(w.savePhysicsState());for(const field of ['slot_index','orbit_time']){const state=w.savePhysicsState(),motor=state.bodies.find(b=>b.body_id===actor.body_id).motor;motor.intent[field]=field==='slot_index'?5:-1;assert.throws(()=>w.loadPhysicsState(state));assert.equal(JSON.stringify(w.savePhysicsState()),before);}
});
