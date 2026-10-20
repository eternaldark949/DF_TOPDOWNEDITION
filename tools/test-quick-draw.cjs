#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
function test(name,code,check){const e=runtime(join(__dirname,'..','DFAB V8.html'),{events:true,timers:true});e.scope.dispatchEvent=e.dispatchWindow;const r=structuredClone(e.run(`(()=>{${setup}${code}})()`));check(r);assert.deepEqual(e.errors,[]);tests.push(name);}
const setup=`game._doLoadMap('ollo_test');game.running=true;game.paused=false;game.player.visible=true;
 game.currentWeapon=createItemFromRegistry('sniper_sara',game);game.weaponMode='sniper';game.shootCooldown=0;
 game.resonance.deserialize({level:50,points:0,ranks:{hollow_points:3,quick_draw:3,flit_strike:3,quick_hands:3}});
 _gameTimeSec=10;game.flitState.lastFlitAt=9.8;
 const tick=(n)=>{for(let i=0;i<n;i++){_gameTimeSec+=1/60;if(game.shootCooldown>0)game.shootCooldown--;game.updateQuickDraw();}};
 const touch=(type,x)=>{const F=game.fireJoystick, r=game.fireBtn.getBoundingClientRect();
 game.fireBtn.dispatchEvent({type,preventDefault(){},changedTouches:[{identifier:7,clientX:r.left+r.width/2+x,clientY:r.top+r.height/2}]});};
`;
test('Release draws once, preserves stacked damage bonuses, recovers and reholsters',`
 const armed=game.armQuickDraw();const holstered=game.weaponHolstered;game.fireWeapon();const heldShots=game.projectiles.length;
 const requested=game.requestQuickDraw(0);tick(6);const before=game.projectiles.length;tick(1);
 const shot=game.projectiles[0],cooldown=game.shootCooldown;tick(10);
 return {armed,holstered,heldShots,requested,before,count:game.projectiles.length,damage:shot.damage,cooldown,holsteredAfter:game.weaponHolstered,phase:game._quickDraw.phase};`,r=>{
 assert.deepEqual(r,{armed:true,holstered:true,heldShots:0,requested:true,before:0,count:1,damage:347,cooldown:71,holsteredAfter:true,phase:'ready'});
});
test('Recovery releases are discarded and tapping out of the mode cannot bypass cooldown',`
 game.armQuickDraw();game.requestQuickDraw(0);tick(17);const early=game.requestQuickDraw(1);
 const left=game.shootCooldown;game.cancelQuickDraw();game.setWeaponHolstered(false);const after=game.shootCooldown;
 return {early,left,after,count:game.projectiles.length};`,r=>{assert.equal(r.early,false);assert.ok(r.left>0);assert.equal(r.left,r.after);assert.equal(r.count,1);});
test('Touch quick draw forces release firing even when ordinary aim/release settings are disabled',`
 GameSettings.aimBeforeFire=false;GameSettings.sniperRelease=false;game.armQuickDraw();
 touch('touchstart',0);touch('touchmove',90);const armed=game.fireJoystick.armed,heldShots=game.projectiles.length;
 touch('touchend',90);tick(17);const first=game.projectiles.length;
 // Remembered aim must not arm a fresh quick draw without a new drag.
 tick(100);touch('touchstart',0);touch('touchend',0);tick(17);
 return {armed,heldShots,first,final:game.projectiles.length};`,r=>{assert.deepEqual(r,{armed:true,heldShots:0,first:1,final:1});});
test('Dragging back inside the ring and touch cancellation never fire',`
 game.armQuickDraw();touch('touchstart',0);touch('touchmove',90);touch('touchmove',10);touch('touchend',10);tick(20);
 touch('touchstart',0);touch('touchmove',90);touch('touchcancel',90);tick(20);
 return {count:game.projectiles.length,phase:game._quickDraw.phase,release:game._releaseShot};`,r=>{assert.deepEqual(r,{count:0,phase:'ready',release:null});});
test('Pause cancels the pending shot but preserves quick draw mode and flit charge',`
 game.armQuickDraw();const charge=game.flitState.attunement;game.requestQuickDraw(0);tick(3);
 game.pauseSystem.acquire('test');game.pauseSystem.release('test');tick(20);
 return {active:!!game._quickDraw,count:game.projectiles.length,charge:game.flitState.attunement,expected:charge,holstered:game.weaponHolstered};`,r=>{assert.equal(r.active,true);assert.equal(r.count,0);assert.equal(r.charge,r.expected);assert.equal(r.holstered,true);});
test('Weapon swaps and map changes cancel an unfinished draw',`
 game.armQuickDraw();game.requestQuickDraw(0);game.currentWeapon=createItemFromRegistry('pistol_fpx',game);tick(8);
 const swap=!!game._quickDraw;game.weaponMode='normal';game.armQuickDraw();game.requestQuickDraw(0);game._doLoadMap('apt_949');tick(8);
 return {swap,map:!!game._quickDraw,count:game.projectiles.length};`,r=>{assert.deepEqual(r,{swap:false,map:false,count:0});});
test('Quick draw is available only on foot with a firearm, and holstered normal fire stays quiet',`
 game.isDriving=true;const driving=game.armQuickDraw();game.isDriving=false;game.weaponMode='melee';const melee=game.armQuickDraw();
 game.weaponMode='sniper';game.setWeaponHolstered(true);game.fireWeapon();return {driving,melee,count:game.projectiles.length};`,r=>{assert.deepEqual(r,{driving:false,melee:false,count:0});});
test('Desktop press aims without firing and release requests exactly one shot',`
 game.armQuickDraw();game.canvas.dispatchEvent({type:'mousedown',button:0,clientX:150,clientY:100});
 const held=game.projectiles.length;window.dispatchEvent({type:'mouseup',button:0,clientX:150,clientY:100});tick(17);
 return {held,count:game.projectiles.length,down:game.mouseDown};`,r=>{assert.deepEqual(r,{held:0,count:1,down:false});});
test('New game clears quick draw and restores ordinary drawn controls',`
 game.armQuickDraw();game.requestQuickDraw(0);game.resetGameState();
 return {quick:!!game._quickDraw,holstered:game.weaponHolstered,mode:game.weaponMode,fire:game.fireBtn.style.display};`,r=>{
 assert.deepEqual(r,{quick:false,holstered:false,mode:'none',fire:'flex'});
});
{
 const e=runtime(join(__dirname,'..','DFAB V8.html'),{events:true,timers:true});
 e.run(`(()=>{${setup}
 game.holsterBtn.dispatchEvent({type:'pointerdown',pointerId:1,button:0,preventDefault(){},stopPropagation(){}});
 })()`);
 const hold=e.pendingTimers.find(t=>t.ms===450);assert.ok(hold);hold.f();
 e.run(`game.holsterBtn.dispatchEvent({type:'pointerup',pointerId:1,preventDefault(){}})`);
 assert.equal(e.run('!!game._quickDraw&&game.weaponHolstered'),true);
 e.run(`game.holsterBtn.dispatchEvent({type:'pointerdown',pointerId:2,button:0,preventDefault(){},stopPropagation(){}});
 game.holsterBtn.dispatchEvent({type:'pointerup',pointerId:2,preventDefault(){}});`);
 assert.equal(e.run('!game._quickDraw&&!game.weaponHolstered'),true);
 assert.deepEqual(e.errors,[]);tests.push('Hold enters the mode without toggling on release; next tap returns to normal drawn fire');
}
console.log(JSON.stringify({passed:tests.length,tests},null,2));
