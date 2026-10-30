#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
function test(name,code,check){const e=runtime(join(__dirname,'..','DFAB V8.html'),{capture:true,affine:true});const r=structuredClone(e.run(`(()=>{${setup}${code}})()`));check(r);assert.deepEqual(e.errors,[]);tests.push(name);}
const setup=`game._doLoadMap('ollo_test');game.running=true;game.paused=false;game.player.visible=true;
 game.activeMap={id:'fire_test',width:3000,height:3000,walls:[],buildings:[],buildingColliders:[]};
 game.player.x=1000;game.player.y=1000;game.player.angle=-.5;game.player._muzzleLocal={x:20,y:3};game.player._muzzleReady=true;
 game.currentWeapon=createItemFromRegistry('sniper_sara',game);game.weaponMode='sniper';game.shootCooldown=0;
 game.rollCrit=()=>1;// crits are random (engine/combat-fx.js); these compare exact damage
 game.car.x=1000;game.car.y=1000;game.car.angle=0;game.car.length=100;
 _zoomLOD=0;game.weaponHolstered=false;game.projectiles=[];game.muzzleFlashes=[];game.shotFx=[];game.casings=[];
 const fire=(id,drive)=>{game.currentWeapon=createItemFromRegistry(id,game);game.weaponMode=id.startsWith('sniper')?'sniper':'normal';
 game.isDriving=drive;game.shootCooldown=0;game.fireWeapon();const p=game.projectiles.at(-1);
 return {damage:p.damage,life:p.life,color:p.color,speed:Math.hypot(p.vx,p.vy),sniper:p.isSniper,trail:p.fxTrail?.trail,flash:game.muzzleFlashes.at(-1).color};};
`;
for(const id of ['pistol_anavia','sniper_sara','sniper_sr86','golden_child']){
 test(`${id}: walking and driving share projectile stats and signature effects`,`
 const foot=fire('${id}',false),drive=fire('${id}',true);return {foot,drive};`,r=>{
 assert.ok(Math.abs(r.drive.speed-r.foot.speed)<1e-9);delete r.drive.speed;delete r.foot.speed;assert.deepEqual(r.drive,r.foot);if(id==='pistol_anavia')assert.equal(r.drive.trail,'crackle');if(id==='golden_child')assert.equal(r.drive.trail,'wisp');
 });
}
test('Drive-by shot and muzzle flash start at shared scope/laser geometry, ignoring stale foot pose',`
 game.isDriving=true;game.player._muzzleLocal={x:999,y:999};const g=game.getPlayerShotGeometry();game.fireWeapon();const p=game.projectiles.at(-1),flash=game.muzzleFlashes.at(-1);
 return {g,shot:{x:p.x,y:p.y,angle:p.angle},flash:{x:flash.x,y:flash.y,angle:flash.angle}};`,r=>{
 assert.deepEqual(r.shot,r.g);assert.deepEqual(r.flash,r.g);assert.ok(Math.hypot(r.g.x-1000,r.g.y-1000)<110);
});
test('Driver-window restriction applies to bullets and sight geometry from any aim source',`
 game.isDriving=true;game.player.angle=Math.PI/3;const g=game.getPlayerShotGeometry();game.fireWeapon();const p=game.projectiles.at(-1);
 return {g,angle:p.angle};`,r=>{assert.ok(Math.abs(r.g.angle+Math.PI/36)<1e-9);assert.equal(r.angle,r.g.angle);});
test('Scope engages while driving, even if the on-foot gun was holstered',`
 game.isDriving=true;game.weaponHolstered=true;Object.assign(game.fireJoystick,{active:true,aimed:true,armed:false,dx:1,dy:-1});
 const on=game.isScoping();game.updateScope();const k=game.scopeK;game.fireJoystick.active=false;const off=game.isScoping();return {on,k,off};`,r=>{
 assert.equal(r.on,true);assert.ok(r.k>0);assert.equal(r.off,false);
});
test('Laser sight uses the same vehicle muzzle and direction as a projectile',`
 game.isDriving=true;game.inventory.hasAttachment=e=>e==='laser_sight';game._laserKey=null;
 const g=game.getPlayerShotGeometry(),laser=game.getLaserSight();return {g,laser};`,r=>{
 assert.equal(r.laser.x0,r.g.x);assert.equal(r.laser.y0,r.g.y);assert.equal(r.laser.angle,r.g.angle);
});
test('One input path aims inside the ring and releases exactly one shot in both contexts',`
 const out=[];for(const drive of [false,true]){
 game.isDriving=drive;game.player._vehicleLean=1;game.shootCooldown=0;game.projectiles=[];Object.assign(game.fireJoystick,{active:true,aimed:true,armed:false,firing:false,dx:1,dy:-1});
 game.updatePlayerFireInput();const held=game.projectiles.length,lean=game.isShootingFromCar;
 game.fireJoystick.active=false;game._releaseShot=-Math.PI/4;game.updatePlayerFireInput();game.updatePlayerFireInput();
 out.push({held,count:game.projectiles.length,angle:game.projectiles[0].angle,lean});}return out;`,r=>{
 assert.deepEqual(r,[{held:0,count:1,angle:-Math.PI/4,lean:false},{held:0,count:1,angle:-Math.PI/4,lean:true}]);
});
test('A barrel against a wall cannot spawn a drive-by shot on the far side',`
 game.isDriving=true;game.player.angle=0;game.activeMap.walls=[{x:1020,y:960,w:10,h:80}];const g=game.getPlayerShotGeometry();game.fireWeapon();const p=game.projectiles[0];return {g,x:p.x,y:p.y,seat:game.car.getSeatWorldPos(0)};`,r=>{
 assert.equal(r.x,r.seat.x);assert.equal(r.y,r.seat.y);assert.equal(r.g.x,r.seat.x);assert.equal(r.g.y,r.seat.y);
});
test('Consecutive punches land at their normal cadence and each hitbox hits only once',`
 game.story.update=()=>{};
 game.weaponMode='none';game.currentWeapon=null;game.isDriving=false;game.player.angle=0;game._execTarget=null;
 game.mouseDown=false;game._releaseShot=null;game.fireJoystick.active=false;game.enemies=[];
 const target=new Ganger(1040,1000,{hp:5000});game.enemies.push(target);
 target.update=()=>{if(target.invincibleTimer>0)target.invincibleTimer--;};
 let interrupts=0;target.interruptMelee=()=>interrupts++;
 const remaining=[];
 for(let i=0;i<60;i++){
  game.player.x=game.player.y=1000;game.player.angle=0;target.x=1040;target.y=1000;
  target.knockbackVx=target.knockbackVy=0;
  if(i%CONFIG.PUNCH.DURATION_TICKS===0)game.fireWeapon();
  game.update();
  if(i%CONFIG.PUNCH.DURATION_TICKS===5)remaining.push(target.hp);
 }
 return {remaining,interrupts,frames:target.invincibleTimer,projectiles:game.projectiles.length};`,r=>{
 assert.deepEqual(r.remaining,[4985,4970,4955,4940]);assert.equal(r.interrupts,4);
 assert.equal(r.frames,0);assert.equal(r.projectiles,0);
});
test('Enemy projectile callbacks accept normal and critical punches inside existing i-frames',`
 game.weaponMode='none';game.currentWeapon=null;game.isDriving=false;game.player.angle=0;
 const out=[];
 for(const Enemy of [Ganger,Drone,GatlingGunner])for(const speed of [0,10]){
  const target=new Enemy(1300,1000);target.hp=target.maxHp=5000;target.invincibleTimer=20;
  if(target instanceof Drone){target.alt=0;target.state='hover';target.eyePos=()=>({x:-1e9,y:-1e9});}   // landed, hit on the shell (armored)
  let interrupts=0;target.interruptMelee=()=>interrupts++;
  for(const crit of [1,2]){
   game.rollCrit=()=>crit;game.fireWeapon();const p=game.projectiles.pop();p.vx=speed;p.vy=0;
   target.onProjectileHit(p,game);p.destroy();
  }
  out.push({drone:target instanceof Drone,lost:5000-target.hp,frames:target.invincibleTimer,melee:target.lastHitMelee,by:target.lastHitBy===game.player,interrupts});
 }
 return out;`,r=>{
 assert.equal(r.length,6);
 for(const result of r){if(result.drone)assert.ok(result.lost>0&&result.lost<45,'the drone shell takes a share');else assert.equal(result.lost,45);assert.equal(result.frames,20);assert.equal(result.melee,true);assert.equal(result.by,true);}
 assert.equal(r[0].interrupts,2);assert.equal(r[1].interrupts,2);
});
test('Punches preserve existing i-frames while repeated contact damage is still blocked',`
 const target=new Ganger(1300,1000,{hp:500});
 const contact=target.takeDamage(10),blocked=target.takeDamage(10);
 const punch=target.takeDamage(15,0,0,{punch:true});
 const stillBlocked=target.takeDamage(10),frames=target.invincibleTimer;
 target.invincibleTimer=0;target.takeDamage(15,0,0,{punch:true});
 return {contact,blocked,punch,stillBlocked,frames,after:target.invincibleTimer,hp:target.hp};`,r=>{
 assert.deepEqual(r,{contact:true,blocked:false,punch:true,stillBlocked:false,frames:20,after:0,hp:460});
});
console.log(JSON.stringify({passed:tests.length,tests},null,2));
