/**
 * Real Chromium validation of the offline artifact and source-level engine contracts.
 * Playwright is a development tool only, supplied by this workspace (or installed locally).
 * Screenshots use Chromium's software WebGL here; this is not a phone/GPU benchmark.
 */
const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'artifacts');
fs.mkdirSync(artifacts,{recursive:true});

/** Serve modules for isolated contract checks; artifact contents run directly because managed Chromium blocks file:// URLs. */
const server=http.createServer((req,res)=>{
  if(req.url==='/fixture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><canvas style="width:800px;height:600px"></canvas>');return;}
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const target=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(target));}
  catch{res.writeHead(404);res.end();}
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.ETRNLNINE_CHROMIUM||'/usr/bin/chromium',headless:true,
    args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[];const report={};
  try{
    const context=await browser.newContext({viewport:{width:1024,height:720}});
    // Cooperative loading follows real frames; software GL can make those frames slow.
    context.setDefaultTimeout(120000);
    // A runtime guard catches indirect/off-screen preparation as well as visible Canvas usage.
    const installGuard=()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){
        if(type==='2d')throw new Error('Canvas2D forbidden by engine contract');
        return original.call(this,type,...args);
      };
      if(typeof OffscreenCanvas!=='undefined'){
        const get=OffscreenCanvas.prototype.getContext;
        OffscreenCanvas.prototype.getContext=function(type,...args){
          if(type==='2d')throw new Error('Offscreen Canvas2D forbidden');return get.call(this,type,...args);
        };
      }
    };
    await context.addInitScript(installGuard);
    let page=await context.newPage();
    await page.evaluate(installGuard);page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const remote=[];page.on('request',request=>{if(/^https?:/.test(request.url()))remote.push(request.url());});
    await page.setContent(fs.readFileSync(path.join(root,'dist/ETRNLNINE-Atrium.html'),'utf8'));
    await page.waitForFunction(()=>document.querySelector('#status').dataset.actor && document.querySelector('#status').dataset.buffers==='4')
      .catch(async error=>{console.error('Startup state:',await page.locator('body').innerText(),errors);throw error;});
    assert.equal(await page.locator('#error').isVisible(),false);
    console.log('Browser: startup complete');
    const before=Number(await page.locator('#status').getAttribute('data-x'));
    await page.keyboard.down('KeyD');
    await page.waitForFunction(x=>Number(document.querySelector('#status').dataset.x)>x+1,before);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(250);
    assert.ok(Number(await page.locator('#status').getAttribute('data-x'))>before+1,'Keyboard moves example actor');
    const oldCool=await page.locator('#status').getAttribute('data-cool');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(old=>document.querySelector('#status').dataset.cool!==old,oldCool);
    assert.notEqual(await page.locator('#status').getAttribute('data-cool'),oldCool,'Action changes light');
    // HTML template buttons are also operable by focused Enter/Space activation.
    await page.getByRole('button',{name:'Light',exact:true}).focus();
    const keyboardCool=await page.locator('#status').getAttribute('data-cool');
    await page.keyboard.press('Space');
    await page.waitForFunction(old=>document.querySelector('#status').dataset.cool!==old,keyboardCool);
    await page.locator('#pause').click();await page.waitForTimeout(100);
    const frozen=await page.locator('#status').getAttribute('data-time');
    await page.keyboard.down('KeyW');await page.waitForTimeout(150);await page.keyboard.up('KeyW');
    assert.equal(await page.locator('#status').getAttribute('data-time'),frozen,'Pause freezes simulation');
    await page.locator('#pause').click();
    console.log('Browser: input/pause complete');
    // Scene-lifetime stress runs on the target-free tier; the subsequent comparison
    // and ten world transfers exercise the optional screen tier independently.
    await page.getByLabel('Ambient occlusion',{exact:true}).selectOption('geometry',{force:true});
    for(let i=0;i<12;i++){
      const previous=await page.locator('#status').getAttribute('data-world');
      if(i%4===0)console.log(`Browser: scene cycle ${i+1}/12`);
      await page.locator('#restart').click();
      await page.waitForFunction(old=>{const s=document.querySelector('#status').dataset;return s.world!==old && s.world!=='preparing' && s.buffers==='4';},previous);
      assert.equal(await page.locator('.engine-joystick').count(),1);
      assert.equal(await page.locator('.engine-action').count(),2);
      assert.equal(await page.locator('#status').getAttribute('data-buffers'),'4');
      assert.equal(await page.locator('#status').getAttribute('data-vaos'),'3');
    }
    console.log('Browser: scene cycles complete');
    await page.screenshot({timeout:120000,path:path.join(artifacts,'worlds-amber-desktop.png')});
    await page.locator('#pause').click();
    await page.locator('#world-directory summary').click();
    for(const mode of ['off','geometry','screen']){
      await page.getByLabel('Ambient occlusion',{exact:true}).selectOption(mode);
      await page.locator('#world-directory summary').click();
      await page.waitForTimeout(100);
      await page.screenshot({timeout:120000,path:path.join(artifacts,`ao-amber-${mode}.png`)});
      await page.locator('#world-directory summary').click();
    }
    await page.locator('#world-directory summary').click();await page.locator('#pause').click();
    const actorId=await page.locator('#status').getAttribute('data-actor');
    const amberId=await page.locator('#status').getAttribute('data-world');
    const amberCount=await page.locator('#status').getAttribute('data-entities');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(()=>document.querySelector('#status').dataset.cool==='false');
    await page.keyboard.press('KeyG');
    await page.waitForFunction(()=>document.querySelector('#status').dataset.prop==='-6');
    await page.keyboard.press('KeyF');
    await page.waitForFunction(()=>document.querySelector('#status').dataset.committed==='1');
    assert.notEqual(await page.locator('#status').getAttribute('data-world'),amberId);
    assert.equal(await page.locator('#status').getAttribute('data-actor'),actorId);
    assert.equal(await page.locator('#status').getAttribute('data-cool'),'true','Other world has independent light state');
    assert.equal(await page.locator('#status').getAttribute('data-prop'),'6','Other world has independent prop position');
    await page.screenshot({timeout:120000,path:path.join(artifacts,'worlds-violet-desktop.png')});
    await page.locator('#world-directory summary').click();
    await page.locator('#release-inactive').click();
    await page.waitForFunction(()=>document.querySelector('#status').dataset.resident==='1');
    assert.equal(await page.locator('#status').getAttribute('data-buffers'),'3');
    assert.ok(Number(await page.locator('#status').getAttribute('data-snapshot-bytes'))>0);
    await page.screenshot({timeout:120000,path:path.join(artifacts,'worlds-directory.png')});
    await page.keyboard.press('KeyE');
    await page.waitForFunction(()=>document.querySelector('#status').dataset.cool==='false');
    await page.keyboard.press('KeyG');
    await page.waitForFunction(()=>document.querySelector('#status').dataset.prop==='-6');
    await page.keyboard.press('KeyF');
    await page.waitForFunction(()=>document.querySelector('#status').dataset.committed==='2');
    assert.equal(await page.locator('#status').getAttribute('data-world'),amberId,'World identity survives reconstruction');
    assert.equal(await page.locator('#status').getAttribute('data-actor'),actorId,'Actor identity survives reconstruction');
    assert.equal(await page.locator('#status').getAttribute('data-cool'),'false','Evicted light state restored');
    assert.equal(await page.locator('#status').getAttribute('data-prop'),'-6','Evicted prop position restored');
    assert.equal(await page.locator('#status').getAttribute('data-entities'),amberCount,'No duplicated actor on reconstruction');
    for(let i=3;i<=10;i++){
      await page.keyboard.press('KeyF');
      await page.waitForFunction(count=>document.querySelector('#status').dataset.committed===String(count),i);
      assert.equal(await page.locator('#status').getAttribute('data-actor'),actorId);
      assert.equal(await page.locator('#status').getAttribute('data-buffers'),'4');
      assert.equal(await page.locator('#status').getAttribute('data-resident'),'2');
    }
    report.worlds={transfers:10,stableActor:true,persistenceAfterEviction:true,
      snapshotBytes:Number(await page.locator('#status').getAttribute('data-snapshot-bytes')),
      diagnostics:await page.locator('#transfer-time').innerText()};
    await page.locator('#world-directory summary').click();
    await page.setViewportSize({width:1024,height:720});
    await page.waitForFunction(()=>document.querySelector('canvas').width===1024 && document.querySelector('canvas').height===720);
    report.resize=await page.evaluate(()=>{
      const c=document.querySelector('canvas');return {width:c.width,height:c.height,error:c.getContext('webgl2').getError()};
    });
    assert.deepEqual(report.resize,{width:1024,height:720,error:0});
    // Exercise the reusable profiler without exposing the production engine as a global.
    const inspector=page.locator('.etrnl-profiler');
    await inspector.locator(':scope > summary').click();
    await page.waitForFunction(()=>Number(document.querySelector('.etrnl-profiler').dataset.frame)>0);
    assert.match(await inspector.locator('.profile-scopes').innerText(),/lobby\.render/);
    await inspector.getByLabel('Freeze history',{exact:true}).check();
    const frozenProfile=await inspector.getAttribute('data-frame');
    const runningTime=await page.locator('#status').getAttribute('data-time');
    await page.waitForFunction(time=>document.querySelector('#status').dataset.time!==time,runningTime);
    assert.equal(await inspector.getAttribute('data-frame'),frozenProfile,'Freezing history does not advance the recorder or stop the game');
    for(let i=0;i<4;i++)await inspector.getByRole('button',{name:'Capture latest',exact:true}).click();
    assert.equal(await inspector.getAttribute('data-captures'),'2','Capture retention is bounded');
    const [download]=await Promise.all([page.waitForEvent('download'),inspector.getByRole('button',{name:'Export JSON',exact:true}).click()]);
    const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(exported.units,'milliseconds');assert.equal(exported.captures.length,2);
    const capture=exported.captures.at(-1),values=Object.fromEntries(capture.frame.counters.map(item=>[item.name,item.value]));
    const litCapacityBytes=2048*20*4,shadowCapacityBytes=2048*16*4;
    assert.equal(values['renderer.gpuBuffers'],864+2*litCapacityBytes+shadowCapacityBytes);
    assert.equal(values['directory.ownedGpuBuffers'],2*litCapacityBytes);
    assert.ok(capture.frame.scopes.some(scope=>scope.name==='atrium.presentation'));
    assert.match(capture.providerDetails.data.directory.resources[0].owners[0].owner,/realm:/);
    const gpuUnavailable=await inspector.getByLabel('GPU timing',{exact:true}).isDisabled();
    await inspector.evaluate(element=>{element.scrollTop=0;});
    await page.screenshot({timeout:120000,path:path.join(artifacts,'profiler-desktop.png')});
    await inspector.getByLabel('Freeze history',{exact:true}).uncheck();
    await inspector.getByLabel('Record',{exact:true}).uncheck();
    const offFrame=await inspector.getAttribute('data-frame'),offTime=await page.locator('#status').getAttribute('data-time');
    await page.waitForFunction(time=>document.querySelector('#status').dataset.time!==time,offTime);
    assert.equal(await inspector.getAttribute('data-frame'),offFrame,'Disabled recording leaves history untouched');
    await inspector.getByLabel('Record',{exact:true}).check();
    await page.waitForFunction(id=>Number(document.querySelector('.etrnl-profiler').dataset.frame)>Number(id),offFrame);
    report.profiler={historyCapacity:exported.summary.capacity,retainedCaptures:2,freezeKeepsGameRunning:true,
      disabledKeepsGameRunning:true,exportedBytes:fs.statSync(await download.path()).size,gpuUnavailable,
      requestedGpuBufferBytes:values['renderer.gpuBuffers'],owners: capture.providerDetails.data.directory.resources.map(resource=>resource.owners)};
    fs.copyFileSync(await download.path(),path.join(artifacts,'profiler-capture.json'));
    await inspector.locator(':scope > summary').click();
    report.offline={networkRequests:remote.length,sceneReplacements:12,status:await page.locator('#status').innerText()};
    assert.equal(remote.length,0,'Offline artifact makes zero network requests');
    await page.close(); // Do not keep an unrelated software-rendered world consuming GPU/CPU during touch checks.

    // Exercise the actual DOM control templates with simultaneous touch pointers.
    const mobile=await browser.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    mobile.setDefaultTimeout(120000);
    const phone=await mobile.newPage();await phone.evaluate(installGuard);phone.on('pageerror',e=>errors.push(e.message));
    await phone.setContent(fs.readFileSync(path.join(root,'dist/ETRNLNINE-Atrium.html'),'utf8'));
    await phone.waitForFunction(()=>document.querySelector('#status').dataset.actor && document.querySelector('#status').dataset.buffers==='4');
    assert.equal(await phone.getByLabel('Ambient occlusion',{exact:true}).inputValue(),'geometry','Portrait starts with the cheaper target-free tier');
    const stick=await phone.locator('.engine-joystick').boundingBox(),button=await phone.getByRole('button',{name:'Light',exact:true}).boundingBox();
    const cdp=await mobile.newCDPSession(phone);
    const x0=Number(await phone.locator('#status').getAttribute('data-x'));
    const c0=await phone.locator('#status').getAttribute('data-cool');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[
      {x:stick.x+stick.width/2+35,y:stick.y+stick.height/2,id:1},
      {x:button.x+button.width/2,y:button.y+button.height/2,id:2}]});
    await phone.waitForFunction(x=>Number(document.querySelector('#status').dataset.x)>x+0.5,x0);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await phone.locator('.engine-joystick span').evaluate(element=>element.style.transform),'','Released stick recenters');
    assert.ok(Number(await phone.locator('#status').getAttribute('data-x'))>x0+0.4,'Touch joystick moves while button is held');
    assert.notEqual(await phone.locator('#status').getAttribute('data-cool'),c0,'Second finger activates button independently');
    // Steering intentionally coasts after release. Wait in simulation time, not wall
    // time, so software GPU scheduling cannot masquerade as a stuck touch input.
    const releasedAt=Number(await phone.locator('#status').getAttribute('data-time'));
    await phone.waitForFunction(time=>Number(document.querySelector('#status').dataset.time)>time+1,releasedAt);
    const x1=Number(await phone.locator('#status').getAttribute('data-x'));
    const settledAt=Number(await phone.locator('#status').getAttribute('data-time'));
    await phone.waitForFunction(time=>Number(document.querySelector('#status').dataset.time)>time+0.3,settledAt);
    assert.ok(Math.abs(Number(await phone.locator('#status').getAttribute('data-x'))-x1)<0.3,'Touch release stops movement');
    await phone.getByRole('button',{name:'Flit',exact:true}).tap();
    await phone.waitForFunction(()=>document.querySelector('#status').dataset.committed==='1');
    await phone.screenshot({timeout:120000,path:path.join(artifacts,'worlds-violet-mobile.png')});
    await phone.locator('.etrnl-profiler > summary').tap();
    await phone.waitForFunction(()=>Number(document.querySelector('.etrnl-profiler').dataset.frame)>0);
    await phone.screenshot({timeout:120000,path:path.join(artifacts,'profiler-mobile.png')});
    const bounds=await phone.locator('.etrnl-profiler').boundingBox();
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=412,'Profiler fits the portrait viewport');
    report.touch={simultaneousPointers:2,status:await phone.locator('#status').innerText()};
    await mobile.close();

    // A second, empty engine and independent primitive scene exercise public interfaces.
    page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
    report.engine=await page.evaluate(async()=>{
      const {ETRNLNINE}=await import('/engine/etrnlnine.js');
      const canvas=document.querySelector('canvas'),engine=new ETRNLNINE(canvas,{profiling:{enabled:true}}),r=engine.basement.renderer;
      engine.start();engine.start();engine.stop();r.render();
      const empty={worlds:engine.directory.worlds.size,resources:engine.directory.resources.size,draws:r.stats.draws};
      const world=engine.directory.adopt(engine.basement.createWorld());
      const part=engine.directory.create('toy.box',{world,size:[2,2,2]});world.resolve();
      const lease=engine.directory.acquire('test-batch',()=>r.createBatch(world));
      r.render(lease.value);r.render(lease.value);const warm={...r.stats};
      part.x=2;world.resolve();r.render(lease.value);const moved={...r.stats};
      const pixels=new Uint8Array(canvas.width*canvas.height*4);
      r.gl.readPixels(0,0,canvas.width,canvas.height,r.gl.RGBA,r.gl.UNSIGNED_BYTE,pixels);
      let varied=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>50)varied++;
      const glError=r.gl.getError();
      // Keep test references only inside this isolated fixture, never in the delivered example.
      window.fixture={engine,r,lease,world};
      return {empty,warm,moved,glError,varied};
    });
    assert.deepEqual(report.engine.empty,{worlds:0,resources:0,draws:0});
    assert.equal(report.engine.warm.uploads,0,'Unchanged retained instances do not upload');
    assert.ok(report.engine.moved.uploadedBytes>0 && report.engine.moved.uploadedBytes<=80,'One transform updates a bounded range');
    assert.equal(report.engine.glError,0);assert.ok(report.engine.varied>10,'Actual non-background pixels rendered');
    // Real shadow pixels and cache/ownership behavior, separate from the example's artwork.
    report.lighting=await page.evaluate(()=>{
      const {engine,r}=window.fixture,l=r.lighting,gl=r.gl;
      const world=engine.basement.createWorld(),box=options=>engine.directory.create('toy.box',{world,...options});
      box({z:-0.25,size:[20,20,0.5],color:[0.6,0.6,0.6]});
      const wall=box({y:2,z:1.5,size:[5,0.6,3],color:[0.4,0.35,0.5]});
      box({x:-2,y:-1,z:1,size:[0.8,0.8,2],color:[0.55,0.4,0.2]});
      box({x:3,y:-1,z:1,size:[0.6,0.6,1],color:[0.8,0.4,0.2],emission:2,castShadow:false});
      box({x:11,z:6,size:[1,1,1],color:[0.4,0.4,0.5]}); // Truly outside the camera, but its shadow lands inside.
      world.resolve();const batch=r.createBatch(world,64);r.camera.halfHeight=6;
      r.occlusion.configure({mode:'off'});l.ambient.fill(0);l.colors.fill(0);
      l.configureDirectional({direction:[1,0,1],color:[1,1,1]});
      /** Production never reads shadow pixels; these immediate readbacks are test evidence only. */
      const image=mode=>{l.configureShadows({mode,extent:16});r.render(batch);const p=new Uint8Array(r.canvas.width*r.canvas.height*4);gl.readPixels(0,0,r.canvas.width,r.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
      const compare=(a,b)=>{let changed=0,brighter=0;for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<3;c++){d=Math.max(d,Math.abs(a[i+c]-b[i+c]));if(b[i+c]>a[i+c]+1)brighter++;}if(d>1)changed++;}return{changed,brighter};};
      // Temporarily disable all elevated casters: a flat floor must never shadow itself.
      const elevated=[];for(const entity of world.entities.values())if(entity.z>0){elevated.push([entity,entity.shape]);entity.shape=null;}
      const flatOff=image('off'),flatOn=image('low'),flatDifference=compare(flatOff,flatOn);
      for(const[entity,shape]of elevated)entity.shape=shape;
      const unshadowed=image('off'),shadowed=image('low'),sunDifference=compare(unshadowed,shadowed);
      const first=l.maps.inspect();wall.shape.material.baseColor=[0.1,0.2,0.3];r.render(batch);const cached=l.maps.inspect();
      const offscreenCaster=Array.from({length:l.maps.casters.count},(_,i)=>l.maps.casters.data[i*16]).includes(11);
      const offscreenVisible=Array.from({length:batch.count},(_,i)=>batch.data[i*batch.recordFloats]).includes(11);
      wall.x+=1;world.resolve();r.render(batch);const moved=l.maps.inspect();
      // Changing map resolution replaces its target, preserving the shared depth program.
      const program=l.maps.program;image('high');const high=l.maps.inspect(),sameProgram=l.maps.program===program;
      l.configureDirectional({color:[0,0,0]});l.setPoint(0,{position:[0,-3,3],color:[3,2,1],radius:12});
      const originalNow=performance.now;let now=10000;performance.now=()=>now;
      let pointDifference,pointFirst,pointCached,throttled,refreshed,lightMoved,colorChanged;
      try{
        const off=image('off');l.configureShadows({pointIndex:0,pointResolution:128,pointRefreshHz:1});const on=image('low');
        pointDifference=compare(off,on);pointFirst=l.maps.inspect();r.render(batch);pointCached=l.maps.inspect();
        wall.x+=0.5;world.resolve();r.render(batch);throttled=l.maps.inspect();
        now+=1001;r.render(batch);refreshed=l.maps.inspect();
        l.positions[0]+=1;r.render(batch);lightMoved=l.maps.inspect();
        l.colors[0]=2;r.render(batch);colorChanged=l.maps.inspect();
      }finally{performance.now=originalNow;}
      // A different world must never inherit the old cube or retain its world reference.
      const other=engine.basement.createWorld();engine.directory.create('toy.box',{world:other,size:[1,1,1]});other.resolve();
      const otherBatch=r.createBatch(other,64);r.render(otherBatch);const travel=l.maps.inspect();
      otherBatch.dispose();const afterSourceRelease=l.maps.inspect();
      l.configureShadows({mode:'off',pointIndex:-1});other.dispose();batch.dispose();world.dispose();
      l.configureDirectional({direction:[-0.4,-0.5,1],color:[0.20,0.22,0.29]});l.positions.fill(0);l.colors.fill(0);l.ambient.set([0.13,0.13,0.23]);
      const released=l.maps.inspect();
      return{flatDifference,sunDifference,pointDifference,first,cached,moved,high,sameProgram,offscreenCaster,offscreenVisible,
        pointFirst,pointCached,throttled,refreshed,lightMoved,colorChanged,travel,afterSourceRelease,released,error:gl.getError()};
    });
    assert.equal(report.lighting.flatDifference.changed,0,'Flat receiver has no self-shadow speckling');
    assert.ok(report.lighting.sunDifference.changed>100,'Sun map casts onto neighboring surfaces');
    assert.equal(report.lighting.sunDifference.brighter,0);assert.equal(report.lighting.first.frameDraws,1);
    assert.equal(report.lighting.cached.frameDraws,0,'Unchanged sun geometry reuses its map');
    assert.equal(report.lighting.moved.sunUpdates,report.lighting.cached.sunUpdates+1);
    assert.equal(report.lighting.high.sunResolution,1024);assert.equal(report.lighting.sameProgram,true);
    assert.equal(report.lighting.offscreenCaster,true);assert.equal(report.lighting.offscreenVisible,false);
    assert.ok(report.lighting.pointDifference.changed>100,'Selected local light is occluded by scene geometry');
    assert.equal(report.lighting.pointFirst.frameDraws,6);assert.equal(report.lighting.pointCached.frameDraws,0);
    assert.equal(report.lighting.throttled.frameDraws,0);assert.equal(report.lighting.refreshed.frameDraws,6);
    assert.equal(report.lighting.lightMoved.frameDraws,6);assert.equal(report.lighting.colorChanged.frameDraws,0);
    assert.equal(report.lighting.travel.frameDraws,6);assert.equal(report.lighting.released.casters,0);
    assert.equal(report.lighting.released.textures,0);assert.equal(report.lighting.afterSourceRelease.casters,0);assert.equal(report.lighting.afterSourceRelease.casterGpuBytes,0);assert.equal(report.lighting.error,0);
    // Compare AO on real pixels immediately after submission (before default-buffer discard).
    console.log('Browser: primitive complete; testing AO pixels/lifecycle');
    report.ambientOcclusion=await page.evaluate(()=>{
      const {engine,r}=window.fixture,ao=r.occlusion,gl=r.gl;
      const world=engine.basement.createWorld(),box=options=>engine.directory.create('toy.box',{world,...options});
      box({z:-0.25,size:[18,18,0.5],color:[0.5,0.45,0.55]});
      box({x:-1,y:1,z:1.5,size:[1,5,3],color:[0.4,0.35,0.5]});
      box({x:1,y:1,z:0.5,size:[2,2,1],color:[0.55,0.4,0.25]});
      box({x:1,y:1,z:1.3,size:[0.4,0.4,1],color:[0.7,0.5,0.2],emission:3});
      world.resolve();const batch=r.createBatch(world);r.camera.halfHeight=6;r.lighting.ambient.set([0.7,0.6,0.8]);
      /** Read only in tests. Production never reads pixels or waits for AO/GPU results. */
      const image=mode=>{ao.configure({mode});r.render(batch);const p=new Uint8Array(r.canvas.width*r.canvas.height*4);gl.readPixels(0,0,r.canvas.width,r.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
      const off=image('off'),geometry=image('geometry'),screen=image('screen');
      const screenInfo=ao.inspect();
      /** Count changed RGB pixels and changes that violate ambient-only darkening. */
      const compare=(a,b)=>{let changed=0,brighter=0,maxDifference=0;for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<3;c++){d=Math.max(d,Math.abs(a[i+c]-b[i+c]));if(b[i+c]>a[i+c]+1)brighter++;}if(d>1)changed++;maxDifference=Math.max(d,maxDifference);}return{changed,brighter,maxDifference};};
      const geometryDifference=compare(off,geometry),screenDifference=compare(geometry,screen);
      r.lighting.ambient.fill(0);const directDifference=compare(image('off'),image('screen'));
      // Reject an incomplete framebuffer cleanly, then allow explicit retry.
      ao.configure({mode:'off'});const original=gl.checkFramebufferStatus;gl.checkFramebufferStatus=()=>gl.FRAMEBUFFER_UNSUPPORTED;
      ao.configure({mode:'screen'});r.render(batch);const fallback=ao.inspect();gl.checkFramebufferStatus=original;
      const handles={textures:0,framebuffers:0,programs:0},restore=[];
      for(const[type,key]of [['Texture','textures'],['Framebuffer','framebuffers'],['Program','programs']])for(const[op,delta]of [['create',1],['delete',-1]]){
        const name=op+type,method=gl[name];gl[name]=function(...args){handles[key]+=delta;return method.apply(this,args);};restore.push(()=>{gl[name]=method;});
      }
      let cycles;
      try{
        for(let i=0;i<6;i++){
          ao.configure({mode:'screen',resolutionScale:i%2?0.5:0.75});r.render(batch);
          ao.configure({mode:'geometry'});
        }
        cycles={...handles};
      }finally{for(const reset of restore)reset();}
      // Leave screen AO alive to exercise recreation in the existing context-loss check.
      ao.configure({mode:'screen'});r.lighting.ambient.set([0.13,0.13,0.23]);r.render(batch);
      batch.dispose();world.dispose();
      return{geometryDifference,screenDifference,directDifference,screenInfo,fallback,cycles,error:gl.getError()};
    });
    assert.ok(report.ambientOcclusion.geometryDifference.changed>50,'Analytic AO visibly shades actual neighboring surfaces');
    assert.ok(report.ambientOcclusion.screenDifference.changed>50,'Screen AO adds finer visible contacts');
    assert.equal(report.ambientOcclusion.geometryDifference.brighter,0);
    assert.equal(report.ambientOcclusion.directDifference.changed,0,'Direct lighting and emission survive AO unchanged');
    assert.equal(report.ambientOcclusion.screenInfo.textures,3);assert.ok(report.ambientOcclusion.screenInfo.width<=768);
    assert.equal(report.ambientOcclusion.fallback.effectiveMode,'geometry');assert.equal(report.ambientOcclusion.fallback.textures,0);
    assert.match(report.ambientOcclusion.fallback.failure,/framebuffer/);
    assert.deepEqual(report.ambientOcclusion.cycles,{textures:0,framebuffers:0,programs:0});
    assert.equal(report.ambientOcclusion.error,0);
    console.log('Browser: AO pixels/lifecycle complete');
    report.profilerRenderer=await page.evaluate(async()=>{
      const f=window.fixture,p=f.engine.basement.profiler;
      p.beginFrame(16);f.world.entities.values().next().value.x=4;f.world.resolve();
      f.r.prepare(f.lease.value);f.r.render(f.lease.value);p.endFrame();
      const capture=p.capture(),values=Object.fromEntries(capture.frame.counters.map(item=>[item.name,item.value]));
      const baseline=f.engine.lobby.phases.render.size;
      for(let i=0;i<5;i++){
        const view=f.engine.directory.create('tool.profiler',{profiler:p,host:document.body,
          subscribe:callback=>f.engine.lobby.on('render',callback,'test.viewer')});
        view.element.open=true;view.element.dispatchEvent(new Event('toggle'));
        if(f.engine.lobby.phases.render.size!==baseline+1)throw new Error('Profiler viewer failed to subscribe');
        view.dispose();if(f.engine.lobby.phases.render.size!==baseline)throw new Error('Profiler viewer leaked callback');
      }
      p.configure({gpu:true});p.beginFrame(16);f.r.render(f.lease.value);p.endFrame();
      await new Promise(resolve=>setTimeout(resolve,80));f.r.render(f.lease.value);
      const gpu=f.r.gpuTimer.inspect();p.configure({gpu:false});
      return{preparationUploadBytes:values['renderer.uploadedBytes'],lastDrawUploadBytes:f.r.stats.uploadedBytes,
        gpu,queryObjectsAfterDisable:f.r.gpuTimer.slots.length,viewerCycles:5,
        remainingViewers:document.querySelectorAll('.etrnl-profiler').length,error:f.r.gl.getError()};
    });
    assert.ok(report.profilerRenderer.preparationUploadBytes>0,'Preparation uploads survive presentation stats reset');
    assert.equal(report.profilerRenderer.lastDrawUploadBytes,0);
    assert.equal(report.profilerRenderer.queryObjectsAfterDisable,0);assert.equal(report.profilerRenderer.remainingViewers,0);
    assert.equal(report.profilerRenderer.error,0);
    const isolatedProvider=await page.evaluate(()=>{
      const p=window.fixture.engine.basement.profiler;
      const remove=p.provider('bad-report',{sample(){throw null;},details(){throw{get message(){throw new Error('hostile');}};}});
      p.beginFrame(16);p.endFrame();const capture=p.capture();remove();
      return{errors:p.stats.providerErrors,message:capture.providerDetails.data['bad-report'].error};
    });
    assert.equal(isolatedProvider.errors,1);assert.equal(isolatedProvider.message,'[unreadable diagnostic error]');
    report.profilerRenderer.badProviderIsolated=true;
    report.profilerStartup=await page.evaluate(async()=>{
      const {ETRNLNINE}=await import('/engine/etrnlnine.js');
      const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2');
      const counts={buffers:0,programs:0,windowListeners:0},restores=[];
      for(const[name,key,delta]of [['createBuffer','buffers',1],['deleteBuffer','buffers',-1],['createProgram','programs',1],['deleteProgram','programs',-1]]){
        const original=gl[name];gl[name]=function(...args){counts[key]+=delta;return original.apply(this,args);};
        restores.push(()=>{gl[name]=original;});
      }
      for(const[name,delta]of [['addEventListener',1],['removeEventListener',-1]]){
        const original=window[name];window[name]=function(...args){counts.windowListeners+=delta;return original.apply(this,args);};
        restores.push(()=>{window[name]=original;});
      }
      let rejected=0;
      try{
        for(const config of [{maxCounters:2},{maxScopes:2}]){
          try{new ETRNLNINE(canvas,{profiling:config});}
          catch(error){if(!/budget/.test(error.message))throw error;rejected++;}
        }
      }finally{for(const restore of restores)restore();}
      return{rejected,...counts,error:gl.getError()};
    });
    assert.deepEqual(report.profilerStartup,{rejected:2,buffers:0,programs:0,windowListeners:0,error:0});
    const restoration=await page.evaluate(async()=>{
      const f=window.fixture;f.r.lighting.configureShadows({mode:'low',pointIndex:0});f.r.lighting.setPoint(0,{position:[0,0,4],color:[1,1,1],radius:12});f.r.render(f.lease.value);
      const extension=f.r.gl.getExtension('WEBGL_lose_context');
      if(!extension)return{supported:false};
      extension.loseContext();await new Promise(resolve=>setTimeout(resolve,80));
      const paused=f.engine.lobby.reasons.has('gpu-context');
      extension.restoreContext();
      await new Promise((resolve,reject)=>{
        let tries=0;const poll=()=>{if(f.r.stats.contextRestores)resolve();else if(++tries>100)reject(new Error('Context restore timed out'));else setTimeout(poll,20);};poll();
      });
      f.r.render(f.lease.value);
      return {supported:true,paused,restores:f.r.stats.contextRestores,buffers:f.r.stats.buffers,shadows:f.r.lighting.maps.inspect(),ao:f.r.occlusion.inspect(),error:f.r.gl.getError()};
    });
    if(restoration.supported){assert.equal(restoration.paused,true);assert.equal(restoration.buffers,3);assert.equal(restoration.error,0);assert.equal(restoration.ao.effectiveMode,'screen');assert.equal(restoration.ao.textures,3);assert.equal(restoration.shadows.sunReady,true);assert.equal(restoration.shadows.pointReady,true);}
    report.context=restoration;
    report.disposal=await page.evaluate(()=>{
      const f=window.fixture;f.engine.dispose();f.lease.release();f.engine.dispose();
      return {buffers:f.r.stats.buffers,programs:f.r.stats.programs,vaos:f.r.stats.vaos,
        worlds:f.engine.directory.worlds.size,resources:f.engine.directory.resources.size,running:f.engine.lobby.running};
    });
    const profilerDisposed=await page.evaluate(()=>({providers:window.fixture.engine.basement.profiler.providers.size,history:window.fixture.engine.basement.profiler.frames.length,queries:window.fixture.r.gpuTimer.slots.length}));
    assert.deepEqual(profilerDisposed,{providers:0,history:0,queries:0});
    assert.deepEqual(report.disposal,{buffers:0,programs:0,vaos:0,worlds:0,resources:0,running:false});
    // Exercise actual chunked world preparation and collision queries using public modules.
    await page.evaluate(async()=>{
      const {ETRNLNINE}=await import('/engine/etrnlnine.js');
      const {createJourney}=await import('/examples/atrium/journey.js');
      const engine=new ETRNLNINE(document.querySelector('canvas'));engine.basement.renderer.resize();
      const journey=createJourney(engine);engine.start();await journey.ready;
      window.journeyFixture={engine,journey,initialId:journey.actor.root.id,sourceId:journey.current.world.id};
    });
    await page.waitForFunction(()=>window.journeyFixture.engine.directory.residency.inspect().worlds.every(w=>w.status==='ready'));
    await page.evaluate(()=>{
      const {journey}=window.journeyFixture;
      journey.actor.root.x=7;journey.actor.root.y=-3;journey.flit();
    });
    await page.waitForFunction(()=>window.journeyFixture.journey.travel.stats.failed===1);
    assert.equal(await page.evaluate(()=>window.journeyFixture.journey.actor.root.worldId===window.journeyFixture.sourceId),true,'Real destination obstacle refuses transfer');
    await page.evaluate(()=>{
      const {journey}=window.journeyFixture;journey.actor.root.x=0;journey.actor.root.y=-8;
      journey.releaseInactive();journey.flit();journey.cancel();
    });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.journeyFixture.engine.directory.residency.records.size),1,'Cancelled preparation leaves active world only');
    await page.evaluate(()=>{
      const {engine,journey}=window.journeyFixture;engine.lobby.pause('test-pause');journey.flit();
    });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.journeyFixture.journey.actor.root.worldId===window.journeyFixture.sourceId),true,'Pause cannot commit or prepare destination');
    await page.evaluate(()=>window.journeyFixture.engine.lobby.pause('test-pause',false));
    await page.waitForFunction(()=>window.journeyFixture.journey.travel.stats.committed===1);
    report.worldLifecycle=await page.evaluate(()=>{
      const {engine,journey,initialId}=window.journeyFixture;
      const result={blocked:journey.travel.stats.failed,cancelled:journey.travel.stats.cancelled,
        committed:journey.travel.stats.committed,stableActor:journey.actor.root.id===initialId,
        peakResident:engine.directory.residency.stats.peakResident,preparation:engine.lobby.preparation.stats};
      journey.dispose();
      result.afterScene={worlds:engine.directory.worlds.size,resources:engine.directory.resources.size,
        residency:engine.directory.residency.records.size,definitions:engine.directory.residency.definitions.size,
        buffers:engine.basement.renderer.stats.buffers,jobs:engine.lobby.preparation.jobs.size};
      engine.dispose();result.afterEngine={...engine.basement.renderer.stats};return result;
    });
    assert.equal(report.worldLifecycle.stableActor,true);assert.equal(report.worldLifecycle.peakResident,2);
    assert.deepEqual(report.worldLifecycle.afterScene,{worlds:0,resources:0,residency:0,definitions:0,buffers:1,jobs:0});
    assert.equal(report.worldLifecycle.afterEngine.buffers,0);
    // A closer camera on the actual Atrium makes architectural contacts easier to inspect.
    await page.setViewportSize({width:1280,height:900});
    await page.evaluate(async()=>{
      const {ETRNLNINE}=await import('/engine/etrnlnine.js');
      const {createJourney}=await import('/examples/atrium/journey.js');
      document.body.style.cssText='margin:0;background:#10101b;overflow:hidden';
      const canvas=document.querySelector('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';
      const engine=new ETRNLNINE(canvas),r=engine.basement.renderer,journey=createJourney(engine);
      r.camera.x=-4;r.camera.y=7;r.camera.halfHeight=9;
      // This fixture captures a static scene. Prepare without rendering every frame,
      // then stop; an unused neighbor must not gate close-up comparison screenshots.
      engine.start();await journey.ready;engine.stop();
      const world=journey.current;
      r.lighting.ambient.set(world.profile.ambient);r.lighting.positions.set(world.lights);r.lighting.colors.set(world.lightColors);
      world.world.resolve();window.detailFixture={engine,journey,r};
    });
    // Static comparisons submit one frame each. Runtime scheduling and both-world
    // readiness were exercised above; no continuous software-GPU queue is needed here.
    for(const mode of ['off','geometry','screen']){
      await page.evaluate(mode=>{const f=window.detailFixture;f.r.occlusion.configure({mode});f.journey.current.world.resolve();f.r.render(f.journey.current.batch);},mode);
      await page.waitForTimeout(100);
      await page.screenshot({timeout:120000,path:path.join(artifacts,`ao-detail-${mode}.png`)});
    }
    await page.evaluate(()=>{
      const f=window.detailFixture;f.r.lighting.configureDirectional(f.journey.current.profile.sun);
      f.r.occlusion.configure({mode:'geometry'});
    });
    for(const mode of ['off','low','high']){
      await page.evaluate(mode=>{const f=window.detailFixture;f.r.lighting.configureShadows({mode,pointIndex:5,extent:24});f.r.render(f.journey.current.batch);},mode);
      await page.waitForTimeout(100);
      await page.screenshot({timeout:120000,path:path.join(artifacts,`lighting-detail-${mode}.png`)});
    }
    report.lighting.detail=await page.evaluate(()=>window.detailFixture.r.lighting.inspect());
    report.ambientOcclusion.detail=await page.evaluate(()=>{
      const f=window.detailFixture,result={...f.r.occlusion.inspect(),error:f.r.gl.getError()};
      f.journey.dispose();f.engine.dispose();return result;
    });
    assert.equal(report.ambientOcclusion.detail.error,0);
    assert.deepEqual(errors,[],'No browser errors');
    fs.writeFileSync(path.join(artifacts,'browser-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
