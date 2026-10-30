#!/usr/bin/env node
'use strict';
// The parks' moon pools (engine/pools.js): water underfoot that she wades through more slowly, her steps splash
// and ring the water, the surface stirs on its own, and her car stops at the rim.
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});fn(e);assert.deepEqual(e.errors,[]);tests.push(name);}
const setup=`game._doLoadMap('sdc');game.running=true;game.paused=false;game.isDriving=false;game.player.visible=true;game.player._game=game;
 const P=game.activeMap.pools;const p=P[0];_gameTimeSec=50;game.poolRings=[];`;

test('Every park has its pool: water in it, grass beyond the rim',e=>{
 const r=value(e,setup+`return {n:P.length,names:P.every(q=>q.park),mid:game.materialAt(p.x,p.y),near:game.materialAt(p.x+p.r-4,p.y),out:game.materialAt(p.x+p.r+30,p.y+40),dry:game.poolAt(p.x+p.r+1,p.y)};`);
 assert.equal(r.n,6);assert.ok(r.names);
 assert.equal(r.mid,'water');assert.equal(r.near,'water');assert.equal(r.out,'grass');assert.equal(r.dry,null);
});

test('She wades at 70% pace in the water',e=>{
 const r=value(e,setup+`const walk=(x,y)=>{game.player.x=x;game.player.y=y;game.player.velX=game.player.velY=0;for(let i=0;i<30;i++)game.player.applyMovement(1,0);return game.player.x-x;};
  const wet=walk(p.x-40,p.y),dry=walk(p.x-p.r-400,p.y-p.r-200);return {ratio:wet/dry};`);
 assert.ok(Math.abs(r.ratio-0.7)<0.06,String(r.ratio));
});

test('Her steps ring the water (smaller when she sneaks) and walking leaves a wake; a dry step does not',e=>{
 const r=value(e,setup+`game.player.x=p.x;game.player.y=p.y;game.onStep(game.player,2);const loud=game.poolRings.length,size=game.poolRings[0]&&game.poolRings[0].size;
  game.sneaking=true;game.onStep(game.player,1);const soft=game.poolRings.at(-1).size;game.sneaking=false;
  game.poolRings=[];game.player._gait={speed:2};game._poolStirAt=_gameTimeSec;game.updatePools();const wake=game.poolRings.length;
  game.poolRings=[];game.player.x=p.x+p.r+60;game.onStep(game.player,2);game._wakeAt=-9;game.updatePools();
  return {loud,size,soft,wake,dry:game.poolRings.length};`);
 assert.equal(r.loud,1);assert.ok(r.soft<r.size);assert.equal(r.wake,1);assert.equal(r.dry,0);
});

test('The pools stir on their own, and the rings fade and draw inside the water only',e=>{
 const r=value(e,setup+`game.view={left:p.x-500,right:p.x+500,top:p.y-500,bottom:p.y+500};game.player.x=p.x+2000;game._poolStirAt=-9;game.updatePools();
  const stirred=game.poolRings.filter(f=>Math.hypot(f.x-p.x,f.y-p.y)<p.r).length;let clips=0;
  const ctx=new Proxy({},{get:(t,k)=>k==='clip'?()=>{clips++;}:t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
  game.drawPoolRipples(ctx,null);_gameTimeSec+=5;game.drawPoolRipples(ctx,null);return {stirred,clips,left:game.poolRings.length};`);
 assert.ok(r.stirred>=1);assert.ok(r.clips>=1);assert.equal(r.left,0);
});

test('A car stops at the rim: each pool is a collider for driving, not for walking or shots',e=>{
 const r=value(e,setup+`const cols=game.carColliders(),pool=cols.filter(c=>c.pool);const car={length:60,width:28};
  const hit=TrafficVehicle.prototype.checkEnvironmentCollision.call(car,p.x,p.y,0,[],cols);
  const plain=TrafficVehicle.prototype.checkEnvironmentCollision.call(car,p.x,p.y,0,[],getColliders(game.activeMap));
  return {n:pool.length,hit,plain,walk:getColliders(game.activeMap).some(c=>c.pool)};`);
 assert.deepEqual(r,{n:6,hit:true,plain:false,walk:false});
});

test('After dark the pools shine (sheen, wavering light, moons); by day nothing is added',e=>{
 const r=value(e,setup+`game._cullBounds={view:{left:p.x-300,right:p.x+300,top:p.y-300,bottom:p.y+300}};let fills=0;
  const ctx=new Proxy({},{get:(t,k)=>/Gradient$/.test(k)?()=>({addColorStop(){}}):k==='fill'?()=>{fills++;}:t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
  game.drawPoolGlow(ctx,0.05);const day=fills;game.drawPoolGlow(ctx,0.8);return {day,night:fills};`);
 assert.equal(r.day,0);assert.ok(r.night>=10,String(r.night));
});

console.log(`test-park-pools: ${tests.length} passed`);
