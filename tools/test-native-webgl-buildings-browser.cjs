#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync(path.join(__dirname,'../DFAB WebGL.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:880,height:411}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>{game.loop=()=>{};document.getElementById('btn-native-city').click();game.player.x=935;game.player.y=842;game.weather.isRaining=false;game.nativeRenderer.setLayers({people:false,vehicles:false,impactParticles:false,rainDrops:false,rainSplashes:false});});
 const result=await page.evaluate(()=>{
  const r=game.nativeRenderer;_frameTime=12345;_gameTimeSec=12.345;
  const pixels=()=>{const t=PIXI.RenderTexture.create({width:880,height:411});r.renderer.render(r.stage,{renderTexture:t,clear:true});const data=r.renderer.extract.pixels(t);t.destroy(true);return data;};
  r.setLayers({buildingCache:false});for(let i=0;i<20;i++)game.draw();const original=pixels();
  r.setLayers({buildingCache:true});game.draw();for(const a of r.nativeBuildings.values())if(a.glowMesh)a.glowMesh.shader.uniforms.animate=0;
  const cached=pixels();let error=0,max=0,count=0;
  for(let i=0;i<original.length;i+=4)for(let c=0;c<3;c++){const e=Math.abs(original[i+c]-cached[i+c]);error+=e;max=Math.max(max,e);if(e>10)count++;}
  const hashes=new Set();const run=enabled=>{r.setLayers({buildingCache:enabled});r.frames=[];r.warmFrames=20;for(let i=0;i<50;i++){_frameTime+=17;_gameTimeSec+=.017;game.draw();if(enabled)for(const r1 of r.nativeBuildings.values())if(r1.glowLive)hashes.add(r1.glowLive.hash);}const f=r.report().frames;
   return {bufferMean:f.reduce((n,v)=>n+v.bufferBytes,0)/f.length,drawMean:f.reduce((n,v)=>n+v.draws,0)/f.length,renderMean:f.reduce((n,v)=>n+v.renderMs,0)/f.length,
    buildingMean:f.reduce((n,v)=>n+v.world.timings.buildingsMs,0)/f.length,rasterizations:f.reduce((n,v)=>n+v.world.buildingCache.rasterizations,0),livePaths:r.buildingStats.livePaths,bytes:r.buildingGlowBytes(),bakes:f.reduce((n,v)=>n+v.bakes,0),bakeOrigins:f.filter(v=>v.bakes).map(v=>v.bakeOrigins)};};
  const live=run(false),retained=run(true);game.player.x+=12;game.draw();const moved=r.buildingStats.rasterizations;game.draw();const stationary=r.buildingStats.rasterizations;
  return {liveRevisions:hashes.size,composition:{mean:error/(original.length/4*3),max,channelsOver10:count},live,retained,moved,stationary};
 });console.log(JSON.stringify(result,null,2));assert.ok(result.composition.mean<3,'cached mixed additive/source-over output remains close');assert.ok(result.retained.bufferMean<result.live.bufferMean*.75);assert.ok(result.retained.buildingMean<result.live.buildingMean*.65);assert.equal(result.retained.rasterizations,0);assert.ok(result.liveRevisions>10);assert.ok(result.moved>0);assert.equal(result.stationary,0);assert.deepEqual(errors,[]);
 const recovery=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=game.nativeRenderer,ext=r.renderer.gl.getExtension('WEBGL_lose_context'),timer=setTimeout(()=>reject(new Error('Building recovery timeout')),5000);
  r.canvas.addEventListener('webglcontextlost',()=>setTimeout(()=>ext.restoreContext(),100),{once:true});r.canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timer);game.draw();const refresh=r.buildingStats.rasterizations;game.draw();resolve({lost:r.lost,refresh,hits:r.buildingStats.hits});},{once:true});ext.loseContext();}));
 assert.equal(recovery.lost,false);assert.ok(recovery.refresh>0&&recovery.hits>0);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,recovery,...result},null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
