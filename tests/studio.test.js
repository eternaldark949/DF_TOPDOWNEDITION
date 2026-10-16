/** Authoring acceptance at mechanism boundaries: transactions, references, spatial edits and 3D rays. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ATRIUM_PROJECT,validateAtriumProject } from '../examples/atrium/project.js';
import { copyData,validateProject,parseProject } from '../engine/basement/project.js';
import { ProjectDocument } from '../engine/basement/document.js';
import { Camera } from '../engine/basement/camera.js';
import { eulerRotation,rotateVector } from '../engine/basement/rotation.js';
import { World,Identities } from '../engine/basement/world.js';
import { rayBox,pickWorld } from '../engine/basement/picking.js';
import { SceneInstance } from '../engine/directory/scene-instance.js';
import { legalLanding } from '../examples/atrium/worlds.js';
import { assembly } from '../engine/penthouse/assembly.js';
import { writeProperty,TRANSFORM_PROPERTIES } from '../engine/basement/properties.js';

/** Real authored package must reject bad references, versions, cycles and malformed transforms. */
test('portable project validates all references, versions and bounded data before adoption',()=>{
 assert.equal(validateProject(ATRIUM_PROJECT),ATRIUM_PROJECT);
 for(const mutate of [p=>p.schemaVersion=99,p=>p.assets[0].generatorVersion=2,p=>p.scenes[0].entities[0].asset='missing',p=>p.scenes[0].entities[1].id=p.scenes[0].entities[0].id,p=>p.scenes[0].entities[0].rotation=[0,0,0,2],p=>p.assets[0].parts[0].parent=0,p=>p.scenes[0].lights[0].radius=Infinity]){const p=copyData(ATRIUM_PROJECT);mutate(p);assert.throws(()=>validateAtriumProject(p));}
 assert.throws(()=>parseProject(' '.repeat(524289)),/512 KiB/);
 const p=copyData(ATRIUM_PROJECT);p.name='A </script> & <b> portable name';assert.equal(parseProject(JSON.stringify(p)).name,p.name);
});

/** Preview cancellation, stable identity, dirty checkpoints and Play copies share one contract. */
test('commands restore exact identities, cancel previews and isolate simulation snapshots',()=>{
 const doc=new ProjectDocument(ATRIUM_PROJECT),id=doc.data.scenes[0].entities[0].id,initial=doc.snapshot();
 doc.begin('drag');for(let i=0;i<4;i++)doc.preview(p=>p.scenes[0].entities[0].position[0]=i+1);doc.cancel();assert.deepEqual(doc.data,initial);assert.equal(doc.undoStack.length,0);
 doc.edit('move',p=>p.scenes[0].entities[0].position[0]=8);assert.equal(doc.undoStack.length,1);assert.equal(doc.dirty,true);doc.markSaved();doc.undo();assert.equal(doc.data.scenes[0].entities[0].id,id);assert.equal(doc.dirty,true);doc.redo();assert.equal(doc.dirty,false);
 const play=doc.snapshot();play.scenes[0].entities[0].position[0]=900;assert.equal(doc.data.scenes[0].entities[0].position[0],8);
 assert.throws(()=>doc.edit('invalid',p=>p.scenes[0].entities[0].scale=0));assert.equal(doc.active,null);assert.equal(doc.data.scenes[0].entities[0].scale,1);
 for(let i=0;i<90;i++)doc.edit('rename',p=>p.name='Project '+i);assert.ok(doc.undoStack.length<=64);assert.ok(doc.undoStack.reduce((n,c)=>n+2*(c.before.length+c.after.length),0)<=2097152);
});

/** The same transformed assembly drives visible geometry and subsequent movement collision. */
test('moving and rotating a grouped planter updates foliage and conservative collision bounds',()=>{
 const project=copyData(ATRIUM_PROJECT),scene=project.scenes[0],world=new World('test',new Identities());const directory={create:(name,options)=>{assert.equal(name,'toy.assembly');return assembly(options);}};
 const live=new SceneInstance(directory,world,project,scene),planter=scene.entities.find(e=>e.tag==='planter'),built=live.instances.get(planter.id);assert.equal(built.parts.length,5);const id=built.root.id;
 const oldX=planter.position[0],oldY=planter.position[1];assert.equal(legalLanding({layout:live},{x:oldX,y:oldY,z:0}),false);
 planter.position[0]+=3;planter.rotation=eulerRotation(.2,.3,.6);planter.scale=1.5;live.apply(scene);
 assert.equal(legalLanding({layout:live},{x:oldX,y:oldY,z:0}),true);assert.equal(legalLanding({layout:live},{x:planter.position[0],y:planter.position[1],z:0}),false);
 assert.equal(built.root.id,id);assert.ok(Math.abs(built.colliders[0].x-planter.position[0])<1e-8);assert.ok(built.colliders[0].width>2.4);assert.ok(built.parts[4].pose.z>built.parts[0].pose.z);live.dispose();assert.equal(world.entities.size,0);
});

/** Projection, inverse rays, full quaternion parents and oriented slab intersection agree. */
test('camera rays select fully rotated boxes in top, oblique and side views',()=>{
 const world=new World('test',new Identities());const root=world.create({x:3,y:2,z:4,rotation:eulerRotation(.3,.4,.7),scale:2});const child=world.create({parent:root,x:1,shape:{size:[1,2,1],color:[1,1,1]}});world.resolve();const v=[0,0,0];rotateVector(root.rotation,2,0,0,v);assert.ok(Math.abs(child.pose.x-3-v[0])<1e-8);
 const camera=new Camera();for(const view of ['top','oblique','side','front']){camera.preset(view);const point=camera.project(child.pose,800,600),ray=camera.ray(point.x,point.y,800,600);assert.notEqual(rayBox(ray,child),null);assert.equal(pickWorld(world,ray),child);}
 camera.preset('front');assert.equal(camera.ground(400,300,800,600),null);
 const descriptor=TRANSFORM_PROPERTIES.find(p=>p.key==='rotation'),target={rotation:[0,0,0,1]};writeProperty(target,descriptor,[20,30,40]);assert.ok(Math.abs(Math.hypot(...target.rotation)-1)<1e-12);assert.throws(()=>writeProperty(target,descriptor,[NaN,0,0]));
});

/** Crossing a world boundary resets the expanded interpolation history, not only XYZ/yaw. */
test('world transfer preserves full attachment orientation and resets uniform-scale history',async()=>{
 const {transferTree}=await import('../engine/basement/transfer.js');
 const identities=new Identities(),source=new World('source',identities),destination=new World('destination',identities);
 const root=source.create(),child=source.create({parent:root,x:1});source.snapshot();root.rotation=eulerRotation(.4,.5,.6);root.scale=3;
 transferTree({source,destination,root,landing:{x:5,y:6,z:7}});destination.resolve(0);
 assert.deepEqual(root.previous.rotation,root.rotation);assert.equal(root.previous.scale,3);assert.equal(child.worldId,'destination');
 const offset=[0,0,0];rotateVector(root.rotation,3,0,0,offset);assert.ok(Math.abs(child.pose.z-7-offset[2])<1e-9);assert.equal(source.entities.size,0);
});
