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
// Canvas calls a frame, averaged over a second of play with the clocks running. Measured: city at night 10.3k,
// the park by day 16.1k (it was 46-87k a frame before tree clips were trimmed, ledges batched and the far sides of
// posts and trunks skipped), café 1.7-2.1k, club 6.7-9.9k
// (the city's and club's crowds come and go, so they wander); the budgets sit about 10% over the top.
const CALL_BUDGET={ city_night: 12000, city_park: 18000, cozy_cafe: 2400, moon_city: 10900 };
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
 // A fill closes its own subpaths: no closePath
 r=ops(e,`const q=new renderQueue(),c=document.createElement('canvas').getContext('2d');q.begin();q.poly(1,'#f00',[0,0,10,0,10,10]);q.poly(1,'#f00',[50,0,60,0,60,10]);q.flush(c);`);
 assert.equal(r.c.fill,1); assert.equal(r.c.closePath||0,0);
 assert.deepEqual(e.errors,[]);
});

test('A post or trunk queues only the faces turned to the camera, and they match what the camera sees in 3D',()=>{
 const e=fresh();
 // A tapered post off to the side, projected the way the lean does (k = C/(C-z)); the 3D answer by the face normal
 const r=JSON.parse(e.run(`JSON.stringify((()=>{const C=1000,f=[300,200],out=[];
  const P=(x,y,z)=>{const k=C/(C-z);return [(f[0]+x)*k,(f[1]+y)*k];};
  const ring=(z,r)=>Array.from({length:6},(_,i)=>[Math.cos(i*Math.PI/3)*r,Math.sin(i*Math.PI/3)*r,z]);
  const a=ring(0,5),b=ring(14,3);
  for(let i=0;i<6;i++){const j=(i+1)%6,u=[a[j][0]-a[i][0],a[j][1]-a[i][1],0],v=[b[i][0]-a[i][0],b[i][1]-a[i][1],b[i][2]];
   let N=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];const m=[(a[i][0]+a[j][0])/2,(a[i][1]+a[j][1])/2];
   if(N[0]*m[0]+N[1]*m[1]<0)N=N.map(x=>-x);                          // outward
   const toCam=[-f[0]-a[i][0],-f[1]-a[i][1],C];                        // the camera above the origin, at height C
   out.push([renderQueue.front([...P(...a[i]),...P(...a[j]),...P(...b[j]),...P(...b[i])]),N[0]*toCam[0]+N[1]*toCam[1]+N[2]*toCam[2]>0]);}
  return out;})())`));
 assert.equal(r.filter(x=>x[0]).length,3,'half the faces face the camera'); for(const [got,want] of r) assert.equal(got,want);
 assert.deepEqual(e.errors,[]);
});

const SCENES={
 city_night:`game._doLoadMap('sdc'); game.worldMinutes=22*60; game.player.x=4890; game.player.y=2300;`,
 city_park:`game._doLoadMap('sdc'); game.worldMinutes=14*60; game.player.x=2000; game.player.y=1100;`,   // trees under leaning roofs: clips trimmed to the faces they reach
 cozy_cafe:`game._doLoadMap('cozy_cafe_interior'); game.worldMinutes=10*60; game.cafeLife.reset(game); game.player.x=600; game.player.y=800;`,
 moon_city:`game._doLoadMap('moon_city_nightclub'); game.worldMinutes=23*60; game.player.x=800; game.player.y=700;`
};
// A frame with the game's clocks running (the harness's own stand still): game time for poses and the crowd's
// bakes, frame time for the bake budget each frame
const FRAME='game.update();frame_clock.setGameTime(_simTick/60);_frameTime=1000+_simTick*1000/60;game.draw();';
const WARM=240, MEASURE=60;
test('The trees, street lamps and buildings\' ledges are batched, the crowd stands from its bakes, and every scene draws within its canvas-call budget',()=>{
 const e=fresh(); const got={};
 e.scope.__calls=()=>e.counters.canvasCalls;
 e.run(`game.story.update=()=>{}; game.showProfiler=false; GameSettings.profilerMode='off';
  globalThis.__crowd={live:0,baked:0,calls:0}; const B=CrowdBakes.draw.bind(CrowdBakes); CrowdBakes.draw=(ctx,w,c)=>{const r=B(ctx,w,c); __crowd[r?'baked':'live']++; return r;};
  globalThis.__ledges={shapes:0,batches:0}; const LQ=TierKit.ledgeQueue||(TierKit.ledgeQueue=new renderQueue()); const LF=LQ.flush; LQ.flush=function(ctx){LF.call(this,ctx); __ledges.shapes+=this.stats.shapes; __ledges.batches+=this.stats.batches;};
  const D=drawCrowdHumanoid; drawCrowdHumanoid=function(ctx,w,c){const c0=__calls(); try{return D(ctx,w,c);}finally{__crowd.calls+=__calls()-c0;}};`);
 for(const [name,setup] of Object.entries(SCENES)){
  e.run(setup+'game.running=true;game.paused=false;'); for(let i=0;i<WARM;i++) e.run(FRAME);
  e.run('__crowd.live=__crowd.baked=__crowd.calls=0; __ledges.shapes=__ledges.batches=0;');
  const c0=e.counters.canvasCalls; for(let i=0;i<MEASURE;i++) e.run(FRAME); got[name]=Math.round((e.counters.canvasCalls-c0)/MEASURE);
  if(name==='city_night'){const s=JSON.parse(e.run('JSON.stringify(FoliageLampDepth.queue.stats)'));
   assert.ok(s.shapes>500,'the city has trees and lamps in view'); assert.ok(s.batches<s.shapes*0.4,`trees and lamps: ${s.batches} draws for ${s.shapes} shapes`);}
  if(name==='city_park'){const s=JSON.parse(e.run('JSON.stringify(__ledges)'));        // the hotel's and other tiered buildings' ledges
   assert.ok(s.shapes>300,'tiered buildings in view'); assert.ok(s.batches<s.shapes*0.45,`ledges: ${s.batches} draws for ${s.shapes} shapes`);}
  if(name==='cozy_cafe'){const c=JSON.parse(e.run('JSON.stringify(__crowd)'));    // the café's crowd is seated or standing: pose frames
   assert.ok(c.baked>=c.live*9,`café crowd: ${c.baked} bodies from bakes, ${c.live} live`); assert.ok(c.calls/MEASURE<600,`café crowd: ${Math.round(c.calls/MEASURE)} canvas calls a frame`);}
 }
 for(const [name,n] of Object.entries(got)) assert.ok(n<=CALL_BUDGET[name],`${name}: ${n} canvas calls a frame, over its budget of ${CALL_BUDGET[name]}`);
 console.log('  canvas calls a frame:',JSON.stringify(got));
 assert.deepEqual(e.errors,[]);
});

console.log(`test-render-system: ${tests.length} passed`);
