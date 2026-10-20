#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
function test(name,source,check){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});const r=structuredClone(e.run(`(()=>{game._doLoadMap('ollo_test');game.running=true;game.paused=false;${source}})()`));check(r);assert.deepEqual(e.errors,[]);tests.push(name);}
test('Every vehicle cabin gives finite window/seat poses, correct outward arcs and cached layer sprites',`
 const rows=[];for(const [brand,def] of Object.entries(VEHICLE_BRANDS))for(const model of Object.keys(def.models)){
 const c=new TrafficVehicle(null,brand,model,'PLAYER');c.x=500;c.y=500;c.angle=.7;
 const windows=c.occupantWindows(),layers=c.occupantLayers();let valid=true;
 for(let i=0;i<c.seats;i++){const seat=c.seatLayout[i],a=c.angle+(seat.side==='left'?-Math.PI/2:Math.PI/2),p=c.occupantPose(i,a,1,'sniper_sara'),s=c.occupantShot(i,a,1,'sniper_sara');
 valid=valid&&c.isAngleValidForSeat(i,a)&&!c.isAngleValidForSeat(i,a+Math.PI)&&[p.gripX,p.gripY,s.x,s.y].every(Number.isFinite)&&windows.windows[i].half>0;
 }
 rows.push({brand,model,valid,cached:layers===c.occupantLayers(),different:layers.lower!==layers.upper});
 }return rows;`,rows=>{assert.ok(rows.length>=6);for(const r of rows){assert.ok(r.valid,JSON.stringify(r));assert.ok(r.cached);assert.ok(r.different);}});
test('Left and right window poses mirror their grip and muzzle and remain outside the body',`
 const c=game.car;c.angle=0;c.x=500;c.y=500;const a=c.occupantPose(0,-Math.PI/2,1,'sniper_sara'),b=c.occupantPose(1,Math.PI/2,1,'sniper_sara');
 return {a,b,width:c.width};`,r=>{assert.ok(Math.abs(r.a.gripY+r.b.gripY)<1e-8);assert.ok(r.a.muzzleY<-r.width/2);assert.ok(r.b.muzzleY>r.width/2);assert.equal(r.a.driver,true);assert.equal(r.b.driver,false);});
test('Soft aim approaches the boundary continuously and retains its end across the opposite door',`
 const c=game.car;c.angle=0;let old=-.2;const angles=[];
 for(let deg=-20;deg<=120;deg++){const a=c.seatAim(0,deg*Math.PI/180,old,true);angles.push(a);old=a;}
 return angles;`,angles=>{for(let i=0;i<angles.length;i++){assert.ok(angles[i]>=-Math.PI+Math.PI/36-1e-9&&angles[i]<=-Math.PI/36+1e-9);if(i)assert.ok(Math.abs(angles[i]-angles[i-1])<.03);}});
test('Passenger ignores a closer enemy through the wrong door and fires from the visible equipped barrel',`
 const c=game.car;c.x=500;c.y=500;c.angle=0;
 const n=new NPC(500,500,'Seat test','teammate');n.equippedWeaponId='sniper_sara';n.cooldown=0;c.assignPassenger(n);
 const p=c.getSeatWorldPos(n.seatIndex),bad={x:p.x,y:p.y-30,dead:false},good={x:p.x,y:p.y+200,dead:false};
 let shot=null;for(let i=0;i<20&&!shot;i++)shot=n.updateVehicleCombat(c,[bad,good],game);
 const expected=c.occupantShot(n.seatIndex,n.combatTargetAngle,n._vehicleLean,n.equippedWeaponId);
 return {shot:shot&&{x:shot.x,y:shot.y},expected:{x:expected.x,y:expected.y},seat:p,actor:{x:n.x,y:n.y},angle:n.combatTargetAngle};`,r=>{assert.ok(r.shot);assert.deepEqual(r.shot,r.expected);assert.deepEqual(r.actor,r.seat);assert.ok(r.angle>0);});
test('A fresh driver shot waits for the lean while release remains a single queued shot',`
 game.isDriving=true;game.player._vehicleLean=0;game.currentWeapon=createItemFromRegistry('sniper_sara',game);game.weaponMode='sniper';game.weaponHolstered=false;game.shootCooldown=0;game.projectiles=[];
 game._releaseShot=game.car.angle-Math.PI/2;let before;
 for(let i=0;i<7;i++){if(i===6)before=game.projectiles.length;game.updatePlayerFireInput();}
 return {before,count:game.projectiles.length,release:game._releaseShot,lean:game.player._vehicleLean};`,r=>{assert.equal(r.before,0);assert.equal(r.count,1);assert.equal(r.release,null);assert.ok(r.lean>.7);});
test('Player and crew seated drawing use valid Canvas state, with both windows and equipped weapons',`
 const c=game.car;c.hasDriver=true;c.visible=true;game.isDriving=true;game.player._vehicleLean=1;game.currentWeapon=createItemFromRegistry('sniper_sara',game);game.weaponMode='sniper';
 game.player.angle=c.angle-Math.PI/2;Object.assign(game.player,c.getSeatWorldPos(0));
 const before=game.ctx.getTransform();c.draw(game.ctx);game.drawPlayer();
 const n=new NPC(0,0,'Seat test','teammate');c.assignPassenger(n);n._vehicleLean=1;n.equippedWeaponId='rifle_rb98';
 const pose=c.occupantPose(1,c.angle+Math.PI/2,1,n.equippedWeaponId),p=c.getSeatWorldPos(1);
 game.ctx.save();c.clipOccupant(game.ctx,1);game.ctx.translate(p.x,p.y);game.ctx.rotate(c.angle);
 drawProceduralHumanoid(game.ctx,n,{gender:'female',isDriving:true,vehiclePose:pose,height:VEHICLE_OCCUPANT_SCALE});game.ctx.restore();c.drawOccupantOverlay(game.ctx);
 const after=game.ctx.getTransform();return {before,after};`,r=>assert.deepEqual(r.after,r.before));
console.log(JSON.stringify({passed:tests.length,tests},null,2));
