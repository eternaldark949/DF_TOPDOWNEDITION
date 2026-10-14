#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync(path.join(__dirname,'../DFAB WebGL.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:880,height:411}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>{game.loop=()=>{};document.getElementById('btn-native-city').click();game.player.x=528;game.player.y=984;game.weather.setCondition('rain',Infinity,true);
  const node=game.pedestrians.network.nodes[0];game.pedestrians.pedestrians=[];
  for(let i=0;i<36;i++){const p=new Pedestrian(380+(i%9)*35,875+Math.floor(i/9)*45,game.pedestrians.network);p._gait=null;syncHumanoidGait(p);p._gait.speed=2;p._gait.tick=_simTick;game.pedestrians.pedestrians.push(p);}
 });
 const data=await page.evaluate(()=>{
  const r=game.nativeRenderer;const run=enabled=>{r.setLayers({crowdSprites:enabled});r.frames=[];r.warmFrames=70;for(let i=0;i<85;i++){_frameTime+=17;game.draw();}const f=r.report().frames;
   return {frames:f.length,bufferMean:f.reduce((n,v)=>n+v.bufferBytes,0)/f.length,drawMean:f.reduce((n,v)=>n+v.draws,0)/f.length,renderMean:f.reduce((n,v)=>n+v.renderMs,0)/f.length,
    paths:r.worldStats.paths,crowd:r.worldStats.crowd,uploads:f.reduce((n,v)=>n+v.uploads,0),bakes:f.reduce((n,v)=>n+v.bakes,0)};};
  const live=run(false),cached=run(true);const blendBefore=r.peopleContext.pool.find(n=>n instanceof NativeCrowdPoseMesh)?.shader.uniforms.blend;const before=game.pedestrians.pedestrians.map(p=>[p.x,p.y,p.walkPhase]);
  for(let i=0;i<16;i++){for(const p of game.pedestrians.pedestrians){p.walkPhase+=.17;p.x+=1;}_frameTime+=17;game.draw();}
  return {live,cached,phaseChanged:r.peopleContext.pool.find(n=>n instanceof NativeCrowdPoseMesh)?.shader.uniforms.blend!==blendBefore,entities:before.length,atlasBytes:r.crowdAtlas.bytes,poses:game.pedestrians.pedestrians.map(p=>p.walkPhase)};
 });assert.ok(data.cached.crowd.spriteBodies>=30);assert.ok(data.cached.bufferMean<data.live.bufferMean*.6,'GPU crowd strips cut geometry traffic');assert.ok(data.cached.paths<data.live.paths*.5);assert.equal(data.cached.uploads,0);assert.equal(data.cached.bakes,0);assert.ok(data.phaseChanged);

 const recovery=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=game.nativeRenderer,ext=r.renderer.gl.getExtension('WEBGL_lose_context'),timer=setTimeout(()=>reject(new Error('Crowd restoration timeout')),5000);
  r.canvas.addEventListener('webglcontextlost',()=>setTimeout(()=>ext.restoreContext(),100),{once:true});r.canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timer);for(let i=0;i<45;i++)game.draw();resolve({lost:r.lost,bodies:r.worldStats.crowd.spriteBodies,bytes:r.crowdAtlas.bytes});},{once:true});ext.loseContext();}));
 assert.equal(recovery.lost,false);assert.ok(recovery.bodies>=30);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,recovery,...data},null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
