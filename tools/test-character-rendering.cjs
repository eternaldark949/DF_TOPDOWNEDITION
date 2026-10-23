#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const results=[];
function test(name,fn){const env=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true,capture:true});fn(env);assert.deepEqual(env.errors,[]);results.push(name);}
const value=(env,code)=>structuredClone(env.run(`(()=>{${code}})()`));
const scene=`
 const ctx=game.ctx;
 const g={body:bodyCanon('female','curvy'),torso:{},skin:'#c99873',darken:(hex,f)=>darkenHex(hex,Math.floor(f*255))};
 g.torso.x=g.body.tb;g.torso.w=g.body.tf-g.body.tb;
 const fills=[],fill=ctx.fill;
 ctx.fill=function(path){fills.push({path,color:this.fillStyle,alpha:this.globalAlpha});return fill.call(this,path);};
`;

test('Garment paths are reused across characters while colors remain live',env=>{
 const r=value(env,scene+`
  WARDROBE.tops.jacket.draw(ctx,g,{color:'#303080',inner:'#ffffff',trim:'#008000'});
  const first=fills.splice(0);
  const other={...g};WARDROBE.tops.jacket.draw(ctx,other,{color:'#802030',inner:'#202020',trim:'#ff0000'});
  return {same:first.every((v,i)=>v.path===fills[i].path),colorsChanged:first.every((v,i)=>v.color!==fills[i].color),
   separateLapels:fills[2].path!==fills[3].path,paths:fills.length};
 `);
 assert.deepEqual(r,{same:true,colorsChanged:true,separateLapels:true,paths:4});
});

test('Cached garment details fit different body proportions and keep alpha/transforms',env=>{
 const r=value(env,scene+`
  ctx.setTransform(.5,.3,-.2,1.7,12,3);ctx.globalAlpha=.37;const before=ctx.getTransform();
  WARDROBE.tops.jacket.draw(ctx,g,{color:'#303080'});const first=fills.splice(0);
  const male=bodyCanon('male','broad'),other={...g,body:male,torso:{x:male.tb,w:male.tf-male.tb}};
  WARDROBE.tops.jacket.draw(ctx,other,{color:'#303080'});
  return {distinct:first.every((v,i)=>v.path!==fills[i].path),alpha:fills.every(v=>v.alpha===.37),
   transform:JSON.stringify(before)===JSON.stringify(ctx.getTransform()),
   lapel:first[2].path.commands[0],maleLapel:fills[2].path.commands[0],front:g.torso.x+g.torso.w,maleFront:other.torso.x+other.torso.w};
 `);
 assert.equal(r.distinct,true);assert.equal(r.alpha,true);assert.equal(r.transform,true);
 assert.deepEqual(r.lapel,['moveTo',r.front-.6,-2.6]);
 assert.deepEqual(r.maleLapel,['moveTo',r.maleFront-.6,-2.6]);
});

test('Warm static clothing creates no new paths or raster sprites',env=>{
 const r=value(env,scene+`
  const keys=['suit','sports_bra','sleeved_crop','tshirt','tank','crop_top','hoodie','jacket','vest','scrubs'];
  const draw=()=>{for(const k of keys)WARDROBE.tops[k].draw(ctx,g,{color:'#305080'});};
  draw();
  const Base=Path2D;let created=0,images=0;globalThis.Path2D=class extends Base{constructor(...a){super(...a);created++;}};
  const image=ctx.drawImage;ctx.drawImage=function(...a){images++;return image.apply(this,a);};
  for(let i=0;i<100;i++)draw();
  globalThis.Path2D=Base;ctx.drawImage=image;return {created,images};
 `);
 assert.deepEqual(r,{created:0,images:0});
});

test('Clothing bust shapes retain separate fills and reuse outlines across colors',env=>{
 const r=value(env,scene+`
  WARDROBE.tops.tshirt.draw(ctx,g,{color:'#305080'});const first=fills.splice(0);
  WARDROBE.tops.tshirt.draw(ctx,g,{color:'#ff8800'});
  const a=fills[1].path.commands[0],b=fills[2].path.commands[0];
  return {count:fills.length,same:first.every((v,i)=>v.path===fills[i].path),separate:fills[1].path!==fills[2].path,
   leftY:a[2],rightY:b[2],expectedY:g.body.bust.y,changed:first.every((v,i)=>v.color!==fills[i].color)};
 `);
 assert.equal(r.count,3);assert.equal(r.same,true);assert.equal(r.separate,true);assert.equal(r.changed,true);
 assert.equal(r.leftY,-r.expectedY);assert.equal(r.rightY,r.expectedY);
});
test('Detailed clothing/body timings are exclusive, scoped and restore their original functions',env=>{
 env.scope.performance.now=()=>++env.scope.__clock;
 env.scope.__clock=0;
 const r=value(env,scene+`
  const before=[bodyLimbPath,bodyTorsoPath,drawBodyHand,WARDROBE.tops.coat.draw,WARDROBE.tops.jacket.draw,WARDROBE.shoes.heels.draw];
  PeopleProfiler.sync(true);PeopleProfiler.beginEntities();RenderStats.peopleDepth=1;
  WARDROBE.tops.coat.draw(ctx,g,{color:'#305080'});
  const clothing=RenderStats.peopleParts.Clothing,shapes=RenderStats.peopleParts['Body shapes'];
  RenderStats.peopleScope=false;WARDROBE.tops.coat.draw(ctx,g,{color:'#305080'});
  const scoped=clothing===RenderStats.peopleParts.Clothing&&shapes===RenderStats.peopleParts['Body shapes'];
  PeopleProfiler.sync(false);
  const after=[bodyLimbPath,bodyTorsoPath,drawBodyHand,WARDROBE.tops.coat.draw,WARDROBE.tops.jacket.draw,WARDROBE.shoes.heels.draw];
  return {clothing,shapes,scoped,restored:before.every((fn,i)=>fn===after[i])};
 `);
 assert.deepEqual(r,{clothing:4,shapes:1,scoped:true,restored:true});
});

test('Hair/cloth transforms snapshot native coordinates once and reuse plain numeric fields',env=>{
 const r=value(env,`
  const data={a:1.2,b:.3,c:-.4,d:.9,e:1234.5,f:-678.25};let reads=0;
  const native={};for(const k of Object.keys(data))Object.defineProperty(native,k,{get(){reads++;return data[k];}});
  _stInvSrc=null;_stM=null;_worldCanvas=game.canvas;
  _worldMatrix={inverse(){return {multiply(){return native;}};}};
  const T=_simTransform(game.ctx),matrix=T.M;const initial=reads;
  let error=0;const out={};
  for(let i=0;i<50;i++){const x=i*.25,y=-i*.17,w=T.toW(x,y);T.toLInto(out,w.x,w.y);error=Math.max(error,Math.abs(out.x-x),Math.abs(out.y-y));}
  const afterPoints=reads;data.e=99.5;const next=_simTransform(game.ctx);
  return {initial,afterPoints,afterRefresh:reads,error,reused:matrix===next.M,x:next.M.e};
 `);
 assert.equal(r.initial,6);assert.equal(r.afterPoints,6);assert.equal(r.afterRefresh,12);
 assert.ok(r.error<1e-9);assert.equal(r.reused,true);assert.equal(r.x,99.5);
});

test('Limb shading reuses outline geometry and preserves collapsed-joint length',env=>{
 const r=value(env,`
  const ctx=game.ctx,T=BODY_CANON.female.fore,out={},counts={hypot:0,atan2:0,cos:0,sin:0},original={};
  for(const k of Object.keys(counts)){original[k]=Math[k];Math[k]=(...a)=>{counts[k]++;return original[k](...a);};}
  const h=_humanoidDrawBuffer({});h.ctx=ctx;h.shade={lx:0,ly:0,hl2:'#ffffff'};
  let matte,gloss;
  try{
   h.drawLimb(0,0,10,5,T,'#204060',false);matte={...counts};
   for(const k in counts)counts[k]=0;
   h.drawLimb(0,0,10,5,T,'#204060',true);gloss={...counts};
   bodyLimbPath(ctx,4,5,4,5,T,out);
  }finally{for(const k in original)Math[k]=original[k];}
  return {matte,gloss,collapsed:out.length,angle:out.angle};
 `);
 assert.deepEqual(r.matte,{hypot:1,atan2:1,cos:0,sin:0});
 assert.deepEqual(r.gloss,{hypot:1,atan2:1,cos:1,sin:1});
 assert.equal(r.collapsed,0);assert.equal(r.angle,0);
});


const crowd=`
 game.story.update=()=>{};game._doLoadMap('sdc');GameSettings.crowdQuality='high';GameSettings.crowdHybrid=true;
 game.view={x:0,y:0,zoom:1,shakeX:0,shakeY:0};game.player.x=0;game.player.y=0;
 const ctx=game.ctx;ctx.setTransform(1,0,0,1,0,0);_worldCanvas=game.canvas;_worldMatrix=ctx.getTransform();
 const look={stance:'idle',skinColor:'#c99873',hair:{type:'long',color:'#402010'},top:{type:'tank',color:'#803030'},bottom:{type:'mini_skirt',color:'#202020'},shoes:{type:'sneakers',color:'#ffffff'}};
 const walker=(x)=>{const e={x,y:0,angle:0,facingAngle:0,look,walkPhase:0};syncHumanoidGait(e);Object.assign(e._gait,{speed:2,dirX:1,dirY:0,tick:_simTick,prevX:x,prevY:0});return e;};
 let stamps=0,live=0;const D=drawProceduralHumanoid;
 const passes=[];globalThis.drawProceduralHumanoid=function(c,e,cfg){if(cfg._hybrid)passes.push(cfg._hybrid.pass);else live++;return D.apply(this,arguments);};
 const draw=(e,cfg=look)=>{passes.length=0;live=0;ctx.setTransform(1,0,0,1,0,0);drawCrowdHumanoid(ctx,e,{...cfg});return {passes:passes.slice(),live};};
`;
test('Hybrid crowd: far walkers bake each walk cell once, then stamp it with hair and cloth live',env=>{
 const r=value(env,crowd+`
  const e=walker(600);_frameTime=1;
  const first=draw(e);                       // bakes the cell (under + over), then stamps
  const again=draw(e);                       // the same cell: stamp only
  e.walkPhase=Math.PI;_frameTime=2;const other=draw(e);
  const b=CrowdHybrid.cache.get(e);
  return {first:first.passes,again:again.passes,other:other.passes,cells:Array.from(b.have).reduce((a,v)=>a+v,0)};
 `);
 assert.deepEqual(r,{first:['under','over','stamp'],again:['stamp'],other:['under','over','stamp'],cells:2});
});
test('Hybrid crowd: near her, standing, posed, armed, zoomed in, a reflection or switched off are drawn live',env=>{
 const r=value(env,crowd+`
  const out={};_frameTime=1;
  out.near=draw(walker(100)).live===1;
  const s=walker(600);s._gait.speed=0;out.standing=draw(s).live===1;
  const p=walker(600);p._pose={w:1};out.posed=draw(p).live===1;
  out.armed=draw(walker(600),{...look,weapon:{id:'pistol'}}).live===1;
  game.view.zoom=2;out.zoomed=draw(walker(600)).live===1;game.view.zoom=1;
  const m=walker(600);m._reflectionProxy=true;out.reflection=draw(m).live===1;
  GameSettings.crowdHybrid=false;out.off=draw(walker(600)).live===1;GameSettings.crowdHybrid=true;
  out.far=draw(walker(600)).passes.includes('stamp');
  return out;
 `);
 assert.deepEqual(r,{near:true,standing:true,posed:true,armed:true,zoomed:true,reflection:true,off:true,far:true});
});
test('Hybrid crowd: a few cells a frame, a change of pace keeps the bake, a new look rebakes',env=>{
 const r=value(env,crowd+`
  _frameTime=5;const es=[1,2,3,4,5].map(i=>walker(500+i*60));const res=es.map(e=>draw(e).passes.includes('stamp'));
  const e=es[0];const b=CrowdHybrid.cache.get(e);e._gait.speed=2.5;draw(e);const kept=CrowdHybrid.cache.get(e)===b&&b.have.some(Boolean);
  _frameTime=6;const hatted=draw(e,{...look,hat:{type:'beanie',color:'#000'}});
  return {stamped:res,kept,rebaked:hatted.passes[0]==='under'};
 `);
 assert.deepEqual(r,{stamped:[true,true,true,false,false],kept:true,rebaked:true});
});
console.log(JSON.stringify({passed:results.length,results},null,2));
