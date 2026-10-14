#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
    const native=fs.readFileSync(path.join(__dirname,'../DFAB WebGL.html'));
    const canvas=fs.readFileSync(path.join(__dirname,'../DFAB V8.html'));
    const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(req.url==='/canvas'?canvas:native);});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
    try{
        browser=await chromium.launch({executablePath:process.env.DFAB_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
        const page=await browser.newPage({viewport:{width:880,height:411}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(()=>{game.loop=()=>{};document.getElementById('btn-native-apartment').click();game.player.x=590;game.player.y=540;game.player.angle=-.7;game.camera.zoom=1.08;});
        const isolation=await page.evaluate(()=>{
            const r=game.nativeRenderer,out=[];
            for(const key of Object.keys(r.layers)){
                r.preset('baseline');r.setLayers({[key]:true});
                for(let i=0;i<20;i++){_frameTime+=20;game.draw();}
                const report=r.report();r.setLayers({[key]:false});
                const reset={frames:r.frames.length,warm:r.warmFrames,config:r.configurationId};game.draw();
                out.push({key,report,reset,after:r.report()});
            }
            r.preset('canvas');for(let i=0;i<24;i++){_frameTime+=100;game.draw();}
            return {out,full:r.report(),labels:NATIVE_LAYER_LABELS};
        });
        assert.equal(isolation.out.length,Object.keys(isolation.labels).length);
        for(const item of isolation.out){
            assert.equal(item.report.layers[item.key],true);assert.equal(item.after.layers[item.key],false);
            // The key may already be on in baseline; every meaningful change resets history.
            assert.equal(item.reset.frames,0);assert.equal(item.reset.warm,15);
            assert.ok(item.report.frames.every(f=>f.uploads===0&&f.bakes===0),'warmed per-layer frames have no bitmap uploads');
            assert.equal(item.after.configurationId,item.report.configurationId+1);
        }
        assert.ok(isolation.full.frames.every(f=>f.uploads===0&&f.bakes===0&&f.shadows.rebuilds===0),'animated decor and cached shadows stay resident');
        assert.ok(isolation.full.shadowCache.hits>0);assert.ok(isolation.full.shadowTextureBytes>0);
        const shadow=await page.evaluate(()=>{
            const r=game.nativeRenderer;r.preset('baseline');r.setLayers({wallOcclusion:true});
            const source={owner:{},x:100,y:100,radius:180};
            const sample=(texture,x,y)=>{
                const pixels=r.renderer.extract.pixels(texture),W=texture.baseTexture.realWidth,H=texture.baseTexture.realHeight;
                const px=Math.min(W-1,Math.max(0,Math.floor((x-source.x+180)/(texture.width)*W)));
                const py=Math.min(H-1,Math.max(0,Math.floor((y-source.y+180)/(texture.height)*H)));
                return pixels[(py*W+px)*4+3];
            };
            const wall=[{x:180,y:0,w:10,h:300}],wallTexture=r.shadowTexture(source,[],wall,'wall');
            const wallCheck={before:sample(wallTexture,155,100),behind:sample(wallTexture,210,100)};
            r.setLayers({wallOcclusion:false,propShadows:true});
            const caster={owner:{},x:140,y:100,w:20,h:20,elevation:24,key:'caster',points:[[130,90],[150,90],[150,110],[130,110]]};
            const base=r.shadowTexture(source,[],[],'none'),unshadowed=sample(base,164,100);
            const cast=r.shadowTexture(source,[caster],[],'none');
            const finite={unshadowed,shadow:sample(cast,164,100),body:sample(cast,140,100),beyond:sample(cast,200,100)};
            const rebuilds=r.shadowStats.rebuilds;r.shadowTexture(source,[caster],[],'none');const cached=r.shadowStats.rebuilds===rebuilds;
            const other={owner:{},x:220,y:100,radius:180};
            // Same world point lies between the second lamp and the caster; it
            // must remain illuminated rather than inherit the first lamp's shadow.
            const otherTexture=r.shadowTexture(other,[caster],[],'none');
            const data=r.renderer.extract.pixels(otherTexture),W=otherTexture.baseTexture.realWidth,H=otherTexture.baseTexture.realHeight;
            const x=Math.floor((164-other.x+180)/otherTexture.width*W),y=Math.floor(180/otherTexture.height*H);
            return {wallCheck,finite,cached,otherAlpha:data[(y*W+x)*4+3]};
        });
        assert.ok(shadow.wallCheck.before>30&&shadow.wallCheck.behind<5,'opaque wall stops its own light');
        assert.ok(shadow.finite.shadow<shadow.finite.unshadowed*.4,'finite projected shadow darkens the ray behind its caster');
        assert.ok(shadow.finite.body>30&&shadow.finite.beyond>10,'caster stays lit and shadow has a finite reach');
        assert.equal(shadow.cached,true);assert.ok(shadow.otherAlpha>shadow.finite.shadow*2,'another lamp lights the shadow independently');
        const controls=await page.evaluate(()=>{
            const r=game.nativeRenderer;r.preset('canvas');for(let i=0;i<20;i++)game.draw();
            const checked=[...document.querySelectorAll('[data-native-layer]')].every(c=>c.checked===r.layers[c.dataset.nativeLayer]);
            const c=document.querySelector('[data-native-layer="bloom"]');c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}));
            return {checked,bloom:r.layers.bloom,frames:r.frames.length};
        });
        assert.deepEqual(controls,{checked:true,bloom:false,frames:0});
        const downloadPromise=page.waitForEvent('download');
        await page.evaluate(()=>{
            [...document.querySelectorAll('#native-webgl-toolbar button')].find(b=>b.textContent==='Record 20s').click();
            game.nativeRenderer.capture.durationMs=1;for(let i=0;i<30;i++)game.draw();
        });
        const download=await downloadPromise;const saved=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
        assert.equal(saved.capture.finished,true);assert.equal(saved.layers.bloom,false);assert.ok(saved.frames.length>0);
        const recording=await page.evaluate(()=>{
            const r=game.nativeRenderer,before=r.completedCapture.frames.length;
            game.draw();const immutable=r.completedCapture.frames.length===before;
            r.capture={durationMs:20000,startedAt:null,finished:false};r.setLayers({bloom:true});
            return {immutable,canceled:r.capture===null&&r.completedCapture===null};
        });assert.deepEqual(recording,{immutable:true,canceled:true});
        const hints=await page.evaluate(()=>{
            const r=game.nativeRenderer;game.furniture.target=game.props.find(p=>p.decorType==='apt_sofa');game.furniture.state='choose';
            r.setLayers({furnitureHints:true});game.draw();const on=r.hints.visible&&r.chevrons.every(g=>g.visible);
            r.setLayers({furnitureHints:false});game.draw();game.furniture.release(true);return {on,off:!r.hints.visible};
        });assert.deepEqual(hints,{on:true,off:true},'grab-side hints follow their own layer');
        await page.setViewportSize({width:641,height:361});
        const resized=await page.evaluate(()=>{
            const r=game.nativeRenderer;r.preset('canvas');game.resize();for(let i=0;i<22;i++){_frameTime+=30;game.draw();}
            const pixels=r.renderer.extract.pixels(r.stage);let visible=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>25)visible++;
            return {visible,report:r.report()};
        });
        assert.ok(resized.visible>641*361*.1,'bloom retains visible full-resolution scene through an odd-size resize');
        assert.ok(resized.report.frames.every(f=>f.uploads===0),'resized targets stop reallocating after warmup');
        const restoration=await page.evaluate(()=>new Promise((resolve,reject)=>{
            const r=game.nativeRenderer,extension=r.renderer.gl.getExtension('WEBGL_lose_context');if(!extension){resolve(null);return;}
            const timeout=setTimeout(()=>reject(new Error('Layer context restoration timed out')),5000);
            r.canvas.addEventListener('webglcontextlost',()=>setTimeout(()=>{if(r.renderer.gl.isContextLost())extension.restoreContext();},100),{once:true});
            r.canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timeout);resolve([...r.shadowCache.values()].every(v=>v.key===null));},{once:true});extension.loseContext();
        }));
        if(restoration!==null){assert.equal(restoration,true,'restoration invalidates all cached GPU pixels');
            assert.ok(await page.evaluate(()=>{game.draw();return game.nativeRenderer.shadowStats.rebuilds>0;}),'light images redraw after context restoration');}
        await page.setViewportSize({width:880,height:411});
        // Capture the same apartment camera in the old Canvas renderer and the
        // complete WebGL preset. Screenshots are evidence of remaining differences.
        await page.evaluate(()=>{const r=game.nativeRenderer;r.preset('canvas');game.player.x=590;game.player.y=540;game.camera.zoom=1.08;game.player.angle=-.7;
            game.resize();game.roomSystem._lastT=undefined;
            for(let i=0;i<30;i++){_frameTime=1000+i*16.67;game.roomSystem.update(game.player.x,game.player.y);game.draw();}});
        await page.evaluate(()=>document.getElementById('native-webgl-toolbar').style.display='none');
        await page.screenshot({path:'/tmp/dfab-native-canvas-look.png'});
        await page.evaluate(()=>{document.getElementById('native-webgl-toolbar').style.display='block';document.getElementById('native-webgl-layers').hidden=false;});
        await page.screenshot({path:'/tmp/dfab-native-layer-controls.png'});
        const old=await browser.newPage({viewport:{width:880,height:411}});old.on('pageerror',e=>errors.push(e.message));
        await old.goto(`http://127.0.0.1:${server.address().port}/canvas`);
        await old.evaluate(()=>{game.loop=()=>{};game._doLoadMap('apt_949');game.running=true;game.paused=false;
            game.player.x=590;game.player.y=540;game.player.angle=-.7;game.camera.zoom=1.08;GameSettings.lampShadows='high';GameSettings.softShadows=true;
            game.bakeStaticLighting();game.roomSystem._lastT=undefined;for(let i=0;i<30;i++){_frameTime=1000+i*16.67;game.roomSystem.update(game.player.x,game.player.y);}game.draw();
            document.getElementById('ui-layer').style.display='none';document.getElementById('game-container').style.display='block';document.getElementById('tap-to-begin')?.remove();});
        await old.screenshot({path:'/tmp/dfab-canvas-reference.png'});
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({passed:true,layers:isolation.out.map(i=>({key:i.key,draws:i.report.frames.map(f=>f.draws),uploads:i.report.frames.map(f=>f.uploads)})),
            full:isolation.full,shadow,controls,recording,recordedFrames:saved.frames.length},null,2));
    }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
