#!/usr/bin/env node
'use strict';
// Crafted gear (story/missions.js SCHEMATICS): the Mirror Blade, the Bloodthirsty Muzzle, the Mirrored Glass;
// two attachment slots (ui/inventory-augments.js); the deflecting and the damage (engine/status-effects.js)
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});fn(e);assert.deepEqual(e.errors,[]);tests.push(name);}
const setup=`game._doLoadMap('ollo_test');game.running=true;game.paused=false;game.player.visible=true;
 game.activeMap={id:'gear_test',width:3000,height:3000,walls:[],buildings:[],buildingColliders:[]};
 game.player._game=game;game.player.x=1000;game.player.y=1000;game.player.angle=0;game.isDriving=false;
 game.weaponHolstered=false;game.projectiles=[];game.enemies=[];game.floatingTexts=[];_gameTimeSec=10;
 game.inventory.items=[];game.inventory.equippedAttachments=[];game.cosmetics.equippedAccessory=null;
 const give=id=>{const it=createItemFromRegistry(id,game);game.inventory.items.push(it);return it;};
 const wield=id=>{game.currentWeapon=give(id);game.weaponMode=ITEM_REGISTRY[id].weaponMode;game.shootCooldown=0;};
 const ganger=(x,y)=>{const g=new Ganger(x,y,{hp:5000});g.state='IDLE';game.enemies.push(g);return g;};
 const rnd=Math.random;const withRandom=(v,f)=>{Math.random=()=>v;try{return f();}finally{Math.random=rnd;}};
 const shot=(x,y,ang,owner)=>{const p=new ProjectileEntity({x,y,angle:ang,isEnemy:true,owner,damage:30});game.projectiles.push(p);return p;};
 const tick=()=>{_simTick++;_gameTimeSec+=1/60;game.updateMeleeSwing();game.deflectShots();for(const p of game.projectiles){p.lastX=p.x;p.lastY=p.y;p.x+=p.vx;p.y+=p.vy;}};`;

test('Three new schematics at the workbench, with the agreed costs',e=>{
 const r=value(e,`return SCHEMATICS.map(s=>[s.id,s.scrapCost,!!s.cosmetic]);`);
 for(const want of [['mirror_blade',200,false],['blood_muzzle',275,false],['acc_mirror_glass',650,true]])assert.deepEqual(r.find(x=>x[0]===want[0]),want);
});

test('Two attachments at most; unequipping one leaves the other',e=>{
 const r=value(e,setup+`for(const id of ['laser_sight','blood_muzzle','mirror_blade'])give(id);
  for(const id of ['laser_sight','blood_muzzle','mirror_blade'])game.inventory.equipItem(id);
  const two=game.inventory.equippedAttachments.slice();
  game.inventory.unequip('laser_sight');const after=game.inventory.equippedAttachments.slice();
  game.inventory.equipItem('mirror_blade');
  const saved=game.inventory.equippedAttachments.slice();
  return {two,after,saved,laser:game.inventory.hasAttachment('laser_sight'),muzzle:game.inventory.hasAttachment('blood_muzzle'),first:game.inventory.equippedAttachmentId};`);
 assert.deepEqual(r.two,['laser_sight','blood_muzzle']);assert.deepEqual(r.after,['blood_muzzle']);
 assert.deepEqual(r.saved,['blood_muzzle','mirror_blade']);assert.equal(r.laser,false);assert.equal(r.muzzle,true);assert.equal(r.first,'blood_muzzle');
});

test('Crafting spends scrap, a cosmetic schematic grants the piece, and the glass needs the Crystal Glass',e=>{
 const r=value(e,setup+`game.scrap=2000;const out={};
  out.made=['mirror_blade','blood_muzzle','acc_mirror_glass'].map(id=>game.craftSchematic(id));
  out.again=game.craftSchematic('mirror_blade');
  out.items=game.inventory.items.map(i=>i.id);out.glass=game.cosmetics.isOwned('acc_mirror_glass');out.scrap=game.scrap;
  game.cosmetics.owned=game.cosmetics.owned.filter(id=>id!=='acc_glass'&&id!=='acc_mirror_glass');game.scrap=2000;
  out.withoutGlass=game.craftSchematic('acc_mirror_glass');out.scrapKept=game.scrap;
  game.openCraftingTable();
  return out;`);
 assert.deepEqual(r.made,[true,true,true]);assert.equal(r.again,false);assert.equal(r.withoutGlass,false);assert.equal(r.scrapKept,2000);
 assert.ok(r.items.includes('mirror_blade')&&r.items.includes('blood_muzzle'));assert.equal(r.glass,true);
 assert.equal(r.scrap,2000-200-275-650);
});

test('Every attachment can be crafted even with a full bag; only two are worn',e=>{
 const r=value(e,setup+`game.scrap=5000;for(let i=0;i<game.inventory.capacity;i++)give('pistol_fpx');
  const made=['laser_sight','mirror_blade','blood_muzzle'].map(id=>game.craftSchematic(id));
  const gun=game.craftSchematic('golden_child');
  for(const id of ['laser_sight','mirror_blade','blood_muzzle'])game.inventory.equipItem(id);
  return {made,gun,worn:game.inventory.equippedAttachments.length};`);
 assert.deepEqual(r.made,[true,true,true]);assert.equal(r.gun,false);assert.equal(r.worn,2);
});

test('The Muzzle: bullets ×1.75; the Mirrored Glass: all damage ×1.35, stacking',e=>{
 const r=value(e,setup+`game.player._muzzleLocal={x:20,y:3};game.player._muzzleReady=true;
  const fire=()=>{game.shootCooldown=0;withRandom(.99,()=>game.fireWeapon());return game.projectiles.at(-1).damage;};
  wield('pistol_fpx');const base=fire();
  give('blood_muzzle');game.inventory.equipItem('blood_muzzle');const muzzle=fire();
  game.cosmetics.owned.push('acc_mirror_glass');game.cosmetics.equip('acc_mirror_glass');const both=fire();
  return {base,muzzle,both,mult:game.playerDamageMult()};`);
 assert.equal(r.muzzle,Math.round(r.base*1.75));assert.equal(r.both,Math.round(r.base*1.75*1.35));assert.equal(r.mult,1.35);
});

test('The Mirror Blade turns a shot its cut meets back at the shooter; without it the shot flies on',e=>{
 const r=value(e,setup+`const out={};
  for(const mirror of [false,true]){game.projectiles=[];game.enemies=[];game.inventory.items=[];game.inventory.equippedAttachments=[];
   wield('blood_pact');if(mirror){give('mirror_blade');game.inventory.equipItem('mirror_blade');}
   const g=ganger(1300,1000);game._slashSide=1;withRandom(.99,()=>game.meleeSlash());
   while(_gameTimeSec-game._slashT<WIDE_SWING.windup*game._slashSecs)tick();   // into the cut, then a shot comes in
   const p=shot(1120,1000,Math.PI,g);
   for(let i=0;i<20&&game._swing;i++)tick();
   out[mirror?'mirror':'plain']={enemy:p.isEnemy,vx:Math.sign(p.vx),owner:p.owner===game.player};}
  return out;`);
 assert.deepEqual(r.plain,{enemy:true,vx:-1,owner:false});assert.deepEqual(r.mirror,{enemy:false,vx:1,owner:true});
});

test('The Mirrored Glass shield turns shots until 90 damage, then recharges over 3 s',e=>{
 const r=value(e,setup+`game.cosmetics.owned.push('acc_mirror_glass');game.cosmetics.equip('acc_mirror_glass');
  const g=ganger(1300,1000),turned=[];
  for(let i=0;i<4;i++){const p=shot(1030,1000,Math.PI,g);tick();turned.push(!p.isEnemy);game.projectiles=[];}
  const spent=game.mirrorShield().spent;let n=0;while(game.mirrorShield().spent&&n<400){tick();n++;}
  const p=shot(1030,1000,Math.PI,g);tick();
  return {turned,spent,secs:n/60,after:!p.isEnemy,dmgHp:g.hp};`);
 assert.deepEqual(r.turned,[true,true,true,false]);assert.equal(r.spent,true);
 assert.ok(Math.abs(r.secs-3)<.1,String(r.secs));assert.equal(r.after,true);
});

test('Mirrored Glass is crafted, not sold, and draws as a silvered glass',e=>{
 const r=value(e,setup+`const before=game.cosmetics.buy('acc_mirror_glass',Object.assign(game,{currency:99999}));
  game.cosmetics.owned.push('acc_mirror_glass');game.cosmetics.equip('acc_mirror_glass');
  const held=game.cosmetics.getRenderConfig().held;
  return {before,held};`);
 assert.equal(r.before,false);assert.equal(r.held.type,'glass');assert.equal(r.held.mirror,true);
});

test('Golden Child: burn 8 a tick, scaled with the shot and its crit; burn ticks pass i-frames, so orbs stack',e=>{
 const r=value(e,setup+`game.player._muzzleLocal={x:20,y:3};game.player._muzzleReady=true;
  const fire=v=>{game.shootCooldown=0;withRandom(v,()=>game.fireWeapon());return game.projectiles.at(-1);};
  wield('golden_child');const base=fire(.99).dotDamage;
  give('blood_muzzle');game.inventory.equipItem('blood_muzzle');const muzzle=fire(.99).dotDamage,crit=fire(.01).dotDamage;
  const g=ganger(1300,1000);g.invincibleTimer=20;const hp=g.hp;
  const a=g.takeDamage(8,0,0,{type:'burn'}),b=g.takeDamage(8,0,0,{type:'burn'});
  return {base,muzzle,crit,landed:[a,b],lost:hp-g.hp,frames:g.invincibleTimer,maxOrbs:game.projectiles.at(-1).maxOrbs};`);
 assert.deepEqual(r,{base:8,muzzle:14,crit:28,landed:[true,true],lost:16,frames:20,maxOrbs:4});
});

test('Golden Child orbs: up to four live on one target, a fifth replaces the oldest',e=>{
 const r=value(e,setup+`const g=ganger(1300,1000),h=ganger(1400,1000);game.stickyOrbs=[];
  for(let i=0;i<5;i++)game.stickOrb(g,{maxOrbs:4,dotTicks:12,dotInterval:10,dotDamage:8+i});game.stickOrb(h,{maxOrbs:4,dotTicks:12,dotInterval:10,dotDamage:8});
  const on=game.stickyOrbs.filter(o=>o.target===g);return {n:on.length,dmg:on.map(o=>o.dotDamage),other:game.stickyOrbs.filter(o=>o.target===h).length};`);
 assert.deepEqual(r.dmg,[9,10,11,12]);assert.equal(r.other,1);
 assert.equal(r.n,4);
});

test('Blades: Crimson Edge cuts ×1.5 and bleeds five deep; Quick Hands and Reflex Sync quicken the swing',e=>{
 const r=value(e,setup+`const g=ganger(1030,1000);wield('maiden_kukri');
  const swing=()=>{const s=withRandom(.99,()=>game.meleeSlash());const cd=game.shootCooldown;while(game._swing===s)tick();return cd;};
  const hp0=g.hp;const cd0=swing();const plain=hp0-g.hp;
  give('crimson_edge');game.inventory.equipItem('crimson_edge');const hp1=g.hp;swing();const edged=hp1-g.hp;
  for(let i=0;i<6;i++){game.shootCooldown=0;swing();}
  game.resonance.ranks.quick_hands=3;game.augments.equipped.push('fast_reload');const cd1=swing();
  return {plain,edged,stacks:g._status.bleed.stacks,cd0,cd1};`);
 assert.equal(r.plain,28);assert.equal(r.edged,42);assert.equal(r.stacks,5);
 assert.equal(r.cd0,16);assert.equal(r.cd1,Math.max(2,Math.round(16*(1-0.24)*0.8)));
});

test('Blades: a cut heals 4% of its damage; mid-swing she takes 25% less; a Flit-cut always crits',e=>{
 const r=value(e,setup+`const g=ganger(1030,1000);wield('blood_pact');
  game.playerHealth=50;game.player.hp=50;game.player.maxHp=game.maxPlayerHealth=100;
  const s=withRandom(.99,()=>game.meleeSlash());
  const before=game.player.hp;game.player.invincibleTimer=0;game.player.takeDamage(20);const guarded=before-game.player.hp;
  while(game._swing===s)tick();const healedTo=game.player.hp;
  _gameTimeSec+=2;game.player.invincibleTimer=0;const b2=game.player.hp;game.player.takeDamage(20);const open=b2-game.player.hp;
  game.flitState.lastFlitAt=_gameTimeSec;const hp=g.hp;game.shootCooldown=0;const s2=withRandom(.99,()=>game.meleeSlash());while(game._swing===s2)tick();
  return {guarded,healed:healedTo-(before-guarded),open,flit:hp-g.hp};`);
 assert.equal(r.guarded,15);assert.equal(r.healed,2);assert.equal(r.open,20);assert.equal(r.flit,90);
});

console.log(JSON.stringify({passed:tests.length,tests},null,2));
