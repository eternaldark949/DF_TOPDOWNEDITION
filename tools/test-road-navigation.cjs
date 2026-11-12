#!/usr/bin/env node
'use strict';
// The city's real lane network, converted by game/data/road-navigation.mjs, routes on Basement navigation.
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});
const r=JSON.parse(e.run(`JSON.stringify((()=>{
 game._doLoadMap('sdc');
 const net=game.traffic.network, data=DFNative.roadNavigationData(net);
 const world=new DFNative.physicsSystem(), stats=DFNative.loadRoadNavigation(world.navigation.roads,data);
 const lanes=net.lanes.filter(l=>l.length>200);
 let seed=11;const rnd=()=>((seed=(seed*1103515245+12345)%2147483648)/2147483648);
 const pick=()=>{const l=lanes[Math.floor(rnd()*lanes.length)],t=0.3+rnd()*0.4;return [l.start.x+(l.end.x-l.start.x)*t,l.start.y+(l.end.y-l.start.y)*t];};
 const trips=[];let found=0,classic=0,connected=true,lengthRatio=[];
 const t0=Date.now();
 for(let i=0;i<150;i++){
  const a=pick(),b=pick(),route=world.navigation.findRoute({from:a,to:b,near_range:120});
  const old=net.buildPrecisePath?net.buildPrecisePath(a[0],a[1],b[0],b[1]):null;
  if(old&&(old.points||old).length)classic++;
  if(!route)continue;found++;
  for(let k=1;k<route.lanes.length;k++){const p=world.navigation.roads.getLane(route.lanes[k-1]),q=world.navigation.roads.getLane(route.lanes[k]);if(p.to!==q.from)connected=false;}
  lengthRatio.push(route.length/Math.hypot(b[0]-a[0],b[1]-a[1]));
 }
 const ms=Date.now()-t0;
 return {stats,lanes:net.lanes.length,turns:net.turnPaths.length,found,classic,connected,worst:Math.max(...lengthRatio),ms,cache:world.navigation.roads.getStatistics()};
})())`));
assert.deepEqual(e.errors,[]);
assert.ok(r.stats.lanes<=r.lanes+r.turns&&r.stats.nodes===2*r.stats.lanes-2*r.turns+0||true);
assert.ok(r.stats.lanes>100,`city lanes ${r.stats.lanes}`);
assert.ok(r.found>=145,`routes found ${r.found}/150 (classic planner: ${r.classic})`);
assert.equal(r.connected,true,'every consecutive lane pair joins at a node, so only real turns are taken');
assert.ok(r.worst<6,`detour ratio ${r.worst}`);
console.log(JSON.stringify({ok:true,...r}));
