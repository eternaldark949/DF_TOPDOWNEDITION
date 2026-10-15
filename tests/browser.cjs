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
  try{res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(target));}
  catch{res.writeHead(404);res.end();}
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.ETRNLNINE_CHROMIUM||'/usr/bin/chromium',headless:true,
    args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[];const report={};
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
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
    await page.waitForFunction(()=>document.querySelector('#status').dataset.actor && document.querySelector('#status').dataset.buffers==='3')
      .catch(async error=>{console.error('Startup state:',await page.locator('body').innerText(),errors);throw error;});
    assert.equal(await page.locator('#error').isVisible(),false);
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
    for(let i=0;i<12;i++){
      const previous=await page.locator('#status').getAttribute('data-world');
      await page.locator('#restart').click();
      await page.waitForFunction(old=>{const s=document.querySelector('#status').dataset;return s.world!==old && s.world!=='preparing' && s.buffers==='3';},previous);
      assert.equal(await page.locator('.engine-joystick').count(),1);
      assert.equal(await page.locator('.engine-action').count(),2);
      assert.equal(await page.locator('#status').getAttribute('data-buffers'),'3');
      assert.equal(await page.locator('#status').getAttribute('data-vaos'),'2');
    }
    await page.screenshot({path:path.join(artifacts,'worlds-amber-desktop.png')});
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
    await page.screenshot({path:path.join(artifacts,'worlds-violet-desktop.png')});
    await page.locator('#world-directory summary').click();
    await page.locator('#release-inactive').click();
    await page.waitForFunction(()=>document.querySelector('#status').dataset.resident==='1');
    assert.equal(await page.locator('#status').getAttribute('data-buffers'),'2');
    assert.ok(Number(await page.locator('#status').getAttribute('data-snapshot-bytes'))>0);
    await page.screenshot({path:path.join(artifacts,'worlds-directory.png')});
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
      assert.equal(await page.locator('#status').getAttribute('data-buffers'),'3');
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
    report.offline={networkRequests:remote.length,sceneReplacements:12,status:await page.locator('#status').innerText()};
    assert.equal(remote.length,0,'Offline artifact makes zero network requests');
    await page.close(); // Do not keep an unrelated software-rendered world consuming GPU/CPU during touch checks.

    // Exercise the actual DOM control templates with simultaneous touch pointers.
    const mobile=await browser.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const phone=await mobile.newPage();await phone.evaluate(installGuard);phone.on('pageerror',e=>errors.push(e.message));
    await phone.setContent(fs.readFileSync(path.join(root,'dist/ETRNLNINE-Atrium.html'),'utf8'));
    await phone.waitForFunction(()=>document.querySelector('#status').dataset.actor && document.querySelector('#status').dataset.buffers==='3');
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
    await phone.screenshot({path:path.join(artifacts,'worlds-violet-mobile.png')});
    report.touch={simultaneousPointers:2,status:await phone.locator('#status').innerText()};
    await mobile.close();

    // A second, empty engine and independent primitive scene exercise public interfaces.
    page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
    report.engine=await page.evaluate(async()=>{
      const {ETRNLNINE}=await import('/engine/etrnlnine.js');
      const canvas=document.querySelector('canvas'),engine=new ETRNLNINE(canvas),r=engine.basement.renderer;
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
    assert.ok(report.engine.moved.uploadedBytes>0 && report.engine.moved.uploadedBytes<=48,'One transform updates a bounded range');
    assert.equal(report.engine.glError,0);assert.ok(report.engine.varied>10,'Actual non-background pixels rendered');
    const restoration=await page.evaluate(async()=>{
      const f=window.fixture,extension=f.r.gl.getExtension('WEBGL_lose_context');
      if(!extension)return{supported:false};
      extension.loseContext();await new Promise(resolve=>setTimeout(resolve,80));
      const paused=f.engine.lobby.reasons.has('gpu-context');
      extension.restoreContext();
      await new Promise((resolve,reject)=>{
        let tries=0;const poll=()=>{if(f.r.stats.contextRestores)resolve();else if(++tries>100)reject(new Error('Context restore timed out'));else setTimeout(poll,20);};poll();
      });
      f.r.render(f.lease.value);
      return {supported:true,paused,restores:f.r.stats.contextRestores,buffers:f.r.stats.buffers,error:f.r.gl.getError()};
    });
    if(restoration.supported){assert.equal(restoration.paused,true);assert.equal(restoration.buffers,2);assert.equal(restoration.error,0);}
    report.context=restoration;
    report.disposal=await page.evaluate(()=>{
      const f=window.fixture;f.engine.dispose();f.lease.release();f.engine.dispose();
      return {buffers:f.r.stats.buffers,programs:f.r.stats.programs,vaos:f.r.stats.vaos,
        worlds:f.engine.directory.worlds.size,resources:f.engine.directory.resources.size,running:f.engine.lobby.running};
    });
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
    assert.deepEqual(errors,[],'No browser errors');
    fs.writeFileSync(path.join(artifacts,'browser-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
