import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraSystem,renderSystem,renderFrame,canvasRenderer} from '../index.mjs';
import {physicsSystem} from '../../physics/index.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const view=()=>new cameraSystem({position:[50,50],viewport:{width:100,height:100,pixel_ratio:2}});
const fixture=()=>{const world=new physicsSystem(),camera=view();return {world,camera,render:new renderSystem({physics_system:world,camera})};};
const rect=(fill='#f00',extra={})=>({type:'shape',geometry:{type:'rect',size:[20,20]},position:[50,50],material:{fill},...extra});
class Capture {
 static instances=[];
 constructor(){this.capabilities=new canvasRenderer().capabilities;this.frames=[];this.resources=new Map();this.disposed=false;Capture.instances.push(this);}
 initialize(surface,{viewport}){this.surface=surface;this.resize(viewport);}
 resize(viewport){this.viewport=viewport;}
 getSurfaceBounds(){return {left:0,top:0,width:this.viewport.width,height:this.viewport.height};}
 registerResource(id,data){this.resources.set(id,data);}
 releaseResource(id){this.resources.delete(id);}
 render(frame){this.frames.push(structuredClone(frame));}
 dispose(){this.disposed=true;this.resources.clear();}
}

function context(){
 const calls=[],ctx={calls,stack:0,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})};
 for(const name of ['setLineDash','setTransform','transform','clearRect','fillRect','beginPath','rect','roundRect','ellipse','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','clip','fill','stroke','drawImage','fillText','strokeText','putImageData'])ctx[name]=(...args)=>calls.push([name,...args]);
 ctx.save=()=>{ctx.stack++;calls.push(['save']);};ctx.restore=()=>{ctx.stack--;calls.push(['restore']);};
 for(const name of ['createLinearGradient','createRadialGradient'])ctx[name]=(...args)=>{calls.push([name,...args]);return {addColorStop(...stop){calls.push(['stop',...stop]);}};};
 return ctx;
}
function surface(ctx=context()){return {width:0,height:0,ctx,getContext(type){assert.equal(type,'2d');return ctx;},getBoundingClientRect(){return {left:10,top:20,width:100,height:100};}};}

test('camera world/screen/client coordinates round-trip with rotation, zoom, CSS scaling and DPR',()=>{
 const camera=new cameraSystem({position:[12,-40],zoom:2.5,rotation:.7,viewport:{width:300,height:200,pixel_ratio:3}}),p=[45,70],screen=camera.worldToScreen(p),back=camera.screenToWorld(screen);
 near(back[0],p[0]);near(back[1],p[1]);const bounds={left:17,top:29,width:600,height:400},client=camera.worldToClient(p,bounds),restored=camera.clientToWorld(client,bounds);near(restored[0],p[0]);near(restored[1],p[1]);assert.ok(Object.isFrozen(camera.getView().world_to_screen));
});

test('rotated view bounds clamp to authored bounds and a small map centers without changing physical poses',()=>{
 const camera=new cameraSystem({position:[999,999],rotation:Math.PI/2,viewport:{width:200,height:100},bounds:{left:0,top:0,right:500,bottom:500}}),v=camera.getView();near(v.position[0],450);near(v.position[1],400);
 camera.setBounds({left:0,top:0,right:20,bottom:20});assert.deepEqual(camera.getView().position,[10,10]);assert.throws(()=>camera.setView({zoom:0}),/zoom/);
});

test('camera follows the official body with fixed-step smoothing/interpolation and never writes physics',()=>{
 const {world,camera}=fixture(),person=world.createCharacter({position:[10,20]});camera.follow(person,{smoothing:0});person.setMovement([1,0]);world.updateState();camera.updateState(world.config.fixed_step);
 const before=world.savePhysicsState(),a=camera.getView(0).position,b=camera.getView(1).position;near(a[0],10);near(b[0],person.position[0]);assert.ok(b[0]>a[0]);camera.getView(.5);assert.deepEqual(world.savePhysicsState(),before);
 person.destroy();camera.updateState(1/60);assert.doesNotThrow(()=>camera.getView());
});

test('frames copy submitted data, sort stably within a pass and reuse their packet capacity',()=>{
 const frame=new renderFrame(),camera=view(),source=rect('#f00',{layer:2});frame.begin(camera.getView());frame.submit(source);source.position[0]=999;frame.submit(rect('#00f',{layer:1}));frame.submit(rect('#0f0',{layer:2}));
 const first=frame.finish();assert.deepEqual(first.passes[0].packets.map(p=>p.material.fill),['#00f','#f00','#0f0']);assert.equal(first.passes[0].packets[1].transform[4],50);
 for(let i=0;i<20;i++){frame.begin(camera.getView());frame.submit(rect());frame.finish();}assert.equal(frame.getStatistics().packet_capacity,3);assert.ok(Object.isFrozen(frame.snapshot().passes));
 assert.throws(()=>frame.submit(rect()),/open/);
});

test('ordered target passes create continuation barriers and reject unclosed nesting',()=>{
 const frame=new renderFrame();frame.begin(view().getView());frame.submit(rect());frame.beginPass({target_id:'glow',viewport:{width:20,height:20}});frame.submit(rect());frame.endPass();frame.submit(rect());
 assert.deepEqual(frame.finish().passes.map(p=>[p.target_id,p.clear_color]),[[null,'transparent'],['glow','transparent'],[null,false]]);
 frame.begin(view().getView());frame.beginPass({target_id:'glow'});assert.throws(()=>frame.finish(),/Unclosed/);frame.abort();assert.doesNotThrow(()=>frame.begin(view().getView()));frame.abort();
});

test('data packets reject Canvas callbacks, DOM/image handles and unsupported path commands',()=>{
 const frame=new renderFrame();frame.begin(view().getView());assert.throws(()=>frame.submit({type:'custom',draw(){}}),/packet/);
 assert.throws(()=>frame.submit({type:'sprite',resource_id:{getContext(){}},size:[1,1]}),/ID/);
 assert.throws(()=>frame.submit({...rect(),geometry:{type:'path',commands:[['callback',()=>{}]]}}),/path command/);frame.abort();
});

test('visibility reads render bounds from the single native grid',()=>{
 const {world,render}=fixture();const e=world.elements.createDecoration({position:[150,50],render_shape:{shape_type:'box',dimensions:[200,10]}});const original=world.queryEntitiesInBounds.bind(world),queries=[];
 world.queryEntitiesInBounds=(packet,results)=>{queries.push(packet);return original(packet,results);};
 assert.equal(render.getVisibleEntities()[0].entity,e);assert.equal(queries[0].bounds_type,'render');assert.deepEqual(queries[0].bounds,{left:0,top:0,right:100,bottom:100});render.dispose();
});

test('backend selection preserves physical state, uploads resources and requires a fresh surface across types',async()=>{
 const {world,render}=fixture();render.registerRenderer('first',Capture);class Other extends Capture{}render.registerRenderer('other',Other);
 await render.registerResource('red',{type:'material',material:{fill:'#f00'}});const oldWorld=world.spatial_grid,s={};await render.setRenderer('first',{surface:s});const old=Capture.instances.at(-1);assert.equal(old.resources.size,1);
 await assert.rejects(render.setRenderer('other',{surface:s}),/fresh surface/);await render.setRenderer('other',{surface:{}});assert.equal(old.disposed,true);assert.equal(Capture.instances.at(-1).resources.size,1);assert.equal(world.spatial_grid,oldWorld);assert.equal(world.simulation_tick,0);render.dispose();
});

test('unsupported backend features fail before drawing and resources/feedback loops validate centrally',async()=>{
 const {render}=fixture();class Limited extends Capture{constructor(){super();this.capabilities=['shape','geometry:rect','blend:normal'];}}render.registerRenderer('limited',Limited);await render.setRenderer('limited',{surface:{}});const b=Capture.instances.at(-1);
 render.beginFrame().submit(rect('#f00',{material:{fill:{type:'linear',from:[0,0],to:[20,0],stops:[[0,'#000'],[1,'#fff']]}}}));assert.throws(()=>render.endFrame(),/capability/);assert.equal(b.frames.length,0);render.abortFrame();
 render.beginFrame().submit({type:'sprite',resource_id:'missing',size:[10,10]});assert.throws(()=>render.endFrame(),/Missing/);render.abortFrame();
 await render.registerResource('layer',{type:'target',width:10,height:10});const frame=render.beginFrame();frame.beginPass({target_id:'layer'});frame.submit({type:'sprite',resource_id:'layer',size:[10,10]});frame.endPass();assert.throws(()=>render.endFrame(),/targets|own render target/);render.dispose();
});

test('a failing or disposed renderer preparation cannot replace the active backend',async()=>{
 const {render}=fixture();render.registerRenderer('good',Capture);await render.setRenderer('good',{surface:{}});const old=Capture.instances.at(-1);let resolve;
 class Slow extends Capture{initialize(){return new Promise(r=>{resolve=r;});}}render.registerRenderer('slow',Slow);const pending=render.setRenderer('slow',{surface:{}}),next=Capture.instances.at(-1);render.dispose();resolve();await assert.rejects(pending,/cancelled/);assert.equal(old.disposed,true);assert.equal(next.disposed,true);assert.equal(render.disposed,true);
});

test('Canvas executes data packets with balanced transforms, clips, text and cached geometry',async()=>{
 const {render}=fixture(),main=surface(),paths=[];
 class Canvas extends canvasRenderer{constructor(){super({create_surface:()=>surface(),create_path:()=>{const p=context();paths.push(p);return p;}});}}
 render.registerRenderer('canvas',Canvas);await render.setRenderer('canvas',{surface:main});await render.registerResource('shape',{type:'geometry',geometry:{type:'rect',size:[20,20]}});
 const frame=render.beginFrame();frame.submit({type:'shape',geometry_id:'shape',material:{fill:'#f00'},clips:[{geometry:{type:'ellipse',radii:[5,5]},transform:[1,0,0,1,2,0]}]});frame.submit({type:'text',text:'hello',font:{size:18,family:'sans-serif'},material:{fill:'#fff'}});render.endFrame();
 assert.equal(main.width,200);assert.equal(main.height,200);assert.equal(main.ctx.stack,0);assert.equal(paths.length,1);assert.ok(main.ctx.calls.some(c=>c[0]==='fillText'&&c[1]==='hello'));assert.ok(main.ctx.calls.some(c=>c[0]==='clip'));
 render.beginFrame().submit({type:'shape',geometry_id:'shape'});render.endFrame();assert.equal(paths.length,1);render.dispose();
});

test('Canvas image replacement is atomic and pending decoded images close after disposal',async()=>{
 const {render}=fixture(),main=surface(),closed=[];let pendingResolve;
 class Canvas extends canvasRenderer{constructor(){super({decode_image:url=>url==='first'?Promise.resolve({id:'first',close(){closed.push('first');}}):url==='bad'?Promise.reject(Error('decode failed')):new Promise(r=>{pendingResolve=r;}),create_surface:()=>surface()});}}
 render.registerRenderer('canvas',Canvas);await render.setRenderer('canvas',{surface:main});await render.registerResource('image',{type:'image',url:'first'});await assert.rejects(render.registerResource('image',{type:'image',url:'bad'}),/decode/);
 render.beginFrame().submit({type:'sprite',resource_id:'image',size:[10,10]});render.endFrame();assert.equal(main.ctx.calls.find(c=>c[0]==='drawImage')[1].id,'first');
 const pending=render.registerResource('next',{type:'image',url:'later'});render.dispose();pendingResolve({close(){closed.push('later');}});await assert.rejects(pending,/cancelled/);assert.deepEqual(closed,['first','later']);
});

test('generic rendering and camera have no Canvas calls or private physical/spatial owners',async()=>{
 const {readFileSync}=await import('node:fs');
 for(const name of ['system.mjs','frame.mjs','camera.mjs'])assert.doesNotMatch(readFileSync(new URL('../'+name,import.meta.url),'utf8'),/getContext|Path2D|\bdocument\b|new physicsSystem|new spatialGrid/);
});

test('public rendering and camera members have a shareable API reference',async()=>{
 const {readFileSync}=await import('node:fs'),api=await import('../index.mjs'),reference=readFileSync(new URL('../README.md',import.meta.url),'utf8');
 for(const [name,Class]of Object.entries(api)){assert.ok(reference.includes(name),name);for(const member of Object.getOwnPropertyNames(Class.prototype))if(member!=='constructor')assert.ok(reference.includes(member),`${name}.${member}`);}
});

test('target caches receive only successful backend frames and unsubscribe cleanly',async()=>{
 const {render}=fixture(),events=[];const off=render.onFrameRendered(event=>events.push(event));
 await render.registerResource('cache',{type:'target',width:10,height:10});let frame=render.beginFrame();frame.beginPass({target_id:'cache'});frame.endPass();render.endFrame();assert.equal(events.length,0,'headless collection did not draw a target');
 render.registerRenderer('capture',Capture);await render.setRenderer('capture',{surface:{}});frame=render.beginFrame();frame.beginPass({target_id:'cache'});frame.endPass();render.abortFrame();assert.equal(events.length,0);
 const backend=Capture.instances.at(-1),draw=backend.render;backend.render=()=>{throw new Error('GPU failure');};frame=render.beginFrame();frame.beginPass({target_id:'cache'});frame.endPass();assert.throws(()=>render.endFrame(),/GPU/);assert.equal(events.length,0);
 backend.render=draw;frame=render.beginFrame();frame.beginPass({target_id:'cache'});frame.endPass();render.endFrame();assert.deepEqual(events[0].targets,['cache']);assert.ok(Object.isFrozen(events[0].targets));off();render.beginFrame();render.endFrame();assert.equal(events.length,1);render.dispose();
});

test('Canvas migration overlay preserves host transform, opacity, surface size and state without clearing',()=>{
 const ctx=context(),cv=surface(ctx);cv.width=100;cv.height=80;ctx.canvas=cv;ctx.globalAlpha=.4;ctx.globalCompositeOperation='screen';ctx.fillStyle='#123456';ctx.getTransform=()=>({a:2,b:0,c:0,d:3,e:11,f:17});
 const saved=[],save=ctx.save,restore=ctx.restore;ctx.save=()=>{saved.push({globalAlpha:ctx.globalAlpha,globalCompositeOperation:ctx.globalCompositeOperation,fillStyle:ctx.fillStyle});save();};ctx.restore=()=>{restore();Object.assign(ctx,saved.pop());};
 const drawnOpacity=[],fill=ctx.fill;ctx.fill=(...args)=>{drawnOpacity.push(ctx.globalAlpha);fill(...args);};
 const original=rect('#ff0000',{opacity:.5});assert.equal(canvasRenderer.drawPackets(ctx,[original]),1);assert.equal(original.opacity,.5);assert.deepEqual(drawnOpacity,[.2]);assert.ok(ctx.calls.some(c=>c[0]==='setTransform'&&c.slice(1).join(',')==='2,0,0,3,11,17'));assert.equal(ctx.calls.some(c=>c[0]==='clearRect'),false);assert.equal(ctx.globalAlpha,.4);assert.equal(ctx.globalCompositeOperation,'screen');assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.stack,0);assert.deepEqual([cv.width,cv.height],[100,80]);
});
test('Canvas overlay validates a complete inline batch before painting and recovers after rejection',()=>{
 const ctx=context(),cv=surface(ctx);cv.width=cv.height=100;ctx.canvas=cv;ctx.globalAlpha=1;ctx.getTransform=()=>({a:1,b:0,c:0,d:1,e:0,f:0});
 assert.throws(()=>canvasRenderer.drawPackets(ctx,[rect(),{type:'sprite',resource_id:'unregistered',size:[1,1]}]),/inline packets/);assert.equal(ctx.calls.some(c=>c[0]==='fill'),false);assert.equal(canvasRenderer.drawPackets(ctx,[rect()]),1);assert.equal(ctx.stack,0);
});
