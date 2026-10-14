#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync(path.join(__dirname,'../DFAB WebGL.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:880,height:411}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.goto('http://127.0.0.1:'+server.address().port);


 await page.evaluate(()=>{game.loop=()=>{};document.getElementById('btn-native-city').click();const c=game.ownedCar||game.car;c.x=1200;c.y=550;c.angle=.4;c.visible=true;game.player.x=c.x;game.player.y=c.y+35;game.enterCar(c);game.update();game.draw();});
 const entered=await page.evaluate(()=>{
  const r=game.nativeRenderer,c=game.car,t=PIXI.RenderTexture.create({width:256,height:256});
  const transform=new PIXI.Matrix(1,0,0,1,128-c.x,128-c.y);r.renderer.render(r.occupantContext.root,{renderTexture:t,clear:true,transform});
  const data=r.renderer.extract.pixels(t);t.destroy(true);let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i]>128)pixels++;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');ctx.translate(128-c.x,128-c.y);c.drawOccupantOverlay(ctx);
  const original=ctx.getImageData(0,0,256,256).data;let intersection=0,union=0;for(let i=3;i<data.length;i+=4){const a=data[i]>128,b=original[i]>128;if(a&&b)intersection++;if(a||b)union++;}
  const state={driving:game.isDriving,pixels,iou:intersection/union,paths:r.occupantContext.pathsPainted,stage:r.drivenCarStage.visible,sorted:r.drivenCarStage.parent===r.peopleContext.root,driverBeforeRoof:r.drivenCarStage.getChildIndex(r.playerSprite)<r.drivenCarStage.getChildIndex(r.occupantContext.root)};
  const run=depth=>{r.setLayers({depthSort:depth});for(let i=0;i<12;i++){_frameTime+=17;c.x+=1;game.update();game.draw();}return {visible:r.drivenCarStage.visible,correctParent:r.drivenCarStage.parent===(depth?r.peopleContext.root:r.objects),cameraTracks:Math.abs(game.view.x-c.x)<.01};};
  state.sortedDrive=run(true);state.broadDrive=run(false);
  const p=new NPC(c.x,c.y,'Passenger','teammate');p.inCar=true;c.seatOccupants[1]=p;game.draw();state.passengerPaths=r.occupantContext.pathsPainted;
  r.setLayers({vehicles:false});game.draw();state.hidden=!r.drivenCarStage.visible;
  r.setLayers({vehicles:true,depthSort:true});game.draw();state.restored=r.drivenCarStage.visible;
  r.frames=[];r.warmFrames=15;for(let i=0;i<35;i++){_frameTime+=17;game.draw();}state.warmUploads=r.report().frames.reduce((n,f)=>n+f.uploads,0);state.warmBakes=r.report().frames.reduce((n,f)=>n+f.bakes,0);
  return state;
 });console.log(JSON.stringify(entered,null,2));assert.ok(entered.driving&&entered.pixels>500&&entered.iou>.95&&entered.paths>0);assert.ok(entered.stage&&entered.sorted&&entered.driverBeforeRoof);assert.ok(entered.sortedDrive.visible&&entered.sortedDrive.correctParent&&entered.sortedDrive.cameraTracks);assert.ok(entered.broadDrive.visible&&entered.broadDrive.correctParent&&entered.broadDrive.cameraTracks);assert.ok(entered.passengerPaths>entered.paths);assert.ok(entered.hidden&&entered.restored);assert.equal(entered.warmUploads,0);assert.equal(entered.warmBakes,0);assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/dfab-native-driving-v9.png'});
 const recovery=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=game.nativeRenderer,ext=r.renderer.gl.getExtension('WEBGL_lose_context'),timer=setTimeout(()=>reject(new Error('Driving recovery timeout')),5000);
  r.canvas.addEventListener('webglcontextlost',()=>setTimeout(()=>ext.restoreContext(),100),{once:true});r.canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timer);game.draw();resolve({lost:r.lost,visible:r.drivenCarStage.visible,paths:r.occupantContext.pathsPainted});},{once:true});ext.loseContext();}));assert.ok(!recovery.lost&&recovery.visible&&recovery.paths>0);
 const exited=await page.evaluate(()=>{game.toggleVehicle();game.draw();const r=game.nativeRenderer;return {driving:game.isDriving,stageHidden:!r.drivenCarStage.visible,paths:r.occupantContext.pathsPainted,playerVisible:r.playerSprite.visible,parent:r.playerSprite.parent===r.peopleContext.root};});
 assert.ok(!exited.driving&&exited.stageHidden&&exited.paths===0&&exited.playerVisible&&exited.parent);
 await page.evaluate(()=>{game._doLoadMap('apt_949');game.draw();game._doLoadMap('hub_949');game.draw();});assert.deepEqual(errors,[]);
 const evidence={passed:true,environment:'Desktop Chromium SwiftShader',entered,recovery,exited};fs.writeFileSync(path.join(__dirname,'../docs/native-webgl-driving-checks.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
