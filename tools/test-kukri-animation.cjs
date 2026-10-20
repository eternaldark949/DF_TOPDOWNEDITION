#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});fn(e);assert.deepEqual(e.errors,[]);tests.push(name);}
const setup=`game._doLoadMap('apt_949');game.currentWeapon=createItemFromRegistry('maiden_kukri',game);
 game.weaponMode='melee';game.weaponHolstered=false;game.holsterAnim=game.holsterAnimTarget=1;
 game.player._game=game;game.player.x=game.player.y=0;game.player.angle=0;GameSettings.playerGlow=false;
 game.player.walkCycle=0;game.player.speed=0;game.sneaking=false;_gameTimeSec=10;
 const config={gender:'female',stance:'idle',pose:'none',noShadow:true};`;
test('Both cuts sweep in opposite directions and return continuously to guard',e=>{
 const r=value(e,`
 const cuts=[];
 for(const side of [-1,1]){
  const angles=[];for(let i=0;i<=20;i++)angles.push(sampleMeleeSwing(MELEE_SWING.windup+(MELEE_SWING.cutEnd-MELEE_SWING.windup)*i/20,side).a);
  const seams=[MELEE_SWING.windup,MELEE_SWING.cutEnd].map(t=>{
   const a=sampleMeleeSwing(t-1e-7,side),b=sampleMeleeSwing(t+1e-7,side);return Math.hypot(a.handX-b.handX,a.handY-b.handY)+Math.abs(a.a-b.a);
  });
  cuts.push({side,angles,seams,end:sampleMeleeSwing(MELEE_SWING.duration,side)});
 }return {cuts,before:sampleMeleeSwing(-.01,1),after:sampleMeleeSwing(.23,1)};`);
 for(const c of r.cuts){assert.ok(c.angles.every((a,i)=>!i||(a-c.angles[i-1])*c.side<=1e-9));assert.ok(c.seams.every(d=>d<.0001));assert.ok(Math.abs(c.end.a-.35)<1e-10);assert.equal(c.end.handX,8);assert.equal(c.end.handY,9);}
 assert.equal(r.before,null);assert.equal(r.after,null);
});
test('The weapon stays in the right fist while the arm reaches and the elbow follows',e=>{
 const r=value(e,setup+`
 const weapon=drawWeapon,records=[];drawWeapon=(ctx,id,x,y,a)=>{if(id==='maiden_kukri')records.push({x,y,a});};
 const samples=[];
 for(const side of [-1,1])for(const age of [0,.0264,.0924,.1584,.22]){
  game._slashT=10-age;game._slashSide=side;drawProceduralHumanoid(game.ctx,game.player,config);
  const g=_humanoidDrawBuffer(game.player).geometry;
  samples.push({side,age,hand:g.fists[1].slice(),elbow:g.elbows[1].slice(),weapon:records.at(-1)});
 }drawWeapon=weapon;return samples;`);
 for(const s of r){assert.ok(Math.abs(s.weapon.x-s.hand[0])<1e-10);assert.ok(Math.abs(s.weapon.y-s.hand[1])<1e-10);assert.ok(Math.abs(Math.hypot(s.hand[0]-s.elbow[0],s.hand[1]-s.elbow[1])-14)<1e-8,JSON.stringify(s));}
 for(const side of [-1,1]){const samples=r.filter(s=>s.side===side);assert.ok(samples[2].hand[0]-samples[0].hand[0]>13);assert.ok(Math.hypot(samples[2].elbow[0]-samples[0].elbow[0],samples[2].elbow[1]-samples[0].elbow[1])>5);}
});
test('Low and high rendering rates reach the same timed hand and blade pose',e=>{
 const r=value(e,setup+`
 const run=hz=>{delete game.player._animState;game._slashT=10;game._slashSide=1;
  for(let i=0;i/hz<.0924;i++){_gameTimeSec=10+i/hz;drawProceduralHumanoid(game.ctx,game.player,config);}
  _gameTimeSec=10.0924;drawProceduralHumanoid(game.ctx,game.player,config);
  return {hand:_humanoidDrawBuffer(game.player).geometry.fists[1].slice(),pose:{...game.slashAngle()}};
 };return [run(16),run(60)];`);assert.deepEqual(r[0],r[1]);
});
test('The trail ends at the shared blade tip and only samples past cut positions',e=>{
 const r=value(e,setup+`
 const ctx=game.ctx,move=ctx.moveTo,line=ctx.lineTo;const results=[];
 for(const side of [-1,1])for(const age of [.055,.0924,.13,.1584,.205]){
  const points=[];ctx.moveTo=(x,y)=>points.push([x,y]);ctx.lineTo=(x,y)=>points.push([x,y]);
  game._slashT=10-age;game._slashSide=side;game.slashes=[{x:0,y:0,a:0,t0:game._slashT,side,reach:36,arc:1.4}];game.drawSlashes(ctx);
  const t=Math.min(age,MELEE_SWING.cutEnd),tip=sampleMeleeSwing(t,side),start=sampleMeleeSwing(Math.max(MELEE_SWING.windup,t-.065),side);
  const edge=p=>[p.handX+(19.4*Math.cos(p.a)-2.6*Math.sin(p.a))*.95,p.handY+(19.4*Math.sin(p.a)+2.6*Math.cos(p.a))*.95];
  results.push({first:points[0],last:points.at(-1),start:edge(start),tip:edge(tip)});
 }ctx.moveTo=move;ctx.lineTo=line;return results;`);
 for(const s of r){for(let i=0;i<2;i++){assert.ok(Math.abs(s.first[i]-s.start[i])<1e-8);assert.ok(Math.abs(s.last[i]-s.tip[i])<1e-8);}}
});
test('Holstering suppresses the attack pose and trails expire without leaking canvas state',e=>{
 const r=value(e,setup+`
 game._slashT=10-.0924;game._slashSide=1;game.weaponHolstered=true;game.holsterAnim=game.holsterAnimTarget=0;
 drawProceduralHumanoid(game.ctx,game.player,config);const hand=_humanoidDrawBuffer(game.player).geometry.fists[1].slice();
 game.slashes=[{x:0,y:0,a:0,t0:9,side:1,reach:36,arc:1.4}];
 game.ctx.setTransform(.5,.2,-.1,2,10,20);game.ctx.globalAlpha=.4;game.ctx.globalCompositeOperation='source-over';game.drawSlashes(game.ctx);
 const m=game.ctx.getTransform();return {hand,left:game.slashes.length,m:[m.a,m.b,m.c,m.d,m.e,m.f],alpha:game.ctx.globalAlpha,mode:game.ctx.globalCompositeOperation};`);
 assert.ok(r.hand[0]<10);assert.equal(r.left,0);assert.deepEqual(r.m,[.5,.2,-.1,2,10,20]);assert.equal(r.alpha,.4);assert.equal(r.mode,'source-over');
});
console.log(JSON.stringify({passed:tests.length,tests},null,2));
