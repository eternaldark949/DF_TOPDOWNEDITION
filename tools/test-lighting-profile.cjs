#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/engine/gamma-shadows.js'),'utf8').split('        // Gamma keeps')[0];
let clocks=0,next=0,available=false,disjoint=false,deleted=0,begin=0,end=0;
const context={performance:{now:()=>++clocks},GameSettings:{lampShadows:'gamma',softShadows:true,profilerMode:'full'},window:{devicePixelRatio:1},DynamicShadows:{stats:{},bytes:0,_families:{}},GammaShadows:{stats:{},slots:[]},DevOverlay:{_canvasMB:()=>({total:0})}};
const p=vm.runInNewContext(source+';LightingProfile',context);
const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,isContextLost:()=>false,createQuery:()=>({id:++next}),beginQuery:()=>begin++,endQuery:()=>end++,deleteQuery:()=>deleted++,getParameter:()=>disjoint,getQueryParameter:(q,k)=>k===1?available:12000000};
p.gl=gl;p.timer={TIME_ELAPSED_EXT:7,GPU_DISJOINT_EXT:8};p.enabled=true;p.recording=true;p.frameId=4;p.stages={};
assert.equal(p.beginGPU('resolve'),true);p.endGPU();assert.equal(p.beginGPU('blur'),true);p.endGPU();
p.poll();assert.equal(p.pending.length,2);assert.equal(Object.keys(p.gpu).length,0,'pending query is not read early');
available=true;p.frameId=5;p.poll();assert.equal(p.pending.length,0);assert.equal(p.gpu.resolve.ms,12);assert.equal(p.gpu.resolve.frameId,4,'sample retains source frame');assert.equal(deleted,2);
p.frameId=8;available=false;p.beginGPU('resolve');p.endGPU();disjoint=true;p.poll();assert.equal(p.pending.length,0);assert.equal(Object.keys(p.gpu).length,0);assert.match(p.gpuStatus,/disjoint/);
disjoint=false;p.frameId=12;for(let i=0;i<8;i++){assert.equal(p.beginGPU('resolve'),true);p.endGPU();}assert.equal(p.beginGPU('resolve'),false,'queue is bounded');
p.frameId=140;p.poll();assert.equal(p.pending.length,0,'expired queries are deleted');
p.frameId=144;p.beginGPU('resolve');p.clearQueries();assert.equal(p.activeQuery,null);assert.equal(p.pending.length,0);assert.equal(begin,end,'cleanup closes active timer');
p.enabled=false;const before=clocks;assert.equal(p.start(),null);p.end('disabled',null);assert.equal(clocks,before,'disabled profiling reads no clocks');assert.equal(p.beginGPU('resolve'),false);
p.enabled=true;p.stages={};const t=p.start();p.end('test',t);assert.equal(p.stages.test.ms,1);
const game={_renderDrawId:1,canvas:{width:100,height:80},lightCanvas:{width:50,height:40},lightingScale:1,camera:{zoom:1}};
p.bytes={mask:4,layers:8000};p.churn={new:0,changed:1,evicted:0};
for(let i=0;i<70;i++){p.frameId=i;p.finish(game);}assert.equal(p.history.length,60);assert.equal(p.summary()[0].mean,1);assert.equal(p.snapshot(game).frames.length,60);assert.equal(p.start(),null,'timing outside a render frame is disabled');
p.key='old';p.instrumented=true;game.showProfiler=true;p.begin(game);assert.equal(p.history.length,0,'mode/map reset discards old samples');
const original=()=>7,object={run:original};p.wrap(object,'run','wrapped');p.disable();assert.equal(object.run,original,'closing Full restores original shadow methods');
console.log('Lighting profiler: async results, source frames, disjoint rejection, queue limits, expiry, cleanup, disabled overhead and bounded history passed.');
// Frame-cadence metrics must include stalls outside the renderer, unlike CPU rows.
let wall=0;
const c2={...context,performance:{now:()=>wall},GameSettings:{...context.GameSettings},DynamicShadows:{...context.DynamicShadows}};
const {p:cadence,e:experiment}=vm.runInNewContext(source+';({p:LightingProfile,e:GammaExperiment})',c2);
cadence.instrumented=true;const fixture={...game,showProfiler:true,activeMap:{id:'cadence-fixture'}};
for(let i=0;i<15;i++){wall=i*100;fixture._renderDrawId=i;cadence.begin(fixture);wall+=20;cadence.finish(fixture);}
assert.equal(cadence.history.length,0,'warm-up and settling do not contaminate comparisons');
for(const t of [10000,10050,11750]){wall=t;fixture._renderDrawId++;cadence.begin(fixture);wall+=20;cadence.finish(fixture);}
const stats=cadence.cadenceSummary();assert.equal(stats.intervals,2);assert.equal(stats.peakMs,1700);assert.equal(stats.pausesOver1000ms,1);assert.equal(stats.meanMs,875);assert.equal(cadence.latest.cadence.renderMs,20);assert.equal(cadence.latest.cadence.gapMs,1680);
assert.ok(Math.abs(stats.fps-1000/875)<1e-10,'FPS includes the between-render pause');
experiment.select('freeze-all');
for(let i=0;i<15;i++){experiment.begin(fixture);assert.equal(!!experiment.current.freezeMasks,i>=10);assert.equal(!!experiment.current.freezeLayers,i>=10);experiment.advance();}
fixture.canvas={width:200,height:80};experiment.begin(fixture);assert.equal(experiment.current.phase,'warmup');assert.equal(experiment.current.freezeMasks,false,'resize rewarms frozen textures');
console.log('Gamma experiments: warm-up/settling isolation, outside-render stalls, upload-freeze activation and resize reset passed.');
