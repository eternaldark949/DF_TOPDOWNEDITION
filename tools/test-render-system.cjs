#!/usr/bin/env node
'use strict';
// The render system (basement/render-system.js, renderQueue): shapes sorted by depth and drawn in batches of the
// same style, never moved past anything they overlap. And the frame's canvas calls, so a regression shows as a
// number: each scene has a budget (CALL_BUDGET) a little over what it costs today. And the crowd's pose frames
// (ui/crowd-impostors.js): the café's seated and standing crowd is drawn from its bakes.
// The crowd's bakes against the live body, in Chromium: tools/check-crowd-bakes.cjs.
// The pixel comparison (batched against unbatched, in Chromium) is tools/check-render-batching.cjs.
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
// Canvas calls a frame, averaged over a second of play with the clocks running. Measured 14.5-15.9k, 1.8-2.1k,
// 7.6-9.3k (the city's and club's crowds come and go, so they wander); the budgets sit about 10% over the top.
const CALL_BUDGET={ city_night: 17500, cozy_cafe: 2400, moon_city: 10300 };
function test(name,fn){fn();tests.push(name);}
const fresh=()=>{const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true,capture:true});e.setTrace(false);return e;};
const ops=(e,src)=>{e.setTrace(true);e.run('{'+src+'}');const t=e.trace.slice();e.setTrace(false);const c={};for(const r of t)c[r[1]]=(c[r[1]]||0)+1;return {c,t};};

test('Same-colour shapes that miss each other are one fill; what lies between them in depth keeps its place',()=>{
 const e=fresh();
 const sq=(x,y,s=10)=>`[${x},${y},${x+s},${y},${x+s},${y+s},${x},${y+s}]`;
 // two red squares far apart, a blue one between them in z over neither: one red fill, one blue
 let r=ops(e,`const q=new renderQueue(),c=document.createElement('canvas').getContext('2d');q.begin();
  q.poly(1,'#f00',${sq(0,0)});q.poly(2,'#00f',${sq(100,0)});q.poly(3,'#f00',${sq(200,0)});q.flush(c);globalThis.__s={...q.stats};`);
 assert.equal(r.c.fill,2); assert.deepEqual(JSON.parse(e.run('JSON.stringify(__s)')),{shapes:3,batches:2});
 // the blue square now covers the second red one: red, blue, red (three fills, in that order)
 r=ops(e,`const q=new renderQueue(),c=document.createElement('canvas').getContext('2d');q.begin();
  q.poly(1,'#f00',${sq(0,0)});q.poly(2,'#00f',${sq(195,0)});q.poly(3,'#f00',${sq(200,0)});q.flush(c);`);
 assert.equal(r.c.fill,3);
 const styles=r.t.filter(x=>x[1]==='fill').length; assert.equal(styles,3);
 // drawn by z, whatever order they came in
 r=ops(e,`const q=new renderQueue(),c=document.createElement('canvas').getContext('2d');q.begin();
  q.poly(5,'#0f0',${sq(0,0)});q.poly(1,'#f00',${sq(2,2)});q.flush(c);globalThis.__o=q._batches.slice(0,2).map(b=>b.key);`);
 assert.deepEqual(JSON.parse(e.run('JSON.stringify(__o)')).map(k=>k.split('|')[1]),['#f00','#0f0']);
 // overlapping shapes of the same colour aren't merged (no doubled alpha, no winding holes)
 e.run('{'+`const q=new renderQueue(),c=document.createElement('canvas').getContext('2d');q.begin();
  q.poly(1,'#f00',${sq(0,0)},{alpha:0.5});q.poly(2,'#f00',${sq(5,5)},{alpha:0.5});q.flush(c);globalThis.__s={...q.stats};`+'}');
 assert.equal(JSON.parse(e.run('JSON.stringify(__s)')).batches,2);
 // faces that only share an edge do batch (a faceted post); a custom paint is a wall nothing passes
 e.run('{'+`const q=new renderQueue(),c=document.createElement('canvas').getContext('2d');q.begin();
  q.poly(1,'#f00',${sq(0,0)});q.poly(2,'#00f',${sq(10,0)});q.poly(3,'#f00',${sq(20,0)});q.flush(c);globalThis.__a={...q.stats};
  q.begin();q.poly(1,'#f00',${sq(0,0)});q.custom(2,()=>{});q.poly(3,'#f00',${sq(200,0)});q.flush(c);globalThis.__b={...q.stats};
  q.begin();q.poly(1,'#f00',${sq(0,0)});q.poly(3,'#f00',${sq(200,0)});const solo=new renderQueue({batch:false});solo.begin();solo.poly(1,'#f00',${sq(0,0)});solo.poly(3,'#f00',${sq(200,0)});solo.flush(c);globalThis.__c={...solo.stats};`+'}');
 assert.equal(JSON.parse(e.run('JSON.stringify(__a)')).batches,2);
 assert.equal(JSON.parse(e.run('JSON.stringify(__b)')).batches,3);
 assert.equal(JSON.parse(e.run('JSON.stringify(__c)')).batches,2,'batch: false draws each shape on its own');
 // lines batch by colour, width and cap; ellipses and sprites take their place
 r=ops(e,`const q=new renderQueue(),c=document.createElement('canvas').getContext('2d');q.begin();
  q.line(1,2,'#fff',[0,0,10,0],{cap:'round'});q.line(1,2,'#fff',[0,50,10,50],{cap:'round'});q.line(1,3,'#fff',[0,100,10,100],{cap:'round'});
  q.ellipse(1,300,300,5,3,0,'#abc',1);q.ellipse(1,400,300,5,3,0,'#abc',1);q.image(1,c.canvas,500,500,10,10);q.flush(c);`);
 assert.equal(r.c.stroke,3,'two white 2px lines in one, the 3px one, both rings in one'); assert.equal(r.c.drawImage,1); assert.equal(r.c.ellipse,2);
 assert.deepEqual(e.errors,[]);
});

const SCENES={
 city_night:`game._doLoadMap('sdc'); game.worldMinutes=22*60; game.player.x=4890; game.player.y=2300;`,
 cozy_cafe:`game._doLoadMap('cozy_cafe_interior'); game.worldMinutes=10*60; game.cafeLife.reset(game); game.player.x=600; game.player.y=800;`,
 moon_city:`game._doLoadMap('moon_city_nightclub'); game.worldMinutes=23*60; game.player.x=800; game.player.y=700;`
};
// A frame with the game's clocks running (the harness's own stand still): game time for poses and the crowd's
// bakes, frame time for the bake budget each frame
const FRAME='game.update();frame_clock.setGameTime(_simTick/60);_frameTime=1000+_simTick*1000/60;game.draw();';
const WARM=240, MEASURE=60;
test('The trees and street lamps are batched, the crowd stands from its bakes, and every scene draws within its canvas-call budget',()=>{
 const e=fresh(); const got={};
 e.scope.__calls=()=>e.counters.canvasCalls;
 e.run(`game.story.update=()=>{}; game.showProfiler=false; GameSettings.profilerMode='off';
  globalThis.__crowd={live:0,baked:0,calls:0}; const B=CrowdBakes.draw.bind(CrowdBakes); CrowdBakes.draw=(ctx,w,c)=>{const r=B(ctx,w,c); __crowd[r?'baked':'live']++; return r;};
  const D=drawCrowdHumanoid; drawCrowdHumanoid=function(ctx,w,c){const c0=__calls(); try{return D(ctx,w,c);}finally{__crowd.calls+=__calls()-c0;}};`);
 for(const [name,setup] of Object.entries(SCENES)){
  e.run(setup+'game.running=true;game.paused=false;'); for(let i=0;i<WARM;i++) e.run(FRAME);
  e.run('__crowd.live=__crowd.baked=__crowd.calls=0;');
  const c0=e.counters.canvasCalls; for(let i=0;i<MEASURE;i++) e.run(FRAME); got[name]=Math.round((e.counters.canvasCalls-c0)/MEASURE);
  if(name==='city_night'){const s=JSON.parse(e.run('JSON.stringify(FoliageLampDepth.queue.stats)'));
   assert.ok(s.shapes>500,'the city has trees and lamps in view'); assert.ok(s.batches<s.shapes*0.4,`trees and lamps: ${s.batches} draws for ${s.shapes} shapes`);}
  if(name==='cozy_cafe'){const c=JSON.parse(e.run('JSON.stringify(__crowd)'));    // the café's crowd is seated or standing: pose frames
   assert.ok(c.baked>=c.live*9,`café crowd: ${c.baked} bodies from bakes, ${c.live} live`); assert.ok(c.calls/MEASURE<600,`café crowd: ${Math.round(c.calls/MEASURE)} canvas calls a frame`);}
 }
 for(const [name,n] of Object.entries(got)) assert.ok(n<=CALL_BUDGET[name],`${name}: ${n} canvas calls a frame, over its budget of ${CALL_BUDGET[name]}`);
 console.log('  canvas calls a frame:',JSON.stringify(got));
 assert.deepEqual(e.errors,[]);
});

console.log(`test-render-system: ${tests.length} passed`);
