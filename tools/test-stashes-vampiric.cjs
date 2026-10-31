#!/usr/bin/env node
'use strict';
// Stashes round the city (world/map-entities.js ls_*, engine/shops-menus.js searchLostLuggage): each pays its own range
// once a day; the gauntlet's two are loud. Vampiric Fists (engine/knuckles.js onPunchLanded): her punches heal her.
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});fn(e);assert.deepEqual(e.errors,[]);tests.push(name);}
const STASHES={cozy_cafe_interior:['cafe_tote',10,35,0],auto_shop:['torque_tin',30,80,0],enni_cole_interior:['enni_bag',25,70,0],
 enni_cole_upper:['enni_envelope',25,70,0],house_of_death:['house_offering',60,150,700],demoness_palace:['palace_tribute',60,150,700]};

test('Every new stash stands in its map with its own range, and draws closed and open',e=>{
 const r=value(e,`const out={};for(const id of ${JSON.stringify(Object.keys(STASHES))}){game._doLoadMap(id);
   const p=game.props.find(p=>p.interactionType==='lost_luggage'&&p.decorType&&p.decorType.startsWith('ls_'));
   const ctx=game.ctx;p._searched=false;drawClinicDecorProp(ctx,p);p._searched=true;drawClinicDecorProp(ctx,p);p._searched=false;
   const others=game.props.filter(o=>o!==p&&o.hasCollision!==false&&o.x<p.x+p.width&&o.x+o.width>p.x&&o.y<p.y+p.height&&o.y+o.height>p.y).map(o=>o.decorType);
   out[id]=[p.noteId,p.lootMin,p.lootMax,p.lootNoise,others.length];}
  return out;`);
 for(const [id,[note,lo,hi,noise]] of Object.entries(STASHES))assert.deepEqual(r[id],[note,lo,hi,noise,0],id);
});

test('A stash pays inside its range once a day, then again the next day; a loud one wakes those in earshot',e=>{
 const r=value(e,`game._doLoadMap('demoness_palace');game.running=true;game.questState=game.questState||{};game.worldMinutes=600;game.currency=0;
  const p=game.props.find(p=>p.noteId==='palace_tribute');let heard=0;game.enemies=[{x:p.x+200,y:p.y,dead:false,hearNoise(){heard++;return true;}}];
  const rnd=Math.random;Math.random=()=>0;game.searchLostLuggage(p);const lo=game.currency;
  game.searchLostLuggage(p);const again=game.currency;
  game.worldMinutes+=1440;Math.random=()=>0.9999;game.searchLostLuggage(p);Math.random=rnd;
  return {lo,again,hi:game.currency-lo,heard};`);
 assert.deepEqual(r,{lo:60,again:60,hi:150,heard:2});
});

const setup=`game._doLoadMap('ollo_test');game.running=true;game.paused=false;game.player.visible=true;
 game.activeMap={id:'vf_test',width:3000,height:3000,walls:[],buildings:[],buildingColliders:[]};
 game.player._game=game;game.player.x=1000;game.player.y=1000;game.player.angle=0;game.isDriving=false;
 game.weaponHolstered=false;game.projectiles=[];game.enemies=[];game.floatingTexts=[];_gameTimeSec=10;game.flitState.lastFlitAt=-99;
 game.inventory.items=[];game.inventory.equippedAttachments=[];
 const give=id=>{const it=createItemFromRegistry(id,game);game.inventory.items.push(it);return it;};
 const wield=id=>{game.currentWeapon=give(id);game.weaponMode=ITEM_REGISTRY[id].weaponMode;game.shootCooldown=0;};
 const ganger=(x,y,hp=5000)=>{const g=new Ganger(x,y,{hp});g.hp=g.maxHp=hp;g.state='IDLE';game.enemies.push(g);return g;};
 const rnd=Math.random;const withRandom=(v,f)=>{Math.random=()=>v;try{return f();}finally{Math.random=rnd;}};
 const land=()=>{for(let i=0;i<6&&game.projectiles.length;i++){_simTick++;CollisionSystem.beginProjectileStep(game);
   for(const p of game.projectiles)p.update(1,true);CollisionSystem.resolveProjectiles(game);game.projectiles=game.projectiles.filter(p=>p.active&&!p.markedForDestroy);}};
 const punch=()=>{game.shootCooldown=0;withRandom(.99,()=>game.fireWeapon());land();_gameTimeSec+=0.25;};`;

test('The schematic: 350 scrap makes the attachment, worn in a slot',e=>{
 const r=value(e,setup+`game.scrap=350;const made=game.craftSchematic('vampiric_fists');game.inventory.equipItem('vampiric_fists');
  return {made,scrap:game.scrap,worn:game.vampiricFists()};`);
 assert.deepEqual(r,{made:true,scrap:0,worn:true});
});

test('Knuckles: jabs heal 15%, the haymaker 30% and bleeds; nothing without the attachment',e=>{
 const r=value(e,setup+`wield('golden_retribution');const pl=game.player;
  const run=()=>{const out=[];for(let i=0;i<3;i++){game.enemies=[];const g=ganger(1036,1000);pl.hp=50;game.playerHealth=50;punch();
    out.push([pl.hp-50,!!(g._status&&g._status.bleed)]);}return out;};
  const bare=run();give('vampiric_fists');game.inventory.equipItem('vampiric_fists');const vamp=run();
  return {bare:bare.map(x=>x[0]),vamp:vamp.map(x=>x[0]),bleed:vamp.map(x=>x[1]),motes:game.knuckleFx.filter(f=>f.k==='drain').length};`);
 assert.deepEqual(r.bare,[0,0,0]);
 assert.deepEqual(r.vamp,[2,2,12]);                  // 16×.15 → 2, 16×.15 → 2, 40×.3 → 12
 assert.deepEqual(r.bleed,[false,false,true]);
 assert.ok(r.motes>0);
});

test('Bare fists drink too',e=>{
 const r=value(e,setup+`give('vampiric_fists');game.inventory.equipItem('vampiric_fists');game.weaponMode='none';game.currentWeapon=null;
  const pl=game.player;ganger(1036,1000);pl.hp=50;punch();return pl.hp-50;`);
 assert.ok(r>=2,`${r}`);
});

console.log(`ok ${tests.length} stash and vampiric fists tests`);
