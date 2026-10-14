#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
    const html=fs.readFileSync(path.join(__dirname,'../DFAB WebGL.html'));
    const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
    try {
        browser=await chromium.launch({executablePath:process.env.DFAB_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
        const page=await browser.newPage({viewport:{width:880,height:411}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        const storage=await page.evaluate(()=>{
            localStorage.setItem('native-storage-test','original');NativeWebGLStorage.setItem('native-storage-test','preview');
            const result={original:localStorage.getItem('native-storage-test'),preview:NativeWebGLStorage.getItem('native-storage-test')};
            NativeWebGLStorage.removeItem('native-storage-test');localStorage.removeItem('native-storage-test');return result;
        });
        assert.deepEqual(storage,{original:'original',preview:'preview'},'preview storage is isolated from Canvas saves');
        await page.evaluate(()=>{game.loop=()=>{};document.getElementById('btn-native-apartment').click();});
        const warmed=await page.evaluate(()=>{
            const r=game.nativeRenderer,gl=r.renderer.gl;let polls=0;
            const getError=gl.getError.bind(gl);gl.getError=()=>{polls++;return getError();};
            for(let i=0;i<22;i++){_frameTime+=16.67;game.draw();}
            return {report:r.report(),polls,main2D:game.canvas.getContext('2d')!==null,
                sameSurface:r.renderer.view===game.canvas,recoveryBackend:GammaShadows.stats.backend,
                compiled:gl.getProgramParameter(r.lighting.program.glPrograms[r.renderer.CONTEXT_UID].program,gl.LINK_STATUS)};
        });
        assert.equal(warmed.main2D,false,'visible game surface belongs to WebGL');assert.equal(warmed.sameSurface,true);
        assert.equal(warmed.compiled,true);assert.equal(warmed.polls,0,'no hot-path error checkpoints');
        assert.ok(warmed.report.frames.length>0);assert.ok(warmed.report.frames.every(f=>f.uploads===0&&f.bakes===0&&f.draws>0),'warmed frames draw resident textures without uploads');
        const movement=await page.evaluate(()=>{
            game.player.x=850;game.player.y=450;game.player.vx=game.player.vy=0;const before=game.player.x;
            game.keys.d=true;
            for(let i=0;i<8;i++){_frameTime+=16.67;game.update();game.draw();}
            game.keys.d=false;
            const v=game.view,p=game.player,s=game.nativeRenderer.playerSprite;
            const sx=game.canvas.width/2+(p.x-v.x+v.shakeX)*v.zoom;
            const sy=game.canvas.height/2+(p.y-v.y+v.shakeY)*v.zoom;
            const point=s.toGlobal(new PIXI.Point(0,0)),roundtrip=game.viewToWorld(sx,sy);
            return {before,after:p.x,sx,sy,point:{x:point.x,y:point.y},roundtrip:{x:roundtrip.x,y:roundtrip.y},p:{x:p.x,y:p.y}};
        });
        assert.ok(movement.after>movement.before,'existing simulation moves the player');
        for(const axis of ['x','y'])assert.ok(Math.abs(movement.point[axis]-movement[axis==='x'?'sx':'sy'])<.01);
        for(const axis of ['x','y'])assert.ok(Math.abs(movement.roundtrip[axis]-movement.p[axis])<.01);
        const props=await page.evaluate(()=>{
            const r=game.nativeRenderer,p=game.props.find(p=>p.decorType==='apt_sofa');
            const old=r.props.get(p).texture,bytes=r.report().textureBytes;
            p.x+=12;p.angle=.3;game.draw();const moved={same:r.props.get(p).texture===old,rotation:r.props.get(p).sprite.rotation};
            p._searched=!p._searched;game.draw();const changed=r.props.get(p).texture!==old;
            for(let i=0;i<8;i++){p._searched=!p._searched;game.draw();}
            return {moved,changed,bytes,afterBytes:r.report().textureBytes};
        });
        assert.equal(props.moved.same,true,'moving furniture does not rebuild its texture');assert.equal(props.moved.rotation,.3);
        assert.equal(props.changed,true,'art state changes invalidate its texture');assert.ok(props.afterBytes<=props.bytes+192*192*4*10,'repeated changes release previous textures');
        await page.setViewportSize({width:640,height:360});
        const zoom=await page.evaluate(()=>{
            game.camera.zoom=1.4;game.resize();game.draw();
            const p=game.nativeRenderer.playerSprite.toGlobal(new PIXI.Point(0,0)),v=game.view;
            return {surface:[game.canvas.width,game.canvas.height],renderer:[game.nativeRenderer.renderer.width,game.nativeRenderer.renderer.height],
                delta:[p.x-(game.canvas.width/2+(game.player.x-v.x)*v.zoom),p.y-(game.canvas.height/2+(game.player.y-v.y)*v.zoom)]};
        });
        assert.deepEqual(zoom.surface,[640,360]);assert.deepEqual(zoom.renderer,zoom.surface);assert.ok(zoom.delta.every(v=>Math.abs(v)<.01));
        await page.evaluate(()=>{game.camera.zoom=1.08;game.player.x=590;game.player.y=540;game.draw();});
        await page.screenshot({path:'/tmp/dfab-native-webgl-apartment.png'});
        // Readback is confined to validation, never used by the live renderer.
        const lighting=await page.evaluate(()=>{
            const r=game.nativeRenderer,read=()=>{
                r.renderer.render(r.stage);const data=new Uint8Array(640*360*4);
                r.renderer.gl.readPixels(0,0,640,360,r.renderer.gl.RGBA,r.renderer.gl.UNSIGNED_BYTE,data);
                let visible=0;for(let i=0;i<data.length;i+=4)if(Math.max(data[i],data[i+1],data[i+2])>25)visible++;
                return {visible,center:[...data.slice((180*640+320)*4,(180*640+320)*4+4)]};
            };
            r.lightsOn=true;game.draw();const lit=read();r.lightsOn=false;game.draw();return {lit,unlit:read()};
        });
        assert.notDeepEqual(lighting.lit,lighting.unlit,'GPU lighting visibly changes the scene');
        assert.ok(lighting.lit.visible>640*360*.1,'lighting retains visible scene content after repeated frames and a resize');
        await page.evaluate(()=>{game.nativeRenderer.lightsOn=true;});
        // Sample actual requestAnimationFrame cadence instead of a synchronous draw loop.
        const cadence=await page.evaluate(()=>new Promise(resolve=>{
            const r=game.nativeRenderer;r.frames=[];r.lastStart=0;r.warmFrames=10;let n=0;
            const tick=()=>{_frameTime=performance.now();game.draw();if(++n<75)requestAnimationFrame(tick);else resolve(r.report());};requestAnimationFrame(tick);
        }));
        assert.equal(cadence.frames.length,65);assert.ok(cadence.fps>0&&Number.isFinite(cadence.p95Ms));
        assert.ok(cadence.frames.every(f=>f.uploads===0&&f.bakes===0),'actual paced frames reuse textures');
        const context=await page.evaluate(()=>new Promise((resolve,reject)=>{
            const r=game.nativeRenderer,extension=r.renderer.gl.getExtension('WEBGL_lose_context');if(!extension){resolve(false);return;}
            let held=false;const timeout=setTimeout(()=>reject(new Error('Context restoration timed out')),5000);
            r.canvas.addEventListener('webglcontextlost',()=>{
                const n=r.frames.length;game.draw();held=r.lost===true&&r.frames.length===n;
                // Some Chromium builds restore automatically before a polling check
                // can observe loss. Observe the events and request restoration only
                // while the extension still reports a lost context.
                setTimeout(()=>{if(r.renderer.gl.isContextLost())extension.restoreContext();},100);
            },{once:true});
            r.canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timeout);resolve({held,restored:r.lost===false});},{once:true});
            extension.loseContext();
        }));
        if(context){assert.deepEqual(context,{held:true,restored:true});await page.evaluate(()=>game.draw());}
        await page.evaluate(()=>document.querySelector('#native-webgl-toolbar button:last-child').click());
        assert.equal(await page.evaluate(()=>game.nativeRenderer.map.id),'apt_949');
        const blocked=await browser.newPage();
        await blocked.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
        await blocked.goto(`http://127.0.0.1:${server.address().port}`);
        assert.ok(await blocked.evaluate(()=>!!game.nativeRenderer.failure),'unsupported devices report failure instead of Canvas fallback');
        await blocked.evaluate(()=>document.getElementById('btn-native-apartment').click());
        assert.ok((await blocked.locator('#native-webgl-toolbar').innerText()).includes('WebGL unavailable'));
        const live=await browser.newPage({viewport:{width:880,height:411}});
        live.on('pageerror',e=>errors.push(e.message));
        await live.goto(`http://127.0.0.1:${server.address().port}`);
        await live.evaluate(()=>document.getElementById('btn-native-apartment').click());
        await live.waitForFunction(()=>game.nativeRenderer.frames.length>=15);
        assert.equal(await live.evaluate(()=>game.activeMap.id),'apt_949','real gameplay loop stays in the apartment sandbox');
        const visible=await live.evaluate(()=>{
            const r=game.nativeRenderer;r.renderer.render(r.stage);const data=new Uint8Array(880*411*4);
            r.renderer.gl.readPixels(0,0,880,411,r.renderer.gl.RGBA,r.renderer.gl.UNSIGNED_BYTE,data);
            let count=0;for(let i=0;i<data.length;i+=4)if(Math.max(data[i],data[i+1],data[i+2])>25)count++;return count;
        });
        assert.ok(visible>880*411*.1,'scene remains visible through real camera updates');
        await live.screenshot({path:'/tmp/dfab-native-webgl-apartment.png'});
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({passed:true,movement,zoom,cadence,contextRestored:context,screenshot:'/tmp/dfab-native-webgl-apartment.png'},null,2));
    }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
