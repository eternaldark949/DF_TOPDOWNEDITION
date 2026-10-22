#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { runtime } = require('./test-game-runtime.cjs');
const file = join(__dirname, '..', 'DFAB V8.html');
const results = [];
function test(name, fn) { fn(); results.push(name); }
function value(env, code) { return structuredClone(env.run(`(() => {${code}})()`)); }
function setup() {
  const env = runtime(file);
  env.run(`globalThis.clock=1000; performance.now=()=>clock; game.running=true; game.paused=false; document.hidden=false;`);
  return env;
}

test('Rejects invalid starts and conflicting benches; cancellation restores diagnostic settings', () => {
  const env=setup();
  const r=value(env, `
    game.showProfiler=true; GameSettings.profilerMode='full'; GameSettings.countCalls=true; GameSettings.baseline=true;
    const invalid=PerformanceBench.run({durationMs:NaN});
    PerfBench.active=true; const conflict=PerformanceBench.run(); PerfBench.active=false;
    game.paused=true; const paused=PerformanceBench.run(); game.paused=false;
    const started=PerformanceBench.run();
    const during=[game.showProfiler,GameSettings.profilerMode,GameSettings.countCalls,GameSettings.baseline,game.profiler.enabled];
    PerfBench.run(); const reverseConflict=PerfBench.active;
    PerformanceBench.cancel();
    return {invalid,conflict,paused,started,during,reverseConflict,after:[game.showProfiler,GameSettings.profilerMode,GameSettings.countCalls,GameSettings.baseline]};
  `);
  assert.deepEqual(r,{invalid:false,conflict:false,paused:false,started:true,during:[false,'off',false,false,true],reverseConflict:false,after:[true,'full',true,true]});
  assert.deepEqual(env.errors,[]);
});

test('Includes every simulation tick, survives profiler resets, reports stalls and overlapping sections honestly', () => {
  const env=setup();
  const r=value(env, `
    PerformanceBench.run({durationMs:600,warmupMs:0});
    for(let i=0;i<12 && PerformanceBench.active;i++){
      clock=1000+i*66.6666667;
      PerformanceBench.beginFrame(); PerformanceBench.acceptFrame();
      game.profiler.start('Update:Total'); clock+=30; game.profiler.stop('Update:Total');
      game.profiler.add('AI:Traffic',12); PerformanceBench.afterSimulation();
      game.profiler.beginFrame(); game.profiler.start('Render:Total'); clock+=16;game.profiler.stop('Render:Total');
      PerformanceBench.render(game.profiler.frameDeltas());
      game.profiler.frameCounts=29; game.profiler.tick();
      PerformanceBench.endFrame(3,i===2?20:0);
    }
    return {report:PerformanceBench.results,text:PerformanceBench.reportText(),enabled:game.profiler.enabled};
  `);
  assert.ok(Math.abs(r.report.fps-15)<0.001);
  assert.equal(r.report.cpuLoopMs.mean,46);
  assert.equal(r.report.sections.find(s=>s.label==='Update:Total').mean,30);
  assert.equal(r.report.sections.find(s=>s.label==='Render:Total').mean,16);
  assert.equal(r.report.sections.find(s=>s.label==='AI:Traffic').mean,12);
  assert.equal(r.report.simulationMsPerTick,10);
  assert.equal(r.report.droppedSimulationMs,20);
  assert.equal(r.report.stallsOver50Ms,r.report.sampleCount);
  assert.ok(r.report.findings.some(s=>s.includes('outside measured loop')));
  assert.match(r.text,/parents overlap children/);
  assert.match(r.text,/not a GPU measurement/);
  assert.equal(r.enabled,false);
  assert.deepEqual(env.errors,[]);
});

test('Frame limiter skips never become extra rendered frames or halve the measured interval', () => {
  const env=setup();
  const r=value(env, `
    PerformanceBench.run({durationMs:1000,warmupMs:0});
    PerformanceBench.beginFrame();PerformanceBench.acceptFrame();PerformanceBench.afterSimulation();clock+=3;PerformanceBench.endFrame(0,0);
    clock=1008;PerformanceBench.beginFrame(); // rejected by a 60 FPS limiter on a 120 Hz display
    clock=1016.6667;PerformanceBench.beginFrame();PerformanceBench.acceptFrame();PerformanceBench.afterSimulation();clock+=3;PerformanceBench.endFrame(1,0);
    const cadence=PerformanceBench.frames.map(f=>f.cadence);
    PerformanceBench.cancel();return cadence;
  `);
  assert.equal(r.length,1);
  assert.ok(Math.abs(r[0]-16.6667)<0.001);
});

test('Warmup and hidden/paused intervals are excluded; visible long stalls are retained', () => {
  const env=setup();
  const r=value(env, `
    PerformanceBench.run({durationMs:10000,warmupMs:100});
    const frame=()=>{ PerformanceBench.beginFrame();PerformanceBench.acceptFrame();PerformanceBench.afterSimulation();clock+=2;PerformanceBench.endFrame(1,0); };
    frame(); clock=1050;frame();clock=1120;frame();
    document.hidden=true; PerformanceBench._visibility(); clock=5000;frame();
    document.hidden=false;clock=6000;frame();clock=6017;frame();
    game.paused=true;clock=7000;frame();game.paused=false;clock=8000;frame();clock=8017;frame();
    clock=9017;frame();
    const cadence=PerformanceBench.frames.map(f=>f.cadence), interruptions=PerformanceBench.interruptions;
    PerformanceBench.cancel(); return {cadence,interruptions};
  `);
  assert.deepEqual(r.cadence,[17,17,1000]);
  assert.equal(r.interruptions,2);
});

test('Game reset cancels capture and restores idle profiling', () => {
  const env=setup();
  const r=value(env, `
    PerformanceBench.run(); game.resetGameState();
    return {active:PerformanceBench.active,saved:PerformanceBench._saved,enabled:game.profiler.enabled};
  `);
  assert.deepEqual(r,{active:false,saved:null,enabled:false});
});

test('Detailed capture reuses entity/character/world hooks without the Full panel and restores original functions', () => {
  const env=setup();
  const r=value(env, `
    performance.now=()=>{clock+=0.01;return clock;};
    game._doLoadMap('sdc'); game.running=true;game.paused=false;
    const hair=hairGeometry, top=BuildingV2.prototype.drawTop;
    PerformanceBench.run({durationMs:100,warmupMs:0});
    const during={people:PeopleProfiler.active,world:WorldRenderProfiler.active,panel:game.showProfiler,
      mode:GameSettings.profilerMode,wrapped:hairGeometry!==hair&&BuildingV2.prototype.drawTop!==top};
    for(let i=0;i<12&&PerformanceBench.active;i++){
      clock+=34;PerformanceBench.beginFrame();PerformanceBench.acceptFrame();
      game.update();PerformanceBench.afterSimulation();game.draw();PerformanceBench.endFrame(1,0);
    }
    return {during,report:PerformanceBench.results,text:PerformanceBench.reportText(),
      after:{people:PeopleProfiler.active,world:WorldRenderProfiler.active,timed:RenderStats.timed,
        originals:hairGeometry===hair&&BuildingV2.prototype.drawTop===top,enabled:game.profiler.enabled}};
  `);
  assert.deepEqual(r.during,{people:true,world:true,panel:false,mode:'off',wrapped:true});
  for(const label of ['Entities: People','Entities: Vehicles','Entities: Props','Entities: Effects','Entities: World tops',
      'People: Hair physics','People: Hair drawing','People: Cloth physics','People: Body and limbs','World tops: Foliage','Buildings: Base']) {
    assert.ok(r.report.sections.some(s=>s.label===label),label);
  }
  assert.ok(r.report.sections.find(s=>s.label==='Entities: People').mean>0);
  assert.equal(r.report.instrumentation.mode,'detailed');
  assert.match(r.text,/Extra timing calls and wrappers add overhead/);
  assert.equal(r.report.context.simulation.nominalTicksPerSecond,30);
  assert.deepEqual(r.after,{people:false,world:false,timed:false,originals:true,enabled:false});
  assert.deepEqual(env.errors,[]);
});

test('Summary capture disables detailed hooks and cancellation restores an already visible Full profiler', () => {
  const env=setup();
  const r=value(env, `
    game.showProfiler=true;GameSettings.profilerMode='full';game._syncProfiler();
    const full=hairGeometry;
    PerformanceBench.run({detailed:false});
    const summary={people:PeopleProfiler.active,world:WorldRenderProfiler.active,detailed:game._profileDetailed,panel:game.showProfiler};
    PerformanceBench.cancel();
    const restored={people:PeopleProfiler.active,world:WorldRenderProfiler.active,panel:game.showProfiler,
      mode:GameSettings.profilerMode,sameHook:hairGeometry===full};
    PerformanceBench.run();PerformanceBench.cancel();
    return {summary,restored,stillFull:PeopleProfiler.active&&WorldRenderProfiler.active};
  `);
  assert.deepEqual(r.summary,{people:false,world:false,detailed:false,panel:false});
  assert.deepEqual(r.restored,{people:true,world:true,panel:true,mode:'full',sameHook:true});
  assert.equal(r.stillFull,true);
});

test('Tiny dropped-time totals are distinguished from sustained simulation backlog', () => {
  const simulate=dropped=>{
    const env=setup();
    return value(env, `
      PerformanceBench.run({durationMs:100,warmupMs:0});
      for(let i=0;i<10&&PerformanceBench.active;i++){
        clock=1000+i*20;PerformanceBench.beginFrame();PerformanceBench.acceptFrame();PerformanceBench.afterSimulation();
        clock+=2;PerformanceBench.endFrame(1,i===1?${dropped}:0);
      }
      return PerformanceBench.results.findings;
    `);
  };
  assert.ok(simulate(0.1).some(s=>s.includes('does not indicate sustained simulation overload')));
  assert.ok(simulate(10).some(s=>s.includes('can affect world progression')));
});

console.log(JSON.stringify({passed:results.length,results},null,2));
