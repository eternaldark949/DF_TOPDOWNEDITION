import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, spatialGrid, BODY_GROUP } from '../index.mjs';
import { shapeBounds } from '../collision/shape.mjs';
const steps=(p,n=1)=>{for(let i=0;i<n;i++)p.updateState();};
const delta=(after,before,key)=>after[key]-before[key];
const bounds=(left,top,right,bottom)=>({left,top,right,bottom});
const ball=(p,position,extra={})=>p.createBody({position,collision_shape:{shape_type:'circle',radius:1},sleep_enabled:false,...extra});

test('bounds changes inside the same cell range create no cell memberships and unchanged updates keep the revision',()=>{
 const g=new spatialGrid({cell_size:10}),v={body_id:1};g.registerInstance(1,bounds(1,1,8,8),v);const before=g.getStatistics(),revision=g.revision;
 g.updateInstance(1,bounds(2,2,9,9));const after=g.getStatistics();assert.equal(delta(after,before,'updates'),1);assert.equal(delta(after,before,'cell_additions'),0);assert.equal(delta(after,before,'cell_removals'),0);assert.equal(g.revision,revision+1);
 g.updateInstance(1,bounds(2,2,9,9));assert.equal(g.revision,revision+1);assert.deepEqual(g.queryBounds(bounds(8.5,8.5,9,9)),[v]);
});
test('large entries move by updating only entering and leaving edge strips',()=>{
 const g=new spatialGrid({cell_size:10}),v={body_id:1};g.registerInstance(1,bounds(0,0,199,199),v);let before=g.getStatistics();assert.equal(before.cells,400);
 g.updateInstance(1,bounds(10,0,209,199));let after=g.getStatistics();assert.equal(delta(after,before,'cell_additions'),20);assert.equal(delta(after,before,'cell_removals'),20);assert.equal(after.cells,400);
 before=after;g.updateInstance(1,bounds(20,10,219,209));after=g.getStatistics();assert.equal(delta(after,before,'cell_additions'),39);assert.equal(delta(after,before,'cell_removals'),39);assert.equal(after.cells,400);
 assert.deepEqual(g.queryBounds(bounds(0,0,9,9)),[]);assert.deepEqual(g.queryBounds(bounds(215,205,219,209)),[v]);
 g.removeInstance(1);assert.equal(g.getStatistics().cells,0);assert.equal(g.getStatistics().cell_additions,g.getStatistics().cell_removals);
});
test('incremental range differences match a deterministic exhaustive oracle during resize, teleport and negative-coordinate moves',()=>{
 const g=new spatialGrid({cell_size:13}),entries=new Map();let seed=71;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const region=()=>{const x=Math.floor(random()*400)-200,y=Math.floor(random()*400)-200;return bounds(x,y,x+Math.floor(random()*65),y+Math.floor(random()*65));};
 for(let id=1;id<=40;id++){const b=region();entries.set(id,b);g.registerInstance(id,b,{body_id:id});}
 for(let i=0;i<250;i++){
  const id=1+Math.floor(random()*40),b=region();entries.set(id,b);g.updateInstance(id,b);
  const q=region(),actual=g.queryBounds(q).map(v=>v.body_id).sort((a,b)=>a-b);
  const expected=[...entries].filter(([,b])=>b.left<=q.right&&b.right>=q.left&&b.top<=q.bottom&&b.bottom>=q.top).map(([id])=>id).sort((a,b)=>a-b);
  assert.deepEqual(actual,expected);
 }
 g.clear();assert.equal(g.getStatistics().cells,0);assert.equal(g.getStatistics().cell_additions,g.getStatistics().cell_removals);
});
test('unrepresentable cell coordinates and oversized updates reject before modifying an entry',()=>{
 const g=new spatialGrid({cell_size:1}),v={body_id:1};g.registerInstance(1,bounds(0,0,1,1),v);const revision=g.revision;
 assert.throws(()=>g.updateInstance(1,bounds(1e20,0,1e20,1)),/safe integers/);assert.throws(()=>g.updateInstance(1,bounds(0,0,1e7,1)),/million/);
 assert.equal(g.revision,revision);assert.deepEqual(g.queryBounds(bounds(0,0,1,1)),[v]);
 assert.throws(()=>g.queryBounds(bounds(1e20,0,1e20,1)),/safe integers/);assert.throws(()=>g.querySegment([1e20,0],[1e20,1]),/safe integers/);
});
test('a warmed stationary world performs zero new bounds work, index writes or broadphase queries',()=>{
 const p=new physicsSystem({cell_size:16});for(let i=0;i<1000;i++)ball(p,[i*100+8,8]);steps(p);const before=p.getStatistics();steps(p,10);const after=p.getStatistics();
 assert.equal(delta(after,before,'bounds_calculations'),0);assert.equal(delta(after,before,'swept_bounds_calculations'),0);assert.equal(delta(after,before,'broadphase_builds'),0);assert.ok(delta(after,before,'broadphase_reuses')>=20);
 for(const key of ['updates','cell_additions','cell_removals','queries','candidate_visits'])assert.equal(delta(after.spatial,before.spatial,key),0,key);
});
test('static scenery does not add bounds work when one unrelated body moves',()=>{
 const p=new physicsSystem({cell_size:32});for(let i=0;i<1000;i++)ball(p,[i*100,1000],{physics_type:'static'});
 ball(p,[16,16],{linear_velocity:[10,0],continuous_collision:false});steps(p);const before=p.getStatistics();steps(p,6);const after=p.getStatistics();
 assert.equal(delta(after,before,'bounds_calculations'),6);assert.equal(delta(after,before,'swept_bounds_calculations'),6);assert.equal(delta(after,before,'narrow_checks'),0);
});
test('sleeping bodies retain indexed geometry and wake when newly registered scenery overlaps them',()=>{
 const p=new physicsSystem(),body=ball(p,[50,50]);body.sleepBody();steps(p);const before=p.getStatistics();steps(p,5);
 assert.equal(delta(p.getStatistics(),before,'bounds_calculations'),0);assert.ok(p.spatial_grid.queryBounds(bounds(49,49,51,51)).includes(body));
 ball(p,[50,50],{physics_type:'static'});steps(p);assert.equal(body.getState().sleeping,false);assert.notDeepEqual(body.position,[50,50]);
});
test('rotation and changed collision/render/light shapes invalidate only their own cached bounds',()=>{
 const p=new physicsSystem(),body=p.createBody({physics_type:'static',position:[50,50],collision_shape:{shape_type:'box',dimensions:[40,8]},render_shape:{shape_type:'circle',radius:30},light_shape:{shape_type:'circle',radius:40}});
 const before=p.getStatistics();p.updateBody(body,{mass:20,friction:0.9});assert.equal(delta(p.getStatistics(),before,'bounds_calculations'),0);
 body.setRotation(Math.PI/2);const collision=p.getBodyBounds(body);assert.deepEqual(collision,shapeBounds(body.getState().collision_shape,body.position,body.rotation));
 const afterRotation=p.getStatistics();p.updateBody(body,{light_shape:{shape_type:'circle',radius:100}});assert.equal(delta(p.getStatistics(),afterRotation,'bounds_calculations'),1);
 assert.ok(p.spatial_grid.queryBounds(bounds(140,45,145,55)).includes(body));assert.equal(p.queryEntitiesInBounds({bounds:bounds(140,45,145,55),bounds_type:'collision'}).length,0);
 p.updateBody(body,{collision_shape:{shape_type:'circle',radius:4},render_shape:null,light_shape:null});assert.deepEqual(p.getBodyBounds(body),bounds(46,46,54,54));assert.ok(!p.spatial_grid.queryBounds(bounds(140,45,145,55)).includes(body));
});
test('same-bounds collision-mask and physical-role changes invalidate candidate reuse',()=>{
 const p=new physicsSystem(),a=ball(p,[50,50],{collision_mask:0,ghost:true}),b=ball(p,[50,50],{physics_type:'static'});let begins=0,ends=0;p.on('contactBegin',()=>begins++);p.on('contactEnd',()=>ends++);
 steps(p);const gridRevision=p.spatial_grid.revision;p.updateBody(a,{collision_mask:BODY_GROUP.ALL});assert.equal(p.spatial_grid.revision,gridRevision);steps(p);assert.equal(begins,1);
 p.updateBody(a,{collision_mask:0});steps(p);assert.equal(ends,1);
 p.updateBody(a,{physics_type:'static',collision_mask:BODY_GROUP.ALL});steps(p);p.updateBody(b,{physics_type:'rigid'});steps(p);assert.equal(begins,2);
});
test('cached candidates preserve contact stay/end events without querying an unchanged grid',()=>{
 const p=new physicsSystem(),a=ball(p,[50,50],{ghost:true});ball(p,[51,50],{physics_type:'static'});const events=[];for(const name of ['contactBegin','contactStay','contactEnd'])p.on(name,()=>events.push(name));
 steps(p);const before=p.getStatistics();steps(p,3);assert.equal(delta(p.getStatistics().spatial,before.spatial,'queries'),0);assert.deepEqual(events,['contactBegin','contactStay','contactStay','contactStay']);
 a.setPosition([100,100]);steps(p);assert.equal(events.at(-1),'contactEnd');
});
test('same-cell motion invalidates an empty candidate cache and still catches a swept wall impact',()=>{
 const p=new physicsSystem({cell_size:256}),a=ball(p,[40,50]);p.createBody({physics_type:'static',position:[50,50],collision_shape:{shape_type:'box',dimensions:[1,20]}});
 steps(p);const before=p.getStatistics();a.setLinearVelocity([1000,0]);steps(p);assert.ok(a.position[0]<=48.50001,a.position);assert.ok(p.getStatistics().narrow_checks>before.narrow_checks);assert.equal(delta(p.getStatistics().spatial,before.spatial,'membership_changes'),0);
});
test('stationary attachments skip placement and geometry work but follow moved, resized and activated parents',()=>{
 const p=new physicsSystem(),parent=ball(p,[50,50],{physics_type:'static',collision_group:0}),child=ball(p,[0,0],{collision_group:0});p.attachBody(child,{parent_body:parent,local_position:[5,0]});steps(p);
 const before=p.getStatistics();steps(p,10);const after=p.getStatistics();assert.equal(delta(after,before,'attachment_placements'),0);assert.equal(delta(after,before,'bounds_calculations'),0);assert.equal(delta(after.spatial,before.spatial,'updates'),0);
 parent.setPosition([150,50]);assert.deepEqual(child.position,[155,50]);assert.ok(p.spatial_grid.queryBounds(bounds(154,49,156,51)).includes(child));
 p.deactivateBody(parent);assert.equal(p.spatial_grid.getStatistics().instances,0);p.activateBody(parent);assert.equal(p.spatial_grid.getStatistics().instances,2);
 p.setAttachmentPose(child,{local_position:[10,0]});assert.deepEqual(child.position,[160,50]);
});
test('attachment/detachment at an unchanged pose invalidates cached physical candidate membership',()=>{
 const p=new physicsSystem(),parent=ball(p,[50,50],{physics_type:'static',collision_group:0}),child=ball(p,[50,50]);ball(p,[50,50],{physics_type:'static',ghost:true});let begins=0,ends=0;p.on('contactBegin',()=>begins++);p.on('contactEnd',()=>ends++);
 steps(p);assert.equal(begins,1);p.attachBody(child,{parent_body:parent});steps(p);assert.equal(ends,1);
 assert.ok(p.detachBody(child,{exit_points:[[0,0]],inherit_velocity:false}));steps(p);assert.equal(begins,2);
});
test('public bounds and saves cannot mutate cached geometry; clear/load cannot reuse old-body pairs',()=>{
 const p=new physicsSystem(),a=ball(p,[50,50],{ghost:true});ball(p,[50,50],{physics_type:'static'});steps(p);const expected=p.getBodyBounds(a),external=p.getBodyBounds(a);external.left=-999;assert.deepEqual(p.getBodyBounds(a),expected);
 const saved=p.savePhysicsState();assert.doesNotMatch(JSON.stringify(saved),/bounds_cache|spatial_cache|sweep_cache|candidateCache|metrics/);
 const grid=p.spatial_grid;p.clearWorld();ball(p,[100,100]);steps(p);assert.equal(p.getStatistics().bodies,1);
 p.loadPhysicsState(saved);assert.equal(p.spatial_grid,grid);steps(p);assert.deepEqual(p.getBodyBounds(p.fetchBody(a.body_id)),expected);
});

test('collision motion inside an unchanged large visual extent invalidates cached physical candidates',()=>{
 const p=new physicsSystem(),a=p.createBody({physics_type:'kinematic',position:[100,100],collision_shape:{shape_type:'circle',radius:2,local_position:[10,0]},render_shape:{shape_type:'circle',radius:100}});
 ball(p,[100,110],{physics_type:'static'});let hits=0;p.on('contactBegin',()=>hits++);steps(p);const before=p.getStatistics();a.setAngularVelocity(90*Math.PI);steps(p);
 assert.ok(p.getStatistics().narrow_checks>before.narrow_checks);assert.equal(hits,1);
});
test('retiring an old sweep invalidates candidate reuse even when visual bounds keep the grid unchanged',()=>{
 const p=new physicsSystem(),a=p.createBody({physics_type:'kinematic',ghost:true,position:[100,100],collision_shape:{shape_type:'circle',radius:2,local_position:[10,0]},render_shape:{shape_type:'circle',radius:100}});
 ball(p,[110,100],{physics_type:'static'});steps(p);a.setAngularVelocity(90*Math.PI);steps(p);a.setAngularVelocity(0);const before=p.getStatistics();steps(p);
 assert.equal(delta(p.getStatistics(),before,'narrow_checks'),0);assert.ok(p.getStatistics().broadphase_builds>before.broadphase_builds);
 const stable=p.getStatistics();steps(p,3);assert.equal(delta(p.getStatistics(),stable,'broadphase_builds'),0);
});

test('mass, material and naming updates do not dirty stationary geometry or rebuild physical candidates',()=>{
 const p=new physicsSystem(),a=ball(p,[50,50],{ghost:true});ball(p,[51,50],{physics_type:'static'});steps(p);const before=p.getStatistics(),revision=p.spatial_grid.revision;
 p.updateBody(a,{mass:20,friction:0.9,name:'renamed',tags:['updated']});steps(p);const after=p.getStatistics();
 assert.equal(p.spatial_grid.revision,revision);assert.equal(delta(after,before,'bounds_calculations'),0);assert.equal(delta(after,before,'broadphase_builds'),0);
});

test('persistent candidate reuse matches an exhaustive contact oracle across changing poses, filters, shapes, activation and body lifetimes',async()=>{
 // Exhaustive pair enumeration is a test oracle only; production uses the shared grid.
 const {collisionShape,collisionDetector}=await import('../index.mjs');
 const p=new physicsSystem({cell_size:16}),live=[],observed=new Set();let seed=91;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const key=(a,b)=>`${Math.min(a,b)}:${Math.max(a,b)}`;
 for(const event of ['contactBegin','contactStay'])p.on(event,e=>observed.add(key(e.body_a.body_id,e.body_b.body_id)));
 p.on('contactEnd',e=>observed.delete(key(e.body_a.body_id,e.body_b.body_id)));
 const create=()=>ball(p,[Math.floor(random()*40),Math.floor(random()*40)],{ghost:true,continuous_collision:false,render_shape:{shape_type:'circle',radius:80}});
 for(let i=0;i<30;i++)live.push(create());
 for(let frame=0;frame<45;frame++){
  const at=Math.floor(random()*live.length),body=live[at];
  if(frame%7===0){p.removeBody(body);live[at]=create();}
  else p.updateBody(body,{position:[Math.floor(random()*40),Math.floor(random()*40)],rotation:random()*Math.PI,
   collision_shape:{shape_type:'circle',radius:1+random()*5,local_position:[random()*3,0]},
   physics_type:frame%5===0?'static':frame%11===0?'no_collision':'rigid',active:frame%9!==0,
   collision_group:1<<Math.floor(random()*3),collision_mask:Math.floor(random()*8),collision_exclusions:frame%6===0?[live[(at+1)%live.length].body_id]:[]});
  steps(p);const states=live.map(body=>body.getState()),expected=new Set();
  for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
   const a=states[i],b=states[j];
   if(!a.active||!b.active||a.physics_type==='no_collision'||b.physics_type==='no_collision'||a.physics_type==='static'&&b.physics_type==='static'
    ||!(a.collision_mask&b.collision_group)||!(b.collision_mask&a.collision_group)||a.collision_exclusions.includes(b.body_id)||b.collision_exclusions.includes(a.body_id))continue;
   if(collisionDetector.contact(new collisionShape(a.collision_shape),a,new collisionShape(b.collision_shape),b))expected.add(key(a.body_id,b.body_id));
  }
  assert.deepEqual([...observed].sort(),[...expected].sort(),`frame ${frame}`);
 }
});

test('spatial budget errors leave creation, body updates and transform commands atomic',()=>{
 const p=new physicsSystem({cell_size:1}),a=ball(p,[10,10]);steps(p);const before=p.savePhysicsState();
 assert.throws(()=>ball(p,[1e20,0]),/safe integers/);assert.throws(()=>p.createCharacter({position:[1e20,0]}));assert.equal(p.elements.getStatistics().entities,0);assert.equal(p.getStatistics().bodies,1);assert.equal(p.spatial_grid.getStatistics().instances,1);
 const state=p.savePhysicsState(); // Failed creation consumes an ID, but creates no body/index entry.
 assert.throws(()=>p.updateBody(a,{position:[1e20,0]}),/safe integers/);assert.deepEqual(p.savePhysicsState(),state);
 assert.throws(()=>a.setPosition([1e20,0]),/safe integers/);assert.deepEqual(p.savePhysicsState(),state);
 assert.throws(()=>p.updateBody(a,{collision_shape:{shape_type:'box',dimensions:[1e8,1e8]}}),/million/);assert.deepEqual(p.savePhysicsState(),state);
 assert.deepEqual(a.position,before.bodies[0].position);steps(p);assert.ok(p.spatial_grid.queryBounds(bounds(9,9,11,11)).includes(a));
});

test('segments ending at grid corners never step beyond an axis that already reached its final cell',()=>{
 const grid=new spatialGrid({cell_size:10}),body={body_id:1};grid.registerInstance(1,bounds(-1,-1,1,1),body);
 for(const [from,to] of [[[8,-8],[0,0]],[[0,0],[8,-8]],[[-8,8],[0,0]],[[0,0],[-8,8]]]){
  const before=grid.getStatistics().query_cells;assert.ok(grid.querySegment(from,to).includes(body));assert.ok(grid.getStatistics().query_cells-before<10);
  assert.ok(grid.querySweep({from,to,radius:1}).includes(body));
 }
});
