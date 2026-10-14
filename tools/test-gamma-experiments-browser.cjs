#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../DFAB V8.html'));
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.DFAB_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const page=await browser.newPage({viewport:{width:600,height:340}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const experiments=await page.evaluate(()=>{
      game.loop=()=>{};game.running=true;game.paused=false;game.getAmbientDarkness=()=>.8;game._doLoadMap('apt_949');game.bakeStaticLighting();
      game.player.x=850;game.player.y=450;game.camera.x=850;game.camera.y=450;game.nvIntensity=0;
      GameSettings.lampShadows='gamma';GameSettings.softShadows=true;GameSettings.adaptiveLighting=false;GameSettings.profilerMode='full';game.showProfiler=true;DevOverlay.sync(game);
      const run=mode=>{
        GammaExperiment.select(mode);const warm=[],settling=[],frames=[];
        for(let i=0;i<21;i++){
          _frameTime+=101;game.draw();const f=LightingProfile.latest;
          if(f.experiment.phase==='warmup')warm.push(f);else if(f.experiment.phase==='settling')settling.push(f);else frames.push(f);
        }
        return {mode,warm:warm.map(f=>f.gamma),settling:settling.map(f=>f.gamma),frames,report:LightingProfile.snapshot(game),overlay:!!document.querySelector('#gamma-diagnostic-overlay'),pointerEvents:GammaExperiment.overlay?.style.pointerEvents};
      };
      return Object.keys(GammaExperiment.modes).map(run);
    });
    const byMode=Object.fromEntries(experiments.map(e=>[e.mode,e]));
    for(const e of experiments){
      assert.equal(e.warm.length,10);assert.equal(e.settling.length,5);assert.equal(e.frames.length,6);assert.equal(e.report.frames.length,6,'warm/settling frames excluded from measurements');
      assert.ok(e.frames.every(f=>f.backend==='webgl2'&&f.gamma.resolves===1));
      assert.ok(e.frames.every(f=>f.layer[0]===300&&f.layer[1]===170),'lighting resolution is constant');
      assert.ok(e.frames.every(f=>Number.isFinite(f.cadence.renderMs)));
      assert.equal(e.report.experiment.mode,e.mode);
    }
    assert.ok(byMode.baseline.frames.some(f=>f.gamma.uploads>0),'baseline fixture exercises changing masks');
    assert.ok(byMode.baseline.frames.every(f=>f.gamma.draws===7&&f.gamma.blurPasses===2&&f.gamma.layerUploads===3));
    assert.ok(byMode['no-blur'].frames.every(f=>f.gamma.draws===5&&f.gamma.blurPasses===0&&f.gamma.layerUploads===3),'only blur draws are removed');
    for(const mode of ['freeze-all','freeze-masks']){
      const e=byMode[mode];assert.ok(e.warm.some(f=>f.uploads>0));
      assert.ok(e.frames.every(f=>f.gamma.uploads===0&&f.bytes.mask===0&&f.gamma.missingFrozenSprites===0),'resident atlas stays frozen');
      assert.ok(e.frames.some(f=>f.gamma.frozenMasks>0&&f.shadows.builds>0),'CPU mask preparation still runs');
    }
    for(const mode of ['freeze-all','freeze-layers'])assert.ok(byMode[mode].frames.every(f=>f.gamma.layerUploads===0&&f.bytes.layers===0&&f.gamma.frozenLayers===3));
    assert.ok(byMode['freeze-masks'].frames.every(f=>f.gamma.layerUploads===3),'Canvas input transfers remain in mask-only test');
    assert.ok(byMode['freeze-layers'].frames.some(f=>f.gamma.uploads>0),'atlas transfers remain in layer-only test');
    assert.ok(byMode['simple-resolve'].frames.every(f=>f.gamma.draws===3&&f.gamma.blurPasses===2&&f.gamma.layerUploads===3),'simple resolve keeps selected blur and uploads');
    assert.ok(byMode['simple-resolve'].frames.some(f=>f.gamma.uploads>0));
    assert.equal(byMode.overlay.overlay,true);assert.equal(byMode.overlay.pointerEvents,'none');
    assert.ok(byMode.overlay.frames.every(f=>f.stages['WebGL overlay layout']&&!f.stages['WebGL to scene Canvas copy (CPU wait)']),'overlay omits Canvas scene copy');
    const cleanup=await page.evaluate(()=>{
      GameSettings.lampShadows='high';DevOverlay.sync(game);
      const quality={mode:GammaExperiment.mode,overlay:!!document.querySelector('#gamma-diagnostic-overlay')};
      GameSettings.lampShadows='gamma';GammaExperiment.select('overlay');game.draw();
      GameSettings.profilerMode='compact';DevOverlay.sync(game);
      const cleared={mode:GammaExperiment.mode,overlay:!!document.querySelector('#gamma-diagnostic-overlay'),pending:LightingProfile.pending.length};
      GameSettings.profilerMode='full';game.showProfiler=true;DevOverlay.sync(game);GammaExperiment.select('baseline');
      for(let i=0;i<75;i++){_frameTime+=101;game.draw();}
      DevOverlay._shadowPanel(game);const ready=LightingProfile.snapshot(game);
      const select=document.querySelector('[data-gamma-case]');select.value='no-blur';select.dispatchEvent(new Event('change',{bubbles:true}));
      const selected={mode:GammaExperiment.mode,profiler:GameSettings.profilerMode};game.draw();
      document.querySelector('[data-gamma-restart]').click();const restart={samples:GammaExperiment.samples,phase:GammaExperiment.current.phase};
      return {quality,cleared,ready,selected,restart};
    });
    assert.deepEqual(cleanup.quality,{mode:'baseline',overlay:false},'changing shadow quality immediately clears experimental overlay');
    assert.deepEqual(cleanup.cleared,{mode:'baseline',overlay:false,pending:0},'leaving Full removes overlay and experimental overrides');
    assert.equal(cleanup.ready.frames.length,60);assert.equal(cleanup.ready.experiment.ready,true);assert.equal(cleanup.ready.cadence.intervals,59);
    assert.deepEqual(cleanup.selected,{mode:'no-blur',profiler:'full'},'selector works without collapsing Full');assert.equal(cleanup.restart.samples,0);assert.equal(cleanup.restart.phase,'starting');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,experiments:experiments.map(e=>({mode:e.mode,warm:e.warm.length,settling:e.settling.length,report:e.report})),cleanup},null,2));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
