#!/usr/bin/env node
'use strict';
// World queries: basement/query-kit.js (queryKit: find, nearest, sort location packets, game-free) and
// directory/world-query.js (worldQuery: the game's rooms, seats, NPCs, loot, doors, landmarks and buildings).
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});
const run=src=>JSON.parse(e.run(`JSON.stringify((()=>{${src}})(),(k,v)=>k==='entity'?undefined:v)`));
function test(name,fn){fn();assert.deepEqual(e.errors,[]);tests.push(name);}

test('queryKit filters by kind, any field, near, inside and test, and finds the nearest',()=>{
 const r=run(`const P=[queryKit.packet('seat','a',0,0,{pool:'chair',taken:false}),queryKit.packet('seat','b',10,0,{pool:'booth',taken:true}),
  queryKit.packet('npc','Ren',100,100,{name:'Barista Ren'}),queryKit.packet('loot','pp.0',50,0)];
  return {seats:queryKit.ids(queryKit.find(P,{kind:'seat'})), two:queryKit.ids(queryKit.find(P,{kind:['npc','loot']})),
   free:queryKit.ids(queryKit.find(P,{taken:false})), pools:queryKit.ids(queryKit.find(P,{pool:['booth']})),
   near:queryKit.ids(queryKit.find(P,{near:[0,0,20]})), inside:queryKit.ids(queryKit.find(P,{inside:{x:40,y:-5,w:100,h:200}})),
   test:queryKit.ids(queryKit.find(P,{test:p=>p.x>20})), nearest:queryKit.nearest(P,60,10).id, nearSeat:queryKit.nearest(P,60,10,{kind:'seat'}).id,
   sorted:queryKit.ids(queryKit.byDistance(P,100,100)), names:queryKit.names(P), first:queryKit.first(P,{kind:'npc'}).id, none:queryKit.nearest(P,0,0,{kind:'room'})};`);
 assert.deepEqual(r.seats,['a','b']); assert.deepEqual(r.two,['Ren','pp.0']); assert.deepEqual(r.free,['a']); assert.deepEqual(r.pools,['b']);
 assert.deepEqual(r.near,['a','b']); assert.deepEqual(r.inside,['Ren','pp.0']); assert.deepEqual(r.test,['Ren','pp.0']);
 assert.equal(r.nearest,'pp.0'); assert.equal(r.nearSeat,'b'); assert.deepEqual(r.sorted,['Ren','pp.0','b','a']);
 assert.deepEqual(r.names,['a','b','Barista Ren','pp.0']); assert.equal(r.first,'Ren'); assert.equal(r.none,null);
});

test('In the Cozy Cafe: its rooms, its seats (and who has them), its people by room, its exit',()=>{
 const r=run(`game._doLoadMap('cozy_cafe_interior'); game.cafeLife.reset(game);
  const S=worldQuery.getSeats(game);
  return {rooms:queryKit.ids(worldQuery.getRooms(game)), seats:S.length, chairs:CAFE_SEATS.chair.length, rooms_of:[...new Set(S.map(s=>s.room))],
   s0:S[0], seatAt:[CAFE_SEATS.chair[0].at,CAFE_SEATS.chair[0].from,CAFE_SEATS.chair[0].face], free:worldQuery.getSeats(game,{taken:false}).length,
   takenSeats:S.filter(s=>s.taken).length, kitchen:queryKit.names(worldQuery.getNPCs(game,{room:'kitchen'})), ren:worldQuery.getNPCs(game,{name:'Barista Ren'})[0].room,
   doors:worldQuery.getDoors(game).map(d=>[d.target,d.name]), roomAt:worldQuery.roomAt(game,600,500), between:worldQuery.roomAt(game,-50,-50)};`);
 assert.deepEqual(r.rooms,['cafe','kitchen','storeroom']);
 assert.ok(r.seats>r.chairs&&r.chairs>0); assert.deepEqual(r.rooms_of,['cafe']);
 assert.deepEqual([r.s0.id,r.s0.pool,r.s0.index,[r.s0.x,r.s0.y],[r.s0.from.x,r.s0.from.y],r.s0.a],['chair.0','chair',0,r.seatAt[0],r.seatAt[1],r.seatAt[2]]);
 assert.equal(r.free+r.takenSeats,r.seats); assert.ok(r.takenSeats>0,'the guests already seated show as taken');
 assert.deepEqual(r.kitchen,['Chef Koda']); assert.equal(r.ren,'cafe');
 assert.deepEqual(r.doors,[['sdc','Exit to City']]); assert.equal(r.roomAt,'cafe'); assert.equal(r.between,null);
});

test('Rooms of a map she isn\'t on come from GAME_DB.places.rooms; a map without rooms has none',()=>{
 const r=run(`const apt=worldQuery.getRooms(game,{map:'apt_949'}); return {apt:apt.map(p=>[p.id,p.name,p.map]), defs:Object.keys(GAME_DB.places.rooms.apt_949.rooms),
  outdoor:queryKit.ids(worldQuery.getRooms(game,{map:'apt_949',type:'outdoor'})), none:worldQuery.getRooms(game,{map:'sdc'}).length, inside:apt.every(p=>p.x>=p.bounds.x&&p.x<=p.bounds.x+p.bounds.w)};`);
 assert.deepEqual(r.apt.map(a=>a[0]),r.defs); assert.ok(r.apt.every(a=>a[1]&&a[2]==='apt_949'));
 assert.ok(r.outdoor.length>=1); assert.equal(r.none,0); assert.equal(r.inside,true);
});

test('The city: buildings you can go to, with their door, the Zib\'s curb and the map inside, from any map',()=>{
 const r=run(`game._doLoadMap('sdc'); const hub=worldQuery.getBuildings(game), lm=worldQuery.getLandmarks(game);
  game._doLoadMap('cozy_cafe_interior'); const away=worldQuery.getBuildings(game);
  return {hub, away, lm:lm.length, reg:Object.keys(game._hubCache.landmarks).length, zib:ZIB_DESTINATIONS.map(d=>[d.landmark,!!(game._hubCache.landmarks[d.landmark]||{}).templateId]), raw:worldQuery.hubBuildings(game).length};`);
 assert.deepEqual(r.away,r.hub,'the same buildings from inside the cafe');
 const cafe=r.hub.find(b=>b.id==='cozy_cafe');
 assert.equal(cafe.enter,'cozy_cafe_interior'); assert.equal(cafe.landmark,'cozy_cafe'); assert.ok(cafe.door&&cafe.drop&&cafe.drop.roadName);
 for(const [z,isBuilding] of r.zib) if(isBuilding) assert.ok(r.hub.some(b=>b.landmark===z),`Zib's ${z} is a building's landmark, so getBuildings has it`);
 assert.ok(r.lm>=r.reg&&r.raw>r.hub.length);
});

console.log(`test-world-query: ${tests.length} passed`);
