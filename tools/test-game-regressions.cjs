#!/usr/bin/env node
'use strict';
// Run after `node tools/build.mjs`. Uses Node built-ins only and the actual
// generated game, with deterministic browser services. Chromium remains the
// separate check for appearance, touch hardware and real rendering performance.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { runtime } = require('./test-game-runtime.cjs');
const gameFile = join(__dirname, '..', 'DFAB V8.html');
const results = [];
let assertions = 0;
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label); assertions++;
}
function ok(actual, label) { assert.ok(actual, label); assertions++; }
function near(actual, expected, label) { ok(Math.abs(actual - expected) < 1e-6, label); }
function value(env, source) { return structuredClone(env.run(`(() => {${source}})()`)); }
function test(name, callback, options = {}) {
  try {
    const env = runtime(gameFile, options);
    callback(env);
    equal(env.errors, [], 'no game console errors');
    results.push({ name, status: 'passed' });
  } catch (error) {
    results.push({ name, status: 'failed', error: error.stack });
  }
}

test('Level 50 progression, new node gates and point conservation', env => {
  const result = value(env, `
    const r = new ResonanceSystem();
    const total = Array.from({length:50}, (_,i) => RESONANCE.nextLevel(i)).reduce((a,b)=>a+b,0);
    r.earn(total); const gained = r.tune();
    const gates = RESONANCE_TREES.map(tree => {
      const s = new ResonanceSystem(), node = tree.nodes[5];
      s.level=29; s.points=3; s.ranks[tree.nodes[4].id]=1;
      const below=s.raise(tree.id,5); s.level=30; s.ranks[tree.nodes[4].id]=0;
      const missing=s.raise(tree.id,5); s.ranks[tree.nodes[4].id]=1;
      const raised=[s.raise(tree.id,5),s.raise(tree.id,5),s.raise(tree.id,5)];
      return {id:node.id,length:tree.nodes.length,below,missing,raised,rank:s.rank(node.id),points:s.points};
    });
    let spent=0; for(const tree of RESONANCE_TREES) for(let i=0;i<tree.nodes.length;i++)
      for(let n=0;n<3;n++) if(r.raise(tree.id,i)) spent++;
    const refund=r.respec();
    return {cap:RESONANCE.CAP,total,gained,level:r.level,spent,refund,points:r.points,ranks:r.ranks,gates};
  `);
  equal([result.cap, result.total, result.gained, result.level], [50, 91750, 50, 50]);
  equal([result.spent, result.refund, result.points], [50, 50, 50]);
  equal(result.ranks, {});
  equal(result.gates.map(g => g.id), ['long_echo', 'grounded', 'low_signature']);
  for (const gate of result.gates) {
    equal([gate.length, gate.below, gate.missing], [6, false, false], gate.id);
    equal(gate.raised, [true, true, true], gate.id);
    equal([gate.rank, gate.points], [3, 0], gate.id);
  }
});

test('Legacy save/load and cap PP settlement preserve XP without duplicate payouts', env => {
  const legacy = {level:30,xp:117,unsettled:29,points:7,ranks:{reach:3,quick_return:3,flit_strike:3,afterimage:3,double_step:3,reinforced:3,plating:3,steady:2}};
  const result = value(env, `
    game._doLoadMap('apt_949'); game.running=true; game.paused=false;
    game.resonance.deserialize(${JSON.stringify(legacy)}); game.currency=777;
    game.saveGame({auto:true}); game.resonance.reset(); game.currency=0;
    const loaded=game.loadGame('dfab_save_slot_auto');
    const oldState=game.resonance.serialize(), oldCurrency=game.currency;
    game.resonance.deserialize({level:49,xp:RESONANCE.nextLevel(49)-1,unsettled:202,points:49,ranks:{}});
    game.currency=1000; game.openTuning();
    const first={state:game.resonance.serialize(),currency:game.currency,reveal:game._tuneReveal};
    game.openTuning(); const repeated={state:game.resonance.serialize(),currency:game.currency};
    game.saveGame({auto:true}); game.resonance.reset(); game.currency=0;
    const reloaded=game.loadGame('dfab_save_slot_auto');
    const saved={state:game.resonance.serialize(),currency:game.currency};
    game.resonance.earn(98); game.openTuning();
    const below={xp:game.resonance.xp,currency:game.currency};
    game.resonance.earn(1); game.openTuning(); game.openTuning();
    const final={xp:game.resonance.xp,currency:game.currency};
    const r=new ResonanceSystem(); r.level=49; r.xp=200; r.unsettled=100;
    const before=r.serialize(), guarded=r.cashOut(), after=r.serialize();
    r.level=50; r.xp=37; r.unsettled=101; r.onDeath();
    return {loaded,oldState,oldCurrency,first,repeated,reloaded,saved,below,final,guarded,before,after,death:r.serialize()};
  `);
  equal(result.loaded, true); equal(result.oldState, legacy); equal(result.oldCurrency, 777);
  equal([result.first.state.level, result.first.state.points, result.first.state.xp, result.first.state.unsettled], [50, 50, 1, 0]);
  equal(result.first.currency, 1002);
  equal(result.first.reveal, {carried:202,gained:1,from:49,pp:2});
  equal(result.repeated, {state:result.first.state,currency:1002});
  equal(result.reloaded, true); equal(result.saved, result.repeated);
  equal(result.below, {xp:99,currency:1002}); equal(result.final, {xp:0,currency:1003});
  equal(result.guarded, 0); equal(result.before, result.after);
  equal([result.death.xp, result.death.unsettled], [37, 51], 'death risks carried XP only');
});

function flitFixture(env, walls) {
  env.run(`
    game.isDriving=false; game.paused=false; game.hud={has:()=>true}; game.keys={}; game.joystick={active:false};
    game.useNewCollisionSystem=false; game._staticBillboardEntities=[]; game.roomSystem={active:false,doors:[]};
    game.activeMap={width:1000,height:1000,walls:${JSON.stringify(walls)},buildings:[],buildingColliders:[]};
    Object.assign(game.player,{x:100,y:100,angle:0,radius:12});
    game.player.buffSystem={getStat:(name,base)=>base}; game.augments={isEquipped:()=>false};
    game.resonance={stat:(name,base)=>base,rank:()=>0};
    game.flitState={active:false,duration:0,maxDuration:15,attunement:120,maxAttunement:120,dashCost:40,rechargeRate:2,lastFlitAt:-99};
    game._afterimage={x:1,y:2,until:3}; game.flitVFX=[];
    globalThis.__effects=[]; globalThis.__randomCalls=0;
    const priorRandom=Math.random; Math.random=()=>{__randomCalls++;return priorRandom();};
    game.flitRingEl={classList:{remove:()=>__effects.push('ring'),add:()=>__effects.push('ring')},get offsetWidth(){return 1;}};
    game.flitBtn={classList:{add:()=>__effects.push('button')}};
    game.triggerShake=()=>__effects.push('shake'); audioSys.sfx=()=>__effects.push('audio');
    game.emitNoise=()=>__effects.push('noise');
  `);
}
function flitState(env) {
  return value(env, 'return {player:{x:game.player.x,y:game.player.y,angle:game.player.angle},charge:game.flitState,ghost:game._afterimage,vfx:game.flitVFX,effects:__effects,random:__randomCalls};');
}
test('Rejected Flit spends no charge or effects; shortened landing clears the actor radius', env => {
  flitFixture(env, [{x:0,y:0,w:300,h:300}]);
  const before = flitState(env);
  equal(env.run('game.triggerFlit()'), false); equal(flitState(env), before);
  env.run('game.activeMap.walls=[{x:210,y:50,w:50,h:100}];');
  equal(env.run('game.triggerFlit()'), true);
  const after = flitState(env);
  near(after.player.x, 198); near(after.player.y, 100);
  equal(after.charge.attunement, 80); equal(after.vfx.length, 1);
  equal(after.effects.filter(e => e === 'audio').length, 1);
  ok(after.vfx[0].trails.every(t => t.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
});

test('Held ring flick requires fresh outward speed, rearms deliberately and preserves standalone flick', env => {
  env.run(`
    globalThis.__gesture = scenario => {
      const J=game.joystick,F=game.fireJoystick,zone=document.getElementById('input-zone-left');
      let now=10000,calls=[]; performance.now=()=>now;
      game.triggerFlit=(angle,source)=>{calls.push({angle,source});return true;};
      GameSettings.flitRing=scenario.ring!==false; GameSettings.flitFlick=!!scenario.flick;
      game.isDriving=!!scenario.driving; game.paused=false;
      document.getElementById('game-ui').classList.toggle('emote-active',!!scenario.emote);
      J.active=false; J.dx=J.dy=0; J.armed=true; F.active=true; F.id=91;
      for(const step of scenario.steps) {
        now=10000+step.t;
        const touch={identifier:step.id??71,clientX:300+(step.x??0),clientY:400+(step.y??0),target:zone};
        zone.dispatchEvent({type:step.type||'touchmove',changedTouches:[touch],timeStamp:now,preventDefault(){}});
      }
      return {calls,fire:{active:F.active,id:F.id},active:J.active};
    };
  `);
  const start = {type:'touchstart',t:0,x:0};
  const fast = [start,{t:20,x:20},{t:50,x:50},{t:80,x:85}];
  const cases = [
    ['slow push',0,{steps:[start,{t:300,x:30},{t:600,x:60},{t:900,x:90}]}],
    ['flick from held walking position',1,{steps:[start,{t:250,x:20},{t:450,x:35},{t:1450,x:37},{t:1480,x:60},{t:1510,x:88}]}],
    ['stale history and outer jitter',0,{steps:[start,{t:40,x:45},{t:80,x:75},{t:2080,x:79},{t:2110,x:83},{t:2140,x:86}]}],
    ['one activation per excursion',1,{steps:[...fast,{t:100,x:110},{t:120,x:140},{t:1000,x:141},{t:1030,x:175}]}],
    ['return inside rearms',2,{steps:[...fast,{t:300,x:65},{t:800,x:66},{t:830,x:95},{t:860,x:130}]}],
    ['driving guard',0,{driving:true,steps:fast}],
    ['emote guard',0,{emote:true,steps:fast}],
    ['setting off',0,{ring:false,steps:fast}],
    ['foreign touch ignored',0,{steps:[start,{t:20,x:100,id:72}]}],
    ['standalone option still works',1,{ring:false,flick:true,steps:[start,{t:40,x:40}]}],
  ];
  for (const [name, count, scenario] of cases) {
    const result = structuredClone(env.run(`__gesture(${JSON.stringify(scenario)})`));
    equal(result.calls.length, count, name); equal(result.fire, {active:true,id:91}, name);
    for (const call of result.calls) equal(call.source, scenario.flick ? 'flick' : 'ring', name);
  }
}, {events:true});

function setupDrive(env, {taxi=false,lane='R0.S0.L2',destination='clinic'}={}) {
  env.run(`{
    game._doLoadMap('hub_949'); game.story.update=()=>{}; game.running=true; game.paused=false;
    game.traffic.vehicles=[]; game.traffic.spawnTimer=1e9; GameSettings.getMaxTraffic=()=>0;
    game.zibSystem.passengerRide=null; game.zibSystem.activeZibs=[]; game.zibSystem.trySpawn=()=>{};
    game.keys={}; game.joystick.active=false; game.joystick.dx=game.joystick.dy=0; game.handbrakeHeld=false;
    const selected=game.traffic.network.allLanes.find(l=>l.id===${JSON.stringify(lane)});
    const offset=Math.min(200,selected.length*.3);
    game.car=game.ownedCar; game.car.disableAutoDrive(); game.car.clearNavWaypoints();
    Object.assign(game.car,{x:selected.start.x+selected.ux*offset,y:selected.start.y+selected.uy*offset,
      angle:selected.angle,vx:0,vy:0,speed:0,handbrake:false,pedal:0,steer:0,yawRate:0,
      visible:true,dead:false,hasDriver:true,controlMode:'PLAYER'});
    game.isDriving=true; game.player.visible=true; Object.assign(game.player,game.car.getSeatWorldPos(0));
    const point=game.dropOffRegistry[${JSON.stringify(destination)}]; game.currency=10000;
    if(${taxi}) {
      const cab=new TrafficVehicle(selected,'LADY','suv2','AI');
      Object.assign(cab,{x:game.car.x,y:game.car.y,angle:selected.angle,speed:0,vx:0,vy:0,isZib:true,driverType:'zib',hasDriver:false});
      game.ownedCar.visible=false; game.ownedCar.active=false; game.isDriving=false;
      game.traffic.vehicles.push(cab); game.zibSystem.activeZibs.push(cab);
      game.zibSystem.startRide(cab,${JSON.stringify(destination)},point.x,point.y,75,game);
    } else {game.ui.navMarker={...point};game.navDestination={...point};game.toggleAutoDrive();}
    globalThis.__driveTarget={...game.car.navDestination}; globalThis.__driveCar=game.car;
  }`);
}
for (const taxi of [false, true]) test(`${taxi ? 'Zib' : 'Player'} autodrive follows connected roads and arrives without teleport`, env => {
  setupDrive(env, {taxi});
  equal(env.probe.game.car.controlMode, 'AI');
  const start = value(env, 'return {x:game.car.x,y:game.car.y};');
  env.run('for(let i=0;i<60;i++)game.update();');
  ok(Math.hypot(env.probe.game.car.x-start.x, env.probe.game.car.y-start.y) > 100, 'occupants do not block their car');
  const timerStart = env.pendingTimers.length;
  const result = value(env, `
    let arrived=-1; for(let i=0;i<2400;i++) {
      game.update(); if(${taxi ? '!game.zibSystem.isPassenger' : '!game.navDestination'}) {arrived=i;break;}
    }
    return {arrived,distance:Math.hypot(__driveCar.x-__driveTarget.x,__driveCar.y-__driveTarget.y),
      speed:__driveCar.speed,vx:__driveCar.vx,vy:__driveCar.vy,mode:__driveCar.controlMode,
      currency:game.currency,isDriving:game.isDriving,traffic:game.traffic.vehicles.includes(__driveCar)};
  `);
  ok(result.arrived >= 0, 'arrival completed'); ok(result.distance < (taxi ? 40 : 35), 'reaches final drop-off');
  near(result.speed, 0); near(result.vx, 0); near(result.vy, 0);
  ok(!env.pendingTimers.slice(timerStart).some(t => t.ms === 400), 'no stuck-car teleport fallback');
  if (taxi) equal([result.currency,result.isDriving,result.traffic], [9925,false,true]);
  else equal([result.currency,result.mode], [10000,'PLAYER']);
}, {events:true,timers:true});

test('Autodrive keyboard repeat, player takeover and passenger input guards', env => {
  setupDrive(env); env.run('game.toggleAutoDrive();');
  env.dispatchWindow({type:'keydown',key:'q',repeat:false,preventDefault(){}});
  equal(env.probe.game.car.controlMode, 'AI');
  env.dispatchWindow({type:'keydown',key:'q',repeat:true,preventDefault(){}});
  equal(env.probe.game.car.controlMode, 'AI');
  env.run('game.keys.ArrowLeft=true;game.update();');
  equal(env.probe.game.car.controlMode, 'PLAYER');
  setupDrive(env, {taxi:true});
  env.run('game.toggleAutoDrive();game.keys.ArrowLeft=true;game.handbrakeHeld=true;game.update();');
  equal(env.probe.game.car.controlMode, 'AI'); equal(env.probe.game.zibSystem.isPassenger, true);
}, {events:true,timers:true});

test('Closed profiler samples no clocks or reports; visible profiler and benchmark can sample', env => {
  env.run(`
    globalThis.__sample=()=>{const p=game.profiler;p.beginFrame();p.start('Render:Total');p.markWrapper('Render:Total');p.start('Render:World');p.stop('Render:World');p.add('Entities: People',.2,true);p.stop('Render:Total');p.tick();};
    game.showProfiler=true; game._syncProfiler(); for(let i=0;i<30;i++)__sample();
  `);
  ok(env.probe.game.profiler.report.length > 0, 'visible profiler publishes report');
  env.run('game.showProfiler=false;game._syncProfiler();');
  const clocks = env.counters.clocks;
  const before = value(env, 'return {metrics:game.profiler.metrics,report:game.profiler.report,frames:game.profiler.frameCounts};');
  env.run('for(let i=0;i<120;i++)__sample();');
  equal(env.counters.clocks, clocks, 'closed profiler reads no performance clocks');
  equal(value(env, 'return {metrics:game.profiler.metrics,report:game.profiler.report,frames:game.profiler.frameCounts};'), before);
  equal(value(env, 'return game.profiler.frameDeltas();'), {});
  env.run('PerfBench.active=true;game._syncProfiler();'); equal(env.probe.game.profiler.enabled, true);
  env.run('PerfBench.active=false;game._syncProfiler();'); equal(env.probe.game.profiler.enabled, false);
});

const operations = (env, name) => env.trace.filter(op => op[1] === name);
test('Player marker keeps CSS-pixel size, hides in special views and restores Canvas state', env => {
  const g = env.probe.game, ctx = g.ctx;
  const fixture = {running:true,player:{x:100,y:100,visible:true},canvas:g.canvas,_renderScale:1,
    view:{x:100,y:100,zoom:1,shakeX:5,shakeY:-3},scenes:{running:false},cutscene:{active:false}};
  for (const scale of [.5, 1]) for (const zoom of [.2,.5,1,2]) {
    fixture._renderScale=scale; fixture.view.zoom=zoom; env.setTrace(true);
    g.drawPlayerMarker.call(fixture,ctx);
    const points = env.trace.filter(op => ['moveTo','lineTo'].includes(op[1]));
    near((Math.max(...points.map(p=>p[2]))-Math.min(...points.map(p=>p[2])))/scale, 7);
    equal(operations(env,'fill').length, 1); equal(operations(env,'stroke').length, 1);
    equal(operations(env,'drawImage').length, 0, 'marker adds no snapshot or sprite draw');
  }
  for (const [object,key] of [[fixture,'running'],[fixture.player,'visible'],[fixture.player,'isHidden'],
    [fixture.player,'dead'],[fixture.player,'inCar'],[fixture,'isDriving'],[fixture,'cineCam'],
    [fixture,'finisher'],[fixture,'finCam'],[fixture.scenes,'running'],[fixture.cutscene,'active']]) {
    const old=object[key]; object[key]=['visible','running'].includes(key)&&object!==fixture.scenes?false:true;
    env.setTrace(true); g.drawPlayerMarker.call(fixture,ctx); equal(operations(env,'fill').length,0,key); object[key]=old;
  }
  Object.assign(ctx,{globalAlpha:.4,filter:'blur(1px)',shadowBlur:2,shadowOffsetX:3,shadowOffsetY:4,lineJoin:'miter'});
  ctx.setTransform(2,0,0,2,4,5); g.drawPlayerMarker.call(fixture,ctx);
  equal([ctx.globalAlpha,ctx.filter,ctx.shadowBlur,ctx.shadowOffsetX,ctx.shadowOffsetY,ctx.lineJoin], [.4,'blur(1px)',2,3,4,'miter']);
  equal(Object.values(ctx.getTransform()), [2,0,0,2,4,5]);
}, {affine:true});

test('Mirage rings keep one quarter-resolution snapshot, at most four bends and no outlines', env => {
  const g=env.probe.game;
  env.run("GameSettings.soundRings='mirage';");
  g.canvas.width=1280;g.canvas.height=720;
  for(const zoom of [.1,.5,1,2]) for(const t of [0,.25,.6,.99]) {
    g.view={x:0,y:0,zoom,shakeX:0,shakeY:0};
    g.noiseRipples=Array.from({length:18},(_,i)=>({x:0,y:0,reach:180,t,seed:i*.78,enemy:!!(i&1)}));
    const before=structuredClone(g.noiseRipples); env.setTrace(true); g.drawMirageRings(g.ctx);
    const copies=operations(env,'drawImage').filter(op=>op.length===7);
    const bends=operations(env,'drawImage').filter(op=>op.length===11);
    equal(copies.length,t<.6?1:0); equal(bends.length,t<.6?4:0);
    for(const copy of copies) equal(copy.slice(5),[320,180]);
    equal(operations(env,'fill').length,18); equal(operations(env,'stroke').length,0);
    equal(structuredClone(g.noiseRipples),before,'rendering leaves simulation state unchanged');
    ok(env.trace.every(op=>op.every(v=>typeof v!=='number'||Number.isFinite(v))), 'finite draw geometry');
  }
  g.noiseRipples=[{x:100000,y:100000,reach:180,t:.1,seed:1}];
  env.setTrace(true);g.drawMirageRings(g.ctx); equal(operations(env,'drawImage').length,0);
  for(const mode of ['off','simple']) {
    env.run(`GameSettings.soundRings=${JSON.stringify(mode)};`); env.setTrace(true);g.drawMirageRings(g.ctx); equal(env.trace.length,0);
  }
}, {affine:true});

test('Every bundled map loads, updates and draws without runtime errors', env => {
  const maps = Object.keys(env.probe.MAPS);
  ok(maps.length >= 20, 'all bundled maps are present');
  // The new-game story otherwise sends the first hub update into the van.
  // Isolate map simulation/rendering from that intentional narrative transition.
  env.run('game.story.update=()=>{};');
  for (const id of maps) {
    env.run(`game._doLoadMap(${JSON.stringify(id)});game.running=true;game.paused=false;game.showProfiler=false;GameSettings.profilerMode='off';game.update();game.draw();`);
    equal(env.probe.game.activeMap.id, id, id);
    equal(env.errors, [], id);
  }
}, {affine:true});

const failures = results.filter(r => r.status === 'failed');
console.log(JSON.stringify({file:gameFile,passed:results.length-failures.length,failed:failures.length,assertions,results},null,2));
if (failures.length) process.exitCode = 1;
