#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync(path.join(__dirname,'../DFAB WebGL.html')));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:880,height:411}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{game.loop=()=>{};document.getElementById('btn-native-apartment').click();game.nativeRenderer.preset('baseline');game.nativeRenderer.setLayers({playerShadows:true,shapeShadows:true,wallOcclusion:true});game.player.x=590;game.player.y=540;game.player.angle=0;game.camera.zoom=1.08;});
  const animation=await page.evaluate(()=>{
   const r=game.nativeRenderer,p=game.player,revisions=new Set(),frames=[];
   for(let i=0;i<80;i++){
    _gameTimeSec=1+i/60;_frameTime=1000+i*1000/60;p.walkPhase=i*Math.PI*2/64;p.vx=3;p.vy=0;
    p._gait={tick:_simTick,prevX:p.x,prevY:p.y,speed:3,dirX:1,dirY:0,cmdX:0,cmdY:0,driven:false};
    const before=r.uploads,bakes=r.bakes;game.draw();revisions.add(r.actorHash);
    if(i>=20)frames.push({uploads:r.uploads-before,bakes:r.bakes-bakes,animation:r.actorStats,shadows:r.shadowStats,stages:r.layerStages});
   }
   const phaseBefore=p.walkPhase,gait=p._gait;game.draw();const noGaitAdvance=p.walkPhase===phaseBefore&&gait===p._gait;
   r.setLayers({characterAnimation:false});game.draw();const frozen=r.actorRevision;_gameTimeSec+=.1;p.walkPhase+=.4;game.draw();const freeze=r.actorRevision===frozen;
   r.setLayers({characterAnimation:true});game.draw();return{unique:revisions.size,noGaitAdvance,freeze,resumes:r.actorRevision>frozen,frames};
  });
  assert.ok(animation.unique>40,'continuous gait has more than eight baked poses');assert.ok(animation.noGaitAdvance,'drawing does not advance gait twice');
  assert.ok(animation.freeze&&animation.resumes,'animation can be frozen and resumed independently');
  assert.ok(animation.frames.every(f=>f.uploads===0&&f.bakes===0),'moving body and silhouette masks never upload Canvas bitmaps after warmup');
  assert.ok(animation.frames.some(f=>f.shadows.dynamicRebuilds>0),'moving poses exercise GPU shadow refreshes');
  assert.ok(animation.frames.every(f=>f.shadows.staticRebuilds===0),'animation preserves cached static wall/furniture light images');
  const parity=await page.evaluate(()=>{
   const r=game.nativeRenderer,p=game.player,base=game.playerRenderConfig.bind(game),results=[];
   const cases=[['idle',{}],['walk',{pose:'none'}],['sneak',{pose:'sneak',poseWhileMoving:true}],['push',{pose:'push',poseWhileMoving:true}],['phone',{pose:'phone',poseInstant:true}],
    ['punch',{stance:'punch',punchTicks:5}],['rifle',{stance:'rifle'}],['sniper',{stance:'sniper',scopeK:1}],
    ['pistol-model',{stance:'pistol',testWeapon:'pistol_fpx'}],['rifle-model',{stance:'rifle',testWeapon:'rifle_rb98'}],['sniper-model',{stance:'sniper',scopeK:1,testWeapon:'sniper_sara'}],
    ['coat',{top:{type:'coat',color:'#c7a070'},bottom:{type:'trousers',color:'#484858'}}],['dress',{top:{type:'dress',color:'#cc8888'},bottom:{type:'skirt',color:'#cc8888'}}],
    ['hood',{top:{type:'hoodie',color:'#606080'},hat:{type:'hood_up',color:'#606080'}}],['umbrella',{held:{type:'umbrella',open:1,color:'#803050'}}]];
   const originalWeapon=game.currentWeapon,originalMode=game.weaponMode,originalHolstered=game.weaponHolstered;
   for(let i=0;i<cases.length;i++){
    const [name,extra]=cases[i];game.currentWeapon=extra.testWeapon?{id:extra.testWeapon,stats:{fireRate:20,recoil:10}}:originalWeapon;game.weaponMode=extra.testWeapon?'normal':originalMode;game.weaponHolstered=extra.testWeapon?false:originalHolstered;if(extra.testWeapon)game.holsterAnim=game.holsterAnimTarget=1;game.playerRenderConfig=()=>({...base(),...extra});p.vx=name==='walk'||name==='sneak'||name==='push'?3:0;p.vy=0;
    p._gait={tick:_simTick,prevX:p.x,prevY:p.y,speed:p.vx,dirX:1,dirY:0,cmdX:0,cmdY:0,driven:false};p.walkPhase=1.2;p.angle=.7;
    _gameTimeSec=10+i;_frameTime=_gameTimeSec*1000;
    // Advance the stance once, save its starting state, and give both paths
    // that exact state. Body colour and alpha are compared, not screenshots.
    game.draw();const before={};for(const key of ['_animState','_pose','_gait'])before[key]=structuredClone(p[key]);game.draw();
    const native=r.renderer.extract.pixels(r.actorTexture),after={};for(const key of Object.keys(before)){after[key]=p[key];p[key]=structuredClone(before[key]);}
    const cv=document.createElement('canvas');cv.width=cv.height=384;const c=cv.getContext('2d');c.scale(2,2);c.translate(96,96);
    const worldCanvas=_worldCanvas;_worldCanvas=cv;
    const proxy=new Proxy(c,{get(target,key){if(key==='getTransform')return()=>{const m=target.getTransform();return r.actorContext.worldFrame.multiply(new DOMMatrix([m.a/2,m.b/2,m.c/2,m.d/2,m.e/2-96,m.f/2-96]));};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set(target,key,value){target[key]=value;return true;}});
    try{drawProceduralHumanoid(proxy,p,{...game.playerRenderConfig(),_crowdBake:true,noShadow:true});}finally{_worldCanvas=worldCanvas;for(const key of Object.keys(after))p[key]=after[key];}
    const canvas=c.getImageData(0,0,384,384).data;let intersection=0,union=0,rgbError=0,opaque=0;
    for(let k=0;k<native.length;k+=4){const a=native[k+3]>127,b=canvas[k+3]>127;if(a||b)union++;if(a&&b){intersection++;if(native[k+3]>250&&canvas[k+3]>250){for(let j=0;j<3;j++)rgbError+=Math.abs(native[k+j]-canvas[k+j]);opaque++;}}}
    results.push({name,iou:intersection/union,rgbMeanError:rgbError/Math.max(1,opaque*3),pixels:union});
    if(name==='walk'){
     const nc=document.createElement('canvas');nc.width=nc.height=384;nc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(native),384,384),0,0);
     nc.id='native-character-evidence';cv.id='canvas-character-evidence';for(const element of [nc,cv]){element.style.cssText='position:fixed;top:0;background:#383040;z-index:20000';document.body.append(element);}nc.style.left='0';cv.style.left='384px';
    }
   }
   game.currentWeapon=originalWeapon;game.weaponMode=originalMode;game.weaponHolstered=originalHolstered;game.playerRenderConfig=base;return results;
  });
  console.log('Character parity:',JSON.stringify(parity));
  for(const p of parity){assert.ok(p.pixels>500,p.name+' draws a visible body');assert.ok(p.iou>.86,p.name+' alpha silhouette agrees with Canvas');assert.ok(p.rgbMeanError<35,p.name+' body colours agree with Canvas');}
  await page.screenshot({path:'/tmp/dfab-character-parity.png'});
  await page.evaluate(()=>{document.getElementById('native-character-evidence').remove();document.getElementById('canvas-character-evidence').remove();});
  const shadow=await page.evaluate(()=>{
   const r=game.nativeRenderer,original=r.actorTexture,originalBounds=r.actorBounds;r.setLayers({wallOcclusion:false});
   const texture=PIXI.RenderTexture.create({width:192,height:192,resolution:2}),g=new PIXI.Graphics();g.beginFill(0xffffff).drawRect(92,84,24,4).drawRect(92,104,24,4).endFill();r.renderer.render(g,{renderTexture:texture,clear:true});
   r.actorTexture=texture;r.actorBounds=g.getLocalBounds();r.actorRevision++;const source={owner:{},x:100,y:100,radius:180},actor={x:140,y:100,angle:0},base=r.shadowTexture(source,[],[],'shape-test');
   const sample=(t,x,y)=>{const pixels=r.renderer.extract.pixels(t),W=t.baseTexture.realWidth,H=t.baseTexture.realHeight,px=Math.floor((x-source.x+180)/t.width*W),py=Math.floor((y-source.y+180)/t.height*H);return pixels[(py*W+px)*4+3];};
   const unshadowed=sample(base,172,90),cast=r.animatedShadowTexture(source,base,actor),out={unshadowed,finger:sample(cast,172,90),gap:sample(cast,172,100),body:sample(cast,150,90),beyond:sample(cast,195,90)};
   const n=r.shadowStats.dynamicRebuilds;r.animatedShadowTexture(source,base,actor);out.cached=r.shadowStats.dynamicRebuilds===n;
   r.actorRevision++;r.animatedShadowTexture(source,base,actor);out.poseInvalidates=r.shadowStats.dynamicRebuilds===n+1;
   actor.angle=Math.PI/2;const rotated=r.animatedShadowTexture(source,base,actor);out.rotatedGap=sample(rotated,166,100);
   r.actorTexture=original;r.actorBounds=originalBounds;texture.destroy(true);g.destroy();r.actorRevision++;return out;
  });
  console.log('Shadow shape:',JSON.stringify(shadow));
  assert.ok(shadow.finger<shadow.unshadowed*.4,'projected finger blocks its own light');assert.ok(shadow.gap>shadow.finger*2,'gap between fingers remains illuminated');
  assert.ok(shadow.body>30&&shadow.beyond>10,'body stays lit and silhouette cast has finite reach');assert.ok(shadow.cached&&shadow.poseInvalidates,'cache follows pose revision');assert.ok(shadow.rotatedGap<shadow.gap*.5,'rotation changes the projected silhouette');
  const real=await page.evaluate(()=>new Promise(resolve=>{const r=game.nativeRenderer;r.preset('canvas');r.frames=[];r.warmFrames=15;let n=0;
   game.player.x=590;game.player.y=540;game.player.vx=game.player.vy=0;game.keys.d=true;
   const tick=()=>{_frameTime=performance.now();game.update();game.draw();if(++n<95)requestAnimationFrame(tick);else{game.keys.d=false;resolve(r.report());}};requestAnimationFrame(tick);
  }));
  assert.equal(real.frames.length,80);assert.ok(real.frames.some(f=>f.shadows.dynamicRebuilds>0));assert.ok(real.frames.every(f=>f.uploads===0&&f.bakes===0));
  assert.deepEqual(errors,[]);fs.writeFileSync('/tmp/dfab-character-moving-profile.json',JSON.stringify(real,null,2));
  console.log(JSON.stringify({passed:true,animation:{unique:animation.unique,freeze:animation.freeze,resumes:animation.resumes},parity,shadow,moving:{frames:real.frames.length,fps:real.fps,cpuMs:real.renderMeanMs,shadowFrames:real.frames.filter(f=>f.shadows.dynamicRebuilds>0).length}},null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
