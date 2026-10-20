#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});fn(e);assert.deepEqual(e.errors,[]);tests.push(name);}
test('Garden approaches, chamber arch, all rooms, wave spawns and boss position remain traversable',e=>{
 const r=value(e,`
 game._doLoadMap('demoness_palace');const nav=NavGrid.for(game.activeMap),entry=GAUNTLET_MAPS.find(g=>g.id==='demoness_palace');
 const points=[[450,260],[1145,200],[1590,310],[150,700],[1050,700],[1500,700],[300,1250],[900,1320],[1500,1300]];
 return {points:points.map(p=>({p,clear:nav.walkable(...p),route:!!nav.findPath(900,1320,...p)})),
 spawns:entry.spawns.map(p=>nav.walkable(...p)),boss:nav.walkable(900,480),arch:nav.lineWalkable(850,190,930,190),
 exit:game.activeMap.transitions[0].target};`);
 assert.ok(r.points.every(p=>p.clear&&p.route),JSON.stringify(r.points));assert.ok(r.spawns.every(Boolean));assert.equal(r.boss,true);assert.equal(r.arch,true);assert.equal(r.exit,'hub_949');
});
test('Garden thickets share retained flower records and glow canvases across warm frames',e=>{
 const r=value(e,`
 game._doLoadMap('demoness_palace');const beds=game.props.filter(p=>p.decorType==='dp_roses'),ctx=game.ctx;
 for(const p of beds){drawPalaceDecorProp(ctx,p);palaceFlowerGlow(ctx,p,0);}
 const flowers=beds.map(p=>p._palaceFlowers),glows=beds.map(p=>p._flowerGlow);
 let allocations=0;const create=document.createElement;document.createElement=function(tag){if(tag==='canvas')allocations++;return create.call(this,tag);};
 for(let i=0;i<40;i++)for(const p of beds)palaceFlowerGlow(ctx,p,i/60);
 document.createElement=create;
 return {beds:beds.length,blooms:flowers.flat().filter(f=>f.blood).length,allocations,
 retained:beds.every((p,i)=>p._palaceFlowers===flowers[i]&&p._flowerGlow===glows[i]),pixels:glows.reduce((n,c)=>n+c.width*c.height,0)};`);
 assert.ok(r.beds>=6&&r.blooms>=45);assert.equal(r.allocations,0);assert.equal(r.retained,true);assert.ok(r.pixels<150000);
});
test('The lit approach and shadow gallery retain distinct player visibility',e=>{
 const r=value(e,`
 game._doLoadMap('demoness_palace');game.player.x=900;game.player.y=1320;game.calculatePlayerVisibility();const entrance=game.player.visibility;
 game.player.x=1500;game.player.y=700;game.calculatePlayerVisibility();
 return {entrance,gallery:game.player.visibility,hidden:game.player.isHidden,darkness:game.getAmbientDarkness()};`);
 assert.ok(r.entrance>.3,JSON.stringify(r));assert.ok(r.gallery<.3,JSON.stringify(r));assert.equal(r.hidden,true);assert.equal(r.darkness,.88);
});
test('Hunters still perceive a hidden player without altering the player stealth state',e=>{
 const r=value(e,`
 game._doLoadMap('demoness_palace');const h=new Hunter(1450,700),p=game.player;p.x=1500;p.y=700;p.isHidden=true;p.visibility=0;
 const old=Ganger.prototype.update;let seen;Ganger.prototype.update=function(player){seen={hidden:player.isHidden,visibility:player.visibility};return null;};
 h.update(p,game.activeMap.walls,[],[],null,game.activeMap,[]);Ganger.prototype.update=old;
 return {seen,playerHidden:p.isHidden,playerVisibility:p.visibility,nightVision:h.nightVision};`);
 assert.deepEqual(r,{seen:{hidden:false,visibility:.55},playerHidden:true,playerVisibility:0,nightVision:true});
});
test('Living hunters retain paired eye cues while dead hunters and non-hunters do not emit them',e=>{
 const r=value(e,`
 game._doLoadMap('demoness_palace');const h=new Hunter(1400,700),dead=new Hunter(1450,700),civilian=new Ganger(1500,700);dead.dead=true;
 game.enemies=[h,dead,civilian];let dots=0;const arc=game.ctx.arc;game.ctx.arc=function(x,y,r,...rest){if(r===1.1)dots++;return arc.call(this,x,y,r,...rest);};
 game.drawHunterEyes(game.ctx);game.ctx.arc=arc;return {dots,alpha:game.ctx.globalAlpha,mode:game.ctx.globalCompositeOperation};`);
 assert.deepEqual(r,{dots:2,alpha:1,mode:'source-over'});
});
test('Palace floor bakes are bounded, retained and released when leaving',e=>{
 const r=value(e,`
 game._doLoadMap('demoness_palace');game.drawPalaceInterior(game.ctx);const first=game._palaceFloor;
 for(let i=0;i<4;i++)game.drawPalaceInterior(game.ctx);const retained=game._palaceFloor===first;
 game._doLoadMap('apt_949');const released=game._palaceFloor===null;
 game._doLoadMap('demoness_palace');game.drawPalaceInterior(game.ctx);
 return {retained,released,replaced:game._palaceFloor!==first,size:[game._palaceFloor.width,game._palaceFloor.height]};`);
 assert.deepEqual(r,{retained:true,released:true,replaced:true,size:[1800,1400]});
});
console.log(JSON.stringify({passed:tests.length,tests},null,2));
