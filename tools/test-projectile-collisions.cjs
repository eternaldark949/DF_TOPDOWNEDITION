#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const setup=`game._doLoadMap('ollo_test');game.story.update=()=>{};game.running=true;game.paused=false;
 GameEntity.clearAll();game.player.reregister();game.props=[];game.npcs=[];game.enemies=[];game.projectiles=[];
 game._staticWallEntities=[];game._staticBuildingEntities=[];game.roomSystem.active=false;
 game.activeMap={id:'projectile_test',width:5000,height:5000,walls:[],buildings:[],buildingColliders:[]};
 game.player.x=1000;game.player.y=1000;game.player.angle=0;game.player.visible=true;game.player._game=game;
 game.player._muzzleLocal={x:20,y:0};game.player._muzzleReady=true;
 game.camera.x=1000;game.camera.y=1000;game.camera.zoom=1;game.isDriving=false;
 game.mouseDown=false;game.fireJoystick.active=false;game._releaseShot=null;game._execTarget=null;game.weaponHolstered=true;
 game.traffic.vehicles=[];game.ownedCar.visible=false;game.rollCrit=()=>1;Math.random=()=>.5;
 game.cosmetics.equippedAccessory=null;game.augments.equipped=[];game.resonance.ranks={};game.flitState.lastFlitAt=-99;
 const enemy=(x,y=1000)=>{const g=new Ganger(x,y,{hp:5000});g.update=()=>{};game.enemies.push(g);return g;};
 const bullet=(x=1000,y=1000,opts={})=>{const p=new ProjectileEntity({x,y,angle:0,speed:80,damage:100,owner:game.player,...opts});game.projectiles.push(p);return p;};
 const tick=()=>{_gameTimeSec+=1/60;game.update();};
 const clear=()=>{for(const e of game.enemies)e.destroy();for(const p of game.projectiles)p.destroy();game.enemies=[];game.projectiles=[];GameEntity.cleanup();};`;

function run(){
 const results=[];
 const test=(name,source,check)=>{
  try{const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});
   const r=structuredClone(e.run(`(()=>{${setup}${source}})()`));check(r);assert.deepEqual(e.errors,[]);
   results.push({name,status:'passed'});
  }catch(error){results.push({name,status:'failed',error:error.stack});}
 };
 test('Every registered gun hits across muzzle distances and spatial-cell boundaries',`
  const rows=[];
  for(const [id,w]of Object.entries(ITEM_REGISTRY).filter(([,w])=>w.type==='weapon'&&w.weaponMode!=='melee'&&w.weaponMode!=='fists'))
   for(const offset of [0,110,150,190,210])for(const fraction of [.25,.5,.9]){
    clear();game.weaponHolstered=false;game.currentWeapon=createItemFromRegistry(id,game);game.weaponMode=w.weaponMode;
    game.shootCooldown=0;game._drawnAt=undefined;game.fireWeapon();game.weaponHolstered=true;
    const p=game.projectiles.at(-1);p.x=1000+offset;p.y=1000;const g=enemy(p.x+w.stats.projectileSpeed*fraction);
    tick();rows.push({id,offset,fraction,lost:5000-g.hp,expected:w.stats.damage});
   }
  return rows;`,r=>{assert.equal(r.length,90);for(const row of r)assert.equal(row.lost,row.expected,JSON.stringify(row));});
 test('YourGirlSara sweeps a crossed cell and damages each target only once',`
  const g=enemy(1180);const p=bullet(1150,1000,{penetrating:true});tick();const first=g.hp;tick();
  return {first,after:g.hp,hits:p.hitTargets.size,active:p.active};`,r=>assert.deepEqual(r,{first:4900,after:4900,hits:1,active:true}));
 test('A long sniper barrel cannot spawn its shot beyond a point-blank enemy',`
  const g=enemy(1035);game.player._muzzleLocal={x:75,y:0};game.weaponHolstered=false;
  game.currentWeapon=createItemFromRegistry('sniper_sara',game);game.weaponMode='sniper';game.fireWeapon();
  const x=game.projectiles[0].x;tick();return {x,hp:g.hp};`,r=>assert.deepEqual(r,{x:1000,hp:4900}));
 test('A long sniper barrel cannot spawn beyond a solid prop',`
  new GameEntity({x:1040,y:1000,width:4,height:60,hasCollision:true,collisionShape:GameEntity.SHAPE.OBB,collisionLayer:GameEntity.LAYER.DYNAMIC});
  const g=enemy(1130);game.player._muzzleLocal={x:75,y:0};game.weaponHolstered=false;
  game.currentWeapon=createItemFromRegistry('sniper_sara',game);game.weaponMode='sniper';game.fireWeapon();
  const x=game.projectiles[0].x;tick();return {x,hp:g.hp};`,r=>assert.deepEqual(r,{x:1000,hp:5000}));
 test('Sniper hits remain reliable over long ranges, diagonals, and reversed directions',`
  const rows=[];
  for(const angle of [Math.PI,Math.PI/2,-Math.PI/2,Math.PI/4,-.6,2.5])for(const distance of [30,170,390,730,1200]){
   clear();const g=enemy(2500+Math.cos(angle)*distance,2500+Math.sin(angle)*distance);
   bullet(2500,2500,{angle,penetrating:true});let ticks=0;
   while(g.hp===5000&&ticks++<30)tick();rows.push({angle,distance,hp:g.hp});
  }return rows;`,r=>{assert.equal(r.length,30);for(const row of r)assert.equal(row.hp,4900,JSON.stringify(row));});
 test('Penetration hits the nearest targets first, regardless of enemy-array order',`
  const far=enemy(1070),middle=enemy(1050),near=enemy(1030);const p=bullet(1000,1000,{penetrating:true,maxPenetrations:2});tick();
  return {hp:[near.hp,middle.hp,far.hp],count:p.penetrateCount,active:p.active};`,r=>assert.deepEqual(r,{hp:[4900,4900,5000],count:2,active:false}));
 test('A nonpenetrating shot stops at its first enemy and records the impact position',`
  const far=enemy(1060),near=enemy(1030);const p=bullet();tick();return {hp:[near.hp,far.hp],x:p.x,active:p.active};`,r=>{
  assert.deepEqual(r.hp,[4900,5000]);assert.equal(r.active,false);assert.ok(Math.abs(r.x-1010)<1e-8);
 });
 test('Thin walls stop ordinary rounds in travel order, allowing hits before the wall',`
  const out=[];
  for(const [x,targetX]of [[1020,1070],[1050,1030]]){clear();game.activeMap.walls=[{x,y:980,w:4,h:40}];const g=enemy(targetX);const p=bullet();tick();out.push({hp:g.hp,active:p.active});}
  return out;`,r=>assert.deepEqual(r,[{hp:5000,active:false},{hp:4900,active:false}]));
 test('Rotated solid props block crossed shots, and rounded corners do not produce false hits',`
  const prop=new GameEntity({x:1040,y:1000,width:4,height:60,angle:Math.PI/4,mass:10,hasCollision:true,
   collisionLayer:GameEntity.LAYER.DYNAMIC,collisionShape:GameEntity.SHAPE.OBB});
  const g=enemy(1070);bullet();tick();
  const box={x:1040,y:1000,w:10,h:10},miss=bullet(1036,996),tangent=bullet(1037,996);
  return {hp:g.hp,pushed:prop.vx>0,miss:CollisionSystem.projectileHitTime(miss,box),tangent:CollisionSystem.projectileHitTime(tangent,box)};`,r=>{
  assert.equal(r.hp,5000);assert.equal(r.pushed,true);assert.equal(r.miss,null);assert.equal(r.tangent,0);
 });
 test('Moving enemies are tested at the matching time along the bullet path',`
  const out=[];
  for(const [startY,endY]of [[970,1030],[1060,1000]]){clear();const g=enemy(1040,startY);g.update=()=>{g.y=endY;};bullet();tick();out.push(g.hp);}
  return out;`,r=>assert.deepEqual(r,[4900,5000]));
 test('A newly spawned round cannot hit an enemy that crossed its muzzle before the shot existed',`
  const g=enemy(1040);g._projectileStartTick=_simTick;g._projectileStartX=960;g._projectileStartY=1000;
  const p=bullet();CollisionSystem.resolveProjectile(p,game);return g.hp;`,r=>assert.equal(r,5000));
 test('An enemy round hits a player crossing its path during the same tick',`
  game.player.syncHealth(100,100);game.player.invincibleTimer=0;game.player.x=1040;game.player.y=970;
  game.player.applyMovement=()=>{game.player.y=1030;};const owner=enemy(1600,1600);
  bullet(1000,1000,{isEnemy:true,owner,damage:10});tick();return game.player.hp;`,r=>assert.equal(r,90));
 test('A shot can hit on its last lifetime tick',`
  const g=enemy(1030);const p=bullet(1000,1000,{life:1});tick();return {hp:g.hp,active:p.active,left:game.projectiles.length};`,r=>assert.deepEqual(r,{hp:4900,active:false,left:0}));
 test('Removing a hit projectile does not silently remove a different live round',`
  enemy(1030);bullet();const survivor=bullet(1000,1200);tick();const count=game.projectiles.length;tick();
  return {count,same:game.projectiles[0]===survivor,active:survivor.active,x:survivor.x};`,r=>assert.deepEqual(r,{count:1,same:true,active:true,x:1160}));
 test('A custom impact that destroys a piercing shot stops further contacts',`
  const near=enemy(1030),far=enemy(1070);bullet(1000,1000,{penetrating:true,onHit(target,game,p){p.destroy();}});tick();
  return [near.hp,far.hp];`,r=>assert.deepEqual(r,[4900,5000]));
 test('Swept hits work outside the rendering and physics camera margin',`
  const g=enemy(2180);bullet(2150);tick();return g.hp;`,r=>assert.equal(r,4900));
 test('Enemy callbacks keep bullet i-frame bypass for stationary and moving rounds',`
  const out=[];
  for(const Enemy of [Ganger,Drone,GatlingGunner])for(const speed of [0,80]){
   const target=new Enemy(1300,1000);target.hp=target.maxHp=5000;target.invincibleTimer=20;
   if(target instanceof Drone){target.alt=0;target.state='hover';target.eyePos=()=>({x:-1e9,y:-1e9});}   // landed, hit on the shell (armored)
   for(let i=0;i<2;i++){const p=bullet(1000,1000,{speed:speed||1});p.vx=speed;p.vy=0;target.onProjectileHit(p,game);p.destroy();}
   out.push({hp:target.hp,frames:target.invincibleTimer,drone:target instanceof Drone});
  }return out;`,r=>{for(const row of r){assert.equal(row.frames,20);if(row.drone)assert.ok(row.hp<5000&&row.hp>4800,'the drone shell takes a share');else assert.equal(row.hp,4800);}});
 test('Doors are resolved in travel order and reduce only hits beyond a penetrated leaf',`
  const out=[];const event=ambience.doorEvent;ambience.doorEvent=()=>{};
  for(const [doorX,targetX,penetrating]of [[1050,1030,false],[1020,1070,false],[1050,1030,true],[1020,1070,true]]){
   clear();const g=enemy(targetX);let strikes=0;
   game.roomSystem.active=true;game.roomSystem.windows=[];
   game.roomSystem.doors=[{type:'hinged',halfThick:3,leaves:()=>[[doorX,980,doorX,1020]],strike(){strikes++;}}];
   const p=bullet(1000,1000,{penetrating});p.update(1,true);CollisionSystem.resolveProjectiles(game);
   out.push({hp:g.hp,strikes,active:p.active});
  }
  ambience.doorEvent=event;return out;`,r=>assert.deepEqual(r,[
   {hp:4900,strikes:0,active:false},{hp:5000,strikes:1,active:false},
   {hp:4900,strikes:1,active:true},{hp:4950,strikes:1,active:true}]));
 test('Glass at a wall surface shatters before the ordinary round stops there',`
  const pane={x:1040,y:980,w:2,h:40,shattered:false,tryShatter(){this.shattered=true;return true;}};
  game.activeMap.walls=[{x:1040,y:980,w:2,h:40}];game.roomSystem.active=true;
  game.roomSystem.doors=[];game.roomSystem.windows=[pane];const p=bullet();p.update(1,true);
  CollisionSystem.resolveProjectiles(game);return {shattered:pane.shattered,active:p.active};`,r=>assert.deepEqual(r,{shattered:true,active:false}));
 test('A swept Golden Child hit attaches one orb and preserves its damage snapshot',`
  const g=enemy(1180);const p=bullet(1150,1000,{sticky:true,dotDamage:28,dotTicks:12,dotInterval:10});tick();
  const atHit=g.hp,orbs=game.stickyOrbs.length,damage=game.stickyOrbs[0].dotDamage;
  for(let i=0;i<9;i++)tick();return {atHit,after:g.hp,orbs,damage};`,r=>assert.deepEqual(r,{atHit:4900,after:4872,orbs:1,damage:28}));
 test('A reused projectile clears its previous swept path and collision tick',`
  const old=bullet();old.lastX=100;old.lastY=100;old._projectileCollisionTick=_simTick;old._doorHits=new Set([{}]);
  ProjectileEntity.release(old);
  const p=ProjectileEntity.acquire({x:2000,y:1000,vx:80,vy:0,damage:100,owner:game.player});game.projectiles=[p];
  const before=p.lastX;const g=enemy(2030);p.update(1,true);CollisionSystem.resolveProjectiles(game);
  return {before,hp:g.hp,doors:p._doorHits};`,r=>assert.deepEqual(r,{before:undefined,hp:4900,doors:null}));
 test('Low render rates and capped catch-up preserve sniper collision hits',`
  const out=[];game.draw=()=>{};GameSettings.scopeSlow=false;
  for(const frameMs of [1000/60,100,250]){
   clear();game._lastLoopTime=0;game._accumulator=0;const g=enemy(1180);bullet(1150);
   let clock=0;performance.now=()=>clock;
   for(let i=0;i<8;i++){clock+=frameMs;game.loop();}
   out.push({frameMs,hp:g.hp});
  }return out;`,r=>{for(const row of r)assert.equal(row.hp,4900,JSON.stringify(row));});
 test('Props are found by cell: a far crate, a moved crate and a turned one still stop a shot',`
  const out=[];
  const prop=(x,y,w,h,angle=0)=>{const q=new PropEntity({x,y,width:w,height:h,mass:50,color:'#555'});q.angle=angle;return q;};
  for(const s of [[3000,980,40,40],[4600,990,10,20],[1500,960,6,80,0.7]]){
   clear();const q=prop(...s);const p=bullet(s[0]-100);
   for(let i=0;i<3&&p.active;i++){_simTick++;p.update(1,true);CollisionSystem.resolveProjectiles(game);}
   out.push({at:s[0],stopped:!p.active});q.destroy();GameEntity.cleanup();
  }
  clear();const q=prop(2000,980,40,40);const p=bullet(1800);_simTick++;p.update(1,true);CollisionSystem.resolveProjectiles(game);   // bucketed this tick at 2000
  _simTick++;q.x=1900;p.update(1,true);CollisionSystem.resolveProjectiles(game);                                        // pushed into the path next tick
  out.push({at:'moved',stopped:!p.active});
  return out;`,r=>{for(const row of r)assert.equal(row.stopped,true,JSON.stringify(row));});
 return results;
}
module.exports={run};
if(require.main===module){const results=run(),failures=results.filter(r=>r.status==='failed');console.log(JSON.stringify({passed:results.length-failures.length,failed:failures.length,results},null,2));if(failures.length)process.exitCode=1;}
