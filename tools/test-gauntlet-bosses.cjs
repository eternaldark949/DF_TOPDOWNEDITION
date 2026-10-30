#!/usr/bin/env node
'use strict';
// Gauntlet tuning, Lilitu's duel, the Triumvirate's rework and the Double Nights drones,
// simulated on the built game (tools/test-game-runtime.cjs). Logic only: visuals need playtesting.
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {runtime} = require('./test-game-runtime.cjs');
const results = [];
function test(name, source, check) {
  const e = runtime(join(__dirname, '..', 'DFAB V8.html'), {timers:true});
  const result = structuredClone(e.run(`(()=>{${source}})()`));
  check(result); assert.deepEqual(e.errors, []); results.push(name);
}
const setup = (map) => `game.story.update=()=>{}; game._doLoadMap('${map}'); game.running=true; game.paused=false; game.player.visible=true;
 game.loadMap=function(id,at){this._doLoadMap(id,at);};
 const step=(n=1)=>{for(let i=0;i<n;i++){game.update(); _gameTimeSec=_simTick*CONFIG.LOOP.STEP_MS/1000;}};
 const heal=()=>{game.player.hp=game.playerHealth=game.player.maxHp;};`;

test('Wave scaling: HP ×1.04 and damage +2% a wave from 15, elites from 12, scrap 5w (+100 each 5th)', setup('sdc') + `
  const hg=game.hordeGauntlet, out={};
  hg.start(game,'house_of_death');
  for (const w of [11,12,20]) {
    hg.wave=w-1; hg.waveDelay=0; for(const h of hg.hostiles){const i=game.enemies.indexOf(h); if(i>=0) game.enemies.splice(i,1);} hg.spawnWave(game);
    const g=hg.hostiles.find(h=>h instanceof Ganger);
    out[w]={hp:g.maxHp, dmg:g.dmgMul||1, elites:hg.hostiles.filter(h=>h.elite).length, n:hg.hostiles.length};
  }
  const scale=gauntletScale(20);
  const scrap=game.scrap; hg.hostiles.forEach(h=>h.dead=true); hg.update(game);
  return {out, scale, scrap:game.scrap-scrap, map: GAUNTLET_MAPS[1].waves(10), map5: GAUNTLET_MAPS[1].waves(15)};`, r => {
  assert.equal(r.out[11].elites, 0); assert.ok(r.out[12].elites >= 1);
  assert.equal(r.out[20].hp, Math.round((40+20*6)*Math.pow(1.04,5))); assert.ok(Math.abs(r.out[20].dmg-1.10)<1e-9);
  assert.equal(r.out[11].hp, 40+11*6); assert.equal(r.scrap, 5*20+100);
  assert.deepEqual([r.map.solo, r.map.hunters, r.map.alphas, r.map.demoness], [true,0,0,true]);
  assert.deepEqual([r.map5.solo, r.map5.demoness], [false,true]);
});

test('Elites: armored halves bleed, warded turns frontal shots until its ward breaks', setup('house_of_death') + `
  const a=new Ganger(400,400,{hp:100}); applyElite(a,'armored'); game.enemies.push(a);
  a.takeDamage(10,0,0,{type:'bleed'}); const armoredBleed=100-a.hp;
  const w=new Ganger(600,400,{hp:100}); applyElite(w,'warded'); w.angle=0; game.enemies.push(w);
  const shot=(fromX)=>{const p=new ProjectileEntity({x:600+fromX,y:400,angle:fromX>0?Math.PI:0,isEnemy:false,damage:25}); p.owner=game.player; w.invincibleTimer=0; const h=w.hp; w.onProjectileHit(p,game); return h-w.hp;};
  const front=[shot(40),shot(40),shot(40),shot(40)], back=shot(-40);
  return {armoredBleed, front, back, ward:w.ward};`, r => {
  assert.equal(r.armoredBleed, 5);
  assert.deepEqual(r.front, [0,0,0,25]);          // the ward (60) turns three, the last of them breaking it
  assert.equal(r.back, 25); assert.equal(r.ward, 0);
});

test("Lilitu's duel: alone on wave 10, three phases with their moves, and her rewards", setup('sdc') + `
  game.questState.lilituDuelSeen=true; game.player.maxHp=100000; heal();
  const hg=game.hordeGauntlet; hg.start(game,'demoness_palace'); hg.wave=9; hg.waveDelay=0; hg.spawnWave(game);
  const d=hg.hostiles[0]; const seen={1:new Set(),2:new Set(),3:new Set()};
  const nav=NavGrid.for(game.activeMap); let spot=null;               // somewhere in the open with a clear line to her
  for(let a=0;a<6.28&&!spot;a+=0.2){ const x=d.x+Math.cos(a)*260, y=d.y+Math.sin(a)*260; if(nav.walkable(x,y)&&hasShotLine(d.x,d.y,x,y,game.activeMap)) spot={x,y}; }
  let bolts=0, decoys=0;
  for (const frac of [1,0.5,0.2]) {
    d.hp=d.maxHp*frac;
    for(let i=0;i<1500;i++){ step(); heal(); game.player.visible=true; game.player.x=spot.x; game.player.y=spot.y; d.state='ALERT'; d.suspicion=100;
      for(const h of (game._hazards||[])) seen[d.phase].add(h.kind);
      if (d._tell) seen[d.phase].add('tell:'+d._tell.kind);
      bolts+=game.projectiles.some(p=>p.owner===d&&p.color==='#ff5a1a')?1:0; decoys=Math.max(decoys,game.enemies.filter(x=>x.decoy&&!x.dead).length); }
  }
  const darks0=game.loot.filter(l=>l.type==='dark_element').length;
  d.hp=1; d.takeDamage(10,0,0,{shot:true}); step(3);
  return {n:hg.hostiles.length, hp:d.maxHp, solo:d.solo, seen:Object.fromEntries(Object.entries(seen).map(([k,v])=>[k,[...v].sort()])), bolts, decoys,
    darks:game.loot.filter(l=>l.type==='dark_element').length-darks0, wins:game.questState.lilituSoloWins, unlocked:game.questState.goldenRetributionUnlocked,
    left:game.enemies.filter(x=>x.decoy&&!x.dead).length, hazards:(game._hazards||[]).length};`, r => {
  assert.equal(r.hp, 3000+100*10); assert.equal(r.solo, true);
  assert.ok(r.seen[1].includes('sigil') && r.bolts > 0, 'phase I: sigils and ember bolts ' + JSON.stringify(r));
  assert.ok(r.seen[2].includes('flare') && r.seen[2].includes('tell:gale') && r.decoys === 2, 'phase II: shadow step, wing gale, blood mirror');
  assert.ok(r.seen[3].includes('rite'), 'phase III: infernal rite');
  assert.equal(r.darks, 2); assert.equal(r.wins, 1); assert.equal(r.unlocked, true);
  assert.equal(r.left, 0); assert.equal(r.hazards, 0);
});

test('A solo duel saves and restores as a duel (decoys are not saved)', setup('sdc') + `
  game.questState.lilituDuelSeen=true;
  const hg=game.hordeGauntlet; hg.start(game,'demoness_palace'); hg.wave=19; hg.waveDelay=0; hg.spawnWave(game);
  const d=hg.hostiles[0]; d.dormant=false; d.hp=1234; game.enemies.push(new Demoness(d.x+50,d.y,{decoy:true}));
  game.saveGame({auto:true}); game._doLoadMap('apt_949'); game.loadGame('dfab_save_slot_auto');
  const b=hg.hostiles.find(h=>h instanceof Demoness);
  return {n:hg.hostiles.length, solo:b.solo, hp:b.hp, max:b.maxHp, decoys:game.enemies.filter(e=>e.decoy).length};`, r => {
  assert.deepEqual(r, {n:1, solo:true, hp:1234, max:3000+100*20, decoys:0});
});

test('The Triumvirate: 1500 HP each, 2 s reloads, censer, hymn and hook, enrage, and the Blood Pact', setup('church_boss') + `
  game.questState.sanctumIntroSeen=true; game.player.maxHp=100000; heal();
  game.inventory.items=game.inventory.items.filter(i=>i.id!=='blood_pact');
  game.spawnTriumvirate({short:true}); const W=game.enemies.filter(e=>e.persona);
  const kinds=new Set(); let revealed=0;
  for(let i=0;i<2400;i++){ step(); heal(); game.player.x=600; game.player.y=640;
    for(const h of (game._hazards||[])) kinds.add(h.kind);
    if (game._revealedUntil>_gameTimeSec) revealed++; }
  const hp=W.map(w=>w.maxHp), reload=W.map(w=>w.reloadTime);
  W[0].hp=1; W[0].takeDamage(5,0,0,{shot:true}); step(2);
  const enraged=W.slice(1).map(w=>[w.burstDelay,w.reloadTime]);
  for(const w of W.slice(1)){ w.hp=1; w.takeDamage(5,0,0,{shot:true}); step(2); }
  return {hp, reload, kinds:[...kinds].sort(), revealed:revealed>0, enraged,
    drop:game.loot.filter(l=>l.type==='weapon_drop').map(l=>l.item.id), defeats:game.questState.triumvirateDefeats};`, r => {
  assert.deepEqual(r.hp, [1500,1500,1500]); assert.deepEqual(r.reload, [120,120,120]);
  for (const k of ['censer','fire','smoke','hymn','hook']) assert.ok(r.kinds.includes(k), k);
  assert.equal(r.revealed, true);
  for (const [delay, reload] of r.enraged) { assert.equal(delay, 5); assert.equal(reload, 90); }
  assert.deepEqual(r.drop, ['blood_pact']); assert.equal(r.defeats, 1);
});

test('A warden keeps firing into cover for a moment after losing sight', setup('church_boss') + `
  const w=new GatlingGunner(600,300,0,{persona:'vesper'}); w.navMap=game.activeMap; const E=[w], px=game.player.x, py=game.player.y;
  const tick=()=>{ const r=w.update(px,py,E,game.activeMap.walls); _simTick++; _gameTimeSec=_simTick*CONFIG.LOOP.STEP_MS/1000; return r; };
  w._hasSight=()=>true; w.burstCount=1; w.burstCooldown=0; w.burstTimer=1; tick();
  w._hasSight=()=>false; const t0=_gameTimeSec; let n=0, last=0;
  for(let i=0;i<90;i++){ const r=tick(); if(r&&r.length){ n++; last=_gameTimeSec-t0; } }
  return {n, last};`, r => {
  assert.ok(r.n > 0, 'it fires into her cover'); assert.ok(r.last <= 0.55, 'for up to 0.5 s: ' + r.last);
});

test('Drones: three kinds drop in and use their moves; the shell resists, the eye takes more', setup('hotel_suite') + `
  game.player.maxHp=100000; heal();
  const D=[new Drone(900,1100,'lancer'),new Drone(1000,1150,'seer'),new Drone(1100,1100,'grappler')]; D.forEach(d=>game.enemies.push(d));
  const states={}; const early=D[0].takeDamage(50,0,0,{shot:true});
  for(let i=0;i<2400;i++){ step(); heal(); for(const d of D) states[d.kind+':'+d.state]=1; }
  const d=new Drone(500,500,'lancer'); d.alt=0; d.state='hover'; d.angle=0;
  const hit=(x,y)=>{const p=new ProjectileEntity({x,y,angle:Math.PI,isEnemy:false,damage:20}); p.owner=game.player; const h=d.hp; d.onProjectileHit(p,game); return h-d.hp;};
  const e=d.eyePos(), eye=hit(e.x,e.y), shell=hit(d.x-15,d.y);
  const blade=(()=>{const h=d.hp; d.invincibleTimer=0; d.takeDamage(20,0,0,{type:'melee'}); return h-d.hp;})();
  return {early, states:Object.keys(states).sort(), eye, shell, blade};`, r => {
  assert.equal(r.early, false, 'untouchable while it descends');
  for (const s of ['lancer:dive','lancer:recover','grappler:tether','seer:beam','lancer:descend']) assert.ok(r.states.includes(s), s);
  assert.equal(r.eye, 36); assert.equal(r.shell, 6); assert.equal(r.blade, 12);
});

test('Hazards: a flit dodges the hymn; fire sets her burning, and it burns out', setup('church_boss') + `
  game.player.maxHp=1000; heal(); game.player.x=600; game.player.y=600;
  const m=new GatlingGunner(600,300,1,{persona:'matins'});
  game.flitState.active=true; game.flitState.duration=999; game.addHazard({kind:'hymn',x:600,y:300,owner:m}); step(80); const dodged=game.player.hp===game.player.maxHp && !(game._revealedUntil>_gameTimeSec);
  game.flitState.active=false; game.flitState.duration=0; game.addHazard({kind:'hymn',x:600,y:300,owner:m}); step(80); const hitHymn=game.player.maxHp-game.player.hp; heal();
  game.addHazard({kind:'fire',x:600,y:600,r:50,until:_gameTimeSec+0.3,dps:8}); step(20); const burning=!!game._playerBurn;
  step(120); const burned=game.player.maxHp-game.player.hp;
  return {dodged, hitHymn, burning, burned, gone:!game._playerBurn};`, r => {
  assert.equal(r.dodged, true); assert.equal(r.hitHymn, 10);
  assert.equal(r.burning, true); assert.ok(r.burned >= 8); assert.equal(r.gone, true);
});

console.log(JSON.stringify({passed: results.length, tests: results}, null, 2));
