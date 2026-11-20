// ===== LV0 BASEMENT =====
// Reflections: `reflect` read as data, the mask drawn from floor steps, things mirrored where a wet floor shows
// them, the reflection effect checked, and a pass that bakes once and draws the same frame again for free.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraSystem,renderSystem,recordingRenderer,readReflect,REFLECT,maskSteps,createReflectionMask,createReflectionProbes,drawLightReflection,heightPackets,reflectionMatrix,reflectionPass,wetStep,effect,artScene,drawComponents,heightView} from '../index.mjs';
import {physicsSystem} from '../../physics/index.mjs';

test('reflect is true, false or {strength, wet, plane}; unknown fields and bad values are refused',()=>{
 assert.deepEqual(readReflect(true),{...REFLECT});assert.equal(readReflect(false),null);assert.equal(readReflect(null),null);
 assert.deepEqual(readReflect({strength:.45,wet:true}),{strength:.45,wet:true,plane:false});
 assert.throws(()=>readReflect({strength:2}),/0 to 1/);assert.throws(()=>readReflect({shine:1}),/Unknown reflect field: shine/);assert.throws(()=>readReflect({wet:'yes'}),/true or false/);
 const art=new artScene();art.draw([{shape:'rectangle',width:4,height:4,fill:'#111',reflect:{strength:.3}}]);assert.equal(art.finish().length,1,'drawing ignores it');
 assert.throws(()=>new artScene().draw([{shape:'rectangle',width:4,height:4,reflect:{strength:-1}}]),/0 to 1/);
});

test('the mask clears under each floor step and paints its shine; wet floors shine as wet as the weather',()=>{
 const materials=name=>({asphalt:{fill:'#111',reflect:{strength:.5,wet:true}},marble:{fill:'#ccc',reflect:{strength:.6,plane:true}},rug:{fill:'#500'}})[name];
 const floors=[{shape:'rectangle',width:100,height:100,material:'asphalt'},{shape:'group',x:10,steps:[{shape:'rectangle',width:20,height:20,material:'marble'},{shape:'rectangle',width:5,height:5,material:'rug'}]},{shape:'text',text:'x'}];
 const dry=maskSteps(floors,{materials,wet:0});
 assert.equal(dry.length,2,'dry asphalt only clears; the text is left out');assert.equal(dry[0].blend,'destination-out');assert.equal(dry[1].steps[1].fill,'rgba(255,255,255,0.6)','marble always shines');
 const wet=maskSteps(floors,{materials,wet:1});assert.equal(wet[1].fill,'rgba(255,255,255,0.5)');assert.equal(wet[2].steps.length,3,'the rug clears and does not shine');
 const planes=maskSteps(floors,{materials,wet:1,part:'plane'});assert.equal(planes.length,2,'wet asphalt is no plane: it only clears');assert.equal(planes[1].steps[1].fill,'rgba(255,255,255,0.6)');
 assert.equal(wetStep(.31),.25);assert.equal(wetStep(2),1);
 const tiles=createReflectionMask({extent:{left:0,top:0,right:300,bottom:300},floors,materials,wetness:.5,tile_size:100,view:{left:0,top:0,right:150,bottom:150},ahead:60});
 assert.equal(tiles.filter(t=>!t.prepare).length,4,'the tiles the view meets');assert.equal(tiles.filter(t=>t.prepare).length,5,'and those ahead, readied');
 const again=createReflectionMask({extent:{left:0,top:0,right:300,bottom:300},floors,materials,wetness:.52,tile_size:100,view:{left:0,top:0,right:150,bottom:150}});
 assert.equal(again[0].picture.key,tiles[0].picture.key,'the same floors at the same wetness step keep their keys: nothing repaints');
 assert.notEqual(createReflectionMask({extent:{left:0,top:0,right:300,bottom:300},floors,materials,wetness:1,tile_size:100})[0].picture.key,tiles[0].picture.key,'wetter repaints');
});

test('a reflection falls fall × height down the world\'s y, and leans back toward the camera under a height view',()=>{
 assert.deepEqual(reflectionMatrix(100,.75),[1,0,0,1,0,75]);
 const view=new heightView({camera:[0,0],eye:1000}),m=reflectionMatrix(100,.75,view);
 assert.ok(m[0]<1,'k(-z) pulls it toward the camera');
 const light=drawLightReflection(new artScene(),{position:[10,20],height:160,radius:200,color:'#ffc77a',intensity:1}).finish();
 assert.equal(light.length,4,'scatter, smear, head and core');assert.ok(light.every(p=>p.blend==='add'));
 const centre=light[2].geometry.commands[0];assert.equal(centre[1],10);assert.equal(centre[2],20+.75*160,'its head where it falls');
 assert.equal(drawLightReflection(new artScene(),{position:[0,0],radius:9}).finish().length,0,'a light with no colour shows nothing');
 const probes=createReflectionProbes({extent:{left:0,top:0,right:400,bottom:400},tile_size:200,emitters:[{outline:[[0,0],[10,0],[10,5]],open:false,width:0,bounds:[0,0,10,5],color:'#ff00aa',strength:1,reach:96,height:100,still:true}]});
 assert.equal(probes.length,1,'only the tile its mirror reaches');
});

test('components mirrored: each layer at its top\'s fall, its walls facing down the screen from base to top',()=>{
 const world=new physicsSystem(),e=world.elements.createEntity({kind:'static',position:[0,0],components:[{name:'box',layers:[{layer:0,height:0,thickness:100,sides:'#333',steps:[{shape:'rectangle',x:-10,y:-10,width:20,height:20,fill:'#888'}]}]}]});
 world.updateState(1/60);
 const [part]=drawComponents(e,world.elements.asset_library,1,{mirror:.5});
 assert.equal(part.peak,100);assert.deepEqual(part.packets[0].matrix.slice(4),[0,50],'the top falls half its height');
 assert.equal(part.sides.length,1,'one face looks down the screen');
 const c=part.sides[0].geometry.commands;assert.deepEqual([c[0][2],c[2][2]],[10,60],'from its foot to where its top falls');
 const heights=heightPackets({packets:part.packets,sides:part.sides,z0:0,z1:100},{hmax:200});
 assert.equal(heights[0].material.fill.type,'linear','a wall is a ramp of heights');assert.equal(heights[1].material.fill,'rgb(128,255,0)');
});

test('the reflection effect names its targets; the render system refuses one whose target is missing',async()=>{
 assert.throws(()=>effect({type:'reflection'}),/names a render target/);
 const e=effect({type:'reflection',height:'h',mask:'m'});assert.equal(e.probe,null);assert.equal(e.fall,.75);
 assert.throws(()=>effect({type:'reflection',height:'h',mask:'m',steps:100}),/at most 64/);
 const world=new physicsSystem(),render=new renderSystem({physics_system:world,camera:new cameraSystem({position:[0,0],viewport:{width:100,height:100}})});
 render.registerRenderer('recording',recordingRenderer);await render.setRenderer('recording',{surface:null});
 const frame=render.beginFrame();frame.setEffects([e]);assert.throws(()=>render.endFrame(),/Missing or incompatible rendering resource: h/);
});

test('a reflection pass registers its targets, lays the reflection on the ground and costs nothing more when nothing changed',async()=>{
 const world=new physicsSystem(),camera=new cameraSystem({position:[200,200],viewport:{width:400,height:300}}),render=new renderSystem({physics_system:world,camera});
 render.registerRenderer('recording',recordingRenderer);await render.setRenderer('recording',{surface:null});
 world.elements.createEntity({kind:'decoration',position:[200,180],components:[{name:'body',layers:[{layer:0,height:0,thickness:80,steps:[{shape:'circle',radius:8,fill:'#345'}]}]}]});
 world.updateState(1/60);
 const pass=new reflectionPass(render,{quality:'medium',budget_ms:null});await pass.prepare();
 assert.ok(['mask','light','plane','plane_mask'].every(n=>render.listResources().includes(pass.target(n))),'medium needs no height or probe target');
 assert.ok(!render.listResources().includes(pass.target('height')));
 const floors=[{shape:'rectangle',width:400,height:400,material:'asphalt'}],materials=()=>({fill:'#111',reflect:{strength:.5,wet:true}}),lights=[{position:[100,100],height:160,radius:200,color:'#ffcc88'}];
 const draw=()=>{const frame=render.beginFrame();pass.draw(frame,{extent:{left:0,top:0,right:400,bottom:400},floors,materials,wetness:1,lights});render.endFrame();return render.getFrameSnapshot();};
 const first=draw(),second=draw();
 const keys=f=>f.passes.filter(p=>p.target_id===pass.target('mask')).flatMap(p=>p.packets.map(q=>q.picture?.key)).filter(Boolean);
 assert.deepEqual(keys(second),keys(first),'the mask is stamped from the same baked tiles');
 const light=first.passes.find(p=>p.target_id===pass.target('light'));
 assert.ok(light.packets.some(p=>p.blend==='destination-out'),'the body blocks the light as a silhouette');assert.equal(light.packets.at(-1).blend,'destination-in','cut to the mask');
 const laid=first.passes.filter(p=>p.target_id===null).flatMap(p=>p.packets).filter(p=>p.resource_id===pass.target('light'));
 assert.equal(laid.length,12,'laid in twelve shimmering bands');assert.ok(laid.every(p=>p.layer===-99&&p.blend==='add'));
 assert.equal(pass.darknessCut().blend,'destination-out');
 pass.setQuality('off');const frame=render.beginFrame();assert.equal(pass.draw(frame,{extent:{left:0,top:0,right:400,bottom:400}}),0);render.endFrame();
 assert.throws(()=>pass.setQuality('ultra'),/off, low, medium, high/);
});

test('the pass steps its quality down when it runs long and back up after a steady while',async()=>{
 const world=new physicsSystem(),render=new renderSystem({physics_system:world,camera:new cameraSystem({position:[0,0],viewport:{width:50,height:50}})});
 render.registerRenderer('recording',recordingRenderer);await render.setRenderer('recording',{surface:null});
 const pass=new reflectionPass(render,{quality:'high',budget_ms:-1});await pass.prepare();
 for(let i=0;i<30;i++){const f=render.beginFrame();pass.draw(f,{extent:{left:0,top:0,right:50,bottom:50}});render.endFrame();await pass.prepare();}
 assert.equal(pass.quality,'medium','over budget for 30 frames: one step down');
});

test('a raised floor step (a kerb with thickness and sides) masks as its footprint; a side that is no quad takes its top\'s height',()=>{
 const materials=name=>({kerb:{fill:'#333',reflect:{strength:.3,wet:true}}})[name];
 const [clear,shine]=maskSteps([{shape:'polygon',points:[[0,0],[10,0],[10,4],[0,4]],material:'kerb',thickness:5,sides:{material:'kerb_face'}}],{materials,wet:1});
 for(const p of [clear,shine]){assert.equal(p.thickness,undefined);assert.equal(p.sides,undefined);}
 assert.equal(shine.fill,'rgba(255,255,255,0.3)');
 const triangle={type:'geometry',geometry:{commands:[['move',0,0],['line',10,0],['line',5,8],['close']]},material:{fill:'#333'}};
 const [h]=heightPackets({packets:[],sides:[triangle],z0:0,z1:100},{hmax:200});
 assert.equal(typeof h.material.fill,'string','a flat height, not a ramp it cannot place');
});
