#!/usr/bin/env node
'use strict';
// Critical hits (engine/combat-fx.js) and the Blood Pact katana (ui/inventory-augments.js, ui/weapon-models.js)
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});fn(e);assert.deepEqual(e.errors,[]);tests.push(name);}
const setup=`game._doLoadMap('ollo_test');game.running=true;game.paused=false;game.player.visible=true;
 game.activeMap={id:'crit_test',width:3000,height:3000,walls:[],buildings:[],buildingColliders:[]};
 game.player._game=game;game.player.x=1000;game.player.y=1000;game.player.angle=0;game.isDriving=false;
 game.weaponHolstered=false;game.projectiles=[];game.enemies=[];game.floatingTexts=[];_gameTimeSec=10;
 const wield=id=>{game.currentWeapon=createItemFromRegistry(id,game);game.weaponMode=ITEM_REGISTRY[id].weaponMode;game.shootCooldown=0;};
 const ganger=(x,y)=>{const g=new Ganger(x,y,{hp:500});g.state='IDLE';game.enemies.push(g);return g;};
 const rnd=Math.random;const withRandom=(v,f)=>{Math.random=()=>v;try{return f();}finally{Math.random=rnd;}};
 const tick=()=>{_gameTimeSec+=1/60;game.updateStatuses();game.updateMeleeSwing();for(const e of game.enemies)if(e.invincibleTimer>0)e.invincibleTimer--;};
 const swing=()=>{const s=game.meleeSlash();while(game._swing===s)tick();return s.hits;};`;

test('Blood Pact: twice the Kukri\'s reach, half its swing rate, in every new loadout',e=>{
 const r=value(e,`const k=ITEM_REGISTRY.maiden_kukri.stats,b=ITEM_REGISTRY.blood_pact.stats;
  return {reach:b.reach/k.reach,rate:b.fireRate/k.fireRate,name:ITEM_REGISTRY.blood_pact.name,mode:ITEM_REGISTRY.blood_pact.weaponMode,
   loadout:DEFAULT_LOADOUT.includes('blood_pact'),model:weaponModel('blood_pact')===WEAPON_MODELS.blood_pact};`);
 assert.deepEqual(r,{reach:2,rate:2,name:'Blood Pact',mode:'melee',loadout:true,model:true});
});

test('A cut at 70 px lands with Blood Pact but not with the Kukri; the katana waits twice as long',e=>{
 const r=value(e,setup+`const out={};
  for(const id of ['maiden_kukri','blood_pact']){game.enemies=[];const g=ganger(1070,1000);wield(id);
   const hit=withRandom(.99,swing);out[id]={hit,hp:g.hp,cooldown:game.shootCooldown};}
  return out;`);
 assert.equal(r.maiden_kukri.hit,0);assert.equal(r.maiden_kukri.hp,500);
 assert.equal(r.blood_pact.hit,1);assert.equal(r.blood_pact.hp,500-45);
 assert.equal(r.blood_pact.cooldown,2*r.maiden_kukri.cooldown);
});

test('A blade crit doubles the cut and shows a gold number with a bang',e=>{
 const r=value(e,setup+`const g=ganger(1030,1000);wield('blood_pact');withRandom(.01,swing);
  const t=game.floatingTexts.find(t=>t.target===g&&!t.bleed);return {crit:t.crit,value:t.value,color:t.color};`);
 assert.deepEqual(r,{crit:true,value:90,color:'#ffd23a'});
});

test('The hitbox is the drawn blade: Blood Pact cuts beside her, not past its tip',e=>{
 const r=value(e,setup+`wield('blood_pact');const out={};
  for(const [k,x,y] of [['side',1000,1052],['otherSide',1000,948],['ahead',1062,1000],['pastTip',1096,1000],['behind',948,1000]]){
   game.enemies=[];game.player.x=game.player.y=1000;const g=ganger(x,y);game.shootCooldown=0;out[k]=withRandom(.99,swing);}
  return out;`);
 assert.deepEqual(r,{side:1,otherSide:1,ahead:1,pastTip:0,behind:0});
});

test('A cut lands as the blade passes, not at the press: the far side of the sweep is cut last',e=>{
 const r=value(e,setup+`wield('blood_pact');game._slashSide=-1;const a=ganger(1000,1052),b=ganger(1000,948);
  const s=withRandom(.99,()=>game.meleeSlash());const at={press:[a.hp,b.hp]};let n=0;
  while(game._swing===s){tick();n++;if(a.hp<500&&at.a===undefined)at.a=n;if(b.hp<500&&at.b===undefined)at.b=n;}
  return at;`);
 assert.deepEqual(r.press,[500,500]);assert.ok(r.a<r.b,JSON.stringify(r));
});

test('Quick cuts all land: i-frames and bleed ticks no longer swallow the next cut',e=>{
 const r=value(e,setup+`const out={};
  for(const id of ['maiden_kukri','blood_pact']){game.enemies=[];const g=ganger(1030,1000);g.hp=g.maxHp=5000;wield(id);
   let cuts=0;for(let i=0;i<5;i++){game.shootCooldown=0;cuts+=withRandom(.99,swing);while(game.shootCooldown-->0)tick();}
   out[id]={cuts,texts:game.floatingTexts.filter(t=>t.target===g&&!t.bleed).length,frames:g.invincibleTimer};}
  return out;`);
 assert.deepEqual(r.maiden_kukri,{cuts:5,texts:5,frames:0});assert.deepEqual(r.blood_pact,{cuts:5,texts:5,frames:0});
});

test('Crit chance: 10% by default, 20% with Blood Pact; others\' hits and bleeds never crit',e=>{
 const r=value(e,setup+`return {
   gunLow:withRandom(.09,()=>game.rollCrit(ITEM_REGISTRY.pistol_fpx.stats)),gunHigh:withRandom(.11,()=>game.rollCrit(ITEM_REGISTRY.pistol_fpx.stats)),
   pactLow:withRandom(.19,()=>game.rollCrit(ITEM_REGISTRY.blood_pact.stats)),pactHigh:withRandom(.21,()=>game.rollCrit(ITEM_REGISTRY.blood_pact.stats)),
   fist:withRandom(.05,()=>game.rollCrit(null))};`);
 assert.deepEqual(r,{gunLow:2,gunHigh:1,pactLow:2,pactHigh:1,fist:2});
 const b=value(e,setup+`const g=ganger(1030,1000);game.applyStatus(g,'bleed',{dps:8,secs:3,by:game.player});
  _gameTimeSec+=1.01;game.updateStatuses();return game.floatingTexts.filter(t=>t.crit).length;`);
 assert.equal(b,0);
});

test('A shot that crits carries double damage, lands as a crit, and bypasses nothing else',e=>{
 const r=value(e,setup+`game.player._muzzleLocal={x:20,y:3};game.player._muzzleReady=true;
  wield('pistol_fpx');withRandom(.01,()=>game.fireWeapon());const crit=game.projectiles.at(-1);
  wield('pistol_fpx');withRandom(.99,()=>game.fireWeapon());const plain=game.projectiles.at(-1);
  const g=ganger(1300,1000);g.onProjectileHit(crit,game);const t=game.floatingTexts.find(t=>t.target===g);
  return {crit:crit.crit,plain:plain.crit,ratio:crit.damage/plain.damage,text:!!(t&&t.crit),hp:g.hp,dmg:crit.damage};`);
 assert.equal(r.crit,true);assert.equal(r.plain,false);assert.equal(r.text,true);assert.equal(r.hp,500-r.dmg);
 assert.ok(Math.abs(r.ratio-2)<0.1,String(r.ratio));
});

test('The katana\'s slower swing stretches the pose and the trail follows its long red edge',e=>{
 const r=value(e,setup+`wield('blood_pact');game.enemies=[];withRandom(.99,()=>{game.meleeSlash();});
  const s=game.slashes.at(-1);const atKukriEnd=sampleMeleeSwing(.3,1,{},s.secs),kukriEnd=sampleMeleeSwing(.3,1);
  const pts=[];const ctx=game.ctx,line=ctx.lineTo;ctx.lineTo=(x,y)=>pts.push([x,y]);_gameTimeSec+=s.secs*.72;game.drawSlashes(ctx);ctx.lineTo=line;
  const far=Math.max(...pts.map(([x,y])=>Math.hypot(x,y)));
  return {secs:s.secs,mid:!!atKukriEnd,kukriEnd,far,edge:s.edge,cols:s.cols[1][1]};`);
 assert.equal(r.secs,.32);assert.equal(r.mid,true);assert.equal(r.kukriEnd,null);
 assert.ok(r.far>45,String(r.far));assert.deepEqual(r.edge,[50.5,-1.9]);assert.equal(r.cols,'255, 70, 100');
});

test('Blood Pact swings wide in both hands: wound back, swept across, both fists on the grip',e=>{
 const r=value(e,setup+`wield('blood_pact');game.enemies=[];game._slashSide=-1;withRandom(.99,()=>{game.meleeSlash();});
  const secs=game._slashSecs,style=game._slashStyle,at=u=>({...sampleMeleeSwing(u*secs,1,{},secs,style)});
  const wound=at(WIDE_SWING.windup),mid=at((WIDE_SWING.windup+WIDE_SWING.cutEnd)/2),done=at(WIDE_SWING.cutEnd),rest=at(1);
  game._slashT=_gameTimeSec-secs*(WIDE_SWING.windup+WIDE_SWING.cutEnd)/2;
  drawProceduralHumanoid(game.ctx,game.player,{gender:'female',stance:'idle',pose:'none',noShadow:true});
  const g=_humanoidDrawBuffer(game.player).geometry;
  return {style,wound,mid,done,rest,fists:g.fists.map(f=>f.slice()),kukri:weaponModel('maiden_kukri').swing||null,grip:WIDE_SWING.grip,guard:WIDE_SWING.guard.a};`);
 assert.equal(r.style,'wide');assert.equal(r.kukri,null);
 assert.ok(Math.abs(r.wound.a-r.done.a)>3.9,'the blade sweeps a wide arc (over 220 degrees)');
 assert.ok(r.wound.handY>12&&r.done.handY<-12&&r.mid.handX>16,'the hands travel from one side, out in front, to the other');
 for(const p of [r.wound,r.mid,r.done])assert.ok(Math.abs(Math.hypot(p.handX-p.lHandX,p.handY-p.lHandY)-r.grip)<1e-9);
 assert.ok(Math.hypot(r.fists[0][0]-r.fists[1][0],r.fists[0][1]-r.fists[1][1])<8,'both fists hold the grip');
 assert.ok(Math.abs(r.rest.a-r.guard)<1e-9);
});

console.log(JSON.stringify({passed:tests.length,tests},null,2));
