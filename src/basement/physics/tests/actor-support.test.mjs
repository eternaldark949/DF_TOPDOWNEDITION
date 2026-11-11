import test from 'node:test';
import assert from 'node:assert/strict';
import {physicsSystem} from '../index.mjs';

test('repeated unchanged follow/move requests retain paths until the native replan interval',()=>{
 for(const mode of ['followTarget','moveTo']){
  const world=new physicsSystem(),actor=world.createCharacter(),target=world.createCharacter({position:[1000,0]});let searches=0;
  const find=world.findPath.bind(world);world.findPath=(...args)=>{searches++;return find(...args);};
  for(let n=0;n<60;n++){actor[mode](mode==='moveTo'?[1000,200]:target,{speed:30,arrival_distance:10});world.updateState();}
  assert.ok(searches>=3&&searches<=5,`${mode}: ${searches} searches`);assert.ok(actor.position[0]>20);
 }
});
test('a queued move then cancel remains ordered even when the committed motor was idle',()=>{
 const world=new physicsSystem(),actor=world.createCharacter(),wall=world.elements.createStatic({position:[1,0]});let called=false;
 actor.on('contactBegin',()=>{called=true;actor.moveTo([100,0]);actor.cancelMovement();});world.updateState();world.commitCommands();
 assert.equal(called,true);assert.equal(actor.getMovementState().mode,'idle');wall.destroy();
});
test('native observation reports range, cone, proximity and occlusion; prediction and wandering reuse native bodies',()=>{
 const world=new physicsSystem(),actor=world.createCharacter(),target=world.createCharacter({position:[100,0],linear_velocity:[0,20]});
 let view=world.observeTarget(actor,target,{near_range:120,fov:Math.PI/2,personal_space:110,touch_distance:10});
 assert.equal(view.in_range,true);assert.equal(view.in_cone,true);assert.equal(view.close,true);assert.equal(view.touching,false);assert.equal(view.line_clear,true);assert.deepEqual(view.direction,[1,0]);
 const wall=world.elements.createStatic({position:[50,0],collision_shape:{shape_type:'box',dimensions:[4,50]}});assert.equal(world.observeTarget(actor,target).line_clear,false);
 actor.setRotation(Math.PI);view=world.observeTarget(actor,target,{fov:Math.PI/2});assert.equal(view.in_cone,false);assert.equal(view.behind,true);
 assert.deepEqual(world.predictTargetPosition(actor,target,{projectile_speed:100}),{position:[100,20],seconds:1});
 wall.destroy();const landing=world.findWanderPlacement(actor,{near_range:20,angle_sample:0,radius_sample:1});assert.deepEqual(landing.position,[20,0]);
 assert.throws(()=>world.observeTarget(actor,target,{fov:-1}));assert.throws(()=>world.predictTargetPosition(actor,target,{projectile_speed:0}));
});

test('unreachable destinations respect the same retry interval instead of searching every step',()=>{
 const world=new physicsSystem(),actor=world.createCharacter();world.elements.createStatic({position:[100,0],collision_shape:{shape_type:'box',dimensions:[20,20]}});let searches=0;const find=world.findPath.bind(world);world.findPath=(...args)=>{searches++;return find(...args);};
 for(let n=0;n<60;n++){actor.moveTo([100,0]);world.updateState();}assert.ok(searches>=3&&searches<=5,String(searches));
});

test('saving immediately after target removal omits stale motor references without mutating live commands',()=>{
 const world=new physicsSystem(),actor=world.createCharacter(),target=world.createCharacter({position:[100,0]});actor.followTarget(target);actor.lookAtTarget(target);target.destroy();
 const before=actor.getMovementState(),snapshot=world.savePhysicsState(),motor=snapshot.bodies.find(body=>body.body_id===actor.body_id).motor;
 assert.equal(motor.intent,null);assert.equal(motor.facing,null);assert.deepEqual(actor.getMovementState(),before);world.loadPhysicsState(snapshot);world.updateState();assert.equal(world.elements.fetchEntity(actor.entity_id).getMovementState().mode,'idle');
});
