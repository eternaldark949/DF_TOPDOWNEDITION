/** Real touch acceptance for shared authoring tools; software GL is not a phone benchmark. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'dist/ETRNLNINE-Studio.html'),'utf8');
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html>');return;}const file=path.resolve(root,'.'+req.url);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.ETRNLNINE_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[],requests=[],report={},perspective=process.env.ETRNLNINE_PERSPECTIVE==='1';
 const {Camera}=await import('../engine/basement/camera.js');const camera=new Camera();camera.halfHeight=24;camera.preset('top');if(perspective)camera.setProjection('perspective');
 try{
  const context=await browser.newContext({viewport:{width:412,height:892},hasTouch:true,isMobile:true,acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(kind==='2d')throw new Error('Canvas2D forbidden');return get.call(this,kind,...args);};});
  page.on('request',r=>requests.push(r.url()));await page.setContent(html);await page.waitForFunction(()=>document.querySelector('#status').dataset.buffers==='4');
  const exportData=async()=>{const promise=page.waitForEvent('download');await page.locator('#save').click();const file=await promise;return JSON.parse(fs.readFileSync(await file.path(),'utf8'));};
  const options=async fn=>{await page.locator('#viewport-options > summary').click();await fn();await page.locator('#viewport-options > summary').click();};
  const view=async value=>options(()=>page.locator('#view').selectOption(value));
  if(perspective)await options(()=>page.locator('#projection').selectOption('perspective'));
  const base=await exportData(),originalID=await page.locator('#selection-id').textContent();
  await options(()=>page.locator('#grid').click());await page.waitForFunction(()=>document.querySelector('#status').dataset.guides==='2');assert.deepEqual(await exportData(),base);
  await view('top');
  const rect=()=>page.locator('#world').boundingBox(),project=(position,r)=>{const p=camera.project({x:position[0],y:position[1],z:position[2]},r.width,r.height);return {x:r.x+p.x,y:r.y+p.y};};
  let r=await rect(),light=project(base.scenes[0].lights[5].position,r);await page.touchscreen.tap(light.x,light.y);await page.waitForFunction(()=>document.querySelector('#selection-id').textContent==='light:5');assert.equal(await page.locator('#rotate').isDisabled(),true);
  const touch=await context.newCDPSession(page),drag=async(a,b,cancel=false)=>{
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});await touch.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  };
  await page.locator('#move').click();await drag(light,{x:light.x+30,y:light.y});let changed=await exportData();assert.notEqual(changed.scenes[0].lights[5].position[0],0);await page.locator('#undo').click();
  console.log('Tools: grid / marker selection / light movement');
  await page.locator('#mobile-library').click();await page.locator(`#hierarchy [data-id="${originalID}"]`).click();await page.locator('#duplicate').click();const duplicateID=await page.locator('#selection-id').textContent();assert.notEqual(duplicateID,originalID);
  changed=await exportData();const copy=changed.scenes[0].entities.find(e=>e.id===duplicateID),original=base.scenes[0].entities.find(e=>e.id===originalID);assert.equal(copy.asset,original.asset);assert.equal(changed.scenes[0].entities.length,base.scenes[0].entities.length+1);
  await page.locator('#delete').click();assert.equal((await exportData()).scenes[0].entities.some(e=>e.id===duplicateID),false);await page.locator('#undo').click();assert.equal((await exportData()).scenes[0].entities.some(e=>e.id===duplicateID),true);
  await page.locator('#mobile-library').click();await page.locator('#show-assets').click();await page.locator(`.asset-card[data-asset="${original.asset}"]`).click();r=await rect();const ground=project([5,-10,0],r);await page.touchscreen.tap(ground.x,ground.y);const placedID=await page.locator('#selection-id').textContent();changed=await exportData();const placed=changed.scenes[0].entities.find(e=>e.id===placedID);assert.equal(placed.asset,original.asset);assert.equal(placed.position[2],.55);
  console.log('Tools: reusable asset placement / duplicate / delete / undo');
  await page.locator('#rotate').click();r=await rect();const pivot=project(placed.position,r),a={x:pivot.x+48,y:pivot.y},b={x:pivot.x,y:pivot.y-48};await drag(a,b);
  changed=await exportData();const q=changed.scenes[0].entities.find(e=>e.id===placedID).rotation;assert.ok(Math.abs(q[2]-Math.SQRT1_2)<.002,'Ring gesture produces snapped positive 90° Z rotation');
  const before=JSON.stringify(changed);await drag(a,{x:pivot.x-48,y:pivot.y},true);assert.equal(JSON.stringify(await exportData()),before);
  console.log('Tools: rotation ring / snapped quaternion / cancellation');
  for(let i=0;i<2;i++){
   await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.mode==='play'&&document.querySelector('#status').dataset.guides==='0');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Amber Atrium'));
   await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.mode==='edit'&&document.querySelector('#status').dataset.worlds==='1'&&document.querySelector('#status').dataset.guides==='2'&&document.querySelector('#status').dataset.buffers==='5');
  }
  assert.equal(JSON.stringify(await exportData()),before);await page.locator('#mobile-properties').click();await view('oblique');
  await page.screenshot({path:path.join(root,`artifacts/studio-tools-${perspective?'perspective-':''}phone.png`),timeout:120000});await page.setViewportSize({width:1280,height:900});await page.locator('#show-hierarchy').click();await page.locator('#library').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(root,`artifacts/studio-tools-${perspective?'perspective-':''}desktop.png`),timeout:120000});
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  report.projection=perspective?'perspective':'orthographic';report.workflow={grid:true,lightPicking:true,lightMove:true,placement:true,groundOffset:true,duplicate:true,deleteUndo:true,rotationSnap:true,rotationCancel:true,playCycles:2};report.errors=errors;report.requests=requests;
  await context.close();
  // Public source fixture verifies resource accounting and restoration while guides are live.
  const p=await browser.newPage();await p.goto(`http://127.0.0.1:${server.address().port}`);
  await p.evaluate(async()=>{
   const {ETRNLNINE}=await import('/engine/etrnlnine.js');const c=document.createElement('canvas');c.style.cssText='width:320px;height:240px';document.body.append(c);const engine=new ETRNLNINE(c),renderer=engine.basement.renderer,layer=renderer.lines.create(16);layer.begin();layer.segment([0,0,0],[1,1,1],[1,1,0,1]);layer.end();renderer.render(null,[layer]);window.fixture={engine,renderer,layer,c};
  });
  const stats=await p.evaluate(()=>({buffers:fixture.renderer.stats.buffers,programs:fixture.renderer.stats.programs,draws:fixture.renderer.stats.draws,error:fixture.renderer.gl.getError()}));assert.deepEqual(stats,{buffers:2,programs:2,draws:1,error:0});
  const supported=await p.evaluate(()=>{const f=fixture;f.ext=f.renderer.gl.getExtension('WEBGL_lose_context');if(!f.ext)return false;f.ext.loseContext();return true;});
  if(supported){await p.waitForFunction(()=>fixture.renderer.lost);await p.evaluate(()=>fixture.ext.restoreContext());await p.waitForFunction(()=>!fixture.renderer.lost);}
  report.resources=await p.evaluate(()=>{const f=fixture;f.renderer.render(null,[f.layer]);const error=f.renderer.gl.getError();f.layer.dispose();const afterLayer={buffers:f.renderer.stats.buffers,programs:f.renderer.stats.programs,layers:f.renderer.lines.layers.size};f.engine.dispose();return{restored:f.renderer.stats.contextRestores,error,afterLayer,afterEngine:{buffers:f.renderer.stats.buffers,programs:f.renderer.stats.programs,vaos:f.renderer.stats.vaos}};});
  assert.equal(report.resources.error,0);assert.deepEqual(report.resources.afterLayer,{buffers:1,programs:1,layers:0});assert.deepEqual(report.resources.afterEngine,{buffers:0,programs:0,vaos:0});
  fs.writeFileSync(path.join(root,`artifacts/studio-tools-${perspective?'perspective-':''}results.json`),JSON.stringify(report,null,2)+'\n');console.log('Authoring tools acceptance passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
