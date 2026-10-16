/**
 * Studio acceptance in real Chromium: portable HTML, emulated touch, reversible edits,
 * invalid-file isolation, recovery and repeated Play disposal. Software GL is not a device benchmark.
 */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'dist/ETRNLNINE-Studio.html'),'utf8');
const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Studio fixture origin</title>');});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.ETRNLNINE_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[],report={};
 try{
 const context=await browser.newContext({viewport:{width:412,height:892},hasTouch:true,isMobile:true,acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 // Guard preparation as well as visible rendering. Install again after each document replacement.
 const guard=()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(kind==='2d')throw new Error('Canvas2D forbidden');return original.call(this,kind,...args);};if(typeof OffscreenCanvas!=='undefined'){const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(kind,...args){if(kind==='2d')throw new Error('Offscreen Canvas2D forbidden');return get.call(this,kind,...args);};}};
 await page.evaluate(guard);const requests=[],network=r=>requests.push(r.url());page.on('request',network);
 await page.setContent(html);await page.waitForFunction(()=>document.querySelector('#status').dataset.buffers==='4');assert.equal(await page.locator('#error').isVisible(),false);
 await page.locator('[data-panel-toggle=properties]').click();
 const initialID=await page.locator('#selection-id').textContent();const input=()=>page.getByLabel('Position X',{exact:true});const original=Number(await input().inputValue());
 await input().fill('');await input().press('Enter');await page.waitForFunction(()=>!document.querySelector('#error').hidden);await page.locator('#error').click();assert.equal(Number(await input().inputValue()),original);
 await input().fill(String(original+2));await input().press('Enter');await page.waitForFunction(()=>!document.querySelector('#undo').disabled);
 await page.locator('#undo').click();assert.equal(Number(await input().inputValue()),original);assert.equal(await page.locator('#selection-id').textContent(),initialID);
 await page.locator('#redo').click();assert.equal(Number(await input().inputValue()),original+2);
 console.log('Studio: numeric edit / undo / redo');
 // Mobile hierarchy opens independently; selecting a light changes the shared inspector context.
 await page.locator('[data-panel-toggle=directory]').click();await page.locator('#hierarchy [data-id="light:5"]').click();const radius=page.getByLabel('Radius',{exact:true});await radius.fill('14');await radius.press('Enter');await page.locator('#undo').click();assert.equal(await radius.inputValue(),'10');await page.locator('#redo').click();assert.equal(await radius.inputValue(),'14');
 const exportProject=async()=>{const event=page.waitForEvent('download');await page.locator('#save').click();const download=await event;return JSON.parse(fs.readFileSync(await download.path(),'utf8'));};
 const saved=await exportProject();assert.equal(saved.scenes[0].entities.find(e=>e.id===initialID).position[0],original+2);assert.equal(saved.scenes[0].lights[5].radius,14);
 const importProject=async data=>{await page.locator('#file').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});};
 await importProject({schemaVersion:99});await page.waitForFunction(()=>!document.querySelector('#error').hidden);assert.equal(await radius.inputValue(),'14');await page.locator('#error').click();
 await importProject(saved);await page.waitForFunction(id=>document.querySelector('#selection-id').textContent===id,initialID);assert.equal(Number(await input().inputValue()),original+2);
 console.log('Studio: export / valid reload / invalid import isolation');
 // A cancelled captured move must restore data and leave no undo command.
 await page.locator('[data-panel-toggle=properties]').click();await page.locator('[data-panel-toggle=viewport]').click();await page.locator('#view').selectOption('top');await page.locator('[data-panel-toggle=viewport]').click();await page.locator('#move').click();const rect=await page.locator('#world').boundingBox(),e=saved.scenes[0].entities.find(e=>e.id===initialID);
 const camera=JSON.parse(await page.locator('#status').getAttribute('data-camera'));
 const x=rect.x+rect.width/2+(e.position[0]-camera.x)*rect.height/(2*camera.halfHeight),y=rect.y+rect.height/2-(e.position[1]-camera.y)*rect.height/(2*camera.halfHeight);
 const revision=Number(await page.locator('#status').getAttribute('data-revision'));
 const touch=await context.newCDPSession(page);
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+25,y}]});
 await page.waitForFunction(before=>Number(document.querySelector('#status').dataset.revision)>before,revision);
 await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 assert.equal(await page.locator('#undo').isDisabled(),true,'Cancelled drag creates no history entry');
 // A completed real touch drag commits once; undo restores the same stable placement.
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+25,y}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>!document.querySelector('#undo').disabled);
 const moved=await page.evaluate(id=>JSON.parse(localStorage.getItem('ETRNLNINE.Studio.project.v1')).scenes[0].entities.find(e=>e.id===id).position[0],initialID);
 assert.notEqual(moved,original+2);assert.equal(moved/.5,Math.round(moved/.5));
 await page.locator('#undo').click();
 assert.equal((await exportProject()).scenes[0].entities.find(e=>e.id===initialID).position[0],original+2);
 await page.locator('[data-panel-toggle=viewport]').click();await page.locator('#view').selectOption('oblique');await page.locator('[data-panel-toggle=viewport]').click();
 // Real touch selection, then a numeric edit persisted in the same-origin recovery slot.
 await page.locator('[data-panel-toggle=directory]').click();await page.locator(`#hierarchy [data-id="${initialID}"]`).tap();await input().fill(String(original+3));await input().press('Enter');
 await page.waitForFunction(()=>document.querySelector('#status').dataset.recovery==='stored');
 page.off('request',network);await page.goto(`http://127.0.0.1:${server.address().port}`);await page.evaluate(guard);page.on('request',network);
 await page.setContent(html);await page.waitForFunction(()=>document.querySelector('#status').dataset.buffers==='4');await page.locator('#recover').click();await page.locator('[data-panel-toggle=properties]').click();assert.equal(Number(await input().inputValue()),original+3);
 const rotation=page.getByLabel('Rotation Y',{exact:true});await rotation.fill('20');await rotation.press('Enter');
 const authored=await exportProject();assert.ok(Math.abs(authored.scenes[0].entities.find(e=>e.id===initialID).rotation[1])>.1);
 for(let i=0;i<4;i++){
  await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.mode==='play'&&Number(document.querySelector('#status').dataset.worlds)===2);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Amber Atrium'));
  if(i===0){
   const before=Number(await page.locator('#status').getAttribute('data-x')),stick=await page.locator('.engine-joystick').boundingBox();
   const sx=stick.x+stick.width/2,sy=stick.y+stick.height/2;
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx+35,y:sy}]});
   await page.waitForFunction(x=>Number(document.querySelector('#status').dataset.x)>x+.3,before);
   await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});report.walked=true;report.walkInput='touch joystick';
  }
  await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.mode==='edit'&&document.querySelector('#status').dataset.worlds==='1'&&document.querySelector('#status').dataset.buffers==='4');
 }
 assert.deepEqual(await exportProject(),authored);console.log('Studio: recovery / walk / four clean Play-Stop cycles');
 await page.screenshot({path:path.join(root,'artifacts/studio-phone.png')});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(root,'artifacts/studio-desktop.png')});
 assert.equal(requests.length,0,'Offline artifact performs no runtime requests');assert.deepEqual(errors,[]);report.mobile={width:412,height:892};report.playCycles=4;report.requests=requests;report.errors=errors;report.authoredID=initialID;report.recovery=true;report.cancelledTouch=true;report.committedTouch=true;report.blankInputRejected=true;report.fullRotation=true;
 fs.writeFileSync(path.join(root,'artifacts/studio-browser.json'),JSON.stringify(report,null,2));console.log('Studio browser acceptance passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
