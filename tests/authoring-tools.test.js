/** Shared authoring mechanisms: quaternion composition, bounds, and incremental world ownership. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eulerRotation, rotateVector } from '../engine/basement/rotation.js';
import { RotationGesture, rotationAxis, rayPlane, planeBasis } from '../engine/basement/rotation-gesture.js';
import { assetBounds } from '../engine/basement/asset-bounds.js';
import { World, Identities } from '../engine/basement/world.js';
import { SceneInstance } from '../engine/directory/scene-instance.js';
import { assembly } from '../engine/penthouse/assembly.js';
import { ATRIUM_PROJECT, cloneAtriumEntity } from '../examples/atrium/project.js';
import { ProjectDocument } from '../engine/basement/document.js';
import { copyData } from '../engine/basement/project.js';

/** Local and world axes must genuinely differ after an initial tilt, while keeping unit length. */
test('rotation dial unwraps turns, snaps angles and composes in the selected coordinate space',()=>{
 const start=eulerRotation(0,Math.PI/2,0),local=new RotationGesture(start,'z','local',0),world=new RotationGesture(start,'z','world',0);
 const a=local.update(Math.PI/2,15),b=world.update(Math.PI/2,15),x=[0,0,0],y=[0,0,0];rotateVector(a,1,0,0,x);rotateVector(b,1,0,0,y);assert.ok(Math.hypot(...x.map((v,i)=>v-y[i]))>1);
 assert.ok(Math.abs(Math.hypot(...a)-1)<1e-10);
 const rounded=start.map(n=>n*.999999),normalized=new RotationGesture(rounded,'y','local',0).update(0);assert.ok(Math.abs(Math.hypot(...normalized)-1)<1e-10);
 const gesture=new RotationGesture([0,0,0,1],'z','world',170*Math.PI/180);
 const snapped=gesture.update(-170*Math.PI/180,15);assert.ok(Math.abs(snapped[2]-Math.sin(15*Math.PI/360))<1e-10);
 gesture.update(-90*Math.PI/180);gesture.update(0);gesture.update(Math.PI/2);gesture.update(Math.PI);assert.ok(gesture.total>Math.PI);
 assert.throws(()=>rotationAxis(start,'w','local'));
});
/** The ring's pick plane and its generated basis agree even for tilted local axes. */
test('rotation ray/plane queries reject parallel views and preserve an orthonormal ring basis',()=>{
 const normal=rotationAxis(eulerRotation(.4,.6,.2),'y','local'),[u,v]=planeBasis(normal);
 assert.ok(Math.abs(u.reduce((s,n,i)=>s+n*normal[i],0))<1e-10);assert.ok(Math.abs(u.reduce((s,n,i)=>s+n*v[i],0))<1e-10);
 assert.equal(rayPlane({origin:[0,0,1],direction:[1,0,0]},[0,0,0],[0,0,1]),null);
 assert.deepEqual(rayPlane({origin:[2,3,5],direction:[0,0,-1]},[0,0,2],[0,0,1]),[2,3,2]);
});
/** Placement uses hierarchy geometry rather than assuming every source pivot is at ground zero. */
test('assembly ground placement includes nested rotated parts without constructing runtime entities',()=>{
 const asset={parts:[{parent:null,position:[0,0,0],rotation:eulerRotation(Math.PI/2,0,0),shape:null},{parent:0,position:[0,2,0],rotation:[0,0,0,1],shape:{size:[2,4,2]}}]};
 const bounds=assetBounds(asset);assert.ok(Math.abs(bounds.min[2])<1e-10);assert.ok(Math.abs(bounds.max[2]-4)<1e-10);
 const planter=ATRIUM_PROJECT.assets.find(a=>a.name==='Planter');assert.equal(assetBounds(planter).min[2],-.55);
});
/** Adding/removing/undoing must leave unrelated runtime identities and colliders in place. */
test('topology reconciliation retains unchanged trees and cleans removed picking/collision membership',()=>{
 const project=copyData(ATRIUM_PROJECT),scene=project.scenes[0],world=new World('test',new Identities()),directory={create:(_name,args)=>assembly(args)};
 const live=new SceneInstance(directory,world,project,scene),original=scene.entities.find(e=>e.tag==='planter'),unrelated=scene.entities.find(e=>e.tag==='prop');
 const unaffected=live.root(unrelated.id),originalRoot=live.root(original.id),initialSize=world.entities.size,initialColliders=live.colliders.length;
 const clone=cloneAtriumEntity(copyData(original));clone.id='test:copy';clone.position[0]+=2;scene.entities.push(clone);live.apply(scene,project);
 assert.equal(live.root(unrelated.id),unaffected);assert.equal(live.root(original.id),originalRoot);assert.equal(live.colliders.length,initialColliders+1);assert.ok(world.entities.size>initialSize);
 const removedPart=live.instances.get(clone.id).parts[0];scene.entities.pop();live.apply(scene,project);assert.equal(live.idFor(removedPart),undefined);assert.equal(world.entities.size,initialSize);assert.equal(live.colliders.length,initialColliders);
 scene.entities.push(clone);live.apply(scene,project);assert.equal(live.root(unrelated.id),unaffected);assert.notEqual(live.instances.get(clone.id).parts[0],removedPart);
 const anchor=copyData(scene.entities.find(e=>e.tag==='lantern'));assert.equal(cloneAtriumEntity(anchor).tag,null);live.dispose();assert.equal(world.entities.size,0);
});

/** The authoring allocator skips imported names and does not travel backwards with undo. */
test('authored IDs skip collisions and stay monotonic through history',()=>{
 const doc=new ProjectDocument(ATRIUM_PROJECT);doc.data.scenes[0].entities[0].id='instance:1';
 assert.equal(doc.allocateId(),'instance:2');doc.edit('name',p=>p.name='Different');doc.undo();assert.equal(doc.allocateId(),'instance:3');assert.throws(()=>doc.allocateId('../bad'));
});
