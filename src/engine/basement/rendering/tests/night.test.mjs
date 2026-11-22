// ===== LV0 BASEMENT =====
// The night: what things carry (lights), what their lit windows give the light grid, what stops the glow,
// and what stands over the light on the ground (covers) or shines through the dark (shines).
import test from 'node:test';
import assert from 'node:assert/strict';
import {nightAreas,cameraSystem,renderSystem,recordingRenderer,drawComponents,pulseAt,entityLights,facadeEmitters,entityEmitters,entityBlockers,componentCovers,heightView,createLightLayer,createLightLayerParts} from '../index.mjs';
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

test('a walled layer marked cover: false (a post) gives no cover; cover is true or false',async()=>{
 const {world,render}=fixture();render.registerRenderer('recording',recordingRenderer);await render.setRenderer('recording',{surface:null});render.setHeightView({eye:900});
 const post=cover=>({name:'post',layers:[{layer:0,height:0,thickness:40,solid:false,sides:'#222',...(cover===undefined?{}:{cover}),steps:[{shape:'circle',x:0,y:0,radius:3,fill:'#222'}]}]});
 world.elements.createEntity({kind:'static',position:[50,50],components:[post(false)]});world.elements.createEntity({kind:'static',position:[80,50],components:[post()]});
 world.updateState(1/60);
 render.beginFrame();render.drawLooks(1,{covers:24});assert.equal(render.nightOver().filter(o=>o.over==='cover').length,1,'only the post without cover: false');render.endFrame();
 const [thin]=world.elements.getEntities();assert.equal(componentCovers(thin,world.elements.asset_library,new heightView({camera:[50,50],eye:900})).length,0);
 assert.throws(()=>world.elements.createEntity({kind:'static',position:[0,0],components:[post('no')]}),/cover is true or false/);
 render.dispose();
});

test('lights are read once a frame: a thing without lights is not asked for its state, one with lights once',()=>{
 const {world,render}=fixture();
 const lamp=world.elements.createEntity({kind:'static',position:[50,50],lights:[{shape:'point',radius:40,height:10}]}),plain=world.elements.createEntity({kind:'static',position:[60,50]});
 const proto=Object.getPrototypeOf(lamp.body),getState=proto.getState,reads=new Map();
 proto.getState=function(...a){reads.set(this,(reads.get(this)??0)+1);return getState.apply(this,a);};
 const lampReads=()=>reads.get(lamp.body)??0,plainReads=()=>reads.get(plain.body)??0;
 try{
 assert.equal(entityLights(plain).length,0);assert.equal(plainReads(),0,'no lights: no state read');
 entityLights(lamp,{view:new heightView({camera:[0,0],eye:500})});assert.equal(lampReads(),1,'its state once, for its motion and its elevation');
 render.beginFrame();const a=render.visibleLights(),b=render.visibleLights();assert.deepEqual(a,b);assert.notEqual(a,b,'each call its own list');
 assert.equal(lampReads(),2,'inside a frame the night, its glare and the rain share one look at the lights');render.endFrame();
 render.beginFrame();render.visibleLights();assert.equal(lampReads(),3,'a new frame reads them again');render.endFrame();
 }finally{proto.getState=getState;render.dispose();}
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

test('a text step in a panel is text laid on the face: its matrix puts the panel origin where the wall is, lit text shines, detail drops it',()=>{
 const world=new physicsSystem(),view=new heightView({camera:[0,0],eye:900});
 const sign=fill=>[{shape:'rectangle',x:-50,y:0,width:100,height:20,fill:'#222'},{shape:'text',text:'SIGN',x:0,y:10,size:12,align:'center',baseline:'middle',fill}];
 const art={bays:{width:100,margin:0},panels:[{width:100,height:20,at:10,steps:sign('#888'),lit_steps:sign('#fff'),lit:1,fill:'#222',detail:30}]};
 // a board 100 wide, 2 deep, standing 40 tall at y -300: its south face (y -299) looks at the camera at the origin
 const e=world.elements.createEntity({kind:'static',position:[0,-300],components:[{name:'b',layers:[{layer:0,height:0,thickness:40,solid:false,sides:'#777',facade:art,steps:[{shape:'rectangle',x:-50,y:-1,width:100,height:2,fill:'#555'}]}]}]});
 const draw=(zoom,shines=true)=>drawComponents(e,null,1,{view,shines,screen:{bounds:{left:-2000,top:-2000,right:2000,bottom:2000},zoom}})[0].sides;
 const sides=draw(20),texts=sides.filter(p=>p.type==='text');
 assert.ok(texts.length>=1&&texts.every(p=>p.text==='SIGN'),'the text is drawn as text');
 const lit=texts.filter(p=>p.material.fill==='#fff');
 assert.ok(lit.length&&lit.some(p=>p.shine),'a lit sign\'s text shines');
 // the panel's origin (its middle, 10 down from its top) sits on the south face (y -299) at height 10 + 20 - 10 = 20
 const m=lit[0].matrix,k=view.k(20),[X,Y]=view.scaled(0,-299,k);
 near(m[4],X,'x',1e-6);near(m[5],Y,'y',1e-6);
 assert.ok(m[0]>0&&m[3]>0,'it reads left to right and upright, as seen from outside');
 assert.ok(!draw(.5).some(p=>p.type==='text'),'smaller on screen than its detail: no text');
});

test('drawNight takes cuts that thin the dark (a reflection pass\'s darknessCut), drawn in the night\'s layer',async()=>{
 class Rec extends recordingRenderer{constructor(...a){super(...a);Rec.last=this;}}
 const {render}=fixture();render.registerRenderer('recording',Rec);await render.setRenderer('recording',{surface:null});
 const cut={type:'shape',geometry:{type:'path',commands:[['move',0,0],['line',40,0],['line',40,40],['close']]},material:{fill:'#ffffff'},blend:'destination-out',opacity:.5};
 render.beginFrame();render.drawLooks();render.drawNight({tint:'rgba(0,0,20,.8)',cuts:[cut]});render.endFrame();
 const night=Rec.last.frames.at(-1).passes.flatMap(p=>p.packets);
 assert.ok(night.some(p=>p.blend==='destination-out'&&p.geometry?.commands?.[1]?.[1]===40),'the cut is in the night\'s pass');
 render.beginFrame();render.drawLooks();render.drawNight({tint:'rgba(0,0,20,.8)'});render.endFrame();
 assert.ok(!Rec.last.frames.at(-1).passes.flatMap(p=>p.packets).some(p=>p.geometry?.commands?.[1]?.[1]===40),'and only when given');
 render.dispose();
});

test('a layer pulses over its period down to its low, and shows only while its entity\'s switch says so; a switched layer lights no grid',()=>{
 const world=new physicsSystem(),glowing={shape:'rectangle',x:-5,y:-5,width:10,height:10,fill:'#a6f',emits:{strength:1,reach:20}};
 const e=world.elements.createEntity({kind:'static',position:[0,0],components:[{name:'mat',layers:[{layer:0,height:0,thickness:0,solid:false,steps:[box]},
  {layer:1,height:0,thickness:0,solid:false,shown_when:'!occupied',pulse:{period:2,low:.5},steps:[box]},{layer:2,height:0,thickness:0,solid:false,shown_when:'occupied',steps:[glowing]}]}]});
 const layers=t=>drawComponents(e,null,1,{time:t}).map(p=>[p.layer,p.packets[0].opacity]);
 assert.deepEqual(layers(0),[[0,1],[1,.75]],'at rest: the steady one and the pulsing one, halfway up its swell');
 near(layers(.5)[1][1],1,'a quarter period on: full');near(layers(1.5)[1][1],.5,'three quarters: its low');near(pulseAt({period:2,low:.5},1),.75);
 e.set('occupied',true);assert.deepEqual(layers(0).map(l=>l[0]),[0,2],'occupied: the other look');
 assert.equal(entityEmitters(e,null).length,0,'a switched layer comes and goes, so it does not light the baked grid');
 e.set('occupied',false);assert.equal(drawComponents(e,null,1,{time:0,pictures:true}).find(p=>p.layer===1).picture,undefined,'a pulsing layer is drawn each frame, never a picture');
 assert.throws(()=>world.elements.createEntity({kind:'static',position:[0,0],components:[{name:'x',layers:[{layer:0,pulse:{period:0},steps:[box]}]}]}),/pulse/);
 assert.throws(()=>world.elements.createEntity({kind:'static',position:[0,0],components:[{name:'x',layers:[{layer:0,shown_when:'is occupied',steps:[box]}]}]}),/shown_when/);
});

test('a facade part can be laid on chosen walls (faces, in the thing\'s own frame) and in chosen bays (from 0; -1 the last)',()=>{
 const lit=(more,rotation=0)=>facadeEmitters([box],{...facade,panels:[{...facade.panels[0],lit:1,...more}]},{at:[0,0],rotation},{},0,40);
 const all=lit({}),front=lit({faces:['south']});
 assert.ok(front.length>0&&front.length<all.length,'only the front');assert.ok(front.every(e=>e.outline[0][1]>30),'the south wall: +y');
 assert.equal(lit({faces:['south'],bays:[0,-1]}).length,2,'its first and last bays');
 const turned=lit({faces:['south']},Math.PI/2);assert.ok(turned.every(e=>e.outline[0][0]<-30),'turned a quarter, the front faces west in the world');
 assert.throws(()=>new physicsSystem().elements.createEntity({kind:'static',position:[0,0],components:[{name:'b',layers:[{layer:0,thickness:40,sides:'#777',steps:[box],facade:{panels:[{width:4,faces:['up']}]}}]}]}),/faces/);
 assert.throws(()=>new physicsSystem().elements.createEntity({kind:'static',position:[0,0],components:[{name:'b',layers:[{layer:0,thickness:40,sides:'#777',steps:[box],facade:{panels:[{width:4,bays:[.5]}]}}]}]}),/bays/);
});

test('a look\'s lean makes a thing lean that many times as hard as the view, so its fronts read from across the road',()=>{
 const world=new physicsSystem(),make=look=>world.elements.createEntity({kind:'static',position:[0,-200],look,components:[{name:'b',layers:[{layer:0,height:0,thickness:40,solid:false,sides:'#777',steps:[box]}]}]});
 const view=new heightView({camera:[0,0],eye:300}),top=look=>drawComponents(make(look),null,1,{view}).at(-1).packets[0].matrix[0];
 near(top({})-1,view.k(40)-1,'as the street');near(top({lean:2})-1,(view.k(40)-1)*2,'twice as hard');
 assert.throws(()=>drawComponents(make({lean:-1}),null,1,{view}),/lean/);
});

test('a sloped layer (an awning) draws its top in its own tilted plane, and its walls rise to it corner by corner',()=>{
 const world=new physicsSystem(),aw={shape:'rectangle',x:-20,y:0,width:40,height:16,fill:'#e2902c'};
 const e=world.elements.createEntity({kind:'static',position:[0,-100],components:[{name:'a',layers:[{layer:0,height:14,thickness:1,solid:false,slope:[0,-.5],sides:'#c07020',steps:[aw]}]}]});
 const view=new heightView({camera:[0,0],eye:300}),[part]=drawComponents(e,null,1,{view}),M=part.packets[0].matrix;
 const on=(x,y)=>[M[0]*x+M[2]*y+M[4],M[1]*x+M[3]*y+M[5]],near2=(a,b,why)=>{near(a[0],b[0],why,1e-6);near(a[1],b[1],why,1e-6);};
 near2(on(-20,0),view.at(-20,-100,15),'its back edge at its top');near2(on(-20,16),view.at(-20,-84,7),'its front edge 8 lower: half a unit down per unit out');
 assert.ok(part.sides.length>0,'its valance shows');
 assert.throws(()=>world.elements.createEntity({kind:'static',position:[0,0],components:[{name:'x',layers:[{layer:0,slope:[0],steps:[aw]}]}]}),/slope/);
});

test('lights cast shadows on the walls while the switch is on: kept until the light moves or a blocker near it changes',()=>{
 const {world,render}=fixture();
 world.elements.createEntity({kind:'static',position:[150,50],collision_shape:{shape_type:'box',dimensions:[10,1000]}});
 const lamp=world.elements.createEntity({kind:'static',position:[50,50],data:{emission:{shape:'point',radius:200,position:[0,0],shadows:'static'}}});
 const free=world.elements.createEntity({kind:'static',position:[60,60],data:{emission:{shape:'point',radius:50,position:[0,0],shadows:'none'}}});
 const lights=()=>{render.beginFrame();const out=render.visibleLights();render.abortFrame();return out;};
 const [a]=lights();assert.equal(a.polygon,undefined,'off by default');assert.equal(a.shadows,'static');assert.deepEqual(a.origin,[50,50]);
 assert.equal(render.setLightShadows(true),true);
 const [b,c]=lights();assert.ok(b.polygon.length>=3);assert.ok(Math.max(...b.polygon.map(p=>p[0]))<=145.001,'stopped at the near face of the wall');assert.equal(c.polygon,undefined,'shadows none: no polygon');
 const [b2]=lights();assert.equal(b2.polygon,b.polygon,'the same array while nothing changes (so the tiles stay cached)');
 world.elements.createEntity({kind:'static',position:[50,0],collision_shape:{shape_type:'box',dimensions:[1000,10]}});
 const [b3]=lights();assert.notEqual(b3.polygon,b.polygon,'a new wall in reach casts it again');assert.ok(Math.min(...b3.polygon.map(p=>p[1]))>=4.999);
 lamp.moveTo(40,50);const [b4]=lights();assert.notEqual(b4.polygon,b3.polygon,'and so does moving');
 assert.throws(()=>render.setLightShadows({resolution:2}),/resolution/);
 assert.equal(render.setLightShadows(null),false);const [d]=lights();assert.equal(d.polygon,undefined,'off again');
 render.dispose();
});

test('rooms thin the night: an outdoor room to the sky\'s darkness, an indoor room to its fill while its lights are on',()=>{
 const rects=[{x:0,y:0,w:10,h:10}],night={tint:'rgba(0,0,0,.8)'};
 const areas=nightAreas([{type:'outdoor',rects,flags:{}},{type:'indoor',fill:.4,rects,flags:{}},{type:'indoor',fill:.4,rects,flags:{lights_off:true}},{type:'indoor',fill:null,rects,flags:{}},{type:'indoor',fill:.9,rects,flags:{}}],night,{sky:.2});
 assert.deepEqual(areas.map(a=>a.cut),[.75,.5],'the sky lets .75 of the dark through... away; the fill .5; lights off, no fill, or a fill darker than the night: none');
 assert.equal(nightAreas([{type:'outdoor',rects,flags:{}}],night,{sky:.8}).length,0,'a full night sky thins nothing');
 assert.equal(nightAreas([{type:'outdoor',rects,flags:{}}],night,{sky:.31})[0].cut,39/64,'in steps of 1/64');
});

test('a step whose material is a "$name" look value is read through the look when the night looks for glowing steps',async()=>{
 const materials={'kit:chrome':{kind:'material',fill:'#ccd'},'kit:neon':{kind:'material',fill:'#f0a',emits:true}};
 const world=new physicsSystem({asset_library:{getResource:id=>{if(!materials[id])throw new Error(`Unknown asset resource: ${id}`);return materials[id];},resolveTemplate:(id,packet={})=>structuredClone(packet)}});
 const render=new renderSystem({physics_system:world,camera:new cameraSystem({position:[50,50],viewport:{width:400,height:400}})});
 render.registerRenderer('recording',recordingRenderer);await render.setRenderer('recording',{surface:null});render.setHeightView({eye:900});
 const part=m=>({name:'wheel',layers:[{layer:0,height:0,thickness:4,solid:false,steps:[{shape:'circle',x:0,y:0,radius:5,material:'$wheel'}]}]});
 world.elements.createEntity({kind:'static',position:[40,50],look:{values:{wheel:'kit:chrome'}},components:[part()]});
 world.elements.createEntity({kind:'static',position:[80,50],look:{values:{wheel:'kit:neon'}},components:[part()]});
 world.updateState(1/60);
 render.beginFrame();render.drawLooks(1,{covers:24});const shines=render.nightOver().filter(o=>o.over==='shine');render.endFrame();
 assert.equal(shines.length,1,'the neon one shines, the chrome one does not, from one drawing');
 render.dispose();
});
