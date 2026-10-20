#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true,capture:true});e.scope.OffscreenCanvas=function(w,h){const cv=e.scope.document.createElement('canvas');cv.width=w;cv.height=h;cv.transferToImageBitmap=()=>({width:cv.width,height:cv.height,closed:false,close(){this.closed=true;}});return cv;};fn(e);assert.deepEqual(e.errors,[]);tests.push(name);}
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
const fixture=`
 const g=game,ctx=g.lightCtx;g.activeMap={_renderSpatialRevision:0};g.lightingBaked=true;
 g.lightCanvas.width=64;g.lightCanvas.height=32;ctx.setTransform(.5,0,0,.5,-125,-250);
 const a={_shadowPath:{id:'a'},_holeGrad:{id:'ga'},_litK:1},b={_shadowPath:{id:'b'},_holeGrad:{id:'gb'},_litK:.3};
 const inside={_sprites:{hole:{id:'hole'},x:10,y:20,d:40}},lamps=[a,b],interiors=[inside];
 let tint='22, 10, 48',rooms=false,w=64,h=32,left=0;
 const prepare=()=>g._prepareLightingBase(ctx,w,h,tint,left,0,500,500,interiors,lamps,rooms);
 const warm=()=>{let c;for(let i=0;i<7;i++){c=prepare();if(c&&!c.hit)g._storeLightingBase(c);}return c;};
`;
test('Only settled exact inputs reuse the base; moving subpixel views do not allocate',e=>{
 const r=value(e,fixture+`
  const cold=prepare();for(let i=0;i<30;i++){ctx.setTransform(.5,0,0,.5,-125-i*.00000001,-250);prepare();}
  const moving=!!g._lightingBase.canvas;const cache=warm();
  ctx.translate(.00000001,0);const changed=prepare();
  return {cold:cold===null,moving,hit:cache.hit,changed:changed===null,valid:g._lightingBase.valid};
 `);
 assert.deepEqual(r,{cold:true,moving:false,hit:true,changed:true,valid:false});
});
test('Lamp geometry, gradient, intensity, order, tint, revision and interior sprites invalidate exactly',e=>{
 const r=value(e,fixture+`
  warm();const mutations=[()=>a._shadowPath={},()=>a._holeGrad={},()=>a._litK=.8,()=>lamps.reverse(),()=>tint='30, 20, 50',()=>g.activeMap._renderSpatialRevision++,()=>inside._sprites.hole={},()=>inside._sprites.x++,()=>left++];
  const invalid=[],rebuilt=[];for(const edit of mutations){edit();const c=prepare();invalid.push(c===null&&!g._lightingBase.valid);rebuilt.push(!!warm().hit);}
  return {invalid,rebuilt};
 `);assert.ok(r.invalid.every(Boolean));assert.ok(r.rebuilt.every(Boolean));
});
test('Continuous lamp changes stay on the uncached path',e=>{
 const r=value(e,fixture+`
  for(let i=0;i<100;i++){a._litK=.3+i*.001;const c=prepare();if(c&&!c.hit)g._storeLightingBase(c);}
  return {allocated:!!g._lightingBase.canvas,valid:g._lightingBase.valid};
 `);assert.deepEqual(r,{allocated:false,valid:false});
});
test('Room lighting, oversized buffers, unbaked geometry and custom Canvas effects use the original path',e=>{
 const r=value(e,fixture+`
  warm();const cases=[];
  rooms=true;cases.push(prepare()===null);rooms=false;
  w=2048;h=1024;cases.push(prepare()===null);w=64;h=32;
  g.lightingBaked=false;cases.push(prepare()===null);g.lightingBaked=true;
  ctx.globalAlpha=.5;cases.push(prepare()===null);ctx.globalAlpha=1;
  ctx.globalCompositeOperation='lighter';cases.push(prepare()===null);ctx.globalCompositeOperation='source-over';
  ctx.filter='blur(2px)';cases.push(prepare()===null);ctx.filter='none';
  ctx.shadowBlur=3;cases.push(prepare()===null);
  return cases;
 `);assert.ok(r.every(Boolean));
});
test('A cache owns one bounded canvas, reuses it and releases its pixels explicitly',e=>{
 const r=value(e,fixture+`
  const c=warm(),canvas=c.canvas,image=c.image;const area=canvas.width*canvas.height;
  a._litK=.7;warm();const reused=canvas===g._lightingBase.canvas;
  g._releaseLightingBase();return {area,reused,released:g._lightingBase===null,size:[canvas.width,canvas.height],closed:image.closed};
 `);assert.deepEqual(r,{area:2048,reused:true,released:true,size:[1,1],closed:true});
});
test('Dynamic vehicles, projectiles and fire never enter the static cache key',e=>{
 const r=value(e,fixture+`
  warm();g.projectiles.push({x:20,y:30,isFireball:true});g._fireTrail=[{x:40,y:50}];g.car.x+=10;
  return {hit:prepare().hit};
 `);assert.equal(r.hit,true);
});
test('Unavailable or lost cache contexts preserve the ordinary lighting path',e=>{
 const r=value(e,fixture+`
  const c=warm();c.ctx=null;c.canvas.getContext=()=>null;
  g._storeLightingBase(c);const unavailable=prepare()===null&&!c.valid&&c.canvas.width===1;
  g._releaseLightingBase();const other=warm();other.ctx.isContextLost=()=>true;
  return {unavailable,lost:prepare()===null&&!other.valid};
 `);assert.deepEqual(r,{unavailable:true,lost:true});
});
test('Map changes and game reset release the old cache backing store',e=>{
 const r=value(e,`
  const first={width:64,height:32};game._lightingBase={canvas:first};game._doLoadMap('apt_949');
  const mapReleased=first.width===1&&first.height===1&&game._lightingBase===null;
  const second={width:128,height:64};game._lightingBase={canvas:second};game.resetGameState();
  return {mapReleased,resetReleased:second.width===1&&second.height===1&&game._lightingBase===null};
 `);assert.deepEqual(r,{mapReleased:true,resetReleased:true});
});
console.log(JSON.stringify({passed:tests.length,results:tests},null,2));
