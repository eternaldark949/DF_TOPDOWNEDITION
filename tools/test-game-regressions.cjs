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
    portico: "(() => { const g = b._sqPortico(); b._sqPorticoPlane(game.ctx, g, g.x1 - g.x0, SQ_PORTICO.depth, 0); PropPass.idx = Math.max(PropPass.idx, 0); })()" };   // (one run: it has no live parts)
  const owner = { silver_queen: 'silver_queen', moon_city: 'moon_city', portico: 'silver_queen' };
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
    tr(style, 0, 1, 1); const runs = value(env, 'return PropPass.idx + 1;');
    for (let r = 1; r < runs; r++) tr(style, r, 1, 1);      // (a first paint of each run makes its lazy outlines and gradients)
    const first = tr(style, 0, 5, 1);
    ok(runs >= (style === 'portico' ? 1 : 2), `${style}: still runs round its live parts (${runs})`);
    equal(first, tr(style, 0, 777.25, 6), `${style}: run 0 never changes with time or wind`);
    for (let r = 1; r < runs; r++) equal(tr(style, r, 5, 1), tr(style, r, 777.25, 6), `${style}: run ${r}`);
  }
}, {affine: true});

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
