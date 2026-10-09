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
test('Rejected Flit spends no charge, only the blocked cue; shortened landing clears the actor radius', env => {
  flitFixture(env, [{x:0,y:0,w:300,h:300}]);
  const before = flitState(env);
  equal(env.run('game.triggerFlit()'), false);
  const rejected = flitState(env);
  ok(rejected.effects.includes('audio') && rejected.effects.includes('ring'), 'a blocked flit is felt: the ring shudders, a knock');
  equal({...rejected, effects: []}, before);
  env.run('__effects.length=0; game.activeMap.walls=[{x:210,y:50,w:50,h:100}];');
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
    ['flick out of a rest',1,{steps:[start,{t:40,x:40},{t:900,x:110}]}],
    ['sparse slow events stay a push',0,{steps:[start,{t:40,x:40},{t:180,x:70},{t:320,x:95}]}],
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

function setupDrive(env, {taxi=false,lane='R0.S0.L2',destination='clinic',endpoint=false}={}) {
  env.run(`{
    game._doLoadMap('hub_949'); game.story.update=()=>{}; game.running=true; game.paused=false;
    game.traffic.vehicles=[]; game.traffic.spawnTimer=1e9; GameSettings.getMaxTraffic=()=>0;
    game.zibSystem.passengerRide=null; game.zibSystem.activeZibs=[]; game.zibSystem.trySpawn=()=>{};
    game.keys={}; game.joystick.active=false; game.joystick.dx=game.joystick.dy=0; game.handbrakeHeld=false;
    const selected=game.traffic.network.allLanes.find(l=>l.id===${JSON.stringify(lane)});
    const offset=${endpoint} ? selected.length-12 : Math.min(200,selected.length*.3);
    game.car=game.ownedCar; game.car.disableAutoDrive(); game.car.clearNavWaypoints();
    Object.assign(game.car,{x:selected.start.x+selected.ux*offset,y:selected.start.y+selected.uy*offset,
      angle:selected.angle,vx:0,vy:0,speed:0,handbrake:false,pedal:0,steer:0,yawRate:0,
      visible:true,dead:false,hasDriver:true,controlMode:'PLAYER'});
    game.isDriving=true; game.player.visible=true; Object.assign(game.player,game.car.getSeatWorldPos(0));
    const point=${endpoint} ? selected.end : game.dropOffRegistry[${JSON.stringify(destination)}]; game.currency=10000;
    if(${taxi}) {
      const cab=new TrafficVehicle(selected,'LADY','suv2','AI');
      Object.assign(cab,{x:game.car.x,y:game.car.y,angle:selected.angle,speed:0,vx:0,vy:0,isZib:true,driverType:'zib',hasDriver:false});
      game.ownedCar.visible=false; game.ownedCar.active=false; game.isDriving=false;
      game.traffic.vehicles.push(cab); game.zibSystem.activeZibs.push(cab);
      game.zibSystem.startRide(cab,${endpoint ? 'null' : JSON.stringify(destination)},point.x,point.y,75,game);
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

for (const taxi of [false, true]) for (const lane of ['R0.S0.L2','R1.S1.L2']) {
  test(`${taxi ? 'Zib' : 'Player'} completes a passed endpoint stop on ${lane}`, env => {
    setupDrive(env, {taxi,lane,endpoint:true});
    const radius=taxi ? 40 : 35, car=env.probe.game.car;
    const initial=value(env, `return {x:__driveCar.x,y:__driveCar.y,
      distance:Math.hypot(__driveCar.x-__driveTarget.x,__driveCar.y-__driveTarget.y),
      steps:__driveCar._driveRoute.transitions.length};`);
    equal(initial.steps, 0); ok(initial.distance > radius, 'clamping moves the stop behind the car');
    const timerStart=env.pendingTimers.length;
    // A passed longitudinal stop still requires the right lane, lateral proximity,
    // a finished route and no active turn before either arrival flow completes.
    const guards=value(env, `
      const car=__driveCar, route=car._driveRoute, lane=car.currentLane, x=car.x, y=car.y;
      const arrived=()=>${taxi ? '!game.zibSystem.isPassenger' : '!game.navDestination'};
      const check=()=>${taxi ? 'game.zibSystem.tick(game)' : 'game.checkNavArrival()'};
      const result=[];
      car.x=x-lane.uy*${radius+1}; car.y=y+lane.ux*${radius+1}; check(); result.push(arrived());
      car.x=x; car.y=y; route.transitions.push({}); check(); result.push(arrived()); route.transitions.pop();
      car.currentTurnPath={}; check(); result.push(arrived()); car.currentTurnPath=null;
      car.currentLane=game.traffic.network.allLanes.find(l=>l!==lane); check(); result.push(arrived()); car.currentLane=lane;
      return result;
    `);
    equal(guards, [false,false,false,false], 'arrival guards retain an active journey');
    env.run('game.update();');
    equal(env.probe.game.navDestination, null, 'passed stop completes on the next update');
    near(car.x, initial.x); near(car.y, initial.y);
    near(car.speed, 0); near(car.vx, 0); near(car.vy, 0);
    ok(!env.pendingTimers.slice(timerStart).some(t=>t.ms===400), 'arrival uses no teleport');
    if(taxi) equal([env.probe.game.currency,env.probe.game.isDriving,env.probe.game.zibSystem.isPassenger], [9925,false,false]);
    else equal([env.probe.game.currency,car.controlMode], [10000,'PLAYER']);
  }, {events:true,timers:true});
}

test('Map-edge dead ends start no ride, keep her pin, and a failed route is free', env => {
  setupDrive(env);
  const result=value(env, `
    const N=game.traffic.network, lanes=N.allLanes, dead=lanes.filter(l=>!N.laneHasExit(l));
    // Zib spawning: force the random pick onto each dead end in turn
    const zs=game.zibSystem, tm={network:N,vehicles:[]}, R0=Math.random; let spawned=0;
    for (const l of dead) {
      const seq=[0,(lanes.indexOf(l)+0.5)/lanes.length]; Math.random=()=>seq.length?seq.shift():0.5;
      zs.activeZibs=[]; zs.trySpawn(tm); spawned+=zs.activeZibs.length;
    }
    Math.random=R0; zs.activeZibs=[];
    // Player autodrive on a dead end: refused with a reason, the pin left where she put it
    const lane=dead[0], car=game.car; car.disableAutoDrive(); car.clearNavWaypoints();
    Object.assign(car,{x:lane.start.x+lane.ux*lane.length*0.5,y:lane.start.y+lane.uy*lane.length*0.5,angle:lane.angle,currentLane:lane,currentTurnPath:null,speed:0,vx:0,vy:0,controlMode:'PLAYER'});
    const pin={...game.dropOffRegistry.clinic}; game.navDestination={...pin}; game.toggleAutoDrive();
    return {dead:dead.length,routable:lanes.length-dead.length,spawned,mode:car.controlMode,pin:game.navDestination};
  `);
  ok(result.dead > 0 && result.routable > 0, 'the hub has both kinds of lane');
  equal(result.spawned, 0, 'no Zib spawns on a dead end');
  equal(result.mode, 'PLAYER', 'autodrive refused on a dead end');
  equal(result.pin, value(env, 'return {...game.dropOffRegistry.clinic};'), 'her pin stays');
  // a ride the game can't route teleports free
  setupDrive(env, {taxi:true});
  env.run('game.zibSystem.teleportToDestination(game,{free:true});');
  equal(env.probe.game.currency, 10000, 'no fare for our routing failure');
}, {events:true,timers:true});

test('A map switch mid-ride ends the ride uncharged, with no ghost cab', env => {
  setupDrive(env, {taxi:true});
  env.run('for(let i=0;i<30;i++)game.update();');
  const mid=value(env, `const cab=game.car; game._doLoadMap('hotel_lobby');
    return {passenger:game.zibSystem.isPassenger,driving:game.isDriving,own:game.car===game.ownedCar,
            listed:game.zibSystem.activeZibs.includes(cab),currency:game.currency};`);
  equal(mid, {passenger:false,driving:false,own:true,listed:false,currency:10000});
  const later=value(env, `game._doLoadMap('hub_949'); game.story.update=()=>{};
    for(let i=0;i<700;i++)game.update(); return {passenger:game.zibSystem.isPassenger,currency:game.currency};`);
  equal(later, {passenger:false,currency:10000}, 'no stuck-teleport fare later');
}, {events:true,timers:true});

for (const taxi of [false, true]) test(`${taxi ? 'Zib' : 'Player'} stopped beside the final stop arrives after a still half-second`, env => {
  setupDrive(env, {taxi,endpoint:true});
  const radius=taxi ? 40 : 35;
  const result=value(env, `
    const car=__driveCar, lane=car._driveRoute.endLane, t=car._driveRoute.destination;
    const arrived=()=>${taxi ? '!game.zibSystem.isPassenger' : '!game.navDestination'};
    const check=()=>${taxi ? 'game.zibSystem.tick(game)' : 'game.checkNavArrival()'};
    Object.assign(car,{currentLane:lane,currentTurnPath:null,speed:0,vx:0,vy:0});
    // far beside it: never
    car.x=t.x-lane.uy*${radius*2+5}+lane.ux*20; car.y=t.y+lane.ux*${radius*2+5}+lane.uy*20;
    for(let i=0;i<40;i++)check(); const far=arrived();
    // beside it, within reach but off the lane centre: after 30 still ticks
    car.x=t.x-lane.uy*${radius+8}+lane.ux*20; car.y=t.y+lane.ux*${radius+8}+lane.uy*20;
    for(let i=0;i<29;i++)check(); const early=arrived();
    for(let i=0;i<3;i++)check(); const late=arrived();
    return {far,early,late};
  `);
  equal(result, {far:false,early:false,late:true});
}, {events:true,timers:true});

test('Arrival without a drive route keeps the direct-distance threshold', env => {
  const result=value(env, `
    const car={x:50,y:0,currentTurnPath:null,_driveRoute:null};
    const near=game._hasReachedDriveDestination(car,25,0,35);
    const passedFar=game._hasReachedDriveDestination(car,0,0,35);
    car.currentTurnPath={};
    const turning=game._hasReachedDriveDestination(car,25,0,35);
    return {near,passedFar,turning};
  `);
  equal(result, {near:true,passedFar:false,turning:false});
});

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

test('Every rapid-fire bullet that lands deals damage; a melee swing keeps its i-frames', env => {
  const r = value(env, `
    game._doLoadMap('hotel_lobby'); game.story.update=()=>{}; game.running=true; game.paused=false;
    game.enemies.length=0; game.projectiles.length=0;
    const g=new Ganger(game.player.x+300, game.player.y, {hp:40}); game.enemies.push(g);
    let shots=0;
    for (let i=0;i<60 && !g.dead;i++) {
      if (i%4===0) { game.projectiles.push(new ProjectileEntity({x:g.x-20,y:g.y,angle:0,isEnemy:false,owner:game.player,color:'#ccccff',speed:24,damage:ITEM_REGISTRY.pistol_anavia.stats.damage,life:30})); shots++; }
      game.update();
    }
    const m=new Ganger(0,0,{hp:100});
    const first=m.takeDamage(10,0,0,{type:'melee'}), second=m.takeDamage(10,0,0,{type:'melee'});
    return {dead:g.dead, shots, first, second, fireball:ABILITY_REGISTRY.fireball.stats.damage};
  `);
  equal(r.dead, true, 'the ganger falls');
  equal(r.shots, 5, 'five 8-damage Anavia bolts at 15/s drop a 40 HP ganger (not ~20)');
  equal([r.first, r.second], [true, false], 'a second swing inside the i-frames still misses');
  equal(r.fireball, 50);
});

test('Nav grid: once per tick, local invalidation, failed searches back off, steering falls back straight', env => {
  const r = value(env, `
    game._doLoadMap('cozy_cafe_interior'); game.running=true;
    const map=game.activeMap, nav=NavGrid.for(map);
    const p=game.props.find(q=>q.active!==false && q.hasCollision!==false && !q.noNav && q.width>20 && q.height>20);
    const rev0=nav.revision;
    p.x+=6; NavGrid.for(map); const sameTick=nav.revision===rev0;
    _simTick++; NavGrid.for(map); const nextTick=nav.revision>rev0;
    const far={revision:rev0, box:{x0:-900,y0:-900,x1:-800,y1:-800}}, near={revision:rev0, box:{x0:p.x,y0:p.y,x1:p.x+p.width,y1:p.y+p.height}};
    const local=[nav.pathTouched(far), nav.pathTouched(near)];
    p.x-=6; _simTick++; NavGrid.for(map);
    // a search that fails waits FAIL_RETRY_TICKS, wherever the goal goes
    const realFind=nav.findPath; let searches=0; nav.findPath=function(){searches++;return null;};
    const ent={x:p.x-60,y:p.y+p.height/2}, gx=p.x+p.width/2, gy=p.y+p.height/2;
    for(let i=0;i<10;i++){ _simTick++; navWaypoint(ent,gx+(i%2?40:-40),gy,map); }
    const early=searches;
    for(let i=0;i<CONFIG.NAV.FAIL_RETRY_TICKS;i++){ _simTick++; navWaypoint(ent,gx,gy,map); }
    const later=searches;
    ent._navPath=null; const step=actorSteer(ent,gx,gy,1.5,map);
    nav.findPath=realFind;
    return {sameTick,nextTick,local,early,later,step:Math.hypot(step.x,step.y),remaining:step.remaining};
  `);
  equal([r.sameTick, r.nextTick], [true, true], 'geometry is read once per simulation tick');
  equal(r.local, [false, true], 'only paths near a change re-plan');
  equal(r.early, 1, 'one failed search, then it waits'); equal(r.later, 2, 'and retries after FAIL_RETRY_TICKS');
  ok(r.step > 1, 'no route: steering edges straight on where the step is clear'); ok(Number.isFinite(r.remaining), 'with a finite remaining distance');
});

test('Melee steps in only on a target in reach', env => {
  const r = value(env, `
    game._doLoadMap('hotel_lobby'); game.story.update=()=>{}; game.running=true; game.paused=false;
    game.enemies.length=0; game.currentWeapon=createItemFromRegistry('maiden_kukri', game); game.isDriving=false;
    const pl=game.player; pl.angle=0; const x0=pl.x;
    game.meleeSlash(); const idle=pl.x-x0;
    const g=new Ganger(pl.x+40, pl.y, {hp:400}); game.enemies.push(g);
    const x1=pl.x; game.meleeSlash(); const engaged=pl.x-x1;
    return {idle, engaged};
  `);
  equal(r.idle, 0, 'a slash at nothing stays put');
  ok(r.engaged > 0, 'a slash at someone in reach steps in');
});

test('Pause → Equip opens the Weapons tab and lists the equipped gun; furniture waits for the apartment', env => {
  const r = value(env, `
    game._doLoadMap('hotel_lobby'); game.running=true; game.paused=false;
    const furnitureBefore=game.inventory.getEntries().filter(e=>e.source==='furniture').length;
    const gun=game.inventory.items.find(i=>i.type==='weapon'); game.inventory.equipItem(gun.id);
    invSidebar.filterEnabled=true; invSidebar.activeFilter='items';
    pauseMenuController.open(); pauseMenuController.executeQuick('equip');
    game.inventory.render();
    const equipped=game.inventory.getEntries().filter(e=>e.isEquipped).length;
    const shown=game.inventory.uiList.children.filter(c=>String(c.className||'').split(' ').includes('ui-pill')).length;
    game._doLoadMap('apt_949');
    const furnitureAfter=game.inventory.getEntries().filter(e=>e.source==='furniture').length;
    const gunShown=game.inventory.getEntries().some(e=>e.isEquipped && e.category==='weapons');
    return {screen:Screens.current, filter:invSidebar.activeFilter, equipped, shown, gunShown, furnitureBefore, furnitureAfter};
  `);
  equal([r.screen, r.filter], ['equipped', 'weapons']);
  ok(r.gunShown && r.equipped > 0 && r.shown === r.equipped, 'the equipped screen lists everything equipped, gun included');
  equal(r.furnitureBefore, 0, 'no furniture before she has been home');
  ok(r.furnitureAfter > 20, 'the apartment furniture once she has');
});

test('Adaptive lighting survives zoom lamp-budget steps and lightning', env => {
  const r = value(env, `
    game._doLoadMap('hub_949'); game.running=true; game.paused=false;
    GameSettings.adaptiveLighting=true; GameSettings.softShadows=true; game.cutscene.active=false; game._adaptiveLighting=null;
    game._lightingAdaptiveScale(); const s=game._adaptiveLighting; s.mode='reduced'; s.factor=0.8;
    game._maxLitLamps=10; const afterZoom=game._lightingAdaptiveScale();
    game.weather.lightningFlash=0.6; const afterFlash=game._lightingAdaptiveScale();
    const same=game._adaptiveLighting===s, flashing=s.flashing;
    game.weather.lightningFlash=0;
    return {eligible:s.eligible, afterZoom, afterFlash, same, flashing};
  `);
  ok(r.eligible, 'the hub at night is eligible');
  equal([r.afterZoom, r.afterFlash, r.same, r.flashing], [0.8, 0.8, true, true]);
});

test('Baseline layer panel: each layer gated and billed; with Baseline off nothing is gated or counted', env => {
  const r = value(env, `
    game.story.update=()=>{}; game._doLoadMap('hub_949'); game.running=true; game.paused=false;
    game.showProfiler=false; GameSettings.profilerMode='off'; game.worldMinutes=22*60;
    const W=game.weather; W.triggerLightning=()=>{}; W.lockSchedule&&W.lockSchedule('storm'); W.setCondition('storm',null,true);
    const spy={}, wrap=(o,k,name)=>{const f=o[k];o[k]=function(...a){spy[name]=(spy[name]||0)+1;return f.apply(this,a);};};
    wrap(game,'drawPlayer','stella'); wrap(game,'drawLightingSystem','lighting'); wrap(game,'drawEmissivePass','glow');
    wrap(game,'drawBloomPass','bloom'); wrap(W,'drawRainOverlay','rain');
    const frame=()=>{for(const k in spy)delete spy[k];game.worldMinutes=22*60;game.update();game.draw();return Object.assign({bld:RenderStats.bldBase},spy);};
    const P=CanvasRenderingContext2D.prototype, fillRect0=P.fillRect;
    const off=frame(), offShim=P.fillRect!==fillRect0, offAt=RenderLayers.at('lighting'), offTally=Object.keys(RenderLayers._tally).length;
    GameSettings.baseline=true; RenderLayers.sync(game);
    const firstUse=[...RenderLayers.layers()].sort(), onShim=P.fillRect!==fillRect0;
    const base=frame();
    RenderLayers.preset('none'); const none=frame();
    RenderLayers.toggle('lighting'); const solo=frame(), kept=JSON.parse(localStorage.getItem('dfab_render_layers'));
    RenderLayers.preset('all'); do frame(); while(RenderLayers._frames!==0);   // (to the start of a 30-frame window)
    const c0=RenderStats.calls; for(let i=0;i<30;i++)frame(); const c1=RenderStats.calls;
    const L=RenderLayers.last, sum=Object.values(L.avg).reduce((a,b)=>a+b,0);
    GameSettings.baseline=false; RenderLayers.sync(game);
    const after=frame();
    return {off, offShim, offAt, offTally, firstUse, onShim, base, none, solo, kept, all:{total:Math.round(L.total*30), counted:c1-c0, sum:Math.round(sum*30),
      stella:L.avg.stella>0, ground:L.avg.ground>0, lighting:L.avg.lighting>0, roofs:L.avg.roofs>0},
      restored:P.fillRect===fillRect0, active:RenderLayers.active, after};
  `);
  ok(r.off.stella && r.off.lighting && r.off.glow && r.off.rain && r.off.bloom && r.off.bld > 0, 'Baseline off: every layer draws');
  equal([r.offShim, r.offAt, r.offTally], [false, true, 0], 'Baseline off: no counter, no gates, nothing billed');
  equal(r.firstUse, ['atmosphere','bloom','bokeh','ground','hud','rain','rings','stella'], 'first use: what Baseline drew before');
  ok(r.onShim, 'the panel runs the call counter');
  ok(r.base.stella && r.base.rain && r.base.bloom, 'Base: Stella, rain and bloom draw');
  equal([r.base.lighting, r.base.glow, r.base.bld], [undefined, undefined, 0], 'Base: no lighting, glow or buildings');
  equal([r.none.stella, r.none.rain, r.none.bloom, r.none.lighting, r.none.bld], [undefined, undefined, undefined, undefined, 0], 'None draws no layer');
  equal([r.solo.lighting, r.solo.stella], [1, undefined], 'a chip switches its layer alone');
  equal(r.kept, ['lighting'], 'the chip set is kept');
  equal(r.all.total, r.all.counted, 'the layers bill every canvas call of the window');
  equal(r.all.sum, r.all.total);
  ok(r.all.stella && r.all.ground && r.all.lighting && r.all.roofs, 'All: the hub bills Stella, ground, lighting and roofs');
  equal([r.restored, r.active], [true, false], 'Baseline off again: the counter is gone');
  ok(r.after.stella && r.after.lighting && r.after.bld > 0, 'and every layer draws again');
});

test('Furniture sprites: painted runs never change over time, loops repeat per period, stamps follow state', env => {
  env.run('game.story.update=()=>{};');
  // Every painted-once run of every prop on every bundled map draws the same at any time (an animation left
  // in a still run would freeze); every loop paints the same one period on; a live piece forced still varies.
  const runTrace = (i, run, T) => { env.setTrace(true); env.run(`(() => { const p = game.props[${i}]; PropSprites._canvas(p, PropSprites._plan(p, null), ${run}, ${T}); })()`);
    const t = JSON.stringify(env.trace.map(op => op.slice(1)), (k, v) => typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v); env.setTrace(false); return t; };
  let checked = 0, loops = 0;
  for (const id of Object.keys(env.probe.MAPS)) {
    env.run(`game._doLoadMap(${JSON.stringify(id)});`);
    const kinds = value(env, 'return game.props.map(p => [PropSprites.kindOf(p), p.decorType || p.interactionType]);');
    kinds.forEach(([kind, type], i) => {
      if (!kind) return;
      if (kind === 'loop') {
        const P = value(env, `return PROP_LOOP[${JSON.stringify(type)}].period;`) * 1000;
        equal(runTrace(i, 0, 5000), runTrace(i, 0, 5000 + P), `${id} ${type}: one period on, the same frame`); loops++;
        return;
      }
      const first = runTrace(i, 0, 5000), runs = value(env, 'return PropPass.idx + 1;') || 1;
      equal(first, runTrace(i, 0, 987654.321), `${id} ${type}: its painted art never changes over time`);
      for (let r = 1; r < runs; r++) equal(runTrace(i, r, 5000), runTrace(i, r, 987654.321), `${id} ${type} run ${r}`);
      checked++;
    });
  }
  ok(checked > 300 && loops > 15, `checked ${checked} painted props and ${loops} loops`);
  env.run(`game._doLoadMap('house_of_death');`);
  const candle = value(env, `return game.props.findIndex(p => p.decorType === 'hod_candelabra');`);
  ok(runTrace(candle, 0, 5000) !== runTrace(candle, 0, 987654.321), 'control: a candelabra painted as if still would freeze its flames');

  const r = value(env, `
    game._doLoadMap('apt_949'); game.running=true; game.paused=false; game.worldMinutes=22*60;
    const P = CanvasRenderingContext2D.prototype, ctx = game.ctx;
    const sofa = game.props.find(p => p.decorType === 'apt_sofa'), sw = game.props.find(p => p.interactionType === 'light_switch');
    const craft = game.props.find(p => p.decorType === 'apt_craft');
    PropSprites.frame(1.4);
    const calls = (p) => { const before = __calls.n; p.draw(ctx); return __calls.n - before; };
    globalThis.__calls = { n: 0 }; for (const k of ['drawImage','fillRect','fill','stroke','save','restore','translate','rotate','arc','ellipse','roundRect','beginPath']) { const f = P[k]; P[k] = function () { __calls.n++; return f.apply(this, arguments); }; }
    const firstSofa = calls(sofa), sofaCalls = calls(sofa);
    sofa.angle = 0.3; const turned = calls(sofa); sofa.angle = 0;
    calls(craft); const craftCalls = calls(craft), craftRuns = craft._spr.runs.length, craftSplit = craft._spr.split;
    const swRuns = sw._spr || (calls(sw), sw._spr); const swBefore = sw._spr.runs[0];
    sw._switchState = !sw._switchState; calls(sw); const swRepainted = sw._spr.runs[0] !== swBefore && sw._spr.sw === sw._switchState;
    PropSprites.frame(2.6); const closeUp = calls(sofa) > 5; PropSprites.frame(1.4);
    GameSettings.propSprites = false; const vectorOff = calls(sofa) > 5; GameSettings.propSprites = true;
    game.draw(); const bytes = PropSprites.bytes, floor = !!game._aptFloor;
    game._doLoadMap('hotel_suite');
    const released = sofa._spr === undefined && PropSprites.bytes === 0 && !game._aptFloor;
    const desk = game.props.find(p => p.decorType === 'ps_desk'); PropSprites.frame(1.4); calls(desk);
    return {firstSofa, sofaCalls, turned, craftCalls, craftRuns, craftSplit, swRepainted, closeUp, vectorOff, bytes, floor, released, deskNever: !!(desk._spr && desk._spr.never)};
  `);
  equal([r.sofaCalls, r.turned], [1, 5], 'a still piece stamps in one call, five when turned');
  ok(r.firstSofa > 5, 'the first draw paints it');
  equal([r.craftRuns, r.craftSplit], [2, true], 'the workbench: two still runs round its live scanline and ember');
  ok(r.craftCalls < 15, `the workbench stamps its runs and draws only what moves (${r.craftCalls} calls)`);
  ok(r.swRepainted, 'flipping a light switch repaints its sprite');
  ok(r.closeUp, 'zoomed past what a sprite keeps sharp, the vector art draws');
  ok(r.vectorOff, 'Prop Sprites off: vector art');
  ok(r.bytes > 0 && r.floor, 'sprites and the apartment floor are held while she is there');
  ok(r.released, 'and let go when she leaves');
  ok(r.deskNever, 'a piece that cuts with destination-out stays vector');
}, {affine: true});

test('A landmark just off screen still throws its beams but skips its roof pass', env => {
  const r = value(env, `
    game.story.update=()=>{}; game._doLoadMap('hub_949'); game.running=true; game.paused=false; game.worldMinutes=22*60;
    const out = [];
    for (const style of ['silver_queen', 'double_nights', 'moon_city']) {
      const b = game.activeMap.buildings.find(x => x.style === style);
      let top = 0, glow = 0; const t0 = b.drawTop, e0 = b.drawEmissive;
      b.drawTop = function (...a) { top++; return t0.apply(this, a); }; b.drawEmissive = function (...a) { glow++; return e0.apply(this, a); };
      const rows = [];
      for (let dx = 0; dx < 1800; dx += 60) {
        const x = b.x + b.w + dx, y = b.y + b.h / 2;
        game.player.x = x; game.player.y = y; game.update(); game.player.x = x; game.player.y = y;
        top = 0; glow = 0; game.draw(); rows.push([dx, top, glow]);
      }
      delete b.drawTop; delete b.drawEmissive;
      out.push({ style, beside: rows[0], glowOnly: rows.filter(([, t, g]) => t === 0 && g > 0).length, topWithoutGlow: rows.filter(([, t, g]) => t > 0 && g === 0).length });
    }
    return out;`);
  for (const o of r) {
    ok(o.beside[1] === 1 && o.beside[2] >= 1, `${o.style}: beside it, both passes draw it (the glow twice when the street reflects it)`);
    ok(o.glowOnly > 0, `${o.style}: further off, only its glow pass (beams) draws`);
    equal(o.topWithoutGlow, 0, `${o.style}: the roof pass never draws what the glow pass has dropped`);
  }
});

test('A landmark whose body is off screen draws only its beams in the glow pass', env => {
  const r = value(env, `
    game.story.update=()=>{}; game._doLoadMap('hub_949'); game.running=true; game.paused=false; game.worldMinutes=22*60;
    const out = [];
    for (const style of ['silver_queen', 'moon_city']) {
      const b = game.activeMap.buildings.find(x => x.style === style);
      let top = 0, full = 0, beams = 0; const t0 = b.drawTop, e0 = b.drawEmissive;
      b.drawTop = function (...a) { top++; return t0.apply(this, a); };
      b.drawEmissive = function (...a) { if (a[2]) beams++; else full++; return e0.apply(this, a); };
      const rows = [];
      for (let dx = 0; dx < 1800; dx += 60) {
        const x = b.x + b.w + dx, y = b.y + b.h / 2;
        game.player.x = x; game.player.y = y; game.update(); game.player.x = x; game.player.y = y;
        top = 0; full = 0; beams = 0; game.draw(); rows.push([top, full, beams]);
      }
      delete b.drawTop; delete b.drawEmissive;
      out.push({ style, beside: rows[0], beamsOnly: rows.filter(([, f, bm]) => f === 0 && bm > 0).length, topWithoutBody: rows.filter(([t, f]) => t > 0 && f === 0).length,
        id: game.activeMap.buildings.indexOf(b) });
    }
    return out;`);
  for (const o of r) {
    ok(o.beside[1] >= 1 && o.beside[2] === 0, `${o.style}: beside it, the glow pass draws all of it`);
    ok(o.beamsOnly > 0, `${o.style}: further off, only its beams`);
    equal(o.topWithoutBody, 0, `${o.style}: its glow body reaches at least as far as its roof pass`);
  }
  env.setTrace(true);
  env.run(`(() => { for (const id of [${r.map(o => o.id)}]) { const b = game.activeMap.buildings[id]; b._sqDrawBeams = b._mcBeams = () => {}; b.drawEmissive(game.ctx, 1, true); delete b._sqDrawBeams; delete b._mcBeams; } })()`);
  equal(env.trace.length, 0, 'beams only: nothing but the beams touches the canvas');
  env.setTrace(false);
});

test('Portico marquee: one stamp a bulb, from a sprite baked to the screen scale', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('hub_949'); game.worldMinutes=22*60;`);
  const r = value(env, `
    const b = game.activeMap.buildings.find(x => x.style === 'silver_queen'), g = b._sqPortico();
    game.camera.x = g.dx; game.camera.y = g.yb + 120; game.camera.zoom = 1; _zoomLOD = 0;
    b._sqDrawPorticoGlow(game.ctx, 1, 1);   // (bakes the sprites)
    return { id: game.activeMap.buildings.indexOf(b), n: Math.floor((g.x1 - g.x0 - 8) / 9) + 1 };`);
  env.setTrace(true);
  env.run(`game.activeMap.buildings[${r.id}]._sqDrawPorticoGlow(game.ctx, 1, 1)`);
  const ops = env.trace.map(op => op[1]);
  env.setTrace(false);
  equal(ops.filter(o => o === 'arc').length, 0, 'no bulb, dot or lantern is an arc of its own');
  ok(ops.filter(o => o === 'drawImage').length >= r.n, `the ${r.n} marquee bulbs are stamped`);
  const s = value(env, `
    const c = game.ctx, bulb = () => bulbSprite(c, '1,2,3', 1, 1.5, '4,5,6', 0.22, 4.5);
    c.setTransform(1, 0, 0, 1, 0, 0); const a = bulb(); c.setTransform(2.5, 0, 0, 2.5, 0, 0); const b = bulb(); c.setTransform(1, 0, 0, 1, 0, 0);
    return [a.width, a.r, b.width, b.r, a === bulb()];`);
  equal(s, [11, 5.5, 44, 5.5, true], 'baked once per scale (1 and 4 px a world px), stamped the same size in the world');
}, {affine: true});

test('Apartment lights: each lamp shade and festoon bulb is one stamp, glow and bulb together', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('apt_949'); game.worldMinutes=22*60; game.drawApartmentGlow(game.ctx);`);   // (bakes the sprites)
  env.setTrace(true);
  env.run(`game.drawApartmentGlow(game.ctx)`);
  const ops = env.trace.map(op => op[1]);
  env.setTrace(false);
  equal(ops.filter(o => o === 'arc').length, 2, 'the only arcs left are the two gas-burner rings');
  ok(ops.filter(o => o === 'drawImage').length >= 72 + 8, 'the 72 festoon bulbs and the lamp shades are stamped');
}, {affine: true});

test('The window city draws nothing while its strip is off screen', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('apt_949'); game.worldMinutes=22*60;
    game._cullBounds = { view: { left: 0, right: 900, top: 300, bottom: 700 } }; game.drawApartmentBackdrop(game.ctx);`);   // (lays out and bakes)
  env.setTrace(true);
  env.run(`game.drawApartmentBackdrop(game.ctx)`);
  const off = env.trace.length;
  env.run(`game._cullBounds = { view: { left: 0, right: 900, top: -300, bottom: 100 } }; game.drawApartmentBackdrop(game.ctx)`);
  const on = env.trace.length - off;
  env.setTrace(false);
  equal(off, 0, 'in the rooms: no calls at all');
  ok(on > 0, 'on the veranda: it draws');
}, {affine: true});

test('City view: the hub kit seen from a window; its bake leaves the camera as it found it, and each car is one stamp', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('apt_949'); game.worldMinutes=22*60;`);
  const r = value(env, `
    const cam = game.camera, lod = _zoomLOD, cv = new CityView({ x: 0, y: -394, w: 1400, h: 400, seed: 949 });
    cv.bakeBase(); cv.bakeGlow();
    game._cullBounds = { view: { left: -2000, right: 4000, top: -2000, bottom: 2000 } };
    const t = _frameTime / 1000, s = cv.scale, inWin = (x, w) => !(x + w < cv.x || x > cv.x + cv.w), span = cv.VW + 60, pw = 8 * s * 2;
    const cars = cv.cars.filter(c => { const p = cv._carAt(c, t), st = cv._carStamp(c.v, p.rot); return p.a > 0.02 && inWin(cv.x + p.x * s - st.w / 2, st.w); }).length;
    const peds = cv.peds.filter(q => inWin(cv.x + (((q.offset + t * q.speed) % span + span) % span - 30) * s - pw, pw * 2)).length;
    window.__cv = cv; cv.drawBase(game.ctx);   // (turns each car's stamp once)
    return { same: game.camera === cam && _zoomLOD === lod, buildings: cv.buildings.length, cars, peds, kinds: [...new Set(cv.buildings.map(b => b.type))].sort() };`);
  ok(r.same, 'the game camera and zoom LOD are back as they were');
  ok(r.buildings >= 10, 'blocks filled with the hub\'s generic buildings');
  equal(r.kinds, ['apartment', 'shop', 'warehouse'], 'in the hub\'s mix');
  env.setTrace(true);
  env.run(`window.__cv.drawBase(game.ctx)`);
  const images = env.trace.filter(op => op[1] === 'drawImage').length;
  env.setTrace(false);
  equal(images, 1 + r.cars + r.peds, 'the still city, then one stamp per car and per person in the window');
}, {affine: true});

test('City traffic: the cars on a lane share its speed, and never close on each other', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('apt_949');`);
  const r = value(env, `
    const out = [];
    for (const seed of [1, 7, 949]) {
      const cv = new CityView({ x: 0, y: -394, w: 1400, h: 400, seed, parallax: 0.35, edgeY: 20 }), span = cv.VW + 240, lanes = new Map();
      for (const c of cv.cars) if (c.axis === 'h') { if (!lanes.has(c.y)) lanes.set(c.y, []); lanes.get(c.y).push(c); }
      let worst = Infinity, oneSpeed = true;
      for (const cars of lanes.values()) {
        oneSpeed = oneSpeed && cars.every(c => c.speed === cars[0].speed);
        for (let t = 0; t < 600; t += 0.25) {
          const xs = cars.map(c => cv._carAt(c, t).x);
          for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
            const d = Math.abs(xs[i] - xs[j]);
            worst = Math.min(worst, Math.min(d, span - d) - (cars[i].v.length + cars[j].v.length) / 2);
          }
        }
      }
      out.push({ lanes: lanes.size, oneSpeed, worst: Math.round(worst) });
    }
    return out;`);
  for (const l of r) {
    equal(l.lanes, 4, 'two lanes each way');
    ok(l.oneSpeed, 'one speed a lane');
    ok(l.worst >= 40, `over ten minutes the closest two cars on a lane come is ${l.worst} hub px, bumper to bumper`);
  }
});

test('City parallax: the city slides slower than the floor, never past its picture, and sits as laid out at the edge', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('apt_949'); game.worldMinutes=22*60;`);
  const r = value(env, `
    const cv = game._makeAptCityView(), P = cv.parallax, out = { covered: true };
    for (let x = -300; x <= 1700; x += 50) for (let y = -400; y <= 1000; y += 50) {
      game.view = { x, y, zoom: 1 }; cv.slide();
      const L = cv.ix + cv.dx, T = cv.iy + cv.dy, e = 1e-6;
      if (L > cv.x + e || L + cv.iw < cv.x + cv.w - e || T > cv.y + e || T + cv.ih < cv.y + cv.h - e) out.covered = false;
    }
    game.view = { x: cv.x + cv.w / 2, y: cv.edgeY, zoom: 1 }; cv.slide(); out.edge = [cv.dx, cv.dy];
    game.view = { x: cv.x + cv.w / 2 + 100, y: cv.edgeY + 60, zoom: 1 }; cv.slide(); out.moved = [cv.dx / P, cv.dy / P];
    game._cullBounds = { view: { left: -2000, right: 4000, top: -2000, bottom: 2000 } };
    window.__cv = cv; cv.drawBase(game.ctx);   // (bakes, and turns the car stamps)
    return out;`);
  ok(r.covered, 'from any camera, the picture covers the whole window');
  equal(r.edge, [0, 0], 'at the edge, centred: the city as laid out');
  equal(r.moved.map(Math.round), [100, 60], 'the camera 100 px along and 60 back: the city follows it by the parallax');
  const src = (vx, vy) => {
    env.setTrace(true);
    env.run(`game.view = { x: ${vx}, y: ${vy}, zoom: 1 }; window.__cv.drawBase(game.ctx)`);
    const op = env.trace.find(o => o[1] === 'drawImage');
    env.setTrace(false);
    return [op[3], op[4], op[7], op[8]];
  };
  const a = src(700, 20), b = src(800, 80), res = 1.5, P = 0.35;
  equal([a[2], a[3]], [0, -394], 'the still city is stamped into the window');
  equal([Math.round((a[0] - b[0]) / res / P), Math.round((a[1] - b[1]) / res / P)], [100, 60], 'and the part of it that shows slides with the camera, by the parallax');
}, {affine: true});

test('Look-out: at the veranda edge the camera leans out over the city; nowhere else', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('apt_949'); game.running=false; game.enterWorld(); game.loop=()=>{};`);
  const at = (x, y) => value(env, `
    if (!game._cityView) game._cityView = game._makeAptCityView();
    for (let i = 0; i < 120; i++) { game.player.x = ${x}; game.player.y = ${y}; _frameTime += 50; game.draw(); }
    return { lean: game.lookLeanY, want: -game._cityView.lookout / game.camera.zoom, camY: game.camera.y, top: game.activeMap.cameraBounds.top + game.canvas.height / 2 / game.camera.zoom };`);
  const edge = at(700, 20), room = at(400, 500);
  ok(Math.abs(edge.lean - edge.want) < 1, `at the railing it leans ${Math.round(edge.lean)} px (${Math.round(edge.want)} wanted: the same on screen at any zoom)`);
  equal(Math.round(edge.camY), Math.round(Math.max(20 + edge.want, edge.top)), 'the camera is that far out past her (or as far as the city strip goes, on a tall screen)');
  ok(Math.abs(room.lean) < 0.01, 'in the rooms: none');
  const hub = value(env, `game._doLoadMap('hub_949'); _frameTime += 16; game.draw(); return game.lookLeanY;`);
  equal(hub, 0, 'and none at once on another map');
}, {affine: true});

test('Camera edge lock: the view stays inside the map, a narrow map is centred, and off it follows her as before', env => {
  env.run(`game.story.update=()=>{};`);
  const view = (map, px, py, pre = '') => value(env, `
    if (!game.activeMap || game.activeMap.id !== '${map}') { game._doLoadMap('${map}'); game.running=false; game.enterWorld(); game.loop=()=>{}; }
    ${pre}
    for (let i = 0; i < 3; i++) { game.player.x = ${px}; game.player.y = ${py}; _frameTime += 50; game.draw(); }
    const v = game.view, hw = game.canvas.width / 2 / v.zoom, hh = game.canvas.height / 2 / v.zoom;
    return { l: v.x - hw, r: v.x + hw, t: v.y - hh, b: v.y + hh, x: v.x, y: v.y, cx: game.camera.x, cy: game.camera.y };`);
  const e = 1e-6;
  const west = view('apt_949', 20, 100), east = view('apt_949', 1380, 100), rail = view('apt_949', 700, 20);
  ok(Math.abs(west.l) < e && Math.abs(east.r - 1400) < e, 'at the veranda\'s ends the view stops at the apartment\'s walls');
  ok(rail.t >= -394 - e && rail.t < 6, 'at the railing it still rises over the city strip, and no further than its top');
  ok(west.x === west.cx && west.y === west.cy, 'the camera everything else reads is the clamped one');
  const van = view('van_interior', 60, 400, 'game.camera.zoom = 1.6;');
  equal(van.x, 200, 'a map narrower than the view is centred');
  const hub = view('hub_949', 10, 10);
  ok(hub.l >= -e && hub.t >= -e, 'at the hub\'s corner the view stays inside the city');
  const cut = view('hub_949', 2000, 2000, 'game.cutscene.active = true; game.camera.x = -500; game.camera.y = 20000;');
  env.run(`game.cutscene.active = false;`);
  ok(cut.l >= -e && cut.b <= 11000 + e && cut.cx === cut.x, 'a cutscene camera outside the map is brought in, and stays in');
  const off = view('apt_949', 20, 100, 'GameSettings.cameraEdgeLock = false;');
  env.run(`GameSettings.cameraEdgeLock = true;`);
  equal([off.x, off.y], [20, 100], 'with the lock off the camera is her own position again');
}, {affine: true});

test('Ultra reflections: lights at half size, detail at full size and only where it has something, art at the scale it is seen', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('hub_949'); game.running=false; game.enterWorld(); game.loop=()=>{};
    const W = game.weather; W.triggerLightning = () => {}; if (W.lockSchedule) W.lockSchedule('rain'); W.setCondition('rain', null, true);
    GameSettings.reflections = 'ultra'; GameSettings.adaptiveLighting = false;
    for (let i = 0; i < 3; i++) { W.wetness = 1; game.worldMinutes = 22 * 60; game.player.x = 1200; game.player.y = 2400; _frameTime += 16; game.draw(); }`);
  const r = value(env, `
    const F = game._refl, W = game.canvas.width, H = game.canvas.height;
    const out = { R: [F.R.width, F.R.height], full: [W, H], D: F.D ? [F.D.width, F.D.height] : null, Dr: F.Dr };
    game.view.zoom = 1; out.s1 = game._ultraArtScale(); game.view.zoom = 1.6; out.s2 = game._ultraArtScale();
    // nobody and nothing near: no detail layer at all
    const movers = game._ultraReflectionMovers, fol = game._drawUltraReflectionFoliage;
    game._ultraReflectionMovers = () => []; game._drawUltraReflectionFoliage = () => {};
    game.prepareReflections(); out.empty = game._refl.D;
    game._ultraReflectionMovers = movers; game._drawUltraReflectionFoliage = fol;
    return out;`);
  equal(r.R, r.full.map(v => Math.round(v * 0.5)), 'the lights at half size, as on High');
  equal(r.D, r.full, 'the detail layer (people, cars, trees) at full size');
  ok(r.Dr && r.Dr.x1 > r.Dr.x0 && r.Dr.y1 > r.Dr.y0, 'and it knows where it drew');
  equal([r.s1, r.s2], [1, 2], 'reflected art painted at 1x up to zoom 1.25, 2x closer in');
  equal(r.empty, null, 'with nothing to reflect, no detail layer is laid down');
  // The shimmer lays down only the bands across the rect it drew in, and only its columns
  env.setTrace(true);
  env.run(`(() => { const cv = document.createElement('canvas'); cv.width = 900; cv.height = 600; game._drawUltraReflectionBands(game.ctx, cv, 900, 600, 60, { x0: 100, y0: 100, x1: 300, y1: 160 }); })()`);
  const ops = env.trace.filter(o => o[1] === 'drawImage');
  env.setTrace(false);
  equal(ops.length, 6, 'a 60 px tall rect: the 6 bands of 10 px it crosses');
  ok(ops.every(o => o[5] === 200 && o[9] === 200), 'each only 200 px wide, the rect\'s columns');
}, {affine: true});

test('Adaptive reflections: slow frames step Ultra down to High then Medium (never Off), steady frames bring it back, the saved choice untouched', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('hub_949'); game.running=false; game.enterWorld(); game.loop=()=>{};`);
  const r = value(env, `
    let T = 100000; const pn = performance.now; performance.now = () => T;
    const out = [];
    try {
      game.running = true; game.paused = false; game.cineCam = null; game._refl = { R: null };
      GameSettings.adaptiveLighting = true; GameSettings.fpsLimit = 0; GameSettings.reflections = 'ultra'; game._reflAdapt = null;
      const run = (frameMs, reflMs, secs) => { for (let t = 0; t < secs * 1000; t += 133) { T += 133; game._renderFrameMs = frameMs; game._adaptReflections(reflMs); } return game.reflectQuality(); };
      out.push(run(25, 6, 5), run(25, 6, 5), run(25, 6, 30));           // slow: ultra → high → medium, and no lower
      out.push(GameSettings.reflections);
      out.push(run(15, 3, 20), run(15, 3, 15));                         // steady: back to high, then to ultra
      game.cineCam = {}; GameSettings.reflections = 'high'; GameSettings.reflections = 'ultra';
      game._reflAdapt.cap = 'medium'; out.push(game.reflectQuality()); game.cineCam = null;   // photo mode keeps its own choice
      game._reflAdapt = null; out.push(run(15, 6, 30));                 // on target: never steps down
      game._reflAdapt = null; out.push(run(25, 1, 30));                 // slow, but not the reflections' doing: stays
      game._reflAdapt = null; GameSettings.adaptiveLighting = false; out.push(run(25, 6, 30));   // the switch off: the choice, always
    } finally { performance.now = pn; GameSettings.adaptiveLighting = true; game._reflAdapt = null; }
    return out;`);
  equal(r.slice(0, 3), ['high', 'medium', 'medium'], 'slow frames step it down a level at a time, never to Off');
  equal(r[3], 'ultra', 'the saved setting is still Ultra');
  equal(r.slice(4, 6), ['high', 'ultra'], 'steady frames bring it back up');
  equal(r[6], 'ultra', 'photo mode keeps its own reflections');
  equal(r.slice(7), ['ultra', 'ultra', 'ultra'], 'on target, or slow for other reasons, or with the switch off: no change');
}, {affine: true});

test('Device Preset: off by default; on applies this device\'s tier, a save can\'t undo it, and off puts every setting back', env => {
  const r = value(env, `
    const G = GameSettings, out = { def: G.devicePreset }, keys = G._PRESET_KEYS, before = {};
    for (const k of keys) before[k] = G[k];
    const nav = navigator, mob = G._isMobile;
    const tier = (cores, mem, mobile) => {
      const c0 = nav.hardwareConcurrency, m0 = nav.deviceMemory;
      nav.hardwareConcurrency = cores; nav.deviceMemory = mem; G._isMobile = mobile;
      try { return G.deviceTier(); } finally { nav.hardwareConcurrency = c0; nav.deviceMemory = m0; G._isMobile = mob; }
    };
    out.tiers = [tier(2, undefined, false), tier(8, 2, false), tier(4, undefined, false), tier(8, 8, true), tier(8, 8, false)];
    G.deviceTier = () => 'low';
    try {
      G.setDevicePreset(true);
      out.on = [G.devicePreset, G.lightingQuality, G.reflections, G.trafficDensity, G.bloom, JSON.parse(localStorage.getItem('dfab_device_preset')).on];
      G.reflections = 'ultra'; G.lightingQuality = 'high'; G.bloom = true;      // a save's own settings, restored
      G.reapplyDevicePreset();
      out.afterSave = [G.lightingQuality, G.reflections, G.bloom];
      G.setDevicePreset(false);
      out.off = [G.devicePreset, keys.every(k => G[k] === before[k]), JSON.parse(localStorage.getItem('dfab_device_preset')).on];
      G.reflections = 'ultra'; G.reapplyDevicePreset(); out.offSave = G.reflections; G.reflections = before.reflections;
    } finally { delete G.deviceTier; G.setDevicePreset(false); }
    return out;`);
  equal(r.def, false, 'off by default');
  equal(r.tiers, ['low', 'low', 'medium', 'medium', 'high'], 'tiers: 2 cores, 2 GB, 4 cores, a phone, a strong desktop');
  equal(r.on, [true, 'low', 'off', 'low', false, true], 'on: the low preset (lighting low, reflections off, traffic low, no bloom), kept on this device');
  equal(r.afterSave, ['low', 'off', false], 'a save bringing heavier settings is brought back to the preset');
  equal(r.off, [false, true, false], 'off: every setting it touched back exactly as it was');
  equal(r.offSave, 'ultra', 'and while off, a save\'s settings stand');
});

test('Rooftop festoons: every bulb at its own shimmer of the string, in one fill per shimmer', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('hub_949');`);
  const r = value(env, `
    const b = game.activeMap.buildings.find(x => x.roofFeatures && x.roofFeatures.includes('lights'));
    const saved = b.roofFeatures; b.roofFeatures = ['lights'];
    return { found: !!b, id: game.activeMap.buildings.indexOf(b) };`);
  ok(r.found, 'an apartment with festoons');
  env.setTrace(true);
  env.run(`(() => { const b = game.activeMap.buildings[${r.id}]; game.ctx.globalAlpha = 0.8; b._drawRoofFeatures(game.ctx, true); })()`);
  const fills = env.trace.filter(op => op[1] === 'fill').length;
  const alphas = env.trace.filter(op => op[1] === 'set' && op[2] === 'globalAlpha').map(op => op[3]);
  env.setTrace(false);
  equal(fills, 15, 'the 39 bulbs go out in 15 fills');
  ok(alphas.slice(0, 15).every(a => a >= 0.8 * 0.5 - 1e-9 && a <= 0.8 + 1e-9), 'each at 0.5–1 of the string brightness, never fading down the string');
}, {affine: true});

test('Landmark roofs: every painted run draws the same at any time and in any wind', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('hub_949');`);
  const paint = { silver_queen: 'b._leanRoof(game.ctx, true)', moon_city: 'b._mcDrawRoof(game.ctx, false)',
    portico: "(() => { const g = b._sqPortico(); b._sqPorticoPlane(game.ctx, g, g.x1 - g.x0, SQ_PORTICO.depth, 0); })()",   // (unmarked: one whole run)
    canopy: 'b._mcCanopyPlane(game.ctx)' };
  const owner = { silver_queen: 'silver_queen', moon_city: 'moon_city', portico: 'silver_queen', canopy: 'moon_city' };
  const whole = { portico: true, canopy: true };
  const tr = (style, run, T, wind) => {
    env.setTrace(true);
    env.run(`(() => { const b = game.activeMap.buildings.find(x => x.style === '${owner[style]}'); _gameTimeSec = ${T}; _frameTime = ${T * 1000};
      if (game.weather) game.weather.windVec = { x: ${wind}, y: ${wind / 2} };
      PropPass._begin(1, ${run}); try { ${paint[style]}; } finally { PropPass.mode = 0; } })()`);
    // (the mock's restore() records the state it puts back as sets: that's the last paint's leftovers, not this one's)
    const ops = []; let inRestore = false;
    for (const op of env.trace) { if (op[1] === 'restore') inRestore = true; else if (op[1] !== 'set') inRestore = false; if (!(inRestore && op[1] === 'set')) ops.push(op.slice(1)); }
    const t = JSON.stringify(ops, (k, v) => typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v);
    env.setTrace(false); return t;
  };
  for (const style of Object.keys(paint)) {
    tr(style, 0, 1, 1); const runs = value(env, 'return Math.max(1, PropPass.idx + 1);');
    for (let r = 1; r < runs; r++) tr(style, r, 1, 1);      // (a first paint of each run makes its lazy outlines and gradients)
    const first = tr(style, 0, 5, 1);
    ok(whole[style] ? runs === 1 : runs >= 2, `${style}: still runs round its live parts (${runs})`);
    equal(first, tr(style, 0, 777.25, 6), `${style}: run 0 never changes with time or wind`);
    for (let r = 1; r < runs; r++) equal(tr(style, r, 5, 1), tr(style, r, 777.25, 6), `${style}: run ${r}`);
  }
}, {affine: true});

test('An unmarked plane (the Moon City canopy) stamps as one sprite instead of drawing its art', env => {
  env.run(`game.story.update=()=>{}; game._doLoadMap('hub_949');`);
  const B = "game.activeMap.buildings.find(x => x.style === 'moon_city')";
  env.run(`${B}._planeSpr = { canopy: { lod: _zoomLOD, runs: [{ cv: document.createElement('canvas'), x: 1, y: 2, w: 30, h: 20 }], n: 1, done: true, never: false, whole: true, bytes: 0 } };`);
  env.setTrace(true); env.run(`${B}._mcDrawCanopy(game.ctx, false)`);
  const names = env.trace.map(op => op[1]); env.setTrace(false);
  equal(names.filter(n => n === 'drawImage').length, 1, 'the canopy is one stamp');
  equal(names.filter(n => n === 'quadraticCurveTo' || n === 'createLinearGradient' || n === 'fill').length, 0, 'its velvet and valance are not drawn as vector');
  ok(names.includes('stroke'), 'the gold posts still draw live');
}, {affine: true});

// Cars (engine/cars.js): her own car, Amber's van and whatever she's taken, on the hub and off it
function carsFixture(env) {
  env.run(`{
    game.story.update=()=>{}; game._doLoadMap('hub_949'); game.running=true; game.paused=false;
    game.traffic.vehicles=[]; game.traffic.spawnTimer=1e9; GameSettings.getMaxTraffic=()=>0;
    game.zibSystem.passengerRide=null; game.zibSystem.activeZibs=[]; game.zibSystem.trySpawn=()=>{};
    game.keys={}; game.joystick.active=false; game.joystick.dx=game.joystick.dy=0;
    globalThis.__lane=game.traffic.network.allLanes.find(l=>l.id==='R0.S0.L2');
    globalThis.__street=(along,brand='LADY')=>{
      const c=new TrafficVehicle(__lane,brand,brand==='LADY'?'suv2':Object.keys(VEHICLE_BRANDS[brand].models)[0],'AI');
      Object.assign(c,{x:__lane.start.x+__lane.ux*along,y:__lane.start.y+__lane.uy*along,angle:__lane.angle,speed:0,vx:0,vy:0});
      game.traffic.vehicles.push(c); return c;
    };
    globalThis.__beside=c=>{game.player.x=c.x-Math.sin(c.angle)*45;game.player.y=c.y+Math.cos(c.angle)*45;};
  }`);
}

test('Cars live on the hub: after a hijack nothing of hers is drawn, solid or offered indoors, and each is back where she left it', env => {
  carsFixture(env);
  const result=value(env, `
    const own=game.ownedCar, van=game.deliveryVehicle, ownAt=[own.x,own.y], vanAt=[van.x,van.y];
    const h=__street(300); __beside(h); game.hijackVehicle(h);
    h.x+=120; game.toggleVehicle(); const hAt=[h.x,h.y];
    game._doLoadMap('cozy_cafe_interior');
    game.player.x=own.x; game.player.y=own.y; game.update(); game.draw();      // standing where her car is on the hub
    const indoors={cars:[own,van,h].map(c=>[c.visible,c.active]),
      solid:[own,van,h].some(c=>c.active&&GameEntity.registry.all.includes(c)),
      offered:game.activeInteraction&&game.activeInteraction.target||null, parked:game.parkedCars().length};
    game._doLoadMap('hub_949');
    return {indoors:{...indoors,offered:!!indoors.offered}, linked:game.car===h, vans:GameEntity.registry.all.filter(e=>e.isDeliveryVehicle).length,
      own:[own.x,own.y], ownAt, van:[van.x,van.y], vanAt, h:[h.x,h.y], hAt,
      shown:[own,van,h].map(c=>c.visible&&c.active&&GameEntity.registry.all.includes(c)), inTraffic:game.traffic.vehicles.includes(h)};
  `);
  equal(result.indoors, {cars:[[false,false],[false,false],[false,false]], solid:false, offered:false, parked:0}, 'every car put away indoors');
  equal([result.own, result.van, result.h], [result.ownAt, result.vanAt, result.hAt], 'each where she left it');
  equal([result.linked, result.vans, result.shown, result.inTraffic], [true, 1, [true,true,true], false]);
}, {events:true});

test('Out of a hijacked car: lights left on, still hers to Drive; taking another sends it back to traffic, lit, and an empty one has nobody to put out', env => {
  carsFixture(env);
  const result=value(env, `
    const a=__street(300,'Gelfash'), b=__street(700); __beside(a); game.hijackVehicle(a); game.toggleVehicle();
    game.update();
    const left={mode:a.controlMode, lit:carLampsOn(a), traffic:game.traffic.vehicles.includes(a), pill:game.interactBtn._apSig,
      kind:game.activeInteraction&&game.activeInteraction.type};
    document.getElementById('message-modal').textContent='';
    game.interact(); for(let i=0;i<300&&!game.isDriving;i++) game.update();         // the Drive pill: round to her door, back in, no second theft
    const again={driving:game.isDriving, car:game.car===a, msg:document.getElementById('message-modal').textContent||''};
    game.toggleVehicle(); __beside(b); game.update(); const hijackPill=game.interactBtn._apSig;
    game.hijackVehicle(b);
    const switched={lit:carLampsOn(a), traffic:game.traffic.vehicles.includes(a), linked:game.car===b, driving:game.isDriving};
    game.toggleVehicle(); for(let i=0;i<5;i++) game.update();
    const later={mode:a.controlMode, lit:carLampsOn(a)};
    const enemies=game.enemies.length, R=Math.random; Math.random=()=>0;              // a Gelfash driver comes out fighting 1 time in 5 — but nobody's in it
    __beside(a); game.hijackVehicle(a); Math.random=R;
    return {left, again, hijackPill, switched, later, retaken:{car:game.car===a, enemies:game.enemies.length-enemies, bBack:game.traffic.vehicles.includes(b)}};
  `);
  equal(result.left, {mode:'PARKED', lit:true, traffic:false, pill:'Drive|Car|E', kind:'drive'});
  equal([result.again.driving, result.again.car], [true, true]);
  ok(!/HIJACKED/.test(result.again.msg), 'getting back in is not a hijack');
  equal(result.hijackPill, 'Hijack|Vehicle|E');
  equal(result.switched, {lit:true, traffic:true, linked:true, driving:true}, 'the old one keeps its lights as it goes back to traffic');
  equal(result.later, {mode:'PARKED', lit:true});
  equal(result.retaken, {car:true, enemies:0, bBack:true});
}, {events:true});

test("Amber's van is sanctioned: never duplicated, parked where she leaves it, home for a new job", env => {
  carsFixture(env);
  const result=value(env, `
    const van=game.deliveryVehicle, home={...van.home}; __beside(van); game.update();
    const pill=game.interactBtn._apSig;
    game.interact(); for(let i=0;i<300&&!game.isDriving;i++) game.update();         // round to the driver's door and in
    game._rideHud();
    const inVan={car:game.car===van, kept:game.deliveryVehicle===van, kind:game.carKind(van), chip:document.getElementById('ui-ride').querySelector('.r-chip').textContent,
      traffic:game.traffic.vehicles.includes(van)};
    van.x+=500; game.toggleVehicle(); const leftAt=[van.x,van.y];
    game._doLoadMap('cozy_cafe_interior'); game._doLoadMap('hub_949');
    const back={same:game.deliveryVehicle===van, vans:GameEntity.registry.all.filter(e=>e.isDeliveryVehicle).length, at:[van.x,van.y], traffic:game.traffic.vehicles.includes(van)};
    game._doLoadMap('cozy_cafe_interior'); NPC_DIALOGUE['Barista Ren'].accept(game);
    const job=game.missions.activeMission&&game.missions.activeMission.type;
    game._doLoadMap('hub_949');
    return {pill, inVan, leftAt, back, job, home:[van.x,van.y,van.angle], homeWas:[home.x,home.y,home.angle], vans:GameEntity.registry.all.filter(e=>e.isDeliveryVehicle).length};
  `);
  equal(result.pill, 'Drive|Delivery van|E');
  equal(result.inVan, {car:true, kept:true, kind:'sanctioned', chip:'Sanctioned', traffic:false});
  equal(result.back, {same:true, vans:1, at:result.leftAt, traffic:false}, 'one van, where she left it');
  equal([result.job, result.home, result.vans], ['delivery', result.homeWas, 1], 'a new job finds it by the cafe');
}, {events:true});

test('Markers: pins over what is on screen after the light; the compass round her for what is not; none indoors', env => {
  carsFixture(env);
  const draw=(setup)=>value(env, `
    ${setup}
    const kinds=[], at=[], order=[], M=MapIcons.draw, L=game.drawLightingSystem, C=game.drawMarkers;
    MapIcons.draw=function(ctx,k,x,y,...a){ if(/Pin:|^pin:|[bB]adge:/.test(k)) { kinds.push(k); at.push([k,x,y]); } return M.call(this,ctx,k,x,y,...a); };
    game.drawLightingSystem=function(...a){ order.push('light'); return L.apply(this,a); };
    game.drawMarkers=function(...a){ order.push('markers'); return C.apply(this,a); };
    const labels=[], F=game.ctx.fillText; game.ctx.fillText=function(t,...a){ if(/CAR|AMBER|PICK|DROP|\\dm$/.test(t)) labels.push(t); return F.call(this,t,...a); };
    try { game.draw(); }
    finally { MapIcons.draw=M; delete game.drawLightingSystem; delete game.drawMarkers; game.ctx.fillText=F; }
    const v=game.view, z=v.zoom, hub=game.isDriving?game.car:game.player;
    const hx=game.canvas.width/2+(hub.x-v.x)*z, hy=game.canvas.height/2+(hub.y-v.y)*z;
    return {kinds:kinds.sort(), labels:labels.sort(), order:order.join(','), round:at.filter(a=>/[bB]adge/.test(a[0])).map(a=>Math.round(Math.hypot(a[1]-hx,a[2]-hy)))};
  `);
  const own='game.ownedCar';
  const near=draw(`__beside(${own}); game.missions.activeMission=null;`);
  equal(near.kinds, [], 'her car within reach: the Drive pill instead of a pin (the van is far, and no job)');
  equal(near.order, 'light,markers', 'after the light');
  const view=draw(`game.player.x=${own}.x-300; game.player.y=${own}.y;`);
  ok(view.kinds.includes('pin:car') && view.labels.includes('YOUR CAR'), 'on screen: a pin and her car\'s name');
  const far=draw(`game.player.x=${own}.x+2400; game.player.y=${own}.y;`);
  equal(far.kinds, ['crimsonBadge:car'], 'off screen on foot: her car on the compass');
  ok(far.labels.some(l=>/^\d+m$/.test(l)), 'with the distance');
  ok(far.round.every(r=>r>40 && r<110), 'round her, not at the screen\'s edge');
  const job=draw(`const d=game.missions.generateDelivery(game); game.missions.acceptMission(d,game);`);
  ok(job.kinds.includes('amberBadge:box'), 'a delivery to fetch: the package on the compass');
  const pkg=draw(`const p=game.deliveryPackageSpot(); game.player.x=p.x-280; game.player.y=p.y;`);
  ok(pkg.kinds.includes('amberPin:box') && pkg.labels.includes('PICK UP'), 'the package on screen: an amber pin, PICK UP');
  ok(!pkg.kinds.includes('amberPin:car'), 'the van\'s own pin gives way to the package');
  const drop=draw(`game.pickUpPackage(); const m=game.missions.activeMission; game.player.x=m.targetX; game.player.y=m.targetY+(m.targetY>5500?-1500:1500);`);
  ok(drop.kinds.includes('badge:flag'), 'the drop-off on the compass, in gold');
  const driving=draw(`game.missions.activeMission=null; const h=__street(300); __beside(h); game.hijackVehicle(h);
    h.x=${own}.x+2400; h.y=${own}.y; game.player.x=h.x; game.player.y=h.y;`);
  equal(driving.kinds.filter(k=>/car$/.test(k) && !/amber/.test(k)), [], 'driving another car: the ride tag points home instead');
  const inside=draw(`game.toggleVehicle(); game._doLoadMap('cozy_cafe_interior'); game.running=true;`);
  equal(inside.kinds, [], 'none indoors');
}, {events:true});

test('The package: drawn by the van and lit at night, picked up there or loaded with the van; the readout follows the job', env => {
  carsFixture(env);
  const result=value(env, `
    game.missions.acceptMission(game.missions.generateDelivery(game), game);
    const p=game.deliveryPackageSpot(), van=game.deliveryVehicle, spot={x:p.x,y:p.y};
    const bad=[]; game.ctx.translate=function(x,y){ if(!Number.isFinite(x)||!Number.isFinite(y)) bad.push([x,y]); };
    game.drawDeliveryPackage(game.ctx, null); game.drawMissionGlow(game.ctx, 1); delete game.ctx.translate;
    game.player.x=spot.x-Math.sin(van.angle)*40; game.player.y=spot.y+Math.cos(van.angle)*40; game.update();
    const pill=game.interactBtn._apSig; game._objectiveHud();
    const el=document.getElementById('ui-objective'), q=c=>el.querySelector(c).textContent;
    const before={show:el.classList.contains('show'), title:q('.o-title'), step:q('.o-step'), dist:q('.o-dist'), body:document.body.classList.contains('objective-hud')};
    game.interact();
    const picked=game.missions.activeMission.pickedUp, gone=game.deliveryPackageSpot()===null;
    game._objectiveHud(); const after=q('.o-step');
    game.missions.activeMission=null; game.missions.acceptMission(game.missions.generateDelivery(game), game);
    __beside(van); game.enterCar(van); for(let i=0;i<300&&!game.isDriving;i++) game.update();
    const loaded=game.missions.activeMission.pickedUp;
    game.missions.activeMission=null; game._objectiveHud();
    return {bad:bad.length, pill, before, picked, gone, after, loaded, hidden:!el.classList.contains('show'), bodyAfter:document.body.classList.contains('objective-hud')};
  `);
  equal(result.bad, 0, 'drawn where it is (the old art was placed by a width the van does not have)');
  equal(result.pill, 'Pick Up|Delivery|E');
  equal([result.before.show, result.before.body, result.before.title], [true, true, 'Amber delivery']);
  ok(/package/i.test(result.before.step) && /^\d+m$/.test(result.before.dist), 'the step and the distance to the package');
  equal([result.picked, result.gone], [true, true]);
  ok(/^Deliver to /.test(result.after), 'then the drop-off');
  equal(result.loaded, true, 'driving off in the van takes the package with her');
  equal([result.hidden, result.bodyAfter], [true, false], 'no job, no readout');
}, {events:true});

test('Hijacking: a ganger at the wheel comes out fighting; a civilian, or an empty car, does not', env => {
  carsFixture(env);
  const result=value(env, `
    const out=[];
    for (const [driver, has] of [['ganger',true],['civilian',true],['ganger',false]]) {
      if (game.isDriving) game.toggleVehicle();
      const c=__street(300+out.length*200); c.driverType=driver; c.hasDriver=has; if(!has) c.controlMode='PARKED';
      const n=game.enemies.length; __beside(c); game.hijackVehicle(c);
      out.push([driver, has, game.enemies.length-n, /HOSTILE/.test(document.getElementById('message-modal').textContent)]);
    }
    return out;
  `);
  equal(result, [['ganger',true,1,true],['civilian',true,0,false],['ganger',false,0,false]]);
}, {events:true});

test('Traffic goes round her parked car: a lane change, or a stop and an overtake when both lanes are hers; never a shove', env => {
  carsFixture(env);
  const run=(both)=>value(env, `
    game.traffic.vehicles.forEach(c=>c.destroy()); game.traffic.vehicles=[]; GameSettings.getMaxTraffic=()=>20;
    const lane=__lane, probe=new TrafficVehicle(lane,'Gelfash','sedan','AI'); probe.currentLane=lane; const other=probe._sideLanes(false)[0]; probe.destroy();
    const own=game.ownedCar, van=game.deliveryVehicle, at=520; game.car=own; if(game.isDriving) game.toggleVehicle();
    const place=(c,l)=>{const off=-(l.start.x-lane.start.x)*lane.uy+(l.start.y-lane.start.y)*lane.ux; Object.assign(c,{x:lane.start.x+lane.ux*at-lane.uy*off,y:lane.start.y+lane.uy*at+lane.ux*off,angle:lane.angle,vx:0,vy:0,speed:0,controlMode:'PARKED',hasDriver:false,visible:true});};
    place(own,lane); if(${both}) place(van,other); else Object.assign(van, van.home);
    const ai=new TrafficVehicle(lane,'Gelfash','sedan','AI'); Object.assign(ai,{x:lane.start.x+lane.ux*200,y:lane.start.y+lane.uy*200,angle:lane.angle}); game.traffic.vehicles.push(ai);
    game.player.x=own.x+lane.uy*400; game.player.y=own.y-lane.ux*400;
    const s0=[own.x,own.y,van.x,van.y]; let passed=-1;
    for(let i=0;i<1500;i++){ game.update(); if((ai.x-own.x)*lane.ux+(ai.y-own.y)*lane.uy>own.length){passed=i;break;} }
    return {passed, moved:Math.round(Math.hypot(own.x-s0[0],own.y-s0[1])+(${both}?Math.hypot(van.x-s0[2],van.y-s0[3]):0))};
  `);
  const one=run(false), both=run(true);
  ok(one.passed >= 0 && one.passed < 300, `round it by the next lane (${one.passed} ticks)`);
  ok(one.moved <= 2, `her car stays put (${one.moved} px)`);
  ok(both.passed >= 0, `both lanes hers: it stops, then overtakes (${both.passed} ticks)`);
  ok(both.moved <= 10, `no shove (${both.moved} px)`);
}, {events:true});

// People in the road (traffic/traffic-people.js): a car coming down __lane at someone on foot, measured
function folkScene(env) {
  carsFixture(env);
  env.run(`{
    GameSettings.getMaxTraffic=()=>40; GameSettings.getMaxPedestrians=()=>10; game.pedestrians.spawnTimer=1e9;
    game.pedestrians.pedestrians.forEach(p=>p.destroy()); game.pedestrians.pedestrians.length=0;
    Object.assign(game.ownedCar,{x:-5000,y:-5000}); if(game.deliveryVehicle) Object.assign(game.deliveryVehicle,{x:-5000,y:-4000});
    globalThis.__hits=0; game.damagePlayer=()=>{__hits++;};
    globalThis.__horns=0; if(typeof ambience!=='undefined'){ ambience.ready=true; ambience._horn=()=>{__horns++;}; }
    // who: 'her' or a street pedestrian (its own steps frozen); at: lateral offset; walk: px a tick across the lane;
    // walled: parked cars in the lanes either side of her
    globalThis.__folk=({temper='normal', who='her', at=0, walk=0, walled=false, ticks=900})=>{
      game.traffic.vehicles.forEach(c=>c.destroy()); game.traffic.vehicles=[]; __hits=0; __horns=0;
      game.pedestrians.pedestrians.forEach(p=>p.destroy()); game.pedestrians.pedestrians.length=0;
      const lane=__lane, nx=-lane.uy, ny=lane.ux, P=game.player, spot=(d,l)=>({x:lane.start.x+lane.ux*d+nx*l, y:lane.start.y+lane.uy*d+ny*l});
      const ai=new TrafficVehicle(lane,'Gelfash','sedan','AI'); ai.driverType='civilian'; ai.temper=temper; ai.maxSpeed=8.5;
      Object.assign(ai,spot(150,0),{angle:lane.angle,speed:7,vx:lane.ux*7,vy:lane.uy*7,fade:1}); game.traffic.vehicles.push(ai);
      if(walled) for(const side of [-60,60]) for(let k=-3;k<4;k++){ const c=new TrafficVehicle(lane,'Gelfash','sedan','AI'); Object.assign(c,spot(650+k*95,side),{angle:lane.angle,speed:0,vx:0,vy:0,fade:1,controlMode:'PARKED',hasDriver:false}); game.traffic.vehicles.push(c); }
      let Q=P;
      if(who==='her') Object.assign(P,spot(650,at)); else { Object.assign(P,spot(650,400)); Q=new Pedestrian(spot(650,at).x,spot(650,at).y,game.pedestrians.network); Q.update=()=>{}; Q.tryQuip=()=>{}; game.pedestrians.pedestrians.push(Q); }
      let minClear=1e9, fastNear=0, stopped=0, passed=-1, backs=0, rev=0, slowest=1e9;
      for(let i=0;i<ticks;i++){
        Q.x+=nx*walk; Q.y+=ny*walk; game.update();
        const dx=Q.x-ai.x, dy=Q.y-ai.y, c=Math.cos(ai.angle), s=Math.sin(ai.angle), lx=dx*c+dy*s, ly=-dx*s+dy*c;
        const clear=Math.hypot(Math.max(0,Math.abs(lx)-ai.length/2),Math.max(0,Math.abs(ly)-ai.width/2))-15;
        minClear=Math.min(minClear,clear); if(clear<6 && Math.abs(ai.speed)>4) fastNear++;
        if(Math.abs(ai.speed)<0.3) stopped++; slowest=Math.min(slowest,Math.abs(ai.speed));
        if((ai._reverseLeft||0)>rev) backs++; rev=ai._reverseLeft||0;
        if(lx<-ai.length){ passed=i; break; }
      }
      return {minClear:Math.round(minClear), fastNear, stopped, passed, backs, slowest:+slowest.toFixed(1), hits:__hits, horns:__horns};
    };
  }`);
}

test('People in the road: someone crossing is let across, someone standing is stopped for and gone round at a walk; nobody is touched', env => {
  folkScene(env);
  const r=value(env, `return {stand:__folk({}), edge:__folk({at:26}), cross:__folk({at:-70, walk:1}), quick:__folk({at:-70, walk:2})};`);
  for (const [k, o] of Object.entries(r)) {
    ok(o.passed > 0, `${k}: it gets by (${o.passed} ticks)`);
    ok(o.minClear >= 0 && o.fastNear === 0 && o.hits === 0, `${k}: never touches her, nor goes by close over 4 (clear ${o.minClear}, fast ${o.fastNear})`);
  }
  ok(r.stand.stopped > 0 && r.stand.minClear >= 12, `standing: it stops, then goes round with room (${r.stand.stopped} ticks stopped, ${r.stand.minClear} px)`);
  ok(r.edge.stopped < 30, `at the edge of the lane: a step aside, barely a stop (${r.edge.stopped})`);
  ok(r.cross.slowest < 3, `crossing slowly: it slows and lets her across (down to ${r.cross.slowest})`);
}, {events:true});

test('Tempers: the calm wait longer and give more room than the pushy; walled in, a car backs up and waits (the pushy on the horn), never pushes', env => {
  folkScene(env);
  const r=value(env, `return {calm:__folk({temper:'calm'}), pushy:__folk({temper:'pushy'}),
    wallCalm:__folk({temper:'calm', walled:true, ticks:700}), wallPushy:__folk({temper:'pushy', walled:true, ticks:700})};`);
  ok(r.calm.stopped > r.pushy.stopped, `calm waits longer (${r.calm.stopped} vs ${r.pushy.stopped} ticks)`);
  ok(r.calm.minClear > r.pushy.minClear, `calm gives more room (${r.calm.minClear} vs ${r.pushy.minClear} px)`);
  for (const k of ['wallCalm', 'wallPushy']) {
    equal(r[k].passed, -1, `${k}: no way past`);
    ok(r[k].minClear >= 20 && r[k].hits === 0, `${k}: stays back (${r[k].minClear} px)`);
    ok(r[k].backs >= 1, `${k}: backs up to try again`);
  }
  ok(r.wallPushy.horns >= 3 && r.wallPushy.horns > r.wallCalm.horns, `the pushy lean on the horn (${r.wallPushy.horns} vs ${r.wallCalm.horns})`);
}, {events:true});

test('Street pedestrians: one standing in the lane is gone round; one on the pavement by the kerb never slows a car', env => {
  folkScene(env);
  const r=value(env, `
    const inLane=__folk({who:'ped'});
    __lane=game.traffic.network.allLanes.find(l=>l.id==='R0.S0.L3');          // the kerb lane: the pavement starts 30 px out
    const pavement=__folk({who:'ped', at:52});
    __lane=game.traffic.network.allLanes.find(l=>l.id==='R0.S0.L2');
    return {inLane, pavement};
  `);
  ok(r.inLane.passed > 0 && r.inLane.stopped > 0 && r.inLane.minClear >= 12, `in the lane: stopped for, then gone round (${JSON.stringify(r.inLane)})`);
  ok(r.pavement.passed > 0 && r.pavement.slowest > 6.5, `on the pavement: no slowing (${r.pavement.slowest})`);
}, {events:true});

test('Hit by a car: 10 once, then a moment of grace, not a hit every tick it touches', env => {
  folkScene(env);
  const hits=value(env, `
    const c=__street(400); Object.assign(c,{speed:6,vx:__lane.ux*6,vy:__lane.uy*6,fade:1});
    let n=0; game.damagePlayer=()=>{n++;};
    for(let i=0;i<30;i++){ game.player.x=c.x+c.length/2+8; game.player.y=c.y; c.speed=6; game.traffic.grid.clear(); game.traffic.grid.add(c); game.resolveTrafficCollisions(); }
    return n;
  `);
  equal(hits, 1, 'one hit in half a second of contact');
}, {events:true});

test('Parked on its nose: a car backs up off her car, then goes round it without a touch', env => {
  carsFixture(env);
  const r=value(env, `
    GameSettings.getMaxTraffic=()=>40; const lane=__lane, nx=-lane.uy, ny=lane.ux;
    const ai=new TrafficVehicle(lane,'Gelfash','sedan','AI'); ai.temper='normal';
    Object.assign(ai,{x:lane.start.x+lane.ux*400,y:lane.start.y+lane.uy*400,angle:lane.angle,speed:0,vx:0,vy:0,fade:1}); game.traffic.vehicles.push(ai);
    const own=game.ownedCar; game.car=own; if(game.isDriving) game.toggleVehicle();
    const at=400+ai.length/2+6+own.length/2;
    Object.assign(own,{x:lane.start.x+lane.ux*at,y:lane.start.y+lane.uy*at,angle:lane.angle,vx:0,vy:0,speed:0,controlMode:'PARKED',hasDriver:false,visible:true});
    game.player.x=own.x+nx*300; game.player.y=own.y+ny*300;
    const s0=[own.x,own.y]; let backed=false, passed=-1;
    for(let i=0;i<600;i++){ game.update(); if(ai.speed<-0.3) backed=true; if((ai.x-own.x)*lane.ux+(ai.y-own.y)*lane.uy>own.length){passed=i;break;} }
    return {backed, passed, moved:Math.round(Math.hypot(own.x-s0[0],own.y-s0[1]))};
  `);
  ok(r.backed, 'it backs up first');
  ok(r.passed > 0, `then gets by (${r.passed} ticks)`);
  ok(r.moved <= 2, `her car stays put (${r.moved} px)`);
}, {events:true});

test('Saves: her car stays where she parked it through a save made indoors; a hijacked drive loads on foot', env => {
  carsFixture(env);
  const result=value(env, `
    const own=game.ownedCar; Object.assign(own,{x:900,y:1300,angle:0.5});
    game._doLoadMap('cozy_cafe_interior'); game.saveGame({auto:true});
    Object.assign(own,{x:10,y:10}); game.loadGame('dfab_save_slot_auto');
    const indoors={visible:game.ownedCar.visible, active:game.ownedCar.active, linked:game.car===game.ownedCar};
    game._doLoadMap('hub_949'); const out=[game.ownedCar.x,game.ownedCar.y,game.ownedCar.visible];
    const h=new TrafficVehicle(game.traffic.network.allLanes[3],'LADY','suv2','AI'); game.traffic.vehicles.push(h);
    game.player.x=h.x+30; game.player.y=h.y; game.hijackVehicle(h); game.saveGame({auto:true});
    const saved=JSON.parse(localStorage.getItem('dfab_save_slot_auto'));
    game.loadGame('dfab_save_slot_auto');
    return {indoors, out, savedDriving:saved.isDriving, loaded:{driving:game.isDriving, linked:game.car===game.ownedCar, at:[game.ownedCar.x,game.ownedCar.y]}};
  `);
  equal(result.indoors, {visible:false, active:false, linked:true});
  equal(result.out, [900, 1300, true], 'back outside, the car is where she parked it');
  equal(result.savedDriving, false, 'a hijacked drive is not saved as driving her car');
  equal(result.loaded, {driving:false, linked:true, at:[900, 1300]});
}, {events:true});

test('Garage switch while out in a hijacked car keeps her in it, and the old model leaves no invisible wall', env => {
  carsFixture(env);
  const result=value(env, `
    const old=game.ownedCar; game.garage.addCar('LADY','suv2');
    const h=__street(300); __beside(h); game.hijackVehicle(h);
    game.switchGarageCar(game.garage.count-1);
    return {driving:game.isDriving, inH:game.car===h, replaced:game.ownedCar!==old, at:[game.ownedCar.x,game.ownedCar.y], was:[old.x,old.y],
      oldSolid:old.active||old.visible, newShown:game.ownedCar.visible&&game.ownedCar.active};
  `);
  equal(result, {driving:true, inH:true, replaced:true, at:result.was, was:result.was, oldSolid:false, newShown:true});
}, {events:true});

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
