#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const results=[];
function test(name,fn){const env=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true,capture:true});fn(env);assert.deepEqual(env.errors,[]);results.push(name);}
const value=(env,code)=>structuredClone(env.run(`(()=>{${code}})()`));
const setup=`
 const ctx=game.ctx,w=game.weather;
 const circle={type:'dust',x:20,y:30,size:3,color:'rgba(40, 80, 120, 1)',life:.5};
 const spark={type:'spark',x:40,y:50,vx:2,vy:3,life:.4};
 const ghost={type:'ghost',x:60,y:70,angle:.2,life:.3};
`;

test('Only transformed ghost particles copy the full Canvas state',env=>{
 const r=value(env,setup+`
  w.particles=[circle,spark,ghost,circle,spark];
  let saves=0,restores=0;const save=ctx.save,restore=ctx.restore;
  ctx.save=function(){saves++;return save.call(this);};ctx.restore=function(){restores++;return restore.call(this);};
  const original=JSON.stringify(w.particles);w.draw(ctx);
  return {saves,restores,unchanged:JSON.stringify(w.particles)===original};
 `);
 assert.deepEqual(r,{saves:1,restores:1,unchanged:true});
});

test('Particle order, inherited alpha, styles and transforms survive mixed draws',env=>{
 const r=value(env,setup+`
  Object.assign(ctx,{globalAlpha:.67,fillStyle:'#795134',strokeStyle:'#357951',lineWidth:7,
   shadowBlur:3,shadowColor:'#406080',shadowOffsetX:2,filter:'blur(1px)',globalCompositeOperation:'lighter'});
  ctx.setTransform(.8,.2,-.1,1.3,7,9);
  const matrix=JSON.stringify(ctx.getTransform()),draws=[];
  for(const k of ['fill','stroke']){const fn=ctx[k];ctx[k]=function(...a){draws.push([k,this.globalAlpha,this.fillStyle,this.strokeStyle,this.lineWidth]);return fn.apply(this,a);};}
  w.particles=[circle,spark,ghost,circle];w.draw(ctx);
  return {draws,styles:[ctx.globalAlpha,ctx.fillStyle,ctx.strokeStyle,ctx.lineWidth,ctx.shadowBlur,ctx.shadowColor,ctx.shadowOffsetX,ctx.filter,ctx.globalCompositeOperation],matrix:JSON.stringify(ctx.getTransform())===matrix};
 `);
 assert.deepEqual(r.draws.map(v=>v[0]),['fill','stroke','fill','fill']);
 assert.deepEqual(r.draws.map(v=>v[1]),[.25,.67,.67,.25]);
 assert.equal(r.draws[1][4],2);
 assert.deepEqual(r.styles,[1,'#795134','#357951',7,3,'#406080',2,'blur(1px)','lighter']);
 assert.equal(r.matrix,true);
});

test('Culled and interpolated particles retain their existing geometry and source state',env=>{
 const r=value(env,setup+`
  RenderInterp.alpha=.5;RenderInterp._drawActive=true;RenderInterp.gen=17;
  const p={...circle,x:30,y:40,_ipP:{x:20,y:30,life:.7},_ipGen:17};
  w.particles=[p,{...circle,x:-1000,y:-1000}];
  const before=JSON.stringify(w.particles),arcs=[];ctx.arc=(...a)=>arcs.push(a);
  w.draw(ctx,{left:0,top:0,right:100,bottom:100});
  return {arcs,unchanged:JSON.stringify(w.particles)===before};
 `);
 assert.equal(r.arcs.length,1);assert.deepEqual(r.arcs[0],[25,35,3,0,Math.PI*2]);assert.equal(r.unchanged,true);
});
console.log(JSON.stringify({passed:results.length,results},null,2));
