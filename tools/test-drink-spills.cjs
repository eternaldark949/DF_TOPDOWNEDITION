#!/usr/bin/env node
'use strict';
// Drink spills (engine/spills.js): her glass drains a little on a hard turn, a Flit or a hit, leaves a puddle the
// drink's colour that splashes underfoot, and the bar cart at home tops it back up; the level saves.
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});fn(e);assert.deepEqual(e.errors,[]);tests.push(name);}
const setup=`game._doLoadMap('ollo_test');game.running=true;game.paused=false;game.player.visible=true;game.isDriving=false;
 game.player._game=game;game.player.x=1000;game.player.y=1000;game.spills=[];_gameTimeSec=10;
 game.cosmetics.equippedAccessory='acc_glass';game.cosmetics.setAccessoryOption('acc_glass','drink','red_wine');game.cosmetics.drinkLevel=1;
 const step=(vx,vy)=>{_simTick++;_gameTimeSec+=1/60;game.player.velX=vx;game.player.velY=vy;game.updateSpills();};`;

test('Walking, stopping and a right-angle turn keep the drink; a reversal spills a little',e=>{
 const r=value(e,setup+`for(let i=0;i<10;i++)step(1,0);step(0,0);step(0,0);step(1,0);step(0,1);
  const calm=game.cosmetics.drinkLevel;step(0,-1);
  return {calm,after:game.cosmetics.drinkLevel,n:game.spills.length,color:game.spills[0]&&game.spills[0].color};`);
 assert.equal(r.calm,1);
 assert.ok(r.after<1&&r.after>0.93,`a reversal costs a few percent (${r.after})`);
 assert.equal(r.n,1);
 assert.equal(r.color,'#6a0c20','the puddle is the red wine');
});

test('Spills are spaced out, so zig-zagging drains slowly, and a dry glass spills nothing',e=>{
 const r=value(e,setup+`let flips=0;for(let i=0;i<60;i++){step(i%2?1:-1,0);flips++;}
  const second=game.cosmetics.drinkLevel;game.cosmetics.drinkLevel=0;game.spills=[];_gameTimeSec+=5;step(1,0);step(-1,0);
  return {second,dry:game.spills.length};`);
 assert.ok(r.second>0.8,`a second of frantic zig-zag leaves most of the glass (${r.second})`);
 assert.equal(r.dry,0);
});

test('A hit spills more the harder it lands; no glass, no spill',e=>{
 const r=value(e,setup+`game.player.hp=100;game.player.invincibleTimer=0;game.player.takeDamage(10);const small=1-game.cosmetics.drinkLevel;
  _gameTimeSec+=1;game.cosmetics.drinkLevel=1;game.player.takeDamage(40);const big=1-game.cosmetics.drinkLevel;
  _gameTimeSec+=1;game.cosmetics.equippedAccessory=null;const n=game.spills.length;game.player.takeDamage(40);
  return {small,big,same:game.spills.length===n};`);
 assert.ok(r.small>0&&r.big>r.small,`${r.small} < ${r.big}`);
 assert.ok(r.big<=0.07);
 assert.ok(r.same);
});

test('A puddle splashes underfoot, then dries',e=>{
 const r=value(e,setup+`game.spillDrink(0.05,1,0);const s=game.spills[0];const wet=game.materialAt(s.x,s.y);
  _gameTimeSec+=200;game.drawSpills({save(){},restore(){},beginPath(){},arc(){},moveTo(){},fill(){},ellipse(){},stroke(){}},null);
  return {wet,left:game.spills.length,dryNow:game._inSpill(s.x,s.y)};`);
 assert.equal(r.wet,'water');
 assert.equal(r.left,0);
 assert.equal(r.dryNow,false);
});

test('The glass shows its level, the bar cart tops it up, and the level saves',e=>{
 const r=value(e,setup+`game.cosmetics.drinkLevel=0.4;const held=game.cosmetics.getRenderConfig().held.level;
  const ok=game.refillGlass();const full=game.cosmetics.drinkLevel;game.cosmetics.drinkLevel=0.3;
  const C=new CosmeticsSystem();C.deserialize(JSON.parse(JSON.stringify(game.cosmetics.serialize())));
  const old=new CosmeticsSystem();const d=game.cosmetics.serialize();delete d.drinkLevel;old.deserialize(d);
  return {held,ok,full,saved:C.drinkLevel,old:old.drinkLevel};`);
 assert.equal(r.held,0.4);assert.ok(r.ok);assert.equal(r.full,1);assert.equal(r.saved,0.3);assert.equal(r.old,1);
});

test('The apartment has a bar cart',e=>{
 const r=value(e,`game._doLoadMap('apt_949');const p=game.props.find(p=>p.interactionType==='bar_cart');return p&&[p.decorType,PROP_ACTIONS.bar_cart[0]];`);
 assert.deepEqual(r,['apt_bar_cart','Pour']);
});

console.log(`test-drink-spills: ${tests.length} passed`);
