#!/usr/bin/env node
'use strict';
// Behavioral checks for AI perception and bounded crossing queues. Browser/device
// rendering performance and the appearance of queues still need playtesting.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { runtime } = require('./test-game-runtime.cjs');
const file = join(__dirname, '..', 'DFAB V8.html');
const results = [];
function test(name, run) {
  run(); results.push(name);
}
function value(env, code) { return structuredClone(env.run(`(() => { ${code} })()`)); }

test('Perception grid preserves order, range boundaries, moved cars and removals', () => {
  const env = runtime(file);
  const r = value(env, `
    const items = Array.from({length:80}, (_,i)=>({x:i*300,y:0,id:i}));
    const g = new OrderedCrowdPointGrid(256); g.build(items);
    const before = g.query(0,0,300).map(v=>v.id);
    items[50].x=100; g.update(50);
    const moved = g.query(0,0,300).map(v=>v.id);
    g.remove(0);
    const removed = g.query(0,0,300).map(v=>v.id);
    return {before,moved,removed};
  `);
  assert.deepEqual(r.before, [0,1]);
  assert.deepEqual(r.moved, [0,1,50]);
  assert.deepEqual(r.removed, [1,50]);
  assert.deepEqual(env.errors, []);
});

test('Spatial traffic sensing matches full-list sensing in a populated city', () => {
  const simulate = full => {
    const env = runtime(file);
    const r = value(env, `
      let seed=72841; Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
      game.story.update=()=>{}; game._doLoadMap('sdc'); game.running=true; game.paused=false;
      GameSettings.trafficDensity='high'; GameSettings.pedestrianDensity='high';
      let visits=0, queries=0;
      for (const grid of [game.traffic.sensing.cars,game.traffic.sensing.people]) {
        const query=grid.query;
        grid.query=function(...args) {
          queries++;
          const out=${full} ? this.records.slice(0,this.count).filter(r=>r.active).map(r=>r.item) : query.apply(this,args);
          visits+=out.length; return out;
        };
      }
      for(let t=0;t<360;t++) game.update();
      return {cars:game.traffic.vehicles.map(v=>[v.x,v.y,v.speed,v.angle,v.state,v.dead]),
        people:game.pedestrians.pedestrians.map(p=>[p.x,p.y,p.state,p.currentNodeId,p.targetNodeId]),visits,queries};
    `);
    assert.deepEqual(env.errors, []);
    return r;
  };
  const spatial=simulate(false), full=simulate(true);
  assert.deepEqual(spatial.cars,full.cars);
  assert.deepEqual(spatial.people,full.people);
  assert.ok(spatial.queries>0);
  assert.ok(spatial.visits<full.visits*0.6, JSON.stringify({spatial:spatial.visits,full:full.visits}));
  console.log(`Sensing candidates: ${spatial.visits} spatial / ${full.visits} full-list`);
});

function queueScene(length=300) {
  const env=runtime(file);
  env.run(`
    globalThis.clearToCross=false;
    const cw={x:0,y:-25,w:200,h:50};
    globalThis.queueNetwork={nodes:[
      {id:0,x:-${length},y:0,connections:[1,3]},
      {id:1,x:0,y:0,isCrosswalk:true,crosswalkData:cw,connections:[0,2]},
      {id:2,x:200,y:0,isCrosswalk:true,crosswalkData:cw,connections:[1,4]},
      {id:3,x:-${length+300},y:0,connections:[0]},
      {id:4,x:500,y:0,connections:[2]}
    ]};
    game.pedestrians.reset(); game.pedestrians.setNetwork(queueNetwork);
    game.pedestrians.spawnTimer=1e9; GameSettings.pedestrianDensity='high';
    game.player.x=-300; game.player.y=200;
    globalThis.stepQueue=(ticks)=>{ for(let t=0;t<ticks;t++){ _simTick++; game.pedestrians.update(game.player,{type:'outdoor'},[]); } };
    globalThis.addWalker=(x)=>{
      const p=new Pedestrian(x,0,queueNetwork);
      p.currentNodeId=0; p.targetNodeId=1; p.prevNodeId=3; p.speed=2;
      p._isTrafficClear=()=>clearToCross; p._crossingSignal=()=>null; p.tryQuip=()=>{};
      game.pedestrians.pedestrians.push(p); return p;
    };
  `);
  return env;
}

test('Full crossing queues keep six spaced walkers on the pavement and divert overflow', () => {
  const env=queueScene();
  const r=value(env, `
    for(let i=0;i<10;i++) addWalker(-18-i*8);
    stepQueue(110);
    const all=game.pedestrians.pedestrians;
    return {count:all.length,queued:all.filter(p=>p.targetNodeId===1).map(p=>p.x).sort((a,b)=>b-a),
      diverted:all.filter(p=>p.targetNodeId===3).length, road:all.filter(p=>p.x>0&&p.x<200).length};
  `);
  assert.equal(r.count,10,'no visible despawning');
  assert.equal(r.queued.length,6);
  assert.equal(r.diverted,4);
  assert.equal(r.road,0);
  assert.ok(r.queued[0]<=-17);
  for(let i=1;i<r.queued.length;i++) assert.ok(r.queued[i-1]-r.queued[i]>=26,JSON.stringify(r));
  assert.deepEqual(env.errors,[]);
});

test('Queues fit short approaches, retain road users, and clear when crossing opens', () => {
  const env=queueScene(70);
  const r=value(env, `
    for(let i=0;i<8;i++) addWalker(-18-i*5);
    stepQueue(35);
    const held=game.pedestrians.pedestrians.filter(p=>p.targetNodeId===1).length;
    const inRoad=addWalker(80); inRoad.currentNodeId=1; inRoad.targetNodeId=2;
    inRoad.state='crossing'; inRoad.speed=2; inRoad.crossingTimer=0;
    stepQueue(5); const roadTarget=inRoad.targetNodeId, progress=inRoad.x;
    clearToCross=true; stepQueue(160);
    return {held,roadTarget,progress,finished:inRoad.currentNodeId>=2,
      stuck:game.pedestrians.pedestrians.filter(p=>p.targetNodeId===1&&p.x>-70).length};
  `);
  assert.equal(r.held,2);
  assert.equal(r.roadTarget,2);
  assert.ok(r.progress>80);
  assert.ok(r.finished);
  assert.equal(r.stuck,0);
  assert.deepEqual(env.errors,[]);
});

test('Blocked queues retain timeout rerouting', () => {
  const env=queueScene();
  const r=value(env, `const p=addWalker(-18); stepQueue(302); return {target:p.targetNodeId,state:p.state};`);
  assert.equal(r.target,3);
  assert.equal(r.state,'walking');
});
console.log(JSON.stringify({passed:results.length,results},null,2));
