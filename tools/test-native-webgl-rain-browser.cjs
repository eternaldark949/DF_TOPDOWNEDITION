#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync(path.join(__dirname,'../DFAB WebGL.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:880,height:411}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.goto('http://127.0.0.1:'+server.address().port);

 await page.evaluate(()=>{game.loop=()=>{};document.getElementById('btn-native-city').click();game.player.x=1200;game.player.y=550;game.weather.setCondition('rain',Infinity,true);for(let i=0;i<40;i++){_frameTime+=17;game.update();game.draw();}});
 const result=await page.evaluate(()=>{
  const r=game.nativeRenderer,w=game.weather,drops=w.drops,splashes=w.splashes;
  const run=enabled=>{r.setLayers({rainQuads:enabled});r.frames=[];r.warmFrames=15;for(let i=0;i<45;i++){_frameTime+=17;game.draw();}const f=r.report().frames;
   return {mode:r.rainStats.mode,quads:r.rainStats.dropQuads+r.rainStats.splashQuads,paths:r.rainStats.paths,bufferMean:f.reduce((n,v)=>n+v.bufferBytes,0)/f.length,drawMean:f.reduce((n,v)=>n+v.draws,0)/f.length,rainMean:f.reduce((n,v)=>n+v.rain.cpuMs,0)/f.length,bakes:f.reduce((n,v)=>n+v.bakes,0),uploads:f.reduce((n,v)=>n+v.uploads,0)};};
  const paths=run(false),quads=run(true);
  const alphaMass=()=>{const t=PIXI.RenderTexture.create({width:880,height:411});r.renderer.render(r.rainContext.root,{renderTexture:t,clear:true});const data=r.renderer.extract.pixels(t);t.destroy(true);let alpha=0,pixels=0;for(let i=3;i<data.length;i+=4){alpha+=data[i];if(data[i])pixels++;}return {alpha,pixels};};
  const quadPixels=alphaMass();r.setLayers({rainQuads:false});game.draw();const pathPixels=alphaMass();r.setLayers({rainQuads:true});game.draw();

  const lamp=game.lamps.find(l=>Math.abs(l.x-game.player.x)<400&&Math.abs(l.y-game.player.y)<300)||game.lamps[0];
  game.player.x=lamp.x;game.player.y=lamp.y+15;
  const p=new Pedestrian(lamp.x,lamp.y-15,game.pedestrians.network);game.pedestrians.pedestrians=[p];
  const order=()=>{game.draw();const root=r.peopleContext.root,node=r.fixtureNodes.get(lamp).node,person=root.children.find(n=>n._nativeEntity===p);return {person:root.getChildIndex(person),lamp:root.getChildIndex(node),player:root.getChildIndex(r.playerSprite)};};
  r.setLayers({depthSort:true,people:true,fixtures:true});const behind=order();
  p.y=lamp.y+30;const front=order();
  r.setLayers({depthSort:false});game.draw();const legacy=r.fixtureNodes.get(lamp).node.parent===r.fixtures&&r.playerSprite.parent===r.objects;
  r.setLayers({depthSort:true,fixtures:false});game.draw();const hidden=r.fixtureNodes.get(lamp).node.parent===r.fixtures&&!r.fixtures.visible;
  r.setLayers({fixtures:true});game.draw();
  return {paths,quads,quadPixels,pathPixels,behind,front,legacy,hidden,simulationUnchanged:w.drops===drops&&w.splashes===splashes};
 });
 console.log(JSON.stringify(result,null,2));assert.ok(result.quadPixels.pixels>100);assert.ok(result.quadPixels.alpha>result.pathPixels.alpha*.5&&result.quadPixels.alpha<result.pathPixels.alpha*2,'shader rain retains comparable visible weight');assert.ok(result.quads.quads>100);assert.ok(result.paths.paths>0);assert.ok(result.quads.bufferMean<result.paths.bufferMean*.6,'rain quads cut geometry traffic');assert.equal(result.quads.paths,0);assert.equal(result.quads.bakes,0);assert.equal(result.quads.uploads,0);assert.ok(result.simulationUnchanged);
 assert.ok(result.behind.person<result.behind.lamp&&result.behind.lamp<result.behind.player);assert.ok(result.front.lamp<result.front.player&&result.front.player<result.front.person);assert.ok(result.legacy&&result.hidden);assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/dfab-native-rain-v8.png'});
 const recovery=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=game.nativeRenderer,ext=r.renderer.gl.getExtension('WEBGL_lose_context'),timer=setTimeout(()=>reject(new Error('Rain recovery timeout')),5000);
  r.canvas.addEventListener('webglcontextlost',()=>setTimeout(()=>ext.restoreContext(),100),{once:true});r.canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timer);for(let i=0;i<20;i++)game.draw();resolve({lost:r.lost,rain:r.rainStats,sorted:r.peopleContext.root.sortableChildren});},{once:true});ext.loseContext();}));
 assert.equal(recovery.lost,false);assert.ok(recovery.rain.dropQuads>0&&recovery.sorted);assert.deepEqual(errors,[]);
 const evidence={passed:true,environment:'Desktop Chromium SwiftShader; workload comparison, not phone FPS',recovery,...result};fs.writeFileSync(path.join(__dirname,'../docs/native-webgl-rain-checks.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
