/** Profiler contracts: real timing math, bounded retention, failure isolation and disabled work. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Profiler } from '../engine/basement/profiler.js';
import { Runtime } from '../engine/lobby/runtime.js';
import { Directory } from '../engine/directory/directory.js';
import { World,Identities } from '../engine/basement/world.js';
import { boundedCopy } from '../engine/basement/profile-data.js';
import { GpuTimer } from '../engine/basement/gpu-timer.js';

/** Advance a manual clock only when a test explicitly models subsystem work. */
function clock(){let time=0,reads=0;return{now:()=>{reads++;return time;},advance:ms=>{time+=ms;},get reads(){return reads;}};}

/** Record one controlled frame; closures live in tests, not the engine's frame path. */
function frame(p,c,{interval=16,work=4,scope=null}={}){
  const id=p.beginFrame(interval);const token=scope===null?-1:p.begin(scope);
  c.advance(work);p.end(token);p.endFrame();return id;
}

test('nested CPU scopes accumulate inclusive/self time and catch-up calls without double-counting children',()=>{
  const c=clock(),p=new Profiler({enabled:true,now:c.now}),parent=p.scope('parent'),child=p.scope('child');
  p.beginFrame(16);const outer=p.begin(parent);c.advance(2);
  const first=p.begin(child);c.advance(3);p.end(first);c.advance(1);
  const second=p.begin(child);c.advance(4);p.end(second);p.end(outer);p.endFrame(0.1);
  const capture=p.capture();
  assert.deepEqual(capture.frame.scopes.find(s=>s.name==='parent'),{name:'parent',inclusiveMs:10,selfMs:3,calls:1});
  assert.deepEqual(capture.frame.scopes.find(s=>s.name==='child'),{name:'child',inclusiveMs:7,selfMs:7,calls:2});
  assert.equal(capture.frame.cpuMs,10);assert.equal(capture.frame.spans[1].depth,1);
  assert.equal(capture.frame.spans[1].startMs,2);assert.equal(capture.frame.simulationTime,0.1);
});

test('ring percentiles, retained worst frame and GPU association use only retained completed frames',()=>{
  const c=clock(),p=new Profiler({enabled:true,capacity:3,now:c.now});
  for(const interval of [10,20,30,40])frame(p,c,{interval,work:interval/10});
  p.recordGpu(4,2);p.recordGpu(1,99);
  const s=p.summary();assert.equal(s.count,3);assert.equal(s.interval.p50,30);assert.equal(s.interval.p95,40);
  assert.equal(s.worstId,4);assert.equal(s.gpu.samples,1);assert.equal(s.gpu.p50,2);assert.equal(s.stats.expiredGpuSamples,1);
  assert.throws(()=>p.capture(1),/expired/);assert.equal(p.capture(4).frame.gpuMs,2);
});

test('scope/span/depth/registry/capture budgets are enforced and snapshots survive overwritten history',()=>{
  const c=clock(),p=new Profiler({enabled:true,capacity:2,maxScopes:3,maxCounters:1,maxDepth:1,maxSpans:1,maxCaptures:1,now:c.now});
  const a=p.scope('a'),b=p.scope('b');assert.equal(p.scope('a'),a);assert.throws(()=>p.scope('over'),/budget/);
  p.counter('one');assert.throws(()=>p.counter('two'),/budget/);
  p.beginFrame(16);const token=p.begin(a);assert.equal(p.begin(b),-1);c.advance(2);p.end(token);
  const next=p.begin(b);c.advance(1);p.end(next);p.endFrame();const saved=p.capture();
  assert.equal(saved.frame.droppedSpans,2); // second scope and diagnostic collection both exceed timeline budget
  assert.equal(p.stats.depthOverflows,1);assert.equal(saved.frame.scopes.find(s=>s.name==='b').inclusiveMs,1);
  assert.ok(Object.isFrozen(saved));assert.throws(()=>{saved.frame.cpuMs=999;},TypeError);
  frame(p,c);frame(p,c);assert.equal(saved.frame.cpuMs,3);p.capture();assert.equal(p.captures.length,1);
  assert.throws(()=>p.counter('one','bytes'),/unit changed/);
});

test('disabled and frozen frame/scopes make no clock reads or provider calls; game runtime still advances',()=>{
  const c=clock(),p=new Profiler({now:c.now}),scope=p.scope('game');let sampled=0;
  p.provider('test',{begin:()=>sampled++,sample:()=>sampled++});
  assert.equal(p.beginFrame(16),0);assert.equal(p.begin(scope),-1);p.end(-1);p.set(0,99);p.endFrame();
  assert.equal(c.reads,0);assert.equal(sampled,0);
  p.configure({enabled:true});frame(p,c,{scope});const id=p.sequence;
  p.configure({frozen:true});const reads=c.reads;
  frame(p,c,{scope});assert.equal(c.reads,reads);assert.equal(p.sequence,id);
  p.recordGpu(id,123);assert.equal(p.summary().gpu.samples,0);
  let scheduled,steps=0;
  const runtime=new Runtime({profiler:p,request:callback=>{scheduled=callback;return 1;},cancel:()=>{}});
  runtime.on('update',()=>steps++);runtime.start();scheduled(0);scheduled(20);
  assert.equal(steps,1);assert.equal(p.sequence,id);runtime.dispose();
});

test('providers baseline frame deltas, isolate failures, release callbacks and bound captured data',()=>{
  const c=clock(),p=new Profiler({enabled:true,now:c.now});const counter=p.counter('delta');let total=10,before=0;
  const cyclic={message:'x'.repeat(1000),rows:Array.from({length:200},(_,id)=>({id}))};cyclic.self=cyclic;
  Object.defineProperty(cyclic,'getter',{enumerable:true,get(){throw new Error('must not invoke getters');}});
  const remove=p.provider('work',{begin:()=>{before=total;},sample:prof=>prof.set(counter,total-before),details:()=>cyclic});
  p.provider('broken',{sample:()=>{throw new Error('isolated');},details:()=>{throw new Error('capture isolated');}});
  p.beginFrame(16);total+=5;p.endFrame();const capture=p.capture();
  assert.equal(capture.frame.counters[0].value,5);assert.equal(p.stats.providerErrors,1);
  assert.equal(capture.providerDetails.data.work.message.length,256);assert.equal(capture.providerDetails.data.work.rows.length,65);
  assert.equal(capture.providerDetails.data.work.self,'[circular]');assert.equal(capture.providerDetails.data.work.getter,'[accessor omitted]');
  assert.equal(capture.providerDetails.data.broken.error,'capture isolated');remove();assert.equal(p.providers.size,1);
  assert.ok(JSON.parse(p.exportJSON()).captures.length===1);p.dispose();assert.equal(p.providers.size,0);assert.equal(p.storageBytes,0);
  assert.throws(()=>p.configure({enabled:true}),/disposed/);
});

test('single-shot spike capture fires once and labels historical owner details as capture-time data',()=>{
  const c=clock(),p=new Profiler({enabled:true,now:c.now});
  p.armSpike({intervalMs:50,cpuMs:10});frame(p,c,{interval:16,work:3});assert.equal(p.captures.length,0);
  frame(p,c,{interval:60,work:3});assert.equal(p.captures.length,1);assert.equal(p.arm,null);
  frame(p,c,{interval:70,work:3});assert.equal(p.captures.length,1);
  const capture=p.capture(1);assert.match(capture.providerDetails.timing,/capture time/);
});

test('runtime records named callbacks, bounded catch-up, pause flags and failed frames',()=>{
  const c=clock(),p=new Profiler({enabled:true,now:c.now});let scheduled;
  const runtime=new Runtime({profiler:p,request:callback=>{scheduled=callback;return 1;},cancel:()=>{}});
  const remove=runtime.on('update',()=>c.advance(2),'game.simulation');runtime.start();scheduled(0);scheduled(1000);
  let capture=p.capture();const values=Object.fromEntries(capture.frame.counters.map(c=>[c.name,c.value]));
  assert.equal(values['runtime.steps'],5);assert.ok(values['runtime.dropped']>900);
  assert.equal(capture.frame.scopes.find(s=>s.name==='game.simulation').calls,5);assert.equal(capture.frame.cpuMs,10);
  runtime.pause('test');scheduled(1016);assert.equal(p.capture().frame.paused,true);runtime.pause('test',false);
  remove();runtime.on('render',()=>{throw new Error('render fault');},'broken.render');
  assert.throws(()=>scheduled(1032),/render fault/);capture=p.capture();assert.equal(capture.frame.failed,true);
  assert.ok(capture.frame.scopes.some(s=>s.name==='broken.render'));assert.equal(runtime.running,false);runtime.dispose();
  assert.equal(p.providers.size,0);
});

test('Directory captures resource owners, live counts, requested bytes and releases provider on disposal',()=>{
  const c=clock(),p=new Profiler({enabled:true,now:c.now}),directory=new Directory({profiler:p});
  const world=directory.adopt(new World('test',new Identities()));world.create();
  const resource={kind:'test-buffer',cpuBytes:64,gpuBufferBytes:128,dispose(){}};
  const a=directory.acquire('shared',()=>resource,{owner:'world:test'}),b=directory.acquire('shared',()=>resource,{owner:'editor'});
  frame(p,c);const capture=p.capture(),row=capture.providerDetails.data.directory.resources[0];
  assert.equal(row.leases,2);assert.deepEqual(row.owners,[{owner:'world:test',count:1},{owner:'editor',count:1}]);
  assert.equal(capture.frame.counters.find(c=>c.name==='directory.entities').value,1);
  a.release();b.release();frame(p,c);assert.equal(p.capture().providerDetails.data.directory.resources.length,0);
  directory.dispose();assert.equal(p.providers.size,0);
});

/** Minimal GL boundary that refuses premature result reads and exposes lifecycle counts. */
function gpuFixture(supported=true){
  const state={available:false,disjoint:false,created:0,deleted:0,resultReads:0,begins:0,ends:0};
  const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,getExtension:()=>supported?{GPU_DISJOINT_EXT:3,TIME_ELAPSED_EXT:4}:null,
    getParameter:()=>state.disjoint,createQuery:()=>({id:++state.created}),deleteQuery:()=>state.deleted++,
    beginQuery:()=>state.begins++,endQuery:()=>state.ends++,
    getQueryParameter:(_q,type)=>{if(type===1)return state.available;assert.equal(state.available,true,'Never read an unavailable GPU result');state.resultReads++;return 2500000;}};
  return{gl,state};
}

test('GPU timer caps pending queries, polls asynchronously, preserves frame IDs, and frees handles when disabled',()=>{
  const {gl,state}=gpuFixture(),samples=[],timer=new GpuTimer(gl,(id,ms)=>samples.push({id,ms}),{capacity:2});
  timer.configure(true);timer.begin(1);timer.end();timer.begin(2);timer.end();timer.begin(3);timer.end();
  assert.equal(state.created,2);assert.equal(timer.stats.skipped,1);timer.poll();assert.equal(state.resultReads,0);
  state.available=true;timer.poll();assert.deepEqual(samples,[{id:1,ms:2.5},{id:2,ms:2.5}]);
  timer.begin(4);timer.end();assert.equal(state.created,2);timer.configure(false);assert.equal(state.deleted,2);assert.equal(timer.pending,0);
  timer.dispose();assert.equal(state.deleted,2);
});

test('GPU timer rejects disjoint samples and tolerates unsupported/lost/restored contexts',()=>{
  const unavailable=gpuFixture(false),none=new GpuTimer(unavailable.gl,()=>assert.fail());none.configure(true);none.begin(1);
  assert.equal(unavailable.state.created,0);assert.equal(none.inspect().supported,false);none.dispose();
  const {gl,state}=gpuFixture(),timer=new GpuTimer(gl,()=>assert.fail('Disjoint results must be discarded'));
  timer.configure(true);timer.begin(1);timer.end();state.disjoint=true;state.available=true;timer.poll();
  assert.equal(timer.pending,0);assert.equal(state.resultReads,0);assert.equal(timer.stats.disjoint,1);
  timer.invalidate();assert.equal(state.deleted,0);timer.restore();state.disjoint=false;
  timer.configure(true);timer.begin(2);timer.end();timer.dispose();assert.equal(state.deleted,1);
});

test('bounded diagnostic copier cannot retain class instances, accessors or unlimited recursive data',()=>{
  const input={world:new World('x',new Identities()),deep:{a:{b:{c:{d:{e:{f:1}}}}}}};
  assert.equal(boundedCopy(input).world,'[instance omitted]');
  const copied=boundedCopy({list:Array.from({length:1000},()=>({value:'s'.repeat(1000)}))},{remaining:10});
  assert.ok(JSON.stringify(copied).length<3000);
  assert.throws(()=>new Profiler({capacity:0}),RangeError);
  const p=new Profiler();assert.throws(()=>p.counter('bad',{}),RangeError);assert.throws(()=>p.armSpike({cpuMs:0}),RangeError);
});


test('provider isolation also handles non-Error throws and hostile error formatting',()=>{
  const c=clock(),p=new Profiler({enabled:true,now:c.now});
  const hostile={get message(){throw new Error('getter failure');}};
  p.provider('bad',{sample(){throw null;},details(){throw hostile;},status(){throw null;},configure(){throw hostile;}});
  assert.doesNotThrow(()=>frame(p,c));assert.equal(p.stats.providerErrors,1);
  assert.match(p.stats.lastProviderError,/bad.sample: null/);
  assert.equal(p.capture().providerDetails.data.bad.error,'[unreadable diagnostic error]');
  assert.equal(p.status('bad').error,'null');
  assert.doesNotThrow(()=>p.configure({enabled:false}));assert.equal(p.stats.providerErrors,2);
  p.dispose();
});
