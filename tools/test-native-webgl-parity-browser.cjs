#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync(path.join(__dirname,'../DFAB WebGL.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:880,height:411}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.goto('http://127.0.0.1:'+server.address().port);



 await page.evaluate(()=>{game.loop=()=>{};document.getElementById('btn-native-apartment').click();game.nativeRenderer.setLayers({bloom:false,atmosphere:false});});
 const ordering=await page.evaluate(()=>{
  const r=game.nativeRenderer,p=game.props.find(p=>p.hasCollision&&!p.noNav),c=p.getCenter();game.player.x=c.x;game.player.y=c.y-25;
  for(let i=0;i<20;i++){_frameTime+=17;game.draw();}
  const root=r.peopleContext.root,group=r.props.get(p).group,before=root.getChildIndex(r.playerSprite)<root.getChildIndex(group);
  game.player.y=c.y+25;game.draw();const after=root.getChildIndex(group)<root.getChildIndex(r.playerSprite);
  const d=game.roomSystem.doors[0],door=r.doorNodes.get(d)?.node,doorSorted=!door||door.parent===root;
  r.setLayers({depthSort:false});game.draw();const broad=r.props.get(p).group.parent===r.objects&&(!door||door.parent===r.doors);
  r.setLayers({depthSort:true});game.draw();const guest={x:c.x,y:c.y+40,walkPhase:0};const ctx=r.peopleContext;ctx.begin();ctx.translate(guest.x,guest.y);drawCrowdHumanoid(ctx,guest,{stance:'idle',gender:'female',bodyColor:'#554477',headColor:'#dcc6ac'});const guestGrouped=ctx.root.children.some(n=>n._nativeEntity===guest&&n.children.length>0);game.draw();return {before,after,doorSorted,broad,guestGrouped};
 });assert.ok(Object.values(ordering).every(Boolean));
 const bodies=await page.evaluate(()=>{
  const r=game.nativeRenderer,l=game.lamps[0];game.player.x=l.x;game.player.y=l.y;
  const a=new NPC(l.x+25,l.y,'Silhouette','civilian'),b=new NPC(l.x+45,l.y+25,'Live pose','civilian');game.npcs=[a,b];
  for(let i=0;i<30;i++){_frameTime+=17;game.draw();}const cached=r.nativeCasters.report();
  r.setLayers({crowdSprites:false});for(let i=0;i<20;i++){_frameTime+=17;game.draw();}const live=r.nativeCasters.report();
  const target=r.nativeCasters.entries.get(a),before=target.revision,oldX=a.x;a.x+=5;a.walkPhase+=.8;a._gait.speed=2;a._gait.tick=_simTick;_frameTime+=17;game.draw();const changed=r.nativeCasters.entries.get(a).revision>before||(r.nativeCasters.bodies.get(a).x===a.x&&a.x!==oldX);
  a.invincibleTimer=1;game.draw();const blinkHidden=!r.nativeCasters.bodies.has(a);a.invincibleTimer=0;
  r.setLayers({npcShadows:false});game.draw();const off=r.nativeCasters.bodies.has(a);r.setLayers({npcShadows:true,crowdSprites:true});game.draw();
  return {cached,live,changed,blinkHidden,off};
 });console.log('bodies',JSON.stringify(bodies));assert.ok(bodies.cached.shared>=1&&bodies.cached.casters>=2);assert.ok(bodies.live.captures>=2&&bodies.live.liveTargets<=32&&bodies.live.bodyBytes<=32*192*192*4);assert.ok(bodies.changed&&bodies.blinkHidden&&!bodies.off);
 const projection=await page.evaluate(()=>{
  const r=game.nativeRenderer,registry=r.nativeCasters;r.setLayers({playerShadows:false,wallOcclusion:false});registry.begin();
  const texture=PIXI.RenderTexture.create({width:112*17,height:112}),g=new PIXI.Graphics();for(let f=0;f<17;f++)g.beginFill(0xffffff).drawRect(f*112+52,44,24,4).drawRect(f*112+52,64,24,4).endFill();r.renderer.render(g,{renderTexture:texture,clear:true});
  const source={owner:{},x:100,y:100,radius:180},a={owner:{},x:140,y:100,angle:0,scale:1,elevation:24,texture,size:112,bounds:{x:52,y:44,width:24,height:24},frames:[4,5],blend:.4,key:'gapped'},b={...a,owner:{},x:140,y:145,key:'second'};
  registry.bodies.set(a.owner,a);registry.bodies.set(b.owner,b);const base=r.shadowTexture(source,[],[],'open'),sample=(t,x,y)=>{const data=r.renderer.extract.pixels(t),k=t.baseTexture.resolution;return data[(Math.floor((y-source.y+source.radius)*k)*t.baseTexture.realWidth+Math.floor((x-source.x+source.radius)*k))*4+3];};
  const original=sample(base,172,90),cast=r.multiShadowTexture(source,base,game,[]),finger=sample(cast,172,90),gap=sample(cast,172,100),body=sample(cast,150,90),far=sample(cast,230,90),meshes=r.shadowCache.get(source.owner).dynamicMeshes.length;
  const rebuilds=r.shadowStats.dynamicRebuilds;r.multiShadowTexture(source,base,game,[]);const cached=r.shadowStats.dynamicRebuilds===rebuilds;
  a.blend=.6;a.key='new-phase';r.multiShadowTexture(source,base,game,[]);const invalidates=r.shadowStats.dynamicRebuilds===rebuilds+1;
  registry.begin();registry.bodies.set(a.owner,a);r.setLayers({wallOcclusion:true});const blocked=r.multiShadowTexture(source,base,game,[{x:120,y:85,w:2,h:30}])===base&&registry.stats.blocked===1;
  r.setLayers({wallOcclusion:false,vehicleShadows:true});registry.begin();const car={x:140,y:140,angle:0,length:50,width:20,visible:true};registry.vehicle(car);const vSource={owner:{},x:100,y:140,radius:180},vBase=r.shadowTexture(vSource,[],[],'open'),vCast=r.multiShadowTexture(vSource,vBase,game,[]);const vData=r.renderer.extract.pixels(vCast),vOriginal=r.renderer.extract.pixels(vBase);let vehicleChanged=0;for(let i=3;i<vData.length;i+=4)if(vData[i]<vOriginal[i]-20)vehicleChanged++;
  registry.begin();for(let i=0;i<50;i++)registry.bodies.set(i,{...a,owner:{id:i},x:140+(i%5),y:100+Math.floor(i/5)});r.multiShadowTexture(source,base,game,[]);const budget=registry.stats.pairs<=24&&registry.stats.dropped>0&&r.shadowBytes()<=24*1048576;
  texture.destroy(true);g.destroy();return {original,finger,gap,body,far,meshes,cached,invalidates,blocked,vehicleChanged,budget};
 });console.log('projection',JSON.stringify(projection));assert.ok(projection.finger<projection.original*.5&&projection.gap>projection.finger+20&&projection.body>projection.finger+20);assert.ok(projection.meshes>=2&&projection.cached&&projection.invalidates&&projection.blocked&&projection.vehicleChanged>10&&projection.budget);
 const skyline=await page.evaluate(()=>{
  const r=game.nativeRenderer;r.setLayers({playerShadows:true,wallOcclusion:true});game.npcs=[];game.player.x=600;game.player.y=30;
  for(let i=0;i<30;i++){_frameTime+=17;game.draw();}const first=r.backdropContext.hash,slide=[game._cityView.dx,game._cityView.dy],lean=game.lookLeanY;
  _frameTime+=1000;game.draw();const moves=r.backdropContext.hash!==first;
  game.player.x+=70;for(let i=0;i<10;i++){_frameTime+=17;game.draw();}const parallax=game._cityView.dx!==slide[0];
  const city=game._cityView,t=PIXI.RenderTexture.create({width:city.w,height:city.h});r.renderer.render(r.backdropContext.root,{renderTexture:t,clear:true,transform:new PIXI.Matrix(1,0,0,1,-city.x,-city.y)});const native=r.renderer.extract.pixels(t);t.destroy(true);
  const canvas=document.createElement('canvas');canvas.width=city.w;canvas.height=city.h;const ctx=canvas.getContext('2d');ctx.translate(-city.x,-city.y);city.drawBase(ctx);const original=ctx.getImageData(0,0,city.w,city.h).data;let error=0;for(let i=0;i<native.length;i+=4)for(let c=0;c<3;c++)error+=Math.abs(native[i+c]-original[i+c]);
  const match=error/(native.length/4*3);for(let i=0;i<310;i++){r.frameId++;game.view.x=450+i*.9;r.syncBackdrop(game);}const views=r.backdropContext.imageViews.size;
  r.setLayers({liveBackdrop:false});game.draw();const frozen=!r.backdropStats.live&&!r.backdropContext.root.visible;
  r.setLayers({liveBackdrop:true});game.draw();for(let i=0;i<20;i++){_frameTime+=17;game.draw();}r.frames=[];r.warmFrames=0;for(let i=0;i<8;i++){_frameTime+=17;game.draw();}const warm=r.report().frames;
  return {moves,parallax,lean,match,views,frozen,visible:r.backdropStats.visible,uploads:warm.reduce((n,f)=>n+f.uploads,0),uploadOrigins:warm.flatMap(f=>f.textureTraffic?.groups||[]),bakes:warm.reduce((n,f)=>n+f.bakes,0),bakeOrigins:warm.filter(f=>f.bakes).map(f=>f.bakeOrigins),roofAboveActors:r.world.getChildIndex(r.roofStage)>r.world.getChildIndex(r.objects),treesAboveRoofs:r.world.getChildIndex(r.foliageContext.root)>r.world.getChildIndex(r.roofStage)};
 });console.log('skyline',JSON.stringify(skyline));assert.ok(skyline.moves&&skyline.parallax&&skyline.lean<0&&skyline.frozen&&skyline.visible);assert.ok(skyline.match<5&&skyline.views<=256);assert.equal(skyline.uploads,0);assert.equal(skyline.bakes,0);assert.ok(skyline.roofAboveActors&&skyline.treesAboveRoofs);assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/dfab-native-parity-v10.png'});
 await page.evaluate(()=>{const r=game.nativeRenderer;game.lamps[0].radius=2000;const a=new NPC(game.player.x+20,game.player.y,'Recovery body','civilian');game.npcs=[a];r.setLayers({crowdSprites:false});game.draw();});
 const recovery=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=game.nativeRenderer,ext=r.renderer.gl.getExtension('WEBGL_lose_context'),timer=setTimeout(()=>reject(new Error('Parity recovery timeout')),5000);
  r.canvas.addEventListener('webglcontextlost',()=>setTimeout(()=>ext.restoreContext(),100),{once:true});r.canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timer);for(let i=0;i<20;i++)game.draw();const body=r.nativeCasters.entries.get(game.npcs[0]),pixels=body?r.renderer.extract.pixels(body.target):[];let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>128)opaque++;resolve({lost:r.lost,backdrop:r.backdropStats.visible,casters:r.nativeCasters.report(),liveBodyPixels:opaque});},{once:true});ext.loseContext();}));assert.ok(!recovery.lost&&recovery.backdrop&&recovery.liveBodyPixels>100&&recovery.casters.captures>0);assert.deepEqual(errors,[]);
 const evidence={passed:true,environment:'Desktop Chromium SwiftShader; no phone FPS claim',ordering,bodies,projection,skyline,recovery};fs.writeFileSync(path.join(__dirname,'../docs/native-webgl-parity-checks.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
