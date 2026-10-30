#!/usr/bin/env node
'use strict';
// Golden Retribution (engine/knuckles.js): crafted brass knuckles. Jabs on the punch hitbox, every third a haymaker
// that staggers and can slam a body into a wall; a punch in the Flit-Strike window is a haymaker. Blades and jabs
// step her in toward someone just out of reach (engine/status-effects.js meleeStepIn), never through them.
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});fn(e);assert.deepEqual(e.errors,[]);tests.push(name);}
const setup=`game._doLoadMap('ollo_test');game.running=true;game.paused=false;game.player.visible=true;
 game.activeMap={id:'gr_test',width:3000,height:3000,walls:[],buildings:[],buildingColliders:[]};
 game.player._game=game;game.player.x=1000;game.player.y=1000;game.player.angle=0;game.isDriving=false;
 game.weaponHolstered=false;game.projectiles=[];game.enemies=[];game.floatingTexts=[];_gameTimeSec=10;game.flitState.lastFlitAt=-99;
 const wield=id=>{game.currentWeapon=createItemFromRegistry(id,game);game.weaponMode=ITEM_REGISTRY[id].weaponMode;game.shootCooldown=0;};
 const ganger=(x,y,hp=5000)=>{const g=new Ganger(x,y,{hp});g.hp=g.maxHp=hp;g.state='IDLE';game.enemies.push(g);return g;};
 const rnd=Math.random;const withRandom=(v,f)=>{Math.random=()=>v;try{return f();}finally{Math.random=rnd;}};
 const land=()=>{for(let i=0;i<6&&game.projectiles.length;i++){_simTick++;CollisionSystem.beginProjectileStep(game);
   for(const p of game.projectiles)p.update(1,true);CollisionSystem.resolveProjectiles(game);game.projectiles=game.projectiles.filter(p=>p.active&&!p.markedForDestroy);}};
 const punch=()=>{game.shootCooldown=0;withRandom(.99,()=>game.fireWeapon());land();_gameTimeSec+=0.25;};`;

test('The schematic stays locked until Lilitu falls to her alone; then 400 scrap makes the knuckles, worn as fists',e=>{
 const r=value(e,setup+`const sch=SCHEMATICS.find(s=>s.id==='golden_retribution');game.scrap=400;game.questState=game.questState||{};
  game.questState.goldenRetributionUnlocked=false;const locked=game.craftSchematic('golden_retribution'),hint=game.schematicNeeds(sch);game.questState.goldenRetributionUnlocked=true;
  const made=game.craftSchematic('golden_retribution');const it=game.inventory.items.find(i=>i.id==='golden_retribution');
  if(it&&it.action)it.action(it);
  return {locked,hint,cost:sch.scrapCost,made,scrap:game.scrap,mode:game.weaponMode,name:ITEM_REGISTRY.golden_retribution.name};`);
 assert.deepEqual(r,{locked:false,hint:'Defeat Lilitu alone in the palace',cost:400,made:true,scrap:0,mode:'fists',name:'Golden Retribution'});
});

test('Jab, jab, haymaker: 16, 16, then ×2.5, a harder shove and a stagger',e=>{
 const r=value(e,setup+`wield('golden_retribution');const out=[];
  for(let i=0;i<3;i++){game.enemies=[];const g=ganger(1036,1000);punch();out.push({dmg:5000-g.hp,kb:Math.hypot(g.knockbackVx,g.knockbackVy),stag:!!g._staggerUntil});}
  return out;`);
 assert.deepEqual(r.map(x=>x.dmg),[16,16,40]);
 assert.deepEqual(r.map(x=>x.stag),[false,false,true]);
 const ratio=r[2].kb/r[0].kb;
 assert.ok(ratio>2.6&&ratio<3.4,`a haymaker shoves ~3× a jab (${ratio})`);
});

test('A haymaker stops a shot being lined up and the ganger stands still; a boss staggers less and not again soon',e=>{
 const r=value(e,setup+`wield('golden_retribution');const g=ganger(1036,1000);g.isTelegraphing=true;g._aimPoint={x:1,y:1};g.cooldown=0;
  game._punchCombo=2;game._punchAt=_gameTimeSec;punch();const stag=g._staggerUntil-_gameTimeSec+0.25;
  const x=g.x;const res=g.update(game.player,[],[],[],[],game.activeMap,game.enemies);
  const boss=ganger(1036,1000);boss.bossName='Test Boss';game.enemies=[boss];game._punchCombo=2;game._punchAt=_gameTimeSec;punch();const b1=boss._staggerUntil-_gameTimeSec+0.25;
  const was=boss._staggerUntil;game._punchCombo=2;game._punchAt=_gameTimeSec;punch();
  return {tele:g.isTelegraphing,aim:g._aimPoint,cd:g.cooldown>g.telegraphThreshold,stag:+stag.toFixed(2),still:res,boss:+b1.toFixed(2),again:boss._staggerUntil===was};`);
 assert.deepEqual(r,{tele:false,aim:null,cd:true,stag:0.5,still:null,boss:0.3,again:true});
});

test("Driven into a wall, a haymaker's target takes half the hit again; in the open it does not",e=>{
 const r=value(e,setup+`wield('golden_retribution');game.activeMap.walls=[{x:1062,y:900,w:40,h:200}];
  const g=ganger(1036,1000);game._punchCombo=2;game._punchAt=_gameTimeSec;punch();const hay=5000-g.hp;
  for(let i=0;i<20;i++){g.knockbackVx=Math.max(g.knockbackVx,0.5);g.x+=1;if(g.x>1062-g.radius)g.x=1062-g.radius;game.updateKnuckleSlams();}
  const walled=5000-g.hp;
  game.activeMap.walls=[];game.enemies=[];const o=ganger(1036,1000);game._punchCombo=2;game._punchAt=_gameTimeSec;punch();
  for(let i=0;i<20;i++){o.x+=1;game.updateKnuckleSlams();}
  return {hay,walled,open:5000-o.hp};`);
 assert.equal(r.hay,40);
 assert.equal(r.walled,60);
 assert.equal(r.open,40);
});

test('A punch inside the Flit-Strike window is always a haymaker, with Flit-Strike on top',e=>{
 const r=value(e,setup+`wield('golden_retribution');game.resonance.ranks=game.resonance.ranks||{};
  const g=ganger(1036,1000);game.flitState.lastFlitAt=_gameTimeSec;punch();
  return {dmg:5000-g.hp,stag:!!g._staggerUntil,combo:game._punchCombo};`);
 assert.equal(r.stag,true);
 assert.ok(r.dmg>=40,`${r.dmg}`);
 assert.equal(r.combo,0);
});

test('Quick Hands and Reflex Sync quicken the jab; the body runs the full punch curve either way',e=>{
 const r=value(e,setup+`wield('golden_retribution');const base=(game.shootCooldown=0,withRandom(.99,()=>game.fireWeapon()),game.shootCooldown);
  const st=game.resonance.stat.bind(game.resonance);game.resonance.stat=(k,b)=>k==='fireCooldown'?b*0.76:st(k,b);
  const aug=game.augments.isEquipped.bind(game.augments);game.augments.isEquipped=id=>id==='fast_reload'||aug(id);
  game.shootCooldown=0;withRandom(.99,()=>game.fireWeapon());const fast=game.shootCooldown;
  RenderInterp.alpha=1;const t0=game.punchStanceTicks();game.shootCooldown=1;const t1=game.punchStanceTicks();
  return {base,fast,t0:+t0.toFixed(2),t1:+t1.toFixed(2)};`);
 assert.equal(r.base,15);
 assert.equal(r.fast,9);
 assert.ok(r.t0<2&&r.t1>13,`${r.t0} → ${r.t1}`);
});

test('DPS: about 105 bare, about 415 with Heavy Hands, Quick Hands, Reflex Sync and the Mirrored Glass',e=>{
 const r=value(e,`const cycle=(jab,cd)=>(jab*2+jab*2.5)/(3*cd/60);
  const crit=1+0.1*(2-1);
  return {base:Math.round(cycle(16,15)*crit),full:Math.round(cycle(16*1.75*1.35,9)*crit)};`);
 assert.ok(Math.abs(r.base-105)<=5,`${r.base}`);
 assert.ok(Math.abs(r.full-415)<=20,`${r.full}`);
});

test('A blade steps her in to the one it will meet and stops at contact; its cut barely shoves',e=>{
 const r=value(e,setup+`wield('maiden_kukri');const g=ganger(1052,1000);const x0=game.player.x;
  withRandom(.99,()=>game.meleeSlash());const step=game.player.x-x0;
  const gap=Math.hypot(g.x-game.player.x,g.y-game.player.y)-game.player.radius-g.radius;
  game.enemies=[];game.player.x=1000;const far=ganger(1300,1000);game.shootCooldown=0;game._swing=null;
  withRandom(.99,()=>game.meleeSlash());
  return {stepped:step>0&&step<=16,gap:gap>=-0.01,far:game.player.x===1000};`);
 assert.deepEqual(r,{stepped:true,gap:true,far:true});
});

test('A staggered hunter neither dashes nor claws',e=>{
 const r=value(e,setup+`const h=new Hunter(1040,1000,{});h.state='ALERT';h.clawCD=0;h.dashCD=0;game.enemies=[h];h._staggerUntil=_gameTimeSec+0.5;
  const res=h.update(game.player,[],[],[],[],game.activeMap,game.enemies);return {res,x:h.x};`);
 assert.deepEqual(r,{res:null,x:1040});
});

test('The afterimages and rings draw, then fade away',e=>{
 const r=value(e,setup+`wield('golden_retribution');const g=ganger(1036,1000);game._punchCombo=2;game._punchAt=_gameTimeSec;punch();
  const n=game.knuckleFx.length;const kinds=game.knuckleFx.map(f=>f.k).sort().join();
  const ctx=new Proxy({},{get:(t,k)=>/Gradient$/.test(k)?()=>({addColorStop(){}}):t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
  game.drawKnuckleFx(ctx);_gameTimeSec+=1;game.drawKnuckleFx(ctx);
  drawKnuckleDuster(ctx,0,0,0,1);
  return {n,kinds,left:game.knuckleFx.length};`);
 assert.deepEqual(r,{n:2,kinds:'ring,trail',left:0});
});

console.log(`ok ${tests.length} golden retribution tests`);
