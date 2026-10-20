#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {runtime} = require('./test-game-runtime.cjs');
const results = [];
function test(name, source, check) {
  const e = runtime(join(__dirname, '..', 'DFAB V8.html'), {timers:true});
  const result = structuredClone(e.run(`(()=>{${source}})()`));
  check(result); assert.deepEqual(e.errors, []); results.push(name);
}
const setup = `game._doLoadMap('hub_949'); game.running=true; game.paused=false;
 game.loadMap=function(id,at){this._doLoadMap(id,at);};
 const hg=game.hordeGauntlet;`;
for (const id of ['house_of_death','demoness_palace']) {
  test(`${id}: mid-wave save restores surviving types, wounds, kills and wave progression`, setup+`
    hg.start(game,'${id}'); hg.wave=4; hg.waveDelay=0; hg.spawnWave(game);
    const dead=hg.hostiles[0]; dead.dead=true;
    hg.hostiles[1].hp=17; hg.hostiles[1].x+=3; hg.hostiles[1].cooldown=23;
    const before=hg.serialize(game); game.saveGame({auto:true});
    game._doLoadMap('apt_949'); hg.highestWaves={};
    const ok=game.loadGame('dfab_save_slot_auto'); const after=hg.serialize(game);
    const boss=hg.hostiles.find(h=>h instanceof Demoness);
    const live=hg.hostiles.length; hg.hostiles.forEach(h=>h.dead=true);
    const money=game.currency; hg.update(game); const awarded=game.currency-money;
    const kills=hg.totalKills; hg.waveDelay=1; hg.update(game);
    return {ok,before,after,live,awarded,kills,next: hg.wave,active:hg.active,
      intro:!!game._bossIntro,allAwake:hg.hostiles.every(h=>!h.dormant),bossHp:boss?.hp};`, r=>{
    assert.equal(r.ok,true); assert.deepEqual(r.after,r.before); assert.equal(r.active,true);
    assert.equal(r.awarded,140); assert.equal(r.kills,r.live+1); assert.equal(r.next,6);
    assert.equal(r.intro,false); assert.equal(r.allAwake,true);
    if(id==='demoness_palace') assert.ok(r.bossHp>0);
  });
}
test('Fresh session restores the run and records into a newly created controller',setup+`
 hg.start(game,'demoness_palace');hg.wave=2;hg.waveDelay=0;hg.spawnWave(game);hg.hostiles[0].hp=13;
 game.saveGame({auto:true});const saved=JSON.parse(localStorage.getItem('dfab_save_slot_auto')).hordeGauntlet;
 game.resetGameState();const cleared=game.hordeGauntlet===null&&!game._pendingGauntletLoad;
 const ok=game.loadGame('dfab_save_slot_auto');
 return {ok,cleared,replaced:game.hordeGauntlet!==hg,restored:game.hordeGauntlet.serialize(game),saved};`,r=>{
 assert.equal(r.ok,true);assert.equal(r.cleared,true);assert.equal(r.replaced,true);assert.deepEqual(r.restored,r.saved);
});
test('Between-wave countdown resumes without awarding the cleared wave twice',setup+`
 hg.start(game); hg.waveDelay=1; hg.update(game); hg.hostiles.forEach(h=>h.dead=true); hg.update(game);
 const money=game.currency, kills=hg.totalKills; hg.waveDelay=73; game.saveGame({auto:true});
 game.loadGame('dfab_save_slot_auto'); const delay=hg.waveDelay; hg.update(game);
 const unchanged=game.currency===money&&hg.totalKills===kills; hg.waveDelay=1; hg.update(game);
 return {delay,unchanged,wave:hg.wave,size:hg.hostiles.length};`,r=>{
 assert.equal(r.delay,73); assert.equal(r.unchanged,true); assert.equal(r.wave,2); assert.equal(r.size,7);
});
for(const id of ['house_of_death','demoness_palace']) {
 test(`${id}: loaded and inactive exits land beside Grum`,setup+`
  hg.start(game,'${id}'); hg.waveDelay=1; hg.update(game); game.saveGame({auto:true});
  game.loadGame('dfab_save_slot_auto'); game._doLoadMap('hub_949',{linkFrom:'${id}'});
  const grum=game.npcs.find(n=>n.role==='arena_master');
  const activeExit={x:game.player.x,y:game.player.y}; const active=hg.active;
  game._doLoadMap('${id}'); game._doLoadMap('hub_949',{linkFrom:'${id}'});
  return {activeExit,inactiveExit:{x:game.player.x,y:game.player.y},expected:{x:grum.x,y:grum.y+40},active};`,r=>{
  assert.deepEqual(r.activeExit,r.expected); assert.deepEqual(r.inactiveExit,r.expected); assert.equal(r.active,false);
 });
}
test('Legacy arena saves restart wave one while preserving historical records',setup+`
 game._doLoadMap('house_of_death'); game.saveGame({auto:true});
 const save=JSON.parse(localStorage.getItem('dfab_save_slot_auto')); save.world.mapId='grum_arena';
 save.hordeGauntlet={highestWave:12}; localStorage.setItem('legacy',JSON.stringify(save));
 game.loadGame('legacy'); const delay=hg.waveDelay,record=hg.highestWave; hg.waveDelay=1; hg.update(game);
 return {map:game.activeMap.id,active:hg.active,delay,record,wave:hg.wave,size:hg.hostiles.length};`,r=>{
 assert.deepEqual(r,{map:'house_of_death',active:true,delay:90,record:12,wave:1,size:6});
});
test('Loading a hub save from an active gauntlet stops it and respects saved city coordinates',setup+`
 game.player.x=2000;game.player.y=1400;game.saveGame({auto:true});
 hg.start(game);hg.waveDelay=1;hg.update(game);game.loadGame('dfab_save_slot_auto');
 return {active:hg.active,count:hg.hostiles.length,x:game.player.x,y:game.player.y,map:game.activeMap.id};`,r=>{
 assert.deepEqual(r,{active:false,count:0,x:2000,y:1400,map:'hub_949'});
});
test('Real faded load defers gauntlet restoration until the saved map exists',`
 game._doLoadMap('hub_949'); game.running=true;game.paused=false;
 const hg=game.hordeGauntlet; hg.active=true;hg.entry=GAUNTLET_MAPS[1];hg.mapId=hg.entry.mapId;
 game._doLoadMap('demoness_palace');hg.wave=2;hg.waveDelay=0;hg.spawnWave(game);hg.hostiles[0].hp=19;
 game.saveGame({auto:true});game._doLoadMap('apt_949');game.loadGame('dfab_save_slot_auto');
 return {map:game.activeMap.id,pending:!!game._pendingGauntletLoad};`,r=>{
 assert.deepEqual(r,{map:'apt_949',pending:true});
 // See the second half below, using the very same runtime and actual 400 ms callback.
});
{
 const e=runtime(join(__dirname,'..','DFAB V8.html'),{timers:true});
 e.run(`game._doLoadMap('demoness_palace'); game.running=true;game.paused=false;
 const hg=game.hordeGauntlet; hg.active=true;hg.entry=GAUNTLET_MAPS[1];hg.mapId=hg.entry.mapId;
 hg.wave=2;hg.waveDelay=0;hg.spawnWave(game);hg.hostiles[0].hp=19;
 game.saveGame({auto:true});game._doLoadMap('apt_949');game.loadGame('dfab_save_slot_auto');`);
 const fade=e.pendingTimers.find(t=>t.ms===400);assert.ok(fade);fade.f();
 const r=structuredClone(e.run(`({map:game.activeMap.id,wave:hg.wave,hp:hg.hostiles[0].hp,pending:!!game._pendingGauntletLoad,active:hg.active})`));
 assert.deepEqual(r,{map:'demoness_palace',wave:3,hp:19,pending:false,active:true});assert.deepEqual(e.errors,[]);
 results.push('Real fade callback restores the wounded wave on the arriving map');
}
console.log(JSON.stringify({passed:results.length,tests:results},null,2));
