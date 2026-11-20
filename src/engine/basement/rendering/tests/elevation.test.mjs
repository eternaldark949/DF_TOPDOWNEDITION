// ===== LV0 BASEMENT =====
// Drawing and picking read z: parts stand at their entity's elevation or their joint's height, a tipped
// bone is drawn shorter but no thinner, and a pick leans like the drawing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraSystem,renderSystem,recordingRenderer,drawComponents,foreshorten,drawingOutline,limb} from '../index.mjs';
import {physicsSystem} from '../../physics/index.mjs';

const near=(a,b,why='')=>assert.ok(Math.abs(a-b)<1e-6,`${why} ${a} != ${b}`);
const fixture=()=>{const world=new physicsSystem(),camera=new cameraSystem({position:[50,50],viewport:{width:400,height:400}});return {world,render:new renderSystem({physics_system:world,camera})};};

test('a tipped bone is drawn shorter along it and no thinner: places shorten, sizes stay',()=>{
 const steps=[{shape:'limb',from:[0,0],to:[20,0],radii:[4,4.5,3]},{shape:'circle',x:8,radius:3},{shape:'group',x:10,steps:[{shape:'polygon',points:[[0,0],[4,0],[4,2]]}]}];
 const short=foreshorten(steps,.5);
 assert.deepEqual(short[0].to,[10,0]);assert.deepEqual(short[0].radii,[4,4.5,3],'a limb keeps its girth');
 assert.equal(short[1].x,4);assert.equal(short[1].radius,3);assert.equal(short[2].x,5);assert.deepEqual(short[2].steps[0].points,[[0,0],[2,0],[2,2]]);
 assert.deepEqual(steps[0].to,[20,0],'the data is not touched');
 const down=foreshorten(steps,0);assert.deepEqual(down[0].to,[0,0],'pointing straight down it is the round end of it');
 const leaned=foreshorten(steps,0,[.5,.25]);assert.deepEqual(leaned[0].to,[10,5],'leaning, a hanging bone slants on to where its end is drawn');assert.equal(leaned[1].y,2);assert.deepEqual(leaned[0].radii,[4,4.5,3]);
});

test('a limb is round at each joint and swells between, and its outline fits bounds',()=>{
 const path=limb([0,0],[20,0],[4,5,3]);
 assert.equal(path[0][0],'ellipse');assert.equal(path[1][0],'cubic');assert.deepEqual(path.at(-1),['close']);
 const xs=drawingOutline([{shape:'limb',from:[0,0],to:[20,0],radii:[4,5,3]}])[0].points.map(p=>p[0]);
 near(Math.min(...xs),-4);near(Math.max(...xs),23);
 assert.throws(()=>limb([0,0],[1,0],[1,NaN,1]),/belly radius/);
});

test('parts stand at their entity\'s elevation, or at their joint\'s height on a standing rig',()=>{
 const {world}=fixture(),source=world.elements.asset_library;
 const roof=world.elements.createEntity({kind:'static',position:[0,0],elevation:150,components:[{name:'slab',layers:[{layer:0,height:0,thickness:10,steps:[{shape:'circle',radius:5}]}]}]});
 world.updateState(1/60);
 assert.equal(drawComponents(roof,source)[0].height,150,'a part off a joint stands on the entity\'s base');
 const arm=world.elements.createEntity({kind:'character',position:[0,0],components:[{name:'forearm',joint:'elbow',layers:[{layer:0,height:-2,thickness:4,steps:[{shape:'circle',radius:2}]}]}]});
 world.rigs.createRig(arm,{definition:{rig_id:'arm',joints:[{name:'shoulder',height:70,pitch:-Math.PI/2},{name:'elbow',parent:'shoulder',position:[30,0]}]}});
 world.updateState(1/60);
 const joints=name=>world.rigs.getPose(arm,{world_space:true}).joints[name];
 near(drawComponents(arm,source,1,{joints})[0].height,38,'the forearm stands at its elbow, hanging 30 under the shoulder');
 near(arm.height,42,'and the entity is as tall as its posed parts');
});

test('a pick leans like the drawing: a tall thing is hit where it is drawn, from its base to its top',()=>{
 const {world,render}=fixture();render.registerRenderer('recording',recordingRenderer);
 const tower=world.elements.createEntity({kind:'static',name:'tower',position:[80,50],collision_shape:{shape_type:'box',dimensions:[20,20]},components:[{name:'body',layers:[{layer:0,height:0,thickness:300,steps:[]}]}]});
 const ledge=world.elements.createEntity({kind:'static',name:'ledge',position:[20,50],elevation:100,collision_shape:{shape_type:'box',dimensions:[10,10]},components:[{name:'slab',layers:[{layer:0,height:0,thickness:4,steps:[]}]}]});
 world.updateState(1/60);
 assert.equal(render.pickAt([170,50]),null,'flat, the point past the tower misses it');
 render.setHeightView({eye:400});const k=400/(400-300);
 const hit=render.pickAt([50+30*k,50]);
 assert.equal(hit?.entity,tower,'leaning, the tower\'s top is drawn out there and is hit there');near(hit.position[0],80,'at the ground point under it');near(hit.height,300);
 assert.equal(render.pickAt([80,50]).entity,tower,'its foot is still where it stands');
 const up=render.pickAt([50+(20-50)*400/(400-104),50]);
 assert.equal(up?.entity,ledge,'a thing up on a ledge is hit where it is drawn');near(up.height,104,'its height is its top in the world');
});

test('leaning, every wall face draws under every wall top at that height, nearest face last, so walls that meet stand equally tall',async()=>{
 const {world,render}=fixture();render.registerRenderer('recording',recordingRenderer);await render.setRenderer('recording',{surface:null});render.setStillPictures(false);render.setHeightView({eye:900});
 const wall=(x,y,w,h,sides)=>world.elements.createEntity({kind:'static',position:[x,y],components:[{name:'wall',layers:[{layer:0,height:0,thickness:120,solid:false,sides,steps:[{shape:'rectangle',x:-w/2,y:-h/2,width:w,height:h,fill:'#222'}]}]}]});
 wall(80,50,8,300,'#444');wall(150,60,120,8,'#555');world.updateState(1/60);   // a T: the second wall's faces cross the first one's top, and hide behind its face
 render.beginFrame();render.drawLooks();render.endFrame();
 const fills=render.getFrameSnapshot().passes.flatMap(pass=>pass.packets).map(packet=>packet.material.fill);
 assert.ok(Math.max(fills.lastIndexOf('#444'),fills.lastIndexOf('#555'))<fills.indexOf('#222'),`faces, then tops: ${fills}`);
 assert.ok(fills.lastIndexOf('#555')<fills.indexOf('#444'),`the near wall's face last, over the end of the far one: ${fills}`);
 render.dispose();
});

test('leaning, walls stand on each shape\'s true outline: rounded corners round, a hollow kept, a shape on another adds none, a curve shaded round',async()=>{
 const run=async steps=>{
  const {world,render}=fixture();render.registerRenderer('recording',recordingRenderer);await render.setRenderer('recording',{surface:null});render.setStillPictures(false);render.setHeightView({eye:900});
  world.elements.createEntity({kind:'static',position:[50,250],components:[{name:'b',layers:[{layer:0,height:0,thickness:120,solid:false,sides:'#777',steps}]}]});world.updateState(1/60);
  render.beginFrame();render.drawLooks();render.endFrame();const walls=render.getFrameSnapshot().passes.flatMap(p=>p.packets).filter(p=>p.depth<0);render.dispose();
  return {walls,points:walls.filter(p=>p.material.fill==='#777').flatMap(p=>p.geometry.commands.filter(c=>c[0]!=='close').map(c=>[c[1],c[2]]))};
 };
 // a rounded block below the camera: its walls never reach the square corner its box would have
 const rounded=await run([{shape:'rectangle',x:-40,y:-20,width:80,height:40,radius:16,fill:'#a33'}]);
 assert.ok(rounded.points.length>8,'a rounded corner is many facets');
 assert.ok(rounded.points.every(([x,y])=>Math.hypot(x-10,y-230)>3),'no wall foot at the box\'s top-left corner (10, 230)');
 assert.equal(rounded.walls.filter(p=>p.material.fill==='#777').length,1,'one unbroken run of faces is one fill, so no seams between facets');
 assert.ok(rounded.walls.some(p=>/^rgba\(0,0,0,/.test(p.material.fill)),'faces turned from the light are shaded');
 // an L, hollow toward the camera: the walls of its inner corner stand (a hull would have bridged it)
 const ell=await run([{shape:'polygon',points:[[-40,-40],[40,-40],[40,-10],[-10,-10],[-10,40],[-40,40]],fill:'#a33'}]);
 assert.ok(ell.points.some(([x,y])=>Math.abs(x-40)<1e-6&&Math.abs(y-240)<1e-6),'a wall stands at the inner corner (40, 240)');
 // a button on a cushion adds no walls of its own
 const plain=await run([{shape:'rectangle',x:-30,y:-15,width:60,height:30,fill:'#a33'}]),buttoned=await run([{shape:'rectangle',x:-30,y:-15,width:60,height:30,fill:'#a33'},{shape:'circle',x:0,y:0,radius:3,fill:'#ff0'},{shape:'rectangle',x:-30,y:-15,width:60,height:30,fill:'#fff',alpha:.2}]);
 assert.equal(buttoned.walls.length,plain.walls.length,'shapes covered by a larger one stand no walls');
});

test('a still layer is one picture, keyed by its steps and look, shared by every object that has them; off, it is its shapes',async()=>{
 const {world,render}=fixture();render.registerRenderer('recording',recordingRenderer);await render.setRenderer('recording',{surface:null});render.setHeightView({eye:900});
 assert.equal(render.getStillPictures(),true,'on by default');
 const steps=[{shape:'rectangle',x:-20,y:-10,width:40,height:20,radius:6,fill:'#a33'},{shape:'circle',x:0,y:0,radius:3,fill:'#ff0'},{shape:'line',points:[[-15,0],[15,0]],stroke:'#000',line_width:4}];
 const make=(x,y,rotation=0)=>{const e=world.elements.createEntity({kind:'static',position:[x,y],components:[{name:'c',layers:[{layer:0,height:0,thickness:40,solid:false,sides:'#777',steps}]}]});e.rotateTo?.(rotation);return e;};
 make(60,80);make(160,120,.5);world.updateState(1/60);
 const frame=()=>{render.beginFrame();render.drawLooks();render.endFrame();return render.getFrameSnapshot().passes.flatMap(p=>p.packets);};
 const on=frame(),pics=on.filter(p=>p.type==='picture');
 assert.equal(pics.length,2,'one picture a layer');assert.equal(pics[0].picture.key,pics[1].picture.key,'the same art is one picture for both');
 const [bx,by,bw,bh]=pics[0].picture.bounds;assert.ok(bx<=-22&&by<=-12&&bw>=44&&bh>=24,`its bounds hold the shapes and the stroke's reach: ${pics[0].picture.bounds}`);
 assert.ok(!on.some(p=>p.material?.fill==='#a33'),'the shapes are not drawn one by one');assert.ok(on.some(p=>p.material?.fill==='#777'),'its walls are still drawn live');
 const k=900/(900-40);assert.ok(Math.abs(pics[0].picture.matrix[0]-k)<1e-9,'stamped in the plane of its top');assert.ok(Math.abs(pics[0].picture.matrix[4]-(50+(60-50)*k))<1e-9,'at its place, leaned from the camera');
 render.setStillPictures(false);const off=frame();assert.ok(!off.some(p=>p.type==='picture')&&off.some(p=>p.material?.fill==='#a33'),'off, every shape is drawn');
 render.dispose();
});
