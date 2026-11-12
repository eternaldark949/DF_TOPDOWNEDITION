// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { physicsSystem, layoutGeometry } from '../index.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);test('authored wall openings compile into independent horizontal and vertical segments',()=>{
 const walls=[{x:0,y:0,w:100,h:8},{x:100,y:0,w:8,h:100}],source=structuredClone(walls);
 assert.deepEqual(layoutGeometry.cutWallOpenings(walls,[{x:30,y:0,w:20,h:8},{x:100,y:30,w:8,h:20}]),[{x:0,y:0,w:28,h:8},{x:52,y:0,w:48,h:8},{x:100,y:0,w:8,h:28},{x:100,y:52,w:8,h:48}]);
 assert.deepEqual(walls,source);
});
test('rotated grip selection and surface distance are computed from canonical box geometry',()=>{
 const p=new physicsSystem(),body=p.createBody({position:[100,200],rotation:Math.PI/2,collision_shape:{shape_type:'box',dimensions:[40,20]}});
 const grip=p.getBodyGrip(body,{near:[140,200],gap:5});assert.equal(grip.side,3);near(grip.position[0],115);near(grip.position[1],200);near(grip.distance,30);
 const direction=p.getBodyGrip(body,{near:[140,200],direction:[-1,0],gap:5});assert.equal(direction.side,1);near(direction.distance,30);
});
test('persistent facing can be cleared so movement-facing resumes',()=>{
 const p=new physicsSystem(),person=p.createCharacter({collision_mask:0});person.lookInDirection([0,1]);for(let i=0;i<10;i++)p.updateState();near(person.rotation,Math.PI/2);
 person.clearFacing();person.setMovement([1,0],{face_movement:true});p.updateState();near(person.rotation,0);
});
test('directional landing clips analytically to full-shape placement bounds',()=>{
 const p=new physicsSystem(),body=p.createCharacter({position:[50,50],collision_shape:{shape_type:'circle',radius:3}});
 const bounds={left:0,top:0,right:100,bottom:100};
 const landing=p.findDirectionalPlacement(body,{direction:[10,0],distance:100,placement_bounds:bounds});near(landing.position[0],97-1e-4);
 assert.equal(p.isPlacementClear(body,[101,50],{placement_bounds:bounds}),false);
 body.teleportInDirection(undefined,{angle:Math.PI/2,distance:100,placement_bounds:bounds});near(body.position[1],97-1e-4);
 const narrow={left:0,top:0,right:2,bottom:2};assert.equal(p.findDirectionalPlacement(body,{direction:[1,0],distance:100,placement_bounds:narrow}),null);
});
test('bounded clear placement rechecks the current body shape when queued commands commit',()=>{
 const p=new physicsSystem(),person=p.createCharacter({position:[100,100],collision_mask:0});p.createBody();p.createBody();
 const bounds={left:0,top:0,right:100,bottom:100};
 const drop=p.on('contactBegin',()=>{drop();person.updateBody({collision_shape:{shape_type:'circle',radius:20}});person.body.setPosition([90,90],{placement_mode:'clear',placement_bounds:bounds});});
 p.updateState();p.updateState();assert.deepEqual(person.position,[100,100]);
});
test('projectile-from-body uses barrel clearance and keeps owner identity',()=>{
 const p=new physicsSystem(),person=p.createCharacter({position:[0,0]});p.elements.createStatic({position:[8,0],collision_shape:{shape_type:'box',dimensions:[2,30]}});
 const projectile=p.createProjectileFrom(person,{local_position:[15,0],direction:[1,0],collision_shape:{shape_type:'circle',radius:1}});
 assert.deepEqual(projectile.position,[0,0]);assert.equal(projectile.body.getState().owner_id,person.body_id);
 const before=p.getStatistics();assert.throws(()=>p.createProjectileFrom(person,{target:{}}));const after=p.getStatistics();assert.equal(after.bodies,before.bodies);assert.equal(after.entities,before.entities);
});
test('explicit command commits preserve the simulation clock and reject callback reentrancy',()=>{
 const p=new physicsSystem();p.createBody();p.createBody();let created;
 const drop=p.on('contactBegin',()=>{drop();created=p.createCharacter({position:[100,100]});assert.throws(()=>p.commitCommands(),/reentrant/);});
 p.updateState();assert.equal(p.fetchBody(created.body_id),null);assert.throws(()=>p.savePhysicsState(),/pending/);
 const tick=p.simulation_tick;p.commitCommands();assert.equal(p.simulation_tick,tick);assert.equal(p.fetchBody(created.body_id),created.body);assert.ok(p.savePhysicsState());
});
test('spring force limits bound per-step impulses without position teleportation',()=>{
 const p=new physicsSystem(),body=p.createBody({position:[100,0],collision_mask:0,mass:1});
 const joint=p.createConstraint({constraint_type:'spring',body_a:body,world_target:[0,0],stiffness:300,damping:1,max_force:60});p.updateState();
 assert.ok(joint.getState().applied_impulse<=1+1e-7);assert.ok(Math.abs(body.linear_velocity[0])<=1+1e-7);assert.deepEqual(body.position,[100,0]);
});
test('nearby rescue placement checks the shared index and never returns an occupied fallback',()=>{
 const p=new physicsSystem(),person=p.createCharacter({position:[0,0],collision_shape:{shape_type:'circle',radius:2}});
 p.elements.createStatic({position:[0,0],collision_shape:{shape_type:'box',dimensions:[10,10]}});
 const landing=p.findNearbyPlacement(person,{near_range:40,spacing:10,max_samples:20});
 assert.ok(landing);assert.ok(landing.checked_samples<=20);assert.equal(p.isPlacementClear(person,landing.position),true);
 assert.equal(p.findNearbyPlacement(person,{near_range:0,fallback_position:[0,0]}),null);
 assert.deepEqual(p.findNearbyPlacement(person,{near_range:0,fallback_position:[30,0]}).position,[30,0]);
});
test('optional runtime step authority survives saves without becoming serialized configuration',()=>{
 const authority=Symbol('clock'),p=new physicsSystem({step_authority:authority});p.createCharacter();
 assert.throws(()=>p.updateState(),/owning runtime/);assert.throws(()=>p.updateState(p.config.fixed_step,Symbol('other clock')),/owning runtime/);
 assert.equal(p.simulation_tick,0);p.updateState(p.config.fixed_step,authority);
 const state=p.savePhysicsState();assert.equal(Object.hasOwn(state.config,'step_authority'),false);
 p.loadPhysicsState(state);assert.throws(()=>p.updateState(),/owning runtime/);p.updateState(p.config.fixed_step,authority);assert.equal(p.simulation_tick,2);
 assert.throws(()=>new physicsSystem({step_authority:'clock'}),/Symbol/);
});

test('directional placement rejects zero headings and enforces minimum accepted travel inside the engine',()=>{
 const p=new physicsSystem(),person=p.createCharacter({position:[50,50],collision_shape:{shape_type:'circle',radius:3}});
 assert.equal(person.teleportInDirection([0,0],{distance:100}),null);
 assert.equal(p.findDirectionalPlacement(person,{direction:[0,0],distance:100}),null);
 assert.equal(p.findDirectionalPlacement(person,{direction:[1,0],distance:100,min_distance:1,placement_bounds:{left:0,top:0,right:53.5,bottom:100}}),null);
 assert.equal(person.teleportInDirection([1,0],{distance:.5,min_distance:1}),null);
 assert.deepEqual(person.position,[50,50]);
 assert.throws(()=>p.findClearPlacement({body:person,to:[100,50],min_distance:-1}));
 const landing=p.findDirectionalPlacement(person,{direction:[1,0],distance:100,min_distance:1,placement_bounds:{left:0,top:0,right:60,bottom:100}});
 assert.ok(landing.distance>6.99&&landing.distance<7);
});
