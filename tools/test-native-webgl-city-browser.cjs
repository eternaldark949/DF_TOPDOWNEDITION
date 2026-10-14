#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync(path.join(__dirname,'../DFAB WebGL.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:880,height:411}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>{game.loop=()=>{};document.getElementById('btn-native-city').click();});
 console.log('entry',await page.evaluate(()=>({map:game.activeMap.id,world:game.nativeRenderer.worldStats})),errors);assert.deepEqual(errors,[]);

 const report=await page.evaluate(()=>{for(let i=0;i<25;i++){_frameTime+=17;game.draw();}return game.nativeRenderer.report();});assert.equal(report.map,'hub_949');assert.ok(report.world.buildings>0&&report.world.groundTiles>0);assert.ok(report.frames.every(f=>f.uploads===0&&f.bakes===0),'stationary city reuses its textures');assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/dfab-native-city.png'});
 const travel=await page.evaluate(()=>{
  const points=[[4300,4700],[8500,7000],[11800,12000],[1200,550]],out=[];
  for(const [x,y]of points){game.player.x=x;game.player.y=y;for(let i=0;i<14;i++){_frameTime+=17;game.update();game.draw();}
   out.push({x,y,world:game.nativeRenderer.worldStats,bytes:game.nativeRenderer.report().textureBytes,shadowCache:game.nativeRenderer.shadowCache.size});}
  return out;
 });assert.ok(travel.every(t=>t.shadowCache<=64));assert.deepEqual(errors,[]);
 const rain=await page.evaluate(()=>{
  const w=game.weather,r=game.nativeRenderer;w.setCondition('rain',Infinity,true);game.player.x=1200;game.player.y=550;
  for(let i=0;i<30;i++){_frameTime+=17;game.update();game.draw();}const on={...r.rainStats},drops=w.drops,splashes=w.splashes;
  r.setLayers({rainDrops:false,rainSplashes:false});game.draw();const off={...r.rainStats};r.setLayers({rainDrops:true,rainSplashes:true});game.draw();
  return {on,off,restored:w.drops===drops&&w.splashes===splashes};
 });assert.ok(rain.on.drops>0&&rain.on.paths>0);assert.equal(rain.off.paths,0);assert.ok(rain.restored);
 const save=await page.evaluate(()=>{game.player.x=game.activeMap.spawn.x;game.player.y=game.activeMap.spawn.y;game.currency=12345;game.scrap=678;const save=game.getSaveSchema();game.currency=1;game.scrap=0;window.localStorage.setItem('dfab_save_slot_0','canvas-original');return {game:'DFAB',slots:{0:save},activeSlot:0};});
 await page.locator('#btn-native-saves').evaluate(el=>el.click());


 const input=page.locator('#save-slot-file-input');
 await input.setInputFiles({name:'canvas-city-save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
 await page.waitForFunction(()=>saveSlotManager.getSlotData(0)?.player.currency===12345);
 await page.locator('.save-slot-card[data-slot="0"]').click();
 await page.waitForFunction(()=>game.activeMap?.id==='hub_949'&&game.currency===12345&&!document.getElementById('fade-overlay').classList.contains('active'));
 const loaded=await page.evaluate(()=>{game.draw();return {map:game.activeMap.id,currency:game.currency,scrap:game.scrap,x:game.player.x,y:game.player.y,story:game.story.serialize(),original:window.localStorage.getItem('dfab_save_slot_0'),webgl:!!NativeWebGLStorage.getItem('dfab_save_slot_0')};});
 assert.equal(loaded.currency,12345);assert.equal(loaded.scrap,678);assert.equal(loaded.original,'canvas-original');assert.ok(loaded.webgl);assert.deepEqual(loaded.story,save.slots[0].story);
 const interiors=[];for(const id of ['apt_949','hotel_lobby','moon_city_nightclub','cozy_cafe_interior','hotel_suite','enni_cole_interior','enni_cole_upper','demoness_palace','house_of_death','medbay_sw','ethereal_plane','keepers_hill','keepers_parlor','van_interior','church_boss','auto_shop','neural_sys_interior','biggs_arena','ollo_test','ollo_interior','hub_949']){
  await page.evaluate(id=>game.loadMap(id),id);try{await page.waitForFunction(id=>game.activeMap?.id===id&&!document.getElementById('fade-overlay').classList.contains('active'),id);}catch(e){console.log('transition failure',id,await page.evaluate(()=>({map:game.activeMap?.id,seq:game._loadSeq,warm:!!game._mapTextureWarmup,fade:document.getElementById('fade-overlay').className})),errors);throw e;}
  console.log('interior',id);try{interiors.push(await page.evaluate(()=>{for(let i=0;i<3;i++)game.draw();return {map:game.activeMap.id,world:game.nativeRenderer.worldStats};}));}catch(e){console.log('bad textures',await page.evaluate(()=>{const out=[];const walk=n=>{if(n.visible&&n.texture&&!n.texture._uvs)out.push({name:n.constructor.name,parent:n.parent?.constructor.name,texture:n.texture.uid,x:n.x,y:n.y});for(const c of n.children||[])walk(c);};walk(game.nativeRenderer.stage);return out;}));throw e;}
 }
 const recovery=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const r=game.nativeRenderer,ext=r.renderer.gl.getExtension('WEBGL_lose_context');if(!ext){resolve(false);return;}
  const timer=setTimeout(()=>reject(new Error('City context recovery timeout')),5000);
  r.canvas.addEventListener('webglcontextlost',()=>setTimeout(()=>ext.restoreContext(),100),{once:true});
  r.canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timer);for(let i=0;i<3;i++)game.draw();resolve(!r.lost);},{once:true});ext.loseContext();
 }));assert.ok(recovery);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,recovery,map:report.map,world:report.world,steadyUploads:report.frames.reduce((n,f)=>n+f.uploads,0),travel,rain,loaded,interiors},null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
