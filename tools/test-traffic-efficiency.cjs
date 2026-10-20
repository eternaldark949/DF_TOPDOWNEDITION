#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {runtime} = require('./test-game-runtime.cjs');
const results=[];
function test(name, code, check) {
  const env=runtime(join(__dirname,'..','DFAB V8.html'));
  const result=structuredClone(env.run(`(()=>{${code}})()`));
  check(result); assert.deepEqual(env.errors,[]); results.push(name);
}

test('Reused route buffers discard old points after pose and route changes', `
  const v=Object.create(TrafficVehicle.prototype);
  Object.assign(v,{x:0,y:0,angle:0,length:40,laneChangeState:'NONE'});
  const first=v._routeProbe(100).slice();
  v.x=200; v.y=300; v.angle=Math.PI/2;
  const second=v._routeProbe(55).slice();
  const empty=v._routeProbe(10).slice();
  return {first,second,empty};
`,r=>{
  assert.deepEqual(r.first,[20,0,20,34,0,34,48,0,48,62,0,62,76,0,76,90,0,90]);
  assert.deepEqual(r.second,[200,320,20,200,334,34,200,348,48]);
  assert.deepEqual(r.empty,[]);
});

test('Lane checks retain exact 700px boundary and independently sensed player car', `
  const lane={start:{x:0,y:0},ux:1,uy:0,isOpposing:false};
  const v=Object.create(TrafficVehicle.prototype);
  Object.assign(v,{x:0,y:0,speed:0,length:60,currentLane:lane,_folkInLane:()=>false});
  const other={x:700,y:0,speed:0,vx:0,vy:0,length:60,width:30};
  const source=[other,...Array.from({length:10},(_,i)=>({x:3000+i*300,y:0,length:60,width:30}))];
  const grid=new OrderedCrowdPointGrid(256); grid.build(source);
  v._allVehicles=source; v._trafficSensing={active:true,source,cars:grid};
  const boundary=v.isLaneClear(lane,1000);
  other.x=700.001;grid.update(0); const outside=v.isLaneClear(lane,1000);
  v._playerCar={x:100,y:0,length:60,width:30,visible:true,vx:0,vy:0};
  const extra=v.isLaneClear(lane,1000);
  v._trafficSensing.active=false; const fallback=v.isLaneClear(lane,1000);
  return {boundary,outside,extra,fallback};
`,r=>assert.deepEqual(r,{boundary:false,outside:true,extra:false,fallback:false}));

for(const snapshot of [false,true]) test(`Reverse removals retain grid slots (${snapshot?'parked snapshot':'live source'})`, `
  _simTick=1;
  const tm=new TrafficManager();tm.network.intersections=[];tm.spawnTimer=1e6;
  const player={x:0,y:0,visible:false};
  tm.vehicles=Array.from({length:12},(_,i)=>({id:i,x:i*100,y:0,length:60,width:30,
    fade:i===3||i===9?0:1,fading:i===3||i===9,dead:i===3||i===9,
    destroy(){this.markedForDestroy=true;},update(){this.x+=8000;}}));
  const parked=${snapshot}?[{id:99,x:250,y:0,length:60,width:30,hasDriver:true}]:[];
  tm.update(player,{type:'outdoor',walls:[],buildings:[]},null,{},parked,null,[],[]);
  return {cars:tm.vehicles.map(v=>v.id),near:tm.sensing.cars.query(250,0,250).map(v=>v.id),
    moved:tm.sensing.cars.query(8500,0,10000).map(v=>v.id),active:tm.sensing.active};
`,r=>{
  const cars=[0,1,2,4,5,6,7,8,10,11];
  assert.deepEqual(r.cars,cars); assert.equal(r.active,false);
  assert.deepEqual(r.near,snapshot?[3,99]:[]);
  assert.deepEqual(r.moved,snapshot?[0,1,2,3,4,5,6,7,8,9,10,11,99]:cars);
});
console.log(JSON.stringify({passed:results.length,results},null,2));
