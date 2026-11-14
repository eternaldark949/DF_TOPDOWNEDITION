// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import {physicsSystem} from '../index.mjs';
test('radial bands cover crossed radii and bounded outside regions exclude safe bodies',()=>{
 const p=new physicsSystem(),center=p.elements.createTrigger({position:[0,0],collision_shape:{shape_type:'circle',radius:1}}),safe=p.createCharacter({position:[10,0],collision_shape:{shape_type:'circle',radius:2}}),crossed=p.createCharacter({position:[60,0],collision_shape:{shape_type:'circle',radius:2}}),far=p.createCharacter({position:[600,0]});
 const band=p.queryRadialRegion(center,{radius:0,radius_to:100,previous_progress:.4,progress:.8,thickness:2});assert.equal(band.radius,80);assert.deepEqual(band.hits.map(h=>h.entity),[crossed]);const outside=p.queryRadialRegion(center,{radius:30,outside:true,limit_radius:100});assert.deepEqual(outside.hits.map(h=>h.entity),[crossed]);assert.throws(()=>p.queryRadialRegion(center,{radius:30,outside:true}));assert.throws(()=>p.queryRadialRegion(center,{radius:1,progress:2}));
});
test('relative placements resolve native facing and reject candidate paths through cover',()=>{
 const p=new physicsSystem(),source=p.createCharacter({position:[200,0],collision_shape:{shape_type:'circle',radius:8}}),anchor=p.createCharacter({position:[0,0],rotation:Math.PI/2,collision_shape:{shape_type:'circle',radius:8}});const spot=p.findRelativePlacement(source,anchor,{distance:50});assert.ok(Math.abs(spot.position[0])<1e-8);assert.equal(spot.position[1],-50);p.elements.createStatic({position:[0,-25],collision_shape:{shape_type:'box',dimensions:[100,4]}});assert.equal(p.findRelativePlacement(source,anchor,{distance:50}),null);
});
test('bounded firing placement checks native sight and path without registering a second index',()=>{
 const p=new physicsSystem(),source=p.createCharacter({position:[200,0]}),target=p.createCharacter({position:[0,0]});const before=p.getStatistics().spatial.instances;const spot=p.findFiringPlacement(source,target,{inner_range:60,near_range:100,max_candidates:12});assert.ok(spot);assert.equal(p.getStatistics().spatial.instances,before);assert.throws(()=>p.findFiringPlacement(source,target,{max_candidates:10000}));
});
test('directional impact tests use native facing and reject stationary direction',()=>{
 const p=new physicsSystem(),body=p.createCharacter({rotation:Math.PI});assert.equal(p.isDirectionInArc(body,[-1,0],{half_angle:.5}),true);assert.equal(p.isDirectionInArc(body,[1,0],{half_angle:.5}),false);assert.equal(p.isDirectionInArc(body,[0,0]),false);assert.throws(()=>p.isDirectionInArc(body,[1,0],{half_angle:-1}));
});
