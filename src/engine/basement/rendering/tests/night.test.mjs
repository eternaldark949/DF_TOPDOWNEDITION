// ===== LV0 BASEMENT =====
// The night: what things carry (lights), what their lit windows give the light grid, what stops the glow,
// and what stands over the light on the ground (covers) or shines through the dark (shines).
import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraSystem,renderSystem,recordingRenderer,drawComponents,entityLights,facadeEmitters,entityEmitters,entityBlockers,componentCovers,heightView,createLightLayer,createLightLayerParts} from '../index.mjs';
import {physicsSystem} from '../../physics/index.mjs';

const near=(a,b,why='',e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${why} ${a} != ${b}`);
const fixture=()=>{const world=new physicsSystem(),camera=new cameraSystem({position:[50,50],viewport:{width:400,height:400}});return {world,render:new renderSystem({physics_system:world,camera})};};
const box={shape:'rectangle',x:-100,y:-30,width:200,height:60,fill:'#a33'};
const facade={storeys:{height:20},bays:{width:40},seed:3,panels:[{width:16,height:10,at:5,fill:'#123',lit:1,lit_fill:'#ffcc88',emits:{strength:.1,reach:50}}]};

test('a thing\'s lights go where it stands, turned with it, their "$name" colours read from its look',()=>{
 const {world}=fixture();
 const e=world.elements.createEntity({kind:'static',position:[100,200],rotation:Math.PI/2,look:{values:{warm:'#ffcc88'}},
  lights:[{shape:'point',position:[10,0],radius:40,color:'$warm',glow:.3},{shape:'beam',position:[0,0],rotation:.5,length:100,width:20,height:50,over:true}]});
 const [a,b]=entityLights(e);
 near(a.position[0],100,'x');near(a.position[1],210,'turned a quarter, 10 ahead is 10 down');assert.equal(a.color,'#ffcc88');assert.equal(a.still,true,'a thing that stands still has still lights');
 near(b.rotation,Math.PI/2+.5,'a beam turns with it');assert.equal(b.over,true);
 const view=new heightView({camera:[0,0],eye:500});const [,lifted]=entityLights(e,{view});
 const k=view.k(50);near(lifted.position[0],100*k,'leaning, a light with a height is drawn where it leans to');
 assert.throws(()=>world.elements.createEntity({kind:'static',position:[0,0],lights:{radius:4}}),/list of light records/);
 const prop=world.elements.createEntity({kind:'static',position:[5,5],data:{emission:{shape:'strip',size:[10,2],position:[1,0],radius:null}}});
 const [strip]=entityLights(prop);assert.equal(strip.shape,'area','a map light\'s strip is an area light');near(strip.position[0],6);
});

test('lit windows glow: one emitter per lit bay, a hair outside the wall, at the mean height of the lit ones',()=>{
 const out=facadeEmitters([box],facade,{at:[0,0]},{},10,50);
 // 200 x 60 box: two long walls of 5 bays, two short walls of 2 (60 / 40 rounds to 2, then 1.5 → 2)
 assert.ok(out.length>=10,`one per lit bay (${out.length})`);
 const e=out[0];assert.equal(e.open,true);assert.equal(e.color,'#ffcc88','the lit fill colours it');near(e.strength,.2,'two storeys lit');
 near(e.height,10+(5+15+25+35)/2/2,'their mean height over the layer base');
 const [x0,y0]=e.outline[0];assert.ok(Math.abs(y0)>30||Math.abs(x0)>100,'outside the wall');
 assert.equal(facadeEmitters([box],{...facade,panels:[{...facade.panels[0],emits:undefined}]},{},{},0,40).length,0,'no emits, no glow');
 assert.equal(facadeEmitters([box],{...facade,panels:[{...facade.panels[0],lit:0}]},{},{},0,40).length,0,'nothing lit, no glow');
 const {world}=fixture();const b=world.elements.createEntity({kind:'static',position:[0,0],components:[{name:'b',layers:[{layer:0,height:0,thickness:40,solid:false,sides:'#777',facade,steps:[box]}]}]});
 assert.equal(entityEmitters(b,null).length,facadeEmitters([box],facade,{},{},0,40).length,'a thing\'s emitters include its facade\'s');
});

test('a building marked blocks_light stops the glow with the footprint of its walled layers',()=>{
 const packet={position:[10,0],blocks_light:true,components:[{name:'b',at:[0,0],layers:[{layer:0,height:0,thickness:40,sides:'#777',steps:[box]},{layer:1,height:40,thickness:5,sides:'#777',steps:[box]}]},{name:'flat',at:[0,0],layers:[{layer:0,height:0,thickness:0,steps:[box]}]}]};
 const out=entityBlockers(packet);assert.equal(out.length,1,'the lowest walled layer of each component');
 const xs=out[0].outline.map(p=>p[0]);near(Math.min(...xs),-90);near(Math.max(...xs),110);
});

test('what stands tall covers the light on the ground; lit windows and glowing steps shine, in drawing order',async()=>{
 const {world,render}=fixture();render.registerRenderer('recording',recordingRenderer);await render.setRenderer('recording',{surface:null});render.setHeightView({eye:900});
 world.elements.createEntity({kind:'static',position:[50,250],components:[
  {name:'low',layers:[{layer:0,height:0,thickness:10,solid:false,sides:'#777',steps:[{shape:'rectangle',x:-120,y:-40,width:20,height:20,fill:'#333'}]}]},
  {name:'tower',layers:[{layer:0,height:0,thickness:40,solid:false,sides:'#777',facade,steps:[box]}]},
  {name:'sign',layers:[{layer:0,height:0,thickness:2,solid:false,steps:[{shape:'circle',x:0,y:-50,radius:3,fill:'#fe8',emits:true}]}]}]});
 world.updateState(1/60);
 render.beginFrame();render.drawLooks();assert.equal(render.nightOver().length,0,'only when asked');render.endFrame();
 render.beginFrame();render.drawLooks(1,{covers:24});const over=render.nightOver();
 const covers=over.filter(o=>o.over==='cover'),shines=over.filter(o=>o.over==='shine');
 assert.equal(covers.length,1,'only the tower stands over 24');
 assert.ok(shines.some(s=>s.packet.material.fill==='#ffcc88'),'its lit windows shine');
 assert.ok(shines.some(s=>s.packet.material.fill==='#fe8'),'a glowing step shines');
 assert.ok(over.indexOf(covers[0])<over.findIndex(s=>s.packet.material.fill==='#ffcc88'),'a part\'s cover goes before its own windows');
 render.endFrame();
 assert.equal(componentCovers(world.elements.getEntities()[0],world.elements.asset_library,new heightView({camera:[50,50],eye:900}),{above:5}).length,2,'componentCovers gives them for one entity');
 render.dispose();
});

test('the light layer draws covers and shines last, and a light aloft after them, uncached',()=>{
 const square={type:'shape',matrix:[1,0,0,1,0,0],geometry:{type:'path',commands:[['move',0,0],['line',10,0],['line',10,10],['close']]},material:{fill:'#fff'},opacity:1,blend:'normal',clips:[]};
 const tint='rgba(0,0,10,.9)',over=[{packet:square,over:'cover'},{packet:{...square,depth:.5},over:'shine'}];
 const layer=createLightLayer({bounds:{left:0,top:0,right:100,bottom:100},tint,over});
 const tail=layer.slice(-3);
 assert.deepEqual(tail.map(p=>p.blend),['destination-out','normal','destination-out'],'cleared, the dark laid back, then the shine cut');
 assert.equal(tail[1].material.fill,tint);assert.equal(tail[2].depth,0,'one depth, so the frame keeps their order');
 assert.throws(()=>createLightLayer({bounds:{left:0,top:0,right:100,bottom:100},tint,over:[{packet:square,over:'roof'}]}),/cover.*shine/);
 const lights=[{position:[50,50],radius:20,color:'#fff',glow:.5,still:true},{position:[20,20],radius:20,color:'#fff',glow:.5,still:true,over:true}];
 const parts=createLightLayerParts({extent:{left:0,top:0,right:100,bottom:100},tint,lights,over,tile_size:64});
 const at=parts.findLastIndex(p=>p.material?.fill===tint);assert.ok(at>0,'the cover lays the dark back after the plain dark');
 assert.ok(parts.slice(at+2).some(p=>!p.picture),'the light aloft is drawn after the covers, as shapes');
 const keys=list=>list.filter(p=>p.picture).map(p=>p.picture.key).sort();
 assert.deepEqual(keys(parts),keys(createLightLayerParts({extent:{left:0,top:0,right:100,bottom:100},tint,lights:lights.slice(0,1),over,tile_size:64})),'and kept out of the cached tiles');
});

test('a part the screen cannot show at all is not drawn, leaning from its base to its top',()=>{
 const world=new physicsSystem(),e=world.elements.createEntity({kind:'static',position:[1000,0],components:[{name:'b',layers:[{layer:0,height:0,thickness:40,solid:false,sides:'#777',steps:[box]}]}]});
 const view=new heightView({camera:[0,0],eye:900}),screen=b=>({bounds:b,zoom:1});
 assert.equal(drawComponents(e,null,1,{view,screen:screen({left:-200,top:-200,right:200,bottom:200})}).length,0,'off screen: nothing');
 assert.equal(drawComponents(e,null,1,{view,screen:screen({left:-200,top:-200,right:1000,bottom:200})}).length,1,'its foot on screen: drawn');
 const k=view.k(40);assert.ok(1100*k>1100+20+16);assert.equal(drawComponents(e,null,1,{view,screen:screen({left:1100+20,top:-200,right:1100*k,bottom:200})}).length,1,'only its leaning top on screen: drawn');
});

test('a lit band, a window drawn as lit steps, and a plain one when it is too small on screen to show them',()=>{
 const world=new physicsSystem(),view=new heightView({camera:[0,0],eye:900});
 const win=fill=>[{shape:'rectangle',x:-8,y:0,width:16,height:10,fill},{shape:'rectangle',x:-.5,y:0,width:1,height:10,fill:'#222'}];
 const art={storeys:{height:20},bays:{width:40},seed:3,bands:[{from:-2,to:-1,fill:'#b49cff',lit:true}],
  panels:[{width:16,height:10,at:5,steps:win('#345'),lit_steps:win('#e9a775'),lit:1,fill:'#123',lit_fill:'#ffcc88',detail:30}]};
 const e=world.elements.createEntity({kind:'static',position:[0,300],components:[{name:'b',layers:[{layer:0,height:0,thickness:40,solid:false,sides:'#777',facade:art,steps:[box]}]}]});
 const fills=(zoom,shines=true)=>{const [part]=drawComponents(e,null,1,{view,shines,screen:{bounds:{left:-2000,top:-2000,right:2000,bottom:2000},zoom}});return {all:part.sides.map(p=>p.material.fill),shine:part.sides.filter(p=>p.shine).map(p=>p.material.fill)};};
 const big=fills(20);
 assert.ok(big.shine.includes('#b49cff'),'a lit band shines');
 assert.ok(big.shine.includes('#e9a775')&&!big.all.includes('#123'),'close up, a lit window is its lit steps, and it shines');
 const small=fills(1);
 assert.ok(small.shine.includes('#ffcc88')&&!small.all.includes('#e9a775'),'small on screen: the plain panel, lit the same');
 assert.throws(()=>world.elements.createEntity({kind:'static',position:[0,0],components:[{name:'b',layers:[{layer:0,height:0,thickness:40,sides:'#777',facade:{...art,panels:[{width:4,height:4,lit_steps:win('#fff')}]},steps:[box]}]}]}),/lit_steps/);
});
