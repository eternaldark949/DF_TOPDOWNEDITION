#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const results=[];
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'));fn(e);assert.deepEqual(e.errors,[]);results.push(name);}
const pair=`const a=new BumperCar({x:200,y:200}),b=new BumperCar({x:240,y:200,angle:Math.PI});
 const contact=(av,bv)=>{a.x=200;a.y=200;b.x=240;b.y=200;a.angle=0;b.angle=Math.PI;a.vx=av;a.vy=0;b.vx=bv;b.vy=0;a.checkBumperCollision(b,game);};`;
test('Stationary overlaps, separating contacts and slow shoves do not score',e=>{
 assert.deepEqual(value(e,pair+`contact(0,0);contact(-3,3);contact(.4,-.4);return [a.hitScore,b.hitScore];`),[0,0]);
});
test('Repeated corner contact cannot farm points; separation and recovery rearm the pair',e=>{
 const r=value(e,pair+`
 contact(3,-3);const first=[a.hitScore,b.hitScore];
 for(let i=0;i<300;i++){a._bumperTick++;b._bumperTick++;a.hitCooldown=b.hitCooldown=0;contact(3,-3);}
 const pinned=[a.hitScore,b.hitScore];
 b.x=400;a.checkBumperCollision(b,game);contact(3,-3);
 return {first,pinned,fresh:[a.hitScore,b.hitScore]};`);
 assert.deepEqual(r,{first:[1,1],pinned:[1,1],fresh:[2,2]});
});
test('A target cannot earn a point by facing an incoming car while stationary',e=>{
 assert.deepEqual(value(e,pair+`contact(3,0);return [a.hitScore,b.hitScore];`),[1,0]);
});
test('Recovery applies only to that opponent; a clean hit on someone else still counts',e=>{
 const r=value(e,pair+`contact(3,-3);a.hitCooldown=0;const c=new BumperCar({x:240,y:200,angle:Math.PI});
 a.x=200;a.vx=3;a.vy=0;a.angle=0;a.checkBumperCollision(c,game);return a.hitScore;`);assert.equal(r,2);
});
test('Scoring AI cars break away and temporarily choose a different opponent',e=>{
 const r=value(e,`
 const a=new BumperCar({x:200,y:200,isAI:true}),b=new BumperCar({x:240,y:200,angle:Math.PI,isAI:true}),c=new BumperCar({x:400,y:300});
 a.vx=3;b.vx=-3;a.checkBumperCollision(b,game);
 const escape=[a._escapeTicks,b._escapeTicks];a.updateAI([a,b,c],[]);
 return {escape,retarget:a.aiTarget===c,avoided:a._avoidTarget===b};`);
 assert.deepEqual(r,{escape:[40,40],retarget:true,avoided:true});
});
test('An about-face from rest turns toward input instead of getting stuck in reverse',e=>{
 const r=value(e,`
 const m=new BumperCarMinigame();m.active=true;m.timer=1000;m._updateHUD=()=>{};
 const a=m.playerCar=new BumperCar({x:450,y:450,angle:0});m.cars=[a];
 game.activeMap={walls:[]};game.keys={a:true};game.joystick={active:false};
 for(let i=0;i<100;i++)m.update(game);
 return {error:Math.abs(Math.atan2(Math.sin(Math.PI-a.angle),Math.cos(Math.PI-a.angle))),x:a.x};`);
 assert.ok(r.error<.05,JSON.stringify(r));assert.ok(r.x<400,JSON.stringify(r));
});
test('Chase assist is bounded, gives up on steering away, and never accelerates with no input',e=>{
 const r=value(e,`
 const m=new BumperCarMinigame();m.active=true;m.timer=1000;m._updateHUD=()=>{};
 const a=m.playerCar=new BumperCar({x:200,y:200}),b=new BumperCar({x:400,y:230});m.cars=[a,b];
 const assisted=m._chaseHeading(0),picked=m._chaseTarget===b;
 const away=m._chaseHeading(Math.PI),released=m._chaseTarget===null;
 game.activeMap={walls:[]};game.keys={};game.joystick={active:false};
 const start=[a.x,a.y];m.update(game);
 return {assisted,picked,away,released,idle:a.x===start[0]&&a.y===start[1]};`);
 assert.ok(r.assisted>0&&r.assisted<=.25);assert.equal(r.picked,true);assert.equal(r.away,Math.PI);assert.equal(r.released,true);assert.equal(r.idle,true);
});
test('A full seven-car round scores, ends and restores player control and exits',e=>{
 const r=value(e,`
 game._doLoadMap('biggs_arena');game.currency=1000;
 const exits=game.activeMap.transitions,m=game.bumperMinigame;m.start(game);m._updateHUD=()=>{};
 const cars=m.cars.slice(),player=m.playerCar;game.joystick={active:true,dx:0,dy:0};game.keys={};
 for(let i=0;i<3600;i++){
  if(i%12===0){
   const target=cars.filter(c=>c!==player).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0];
   const dx=target.x-player.x,dy=target.y-player.y,d=Math.hypot(dx,dy)||1;game.joystick.dx=dx/d;game.joystick.dy=dy/d;
  }m.update(game);
 }
 const currency=game.currency;m.update(game);
 return {count:cars.length,active:m.active,driving:game.isDriving,visible:game.player.visible,
  exits:game.activeMap.transitions===exits,paidOnce:game.currency===currency,
  scored:cars.every(c=>c.hitScore>0),finite:cars.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y))};`);
 assert.deepEqual(r,{count:7,active:false,driving:false,visible:true,exits:true,paidOnce:true,scored:true,finite:true});
});
console.log(JSON.stringify({passed:results.length,results},null,2));
