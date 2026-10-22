#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const file=join(__dirname,'..','DFAB V8.html'), tests=[];
function test(name,fn){fn();tests.push(name);}
function value(env,src){return structuredClone(env.run(`(()=>{${src}})()`));}

test('Static cell cache preserves slots, duplicates and hit order, including negative coordinates',()=>{
 const env=runtime(file);
 const r=value(env,`
   let s=71;const rnd=()=>((s=s*16807%2147483647)-1)/2147483646;
   const items=Array.from({length:160},(_,id)=>({id,x:rnd()*4000-2000,y:rnd()*4000-2000,w:10+rnd()*400,h:10+rnd()*400}));
   items.push(items[3],items[3]);_physicsSpatial.track(items);
   const grid=new OrderedRenderGrid(400);grid.build(items,o=>({left:o.x,right:o.x+o.w,top:o.y,bottom:o.y+o.h}));
   let equal=true;
   for(let i=0;i<1000;i++){
    const x=rnd()*5000-2500,y=rnd()*5000-2500,b={left:x,right:x+rnd()*1200,top:y,bottom:y+rnd()*1200};
    const expected=grid.query(b,[]).map(e=>e.index);
    const actual=_physicsSpatial.query(items,b).map(o=>items.indexOf(o));
    const mapped=expected.map(k=>items.indexOf(items[k]));
    if(JSON.stringify(actual)!==JSON.stringify(mapped))equal=false;
    const twice=_physicsSpatial.query(items,b).map(o=>items.indexOf(o));
    if(JSON.stringify(twice)!==JSON.stringify(actual))equal=false;
   }
   const c=_physicsSpatial.records.get(items);return{equal,cached:c.cellQueries.size,slots:c.cachedSlots};
 `);
 assert.equal(r.equal,true);assert.ok(r.cached<=256);assert.ok(r.slots<=16384);
});

test('Static cell hits skip grid work and invalidate on geometry edits, slot changes and explicit same-tick invalidation',()=>{
 const env=runtime(file);
 const r=value(env,`
   const a={id:'a',x:10,y:10,w:20,h:20},b={id:'b',x:900,y:900,w:20,h:20},items=[a,b,a];
   _physicsSpatial.track(items);const c=_physicsSpatial.records.get(items),q=c.grid.query;
   let builds=0;c.grid.query=function(...args){builds++;return q.apply(this,args);};
   const B={left:0,top:0,right:50,bottom:50};
   const first=_physicsSpatial.query(items,B).map(o=>o.id);
   for(let i=0;i<100;i++)_physicsSpatial.query(items,{left:1,top:1,right:80,bottom:80});
   const warmQueries=builds;
   b.x=30;b.y=30;_simTick++;
   const moved=_physicsSpatial.query(items,B).map(o=>o.id);
   items[1]={id:'c',x:20,y:20,w:10,h:10};_physicsSpatial.invalidate(items);
   const replaced=_physicsSpatial.query(items,B).map(o=>o.id);
   items.push({id:'d',x:30,y:30,w:5,h:5});
   const grown=_physicsSpatial.query(items,B).map(o=>o.id);
   return{first,warmQueries,moved,replaced,grown};
 `);
 assert.deepEqual(r,{first:['a','a'],warmQueries:1,moved:['a','b','a'],replaced:['a','c','a'],grown:['a','c','a','d']});
});

test('Nonfinite ranges, sparse arrays and unknown geometry retain their fallback behavior',()=>{
 const env=runtime(file);
 const r=value(env,`
  const a={x:0,y:0,w:10,h:10},b={x:500,y:500,w:10,h:10},items=[a,b];_physicsSpatial.track(items);
  const invalid=_physicsSpatial.query(items,{left:NaN,right:1,top:0,bottom:1}).length;
  const sparse=[a,,b];_physicsSpatial.track(sparse);
  const direct=_physicsSpatial.query(sparse,{left:0,right:5,top:0,bottom:5})===sparse;
  return{invalid,direct,untracked:_physicsSpatial.query(items.slice(),{})[0]===a};
 `);
 assert.deepEqual(r,{invalid:2,direct:true,untracked:true});
});

test('Detailed traffic and sign hooks are exclusive and unwind back to exact original functions',()=>{
 const env=runtime(file);
 const r=value(env,`
  let now=1000;performance.now=()=>now+=0.02;
  game.story.update=()=>{};game._doLoadMap('sdc');game.running=true;game.paused=false;
  for(let i=0;i<200;i++)game.update();
  const before={paint:BuildingV2.prototype._paintSign,draw:BuildingV2.prototype.drawTop,manager:TrafficManager.prototype.update,query:_physicsSpatial.query};
  PerformanceBench.run({durationMs:150,warmupMs:0});
  for(let i=0;i<50&&PerformanceBench.active;i++){
   now+=35;PerformanceBench.beginFrame();PerformanceBench.acceptFrame();game.update();PerformanceBench.afterSimulation();game.draw();PerformanceBench.endFrame(1,0);
  }
  const rows=PerformanceBench.results.sections, traffic=rows.filter(r=>r.label.startsWith('Traffic: '));
  const total=rows.find(r=>r.label==='AI:Traffic').mean+(rows.find(r=>r.label==='Physics:Collisions')?.mean||0);
  const restored=Object.entries(before).every(([k,v])=>v===({paint:BuildingV2.prototype._paintSign,draw:BuildingV2.prototype.drawTop,manager:TrafficManager.prototype.update,query:_physicsSpatial.query})[k]);
  game._syncProfiler();
  PerformanceBench.run();PerformanceBench.cancel();
  return{labels:rows.map(r=>r.label),sum:traffic.reduce((s,r)=>s+r.mean,0),total,restored,
   again:BuildingV2.prototype._paintSign===before.paint&&_physicsSpatial.query===before.query,
   inactive:!SignProfiler.active&&!TrafficProfiler.active};
 `);
 assert.ok(r.labels.includes('Traffic: Static broadphase'),JSON.stringify(r));
 assert.ok(r.labels.includes('Traffic: Physics integration'));
 assert.ok(r.labels.some(s=>s.startsWith('Signs: ')));
 assert.ok(r.sum<=r.total+0.001,JSON.stringify({sum:r.sum,total:r.total}));
 assert.equal(r.restored,true);assert.equal(r.again,true);assert.equal(r.inactive,true);assert.deepEqual(env.errors,[]);
});

test('Map-entry warmup prepares ordinary signs only when their font is ready and keeps warm caches reusable',()=>{
 const env=runtime(file);
 const r=value(env,`
  game.story.update=()=>{};game._doLoadMap('sdc');
  const b=game.activeMap.buildings.find(b=>b.isV2&&b.attachedSign&&!b.variant&&b.style!=='double_nights'&&b.style!=='moon_city');
  game.activeMap.buildings=[b];game.props=[];game.groundBaker.activeFor=()=>false;b.inView=()=>true;delete b._signSpr;
  let ready=false;document.fonts.check=()=>ready;
  game._prepareMapTextures(()=>{},game._loadSeq);
  const pendingJobs=game._mapTextureWarmup.jobs.length;
  for(const job of game._mapTextureWarmup.jobs)job();
  const pendingBaked=!!b._signSpr;
  game._cancelMapTextureWarmup();ready=true;
  let bakes=0;const bake=b._bakeSignSprites;b._bakeSignSprites=function(...args){bakes++;return bake.apply(this,args);};
  game._prepareMapTextures(()=>{},game._loadSeq);
  for(const job of game._mapTextureWarmup.jobs)job();
  const prepared=!!b._signSpr,cache=b._signSpr;
  const text=b.attachedSign.text,size=b.attachedSign.fontSize||45,color=b.colors.accent;
  b._signSprites(text,size,color,b._hexToRgb(color));
  game._cancelMapTextureWarmup();return{pendingJobs,pendingBaked,prepared,bakes,same:b._signSpr===cache};
 `);
 assert.deepEqual(r,{pendingJobs:1,pendingBaked:false,prepared:true,bakes:1,same:true});assert.deepEqual(env.errors,[]);
});

console.log(JSON.stringify({passed:tests.length,tests},null,2));
