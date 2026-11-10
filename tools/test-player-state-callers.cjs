'use strict';
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const env=runtime(resolve(__dirname,'../DFAB V8.html'),{affine:true});
const run=source=>structuredClone(env.run(`(()=>{${source}})()`));
let passed=0;
function check(name,source,verify){verify(run(source));passed++;console.log('Passed: '+name);}
env.run("game.story.update=()=>{};game._doLoadMap('ollo_test');game.running=true;game.paused=false;game.hud.revealAll();");
check('production player owns the shared component and retired host ledgers do not exist',`
 return {shared:game.player.vitals instanceof DFNative.playerVitals,data:game.player.data.health===game.player.hp,
 retired:['playerHealth','maxPlayerHealth','healthRegenTimer','flitState','lastHurtAt'].filter(key=>key in game),sync:typeof game.player.syncHealth};`,r=>assert.deepEqual(r,{shared:true,data:true,retired:[],sync:'undefined'}));
check('stims and clinic healing update the same owner and HUD',`
 game.player.vitals.importHealth(30,100);game.boosterCount=4;game.useBooster();const stim={health:game.player.hp,boosters:game.boosterCount,width:game.healthBar.style.width};
 game.refillStims();return {stim,clinic:game.player.hp,boosters:game.boosterCount};`,r=>assert.deepEqual(r,{stim:{health:80,boosters:3,width:'80.0%'},clinic:100,boosters:4}));
check('production recovery uses one seconds-based clock and restarts on actual damage',`
 game.player.vitals.reset();game.player.takeDamage(40);for(let i=0;i<599;i++)game.updatePlayerRecovery();const before=game.player.hp;
 game.updatePlayerRecovery();const threshold=game.player.hp;game.player.takeDamage(5);for(let i=0;i<599;i++)game.updatePlayerRecovery();const restart=game.player.hp;
 game.updatePlayerRecovery();return {before,threshold,restart,after:game.player.hp};`,r=>assert.deepEqual(r,{before:60,threshold:65,restart:60,after:65}));
check('Last Stand grace uses the shared protection timer, with no player frame-timer field',`
 game.player.vitals.reset();game.resonance.ranks={last_stand:1};game.resonance.lastStandReadyAt=0;_gameTimeSec=20;
 game.player.takeDamage(999);const survived=game.player.hp,protectedHit=game.player.takeDamage(1);
 for(let i=0;i<60;i++)game.updatePlayerRecovery();const remaining=game.player.vitals.state.invulnerable_remaining;game.resonance.ranks={};
 return {survived,protectedHit,remaining,legacyTimer:Object.hasOwn(game.player,'invincibleTimer')};`,r=>assert.deepEqual(r,{survived:1,protectedHit:false,remaining:0,legacyTimer:false}));
check('Stellar Lemonade and rank changes clamp shared maximum health and expiration restores it',`
 game.player.vitals.reset();game.currency=1000;game.player.buffSystem.active={};const activated=game.player.buffSystem.activate('stellarLemonade',game.worldMinutes,game);
 const active={health:game.player.hp,maximum:game.player.maxHp};game.player.heal(100);game.player.buffSystem.clearAll(game);
 return {activated,active,after:{health:game.player.hp,maximum:game.player.maxHp}};`,r=>assert.deepEqual(r,{activated:true,active:{health:50,maximum:50},after:{health:50,maximum:100}}));
check('native apartment entry and legacy departure carry the vitals record, with no live host mirror',`
 game.player.vitals.reset();game.player.takeDamage(28);game.player.vitals.makeInvulnerable(1);game.player.vitals.beginFlit(40,.25,_gameTimeSec);const expected=game.player.vitals.snapshot();
 game._doLoadMap('apt_949');const native=game.player instanceof DFNative.Player,entered=game.player.vitals.snapshot();
 game._doLoadMap('ollo_test');return {native,entered,left:game.player.vitals.snapshot(),expected,registry:game.player.vitals instanceof DFNative.playerVitals};`,r=>{assert.equal(r.native,true);assert.equal(r.registry,true);assert.deepEqual(r.entered,r.expected);assert.deepEqual(r.left,r.expected);} );
check('native host advances its vitals exactly once and pause does not advance gameplay timers',`
 game._doLoadMap('apt_949');game.player.vitals.reset();game.player.vitals.beginFlit(40,.25,_gameTimeSec);
 const start=game.player.vitals.state.elapsed_seconds;game.update();const elapsed=game.player.vitals.state.elapsed_seconds-start,energy=game.player.attunement;
 const before=game.player.vitals.snapshot();game.paused=true;game.update();const paused=game.player.vitals.snapshot();game.paused=false;
 return {elapsed,energy,before,paused};`,r=>{assert.ok(Math.abs(r.elapsed-1/60)<1e-9);assert.equal(r.energy,82);assert.deepEqual(r.paused,r.before);});
check('classic save/load preserves authoritative health, Flit protection, energy and combat windows',`
 game.player.vitals.reset();game.player.takeDamage(31);game.player.vitals.beginFlit(40,.25,_gameTimeSec);const expected=game.player.vitals.snapshot();
 game.saveGame({auto:true});game.player.vitals.reset();const loaded=game.loadGame(AUTOSAVE_KEY);
 return {loaded,actual:game.player.vitals.snapshot(),expected};`,r=>{assert.equal(r.loaded,true);assert.deepEqual(r.actual,r.expected);});
check('old saves without vitals reconstruct upgraded health from saved ranks before clamping',`
 game._doLoadMap('ollo_test');game.player.vitals.reset();game.resonance.ranks={reinforced:3};game.applyResonanceStats();game.player.vitals.restoreHealth();game.player.takeDamage(7);
 const expected=game.player.hp,maximum=game.player.maxHp,save=game.getSaveSchema();delete save.player.vitals;
 localStorage.setItem('old-health-save',JSON.stringify(save));game.resonance.reset();game.player.vitals.reset();const loaded=game.loadGame('old-health-save');
 return {loaded,expected,actual:game.player.hp,maximum,restoredMaximum:game.player.maxHp};`,r=>{assert.equal(r.loaded,true);assert.equal(r.actual,r.expected);assert.equal(r.restoredMaximum,r.maximum);assert.ok(r.maximum>100);});
check('native player death uses the existing medbay policy and restores one health owner',`
 game._doLoadMap('apt_949');game.player.vitals.reset();game.player.buffSystem.active={};
 const load=game.loadMap;game.loadMap=(id,at)=>game._doLoadMap(id,at);try{game.player.takeDamage(9999);}finally{game.loadMap=load;}
 return {health:game.player.hp,maximum:game.player.maxHp,dead:game.player.dead,map:game.activeMap.id,retired:'playerHealth' in game};`,r=>{assert.equal(r.dead,false);assert.equal(r.health,r.maximum);assert.equal(r.map,'medbay_sw');assert.equal(r.retired,false);});
const errorsBeforeInvalid=env.errors.length;
check('invalid vitals reject before changing live health, currency or map',`
 const before={vitals:game.player.vitals.snapshot(),currency:game.currency,map:game.activeMap.id},save=game.getSaveSchema();
 save.player.vitals.health=-1;save.player.currency=999999;localStorage.setItem('invalid-vitals-save',JSON.stringify(save));
 const loaded=game.loadGame('invalid-vitals-save');return {loaded,before,after:{vitals:game.player.vitals.snapshot(),currency:game.currency,map:game.activeMap.id}};`,r=>{assert.equal(r.loaded,false);assert.deepEqual(r.after,r.before);});
const expectedErrors=env.errors.splice(errorsBeforeInvalid);assert.equal(expectedErrors.length,1);assert.match(expectedErrors[0],/\[LOAD\] Error loading save/);
check('new game clears upgraded and transient vitals without recreating a host ledger',`
 game.player.vitals.setMaximumHealth(200);game.player.vitals.setMaximumAttunement(200);game.player.vitals.beginFlit(40,.25,10);game.resetGameState();
 return {actual:game.player.vitals.snapshot(),expected:new DFNative.playerVitals().snapshot(),retired:'flitState' in game};`,r=>{assert.deepEqual(r.actual,r.expected);assert.equal(r.retired,false);});
assert.deepEqual(env.errors,[]);
console.log(`Player-state callers: ${passed} checks passed.`);
