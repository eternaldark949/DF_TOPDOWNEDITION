import test from 'node:test';
import assert from 'node:assert/strict';
import {physicsSystem,BODY_GROUP} from '../index.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const setup=()=>{const world=new physicsSystem(),parent=world.createVehicle({collision_shape:{shape_type:'box',dimensions:[60,30]},position:[100,100]}),child=world.createCharacter();world.attachBody(child,{parent_body:parent,local_position:[10,5],emitter:{local_position:[10,28],local_rotation:Math.PI/2,half_angle:1.48}});return {world,parent,child};};
test('mounted launch uses an authored aperture, aligns its offset muzzle and keeps body ownership',()=>{
 const {world,parent,child}=setup(),state=world.getMountedLaunchState(child,{local_position:[15,4],target:[120,250],collision_shape:{shape_type:'circle',radius:5}});assert.equal(state.allowed,true);const shot=world.createProjectileFrom(child,{local_position:[15,4],target:[120,250],speed:600,collision_shape:{shape_type:'circle',radius:5}});assert.ok(shot);assert.equal(shot.body.getState().owner_id,child.entity_id);assert.equal(world.getAttachmentState(child).parent_body_id,parent.entity_id);near(shot.linear_velocity[0]/shot.linear_velocity[1],(120-shot.position[0])/(250-shot.position[1]));assert.equal(world.getStatistics().bodies,3);
});
test('arcs rotate with the parent and opposite-window requests create no body',()=>{
 const {world,parent,child}=setup();assert.equal(world.createProjectileFrom(child,{direction:[0,-1]}),null);assert.equal(world.getStatistics().bodies,2);parent.setRotation(Math.PI/2);const good=world.getMountedLaunchState(child,{direction:[-1,0]});assert.equal(good.allowed,true);assert.equal(world.getMountedLaunchState(child,{direction:[1,0]}).reason,'outside_arc');
});
test('scenery between seat and muzzle, occupied muzzle and own-cabin placement block rather than teleporting a shot',()=>{
 const {world,child}=setup();world.elements.createStatic({position:[110,120],collision_shape:{shape_type:'box',dimensions:[20,3]}});assert.equal(world.getMountedLaunchState(child,{direction:[0,1]}).reason,'blocked_aperture');assert.equal(world.createProjectileFrom(child,{direction:[0,1]}),null);assert.equal(world.getStatistics().bodies,3);
 const other=setup();other.world.setAttachmentEmitter(other.child,{local_position:[0,0],local_rotation:Math.PI/2});assert.equal(other.world.getMountedLaunchState(other.child,{direction:[0,1]}).reason,'blocked_muzzle');
});
test('launch inherits linear and angular velocity at the actual muzzle once',()=>{
 const {world,parent,child}=setup();parent.body.setLinearVelocity([30,10]);parent.body.setAngularVelocity(2);const state=world.getMountedLaunchState(child,{local_position:[10,0],direction:[0,1]}),shot=world.createProjectileFrom(child,{local_position:[10,0],direction:[0,1],speed:100});near(shot.linear_velocity[0],30-2*(state.position[1]-parent.position[1]));near(shot.linear_velocity[1],110+2*(state.position[0]-parent.position[0]));
 world.setAttachmentEmitter(child,{...world.getAttachmentState(child).emitter,inherit_velocity:false});const no=world.createProjectileFrom(child,{direction:[0,1],speed:100});near(no.linear_velocity[0],0);near(no.linear_velocity[1],100);
});
test('disabled emitters block launch; attachment IDs and revisions survive snapshots',()=>{
 const {world,parent,child}=setup(),first=world.getAttachmentState(child);world.setAttachmentEmitter(child,{...first.emitter,enabled:false});assert.equal(world.getMountedLaunchState(child).reason,'emitter_disabled');for(const invalid of [42,[],{half_angle:-1},{inherit_velocity:'yes'}])assert.throws(()=>world.setAttachmentEmitter(child,invalid));const saved=world.savePhysicsState();world.loadPhysicsState(saved);assert.deepEqual(world.getAttachmentState(child.entity_id),{...first,revision:1,emitter:{...first.emitter,enabled:false}});world.setAttachmentEmitter(child.entity_id,first.emitter);assert.ok(world.getMountedLaunchState(child.entity_id).allowed);
});
test('launched projectiles retain normal carrier collisions after redirection, with no permanent own-car exclusion',()=>{
 const {world,parent,child}=setup(),shot=world.createProjectileFrom(child,{direction:[0,1],speed:1000,lifetime:1});assert.equal(shot.body.getState().collision_exclusions.includes(parent.body_id),false);let hits=0;world.on('projectileHit',event=>{if(event.target_entity===parent)hits++;});shot.redirectProjectile([0,-1],{owner_id:null});for(let i=0;i<5;i++)world.updateState();assert.equal(hits,1);
});

test('event-time mounted launches recheck aperture clearance at queued-command commit',()=>{
 const {world,parent,child}=setup(),trigger=world.elements.createStatic({position:[130,100]}),blocker=world.elements.createStatic({position:[500,500],collision_shape:{shape_type:'box',dimensions:[20,3]}});let shot=null;
 world.on('contactBegin',()=>{if(shot)return;blocker.setPosition([110,120]);shot=world.createProjectileFrom(child,{direction:[0,1]});});world.updateState();assert.ok(shot);world.commitCommands();assert.equal(shot.destroyed,true);assert.equal(world.getStatistics().bodies,4);
});


test('mounted clearance sweeps use the actual launch orientation for non-circular projectile shapes',()=>{
 const {world,child}=setup();world.elements.createStatic({position:[115,120],collision_shape:{shape_type:'box',dimensions:[2,5]}});
 const shape={shape_type:'box',dimensions:[20,2]};assert.equal(world.getMountedLaunchState(child,{direction:[0,1],collision_shape:shape}).allowed,true);assert.ok(world.createProjectileFrom(child,{direction:[0,1],collision_shape:shape}));
});

test('queued native target removal cancels a mounted launch without leaking a body or throwing during commit',()=>{
 const {world,child}=setup();world.elements.createStatic({position:[130,100]});const target=world.elements.createStatic({position:[110,250]});let shot=null;
 world.on('contactBegin',()=>{if(shot)return;target.destroy();shot=world.createProjectileFrom(child,{target,speed:1000});});world.updateState();assert.ok(shot);assert.doesNotThrow(()=>world.commitCommands());assert.equal(shot.destroyed,true);assert.equal(world.getStatistics().bodies,3);
});
