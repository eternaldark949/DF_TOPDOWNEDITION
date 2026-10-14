#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync(path.join(__dirname,'../DFAB WebGL.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:880,height:411}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{game.loop=()=>{};document.getElementById('btn-native-apartment').click();game.nativeRenderer.preset('canvas');game.player.x=700;game.player.y=500;game.camera.zoom=.55;});
  const decor=await page.evaluate(()=>{
   const r=game.nativeRenderer,hashes=new Map(),samples=[];for(let i=0;i<64;i++){
    _frameTime=1000+i*7;game.draw();for(const [p,a]of r.props)if(a.liveContext){let s=hashes.get(p.decorType);if(!s)hashes.set(p.decorType,s=new Set());s.add(a.liveContext.hash);}
    if(i>=20)samples.push({uploads:r.report().frames.at(-1)?.uploads||0,bakes:r.report().frames.at(-1)?.bakes||0});
   }
   const plan=game.props.filter(p=>p.decorType==='apt_craft'||p.decorType==='apt_fireplace').map(p=>({type:p.decorType,runs:r.props.get(p).runs.length}));
   r.setLayers({decorAnimation:false});game.draw();const frozen=[...r.props.values()].filter(a=>a.liveContext).every(a=>!a.liveContext.root.visible);
   r.setLayers({decorAnimation:true});game.draw();return {unique:Object.fromEntries([...hashes].map(([k,v])=>[k,v.size])),samples,plan,frozen};
  });
  console.log('Decor:',JSON.stringify(decor.unique));assert.ok(decor.unique.apt_craft>40&&decor.unique.apt_fireplace>40,'scanline/flames follow continuous time, not eight sampled frames');
  assert.ok(decor.samples.every(f=>f.uploads===0&&f.bakes===0),'continuous decor stays off bitmap uploads');assert.ok(decor.frozen);
  assert.ok(decor.plan.find(p=>p.type==='apt_craft').runs===2,'craft scanline retains its two surrounding static runs');
  const quality=await page.evaluate(()=>{
   const r=game.nativeRenderer,p=game.props.find(p=>p.decorType==='apt_sofa');p.x+=11;p.angle=.27;game.player.x=620;const result=[];
   for(const mode of ['standard','high','auto','standard']){
    r.setTextureQuality(mode);for(let i=0;i<20;i++)game.draw();const t=r.props.get(p).texture;
    result.push({mode,logical:[t.width,t.height],pixels:[t.baseTexture.realWidth,t.baseTexture.realHeight],bytes:r.report().textureBytes,
     playerX:game.player.x,propX:p.x,propAngle:p.angle,steady:r.report().frames.every(f=>f.uploads===0&&f.bakes===0)});
   }return result;
  });
  assert.deepEqual(quality[0].logical,quality[1].logical,'high quality preserves world dimensions');
  assert.equal(quality[1].pixels[0],quality[0].pixels[0]*2);assert.equal(quality[1].pixels[1],quality[0].pixels[1]*2);
  assert.ok(quality[1].bytes>quality[0].bytes*2,'high assets really have more pixels');assert.equal(quality.at(-1).bytes,quality[0].bytes,'switching quality releases replaced assets');
  assert.ok(quality.every(q=>q.playerX===620&&q.propX===quality[0].propX&&q.propAngle===.27&&q.steady),'quality preserves game state and stops uploading after rebuild');
  const fx=await page.evaluate(()=>{
   const r=game.nativeRenderer;r.preset('canvas');game.player.x=700;game.player.y=500;game.player.angle=0;game.camera.zoom=1.1;
   game.projectiles=[new ProjectileEntity({x:760,y:470,angle:0,color:'#00f3ff'}),new ProjectileEntity({x:780,y:520,angle:0,color:'#ff3300'})];
   game.projectiles[0].isSniper=true;game.projectiles[0].fxTrail={trail:'crackle',col:'#00f3ff',core:'#ffffff'};game.projectiles[0].trail=[720,470,740,470];
   game.muzzleFlashes=[{x:735,y:490,angle:0,color:'#ffcc88',radius:50,life:3}];
   game.shotFx=[{k:'smoke',x:725,y:510,t:20,life:64,r:4,col:'#ccccdd',ph:0},{k:'ember',x:732,y:514,t:10,life:40,col:'#ffaa33',ph:0,vx:1,vy:0}];
   game.casings=[{x:680,y:520,t:30,big:false,col:'#c9a46a',ph:0,rate:.005,lc:'#ffcc88',lk:1,sub:[2,1,-2,3]}];
   game.weather.particles=[{type:'spark',x:800,y:480,vx:2,vy:1,life:.8,size:2},{type:'spray',x:810,y:480,vx:1,vy:1,color:'rgba(150,10,14,1)',size:2,life:.7}];
   game.decals.addDecal('blood',750,535,{color:'112,16,38',size:4});
   game.floatingTexts=[{x:700,y:470,target:null,value:37,color:'#ffffff',t0:_gameTimeSec,pop:_gameTimeSec,drift:0}];
   game.slashes=[{x:700,y:500,a:0,arc:1.8,reach:45,side:1,t0:_gameTimeSec-.07}];
   r.frames=[];r.warmFrames=20;r.lastStart=r.lastEnd=0;let first;for(let i=0;i<80;i++){_frameTime=2000+i*20;_simTick++;game.draw();if(!i)first=r.detailStats;}
   const steady=r.report(),normal=r.renderer.extract.pixels(r.stage);r.setLayers({projectiles:false,weaponFx:false,casings:false,impactParticles:false,decals:false,overlays:false,transientLights:false,fxGlow:false});game.draw();
   const off=r.renderer.extract.pixels(r.stage);let different=0;for(let i=0;i<off.length;i+=4)if(Math.abs(off[i]-normal[i])+Math.abs(off[i+1]-normal[i+1])+Math.abs(off[i+2]-normal[i+2])>15)different++;
   r.preset('canvas');game.draw();return{steady,different,first,atlasViews:r.postEffectContext.imageViews.size,cueNodes:r.cueContext.pool.filter(n=>n instanceof PIXI.BitmapText).length};
  });
  assert.ok(fx.different>100,'effects change visible scene pixels');assert.ok(fx.atlasViews>20,'fireballs blend different atlas frames');assert.ok(fx.cueNodes>0,'damage text uses resident glyphs');
  console.log('FX uploads:',JSON.stringify(fx.steady.frames.filter(f=>f.uploads||f.bakes).map(f=>({frame:f.frame,uploads:f.uploads,bakes:f.bakes}))));assert.ok(fx.steady.frames.every(f=>f.uploads===0&&f.bakes===0),'warmed firing uses resident atlases and GPU targets');assert.ok(fx.steady.details.effects.transientSources>=3,'shots contribute to the lighting pipeline');
  await page.screenshot({path:'/tmp/dfab-native-details.png'});
  const firing=await page.evaluate(()=>new Promise(resolve=>{
   game.projectiles=[];game.muzzleFlashes=[];game.shotFx=[];game.casings=[];game.weather.particles=[];game.floatingTexts=[];game.slashes=[];
   game.currentWeapon={id:'pistol_fpx',stats:{fireRate:5,recoil:2,projectileColor:'#00f3ff',projectileLife:30}};
   game.weaponMode='normal';game.weaponHolstered=false;game.holsterAnim=game.holsterAnimTarget=1;
   const start=game.shotsFired||0;let n=0,maxProjectiles=0,maxCasings=0;
   const tick=()=>{_frameTime=performance.now();game.update();if(n%5===0)game.fireWeapon();game.draw();
    maxProjectiles=Math.max(maxProjectiles,game.nativeRenderer.detailStats.effects.projectiles);maxCasings=Math.max(maxCasings,game.casings.length);
    if(++n<40)requestAnimationFrame(tick);else resolve({frames:n,shots:(game.shotsFired||0)-start,maxProjectiles,maxCasings});};requestAnimationFrame(tick);
  }));assert.equal(firing.shots,8);assert.ok(firing.maxProjectiles>0&&firing.maxCasings>0,'real weapon simulation feeds native effects');
  const downloadPromise=page.waitForEvent('download');await page.evaluate(()=>{
   const q=document.getElementById('native-texture-quality');q.value='auto';q.dispatchEvent(new Event('change'));
   [...document.querySelectorAll('#native-webgl-toolbar button')].find(b=>b.textContent==='Record 20s').click();game.nativeRenderer.capture.durationMs=1;for(let i=0;i<30;i++)game.draw();
  });const download=await downloadPromise,saved=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(saved.textureQuality,'auto');assert.ok(saved.capture.finished);assert.ok(download.suggestedFilename().startsWith('dfab-native-webgl-v8-'));
  const recovery=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const r=game.nativeRenderer,ext=r.renderer.gl.getExtension('WEBGL_lose_context');if(!ext){resolve(false);return;}
   const timeout=setTimeout(()=>reject(new Error('Detail context recovery timeout')),5000);
   r.canvas.addEventListener('webglcontextlost',()=>setTimeout(()=>ext.restoreContext(),100),{once:true});r.canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timeout);game.draw();resolve(!r.lost);},{once:true});ext.loseContext();
  }));assert.ok(recovery);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,decor:{unique:decor.unique,plan:decor.plan,frozen:decor.frozen},quality,
   fx:{different:fx.different,atlasViews:fx.atlasViews,cueNodes:fx.cueNodes,details:fx.steady.details,uploads:fx.steady.frames.reduce((n,f)=>n+f.uploads,0)},firing,captureQuality:saved.textureQuality,contextRecovery:recovery},null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
