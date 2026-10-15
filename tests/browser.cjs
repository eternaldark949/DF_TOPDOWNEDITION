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
    const page=await context.newPage();
    await page.evaluate(installGuard);page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const remote=[];page.on('request',request=>{if(/^https?:/.test(request.url()))remote.push(request.url());});
    await page.setContent(fs.readFileSync(path.join(root,'dist/ETRNLNINE-Atrium.html'),'utf8'));
    await page.waitForFunction(()=>document.querySelector('#status').dataset.time>0.1);
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
    await page.locator('.engine-action').focus();
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
      await page.waitForFunction(old=>document.querySelector('#status').dataset.world!==old,previous);
      assert.equal(await page.locator('.engine-joystick').count(),1);
      assert.equal(await page.locator('.engine-action').count(),1);
      assert.equal(await page.locator('#status').getAttribute('data-buffers'),'2');
      assert.equal(await page.locator('#status').getAttribute('data-vaos'),'1');
    }
    await page.screenshot({path:path.join(artifacts,'atrium-desktop.png')});
    await page.setViewportSize({width:1024,height:720});
    await page.waitForFunction(()=>document.querySelector('canvas').width===1024 && document.querySelector('canvas').height===720);
    report.resize=await page.evaluate(()=>{
      const c=document.querySelector('canvas');return {width:c.width,height:c.height,error:c.getContext('webgl2').getError()};
    });
    assert.deepEqual(report.resize,{width:1024,height:720,error:0});
    report.offline={networkRequests:remote.length,sceneReplacements:12,status:await page.locator('#status').innerText()};
    assert.equal(remote.length,0,'Offline artifact makes zero network requests');

    // Exercise the actual DOM control templates with simultaneous touch pointers.
    const mobile=await browser.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const phone=await mobile.newPage();await phone.evaluate(installGuard);phone.on('pageerror',e=>errors.push(e.message));
    await phone.setContent(fs.readFileSync(path.join(root,'dist/ETRNLNINE-Atrium.html'),'utf8'));
    await phone.waitForFunction(()=>document.querySelector('#status').dataset.time>0.1);
    const stick=await phone.locator('.engine-joystick').boundingBox(),button=await phone.locator('.engine-action').boundingBox();
    const cdp=await mobile.newCDPSession(phone);
    const x0=Number(await phone.locator('#status').getAttribute('data-x'));
    const c0=await phone.locator('#status').getAttribute('data-cool');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[
      {x:stick.x+stick.width/2+35,y:stick.y+stick.height/2,id:1},
      {x:button.x+button.width/2,y:button.y+button.height/2,id:2}]});
    await phone.waitForFunction(x=>Number(document.querySelector('#status').dataset.x)>x+0.5,x0);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await phone.waitForTimeout(300);
    assert.ok(Number(await phone.locator('#status').getAttribute('data-x'))>x0+0.4,'Touch joystick moves while button is held');
    assert.notEqual(await phone.locator('#status').getAttribute('data-cool'),c0,'Second finger activates button independently');
    const x1=Number(await phone.locator('#status').getAttribute('data-x'));
    await phone.waitForTimeout(400);
    assert.ok(Math.abs(Number(await phone.locator('#status').getAttribute('data-x'))-x1)<0.3,'Touch release stops movement');
    await phone.screenshot({path:path.join(artifacts,'atrium-mobile.png')});
    report.touch={simultaneousPointers:2,status:await phone.locator('#status').innerText()};
    await mobile.close();

    // A second, empty engine and independent primitive scene exercise public interfaces.
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
    assert.deepEqual(errors,[],'No browser errors');
    fs.writeFileSync(path.join(artifacts,'browser-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
