#!/usr/bin/env node
'use strict';
// Gameplay contracts and warm draw retention; Chromium provides the visual review.
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const file=join(__dirname,'..','DFAB V8.html');
// Recorded before the art changes; no private save or external workspace fixture is needed.
const baseline=require('./fixtures/biggs-gameplay.json');
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
const tests=[];
function test(name,fn){fn();tests.push(name);}
test('Park geometry, entry target and arena collisions retain their established layout',()=>{
 const fixture=`const b=createBiggsAmusementPark(100,200);return {bounds:b.getBounds(),shapes:b.getCollisionShapes(),door:b.attachedTransition,walls:MAP_DATA.biggs_arena.walls,spawn:MAP_DATA.biggs_arena.spawn,exits:MAP_DATA.biggs_arena.transitions};`;
 assert.deepEqual(value(runtime(file),fixture),baseline.geometry);
});
test('Warm ride and pavilion painting reuses bounded art and balances canvas state',()=>{
 const e=runtime(file,{affine:true,capture:true});
 const r=value(e,`
  game._doLoadMap('biggs_arena');const ctx=game.ctx,b=createBiggsAmusementPark(100,200),car=new BumperCar({x:300,y:300}),wheel=new FerrisWheel(500,500);
  game.camera.x=450;game.camera.y=450;
  b.drawBase(ctx);b.drawTop(ctx);b.drawEmissive(ctx,1);car.draw(ctx);wheel.draw(ctx);
  const roof=b._lkSprites.biggs_roof,body=car._biggsPaint,frame=wheel._lkSprites.biggs_frame,cabins=wheel._biggsCabins.map(c=>c.cv);
  for(let i=0;i<80;i++){game.camera.x+=1;car.x+=.2;wheel.update();b.drawBase(ctx);b.drawTop(ctx);b.drawEmissive(ctx,.8);car.draw(ctx);wheel.draw(ctx);}
  const m=ctx.getTransform();
  return {retained:roof===b._lkSprites.biggs_roof&&body===car._biggsPaint&&frame===wheel._lkSprites.biggs_frame&&cabins.every((c,i)=>c===wheel._biggsCabins[i].cv),pixels:roof.cv.width*roof.cv.height,transform:[m.a,m.b,m.c,m.d,m.e,m.f]};
 `);
 assert.equal(r.retained,true);assert.ok(r.pixels<250000);assert.deepEqual(r.transform,[1,0,0,1,0,0]);assert.deepEqual(e.errors,[]);
});
test('Interior bake is released on departure and can be rebuilt on reentry',()=>{
 const e=runtime(file);const r=value(e,`
 game._doLoadMap('biggs_arena');game.drawBiggsInterior(game.ctx);const first=game._biggsFloor;
 game._doLoadMap('apt_949');const released=game._biggsFloor===null;
 game._doLoadMap('biggs_arena');game.drawBiggsInterior(game.ctx);
 return {released,replaced:game._biggsFloor!==first,size:[game._biggsFloor.width,game._biggsFloor.height]};`);
 assert.deepEqual(r,{released:true,replaced:true,size:[900,900]});assert.deepEqual(e.errors,[]);
});
console.log(JSON.stringify({passed:tests.length,tests},null,2));
