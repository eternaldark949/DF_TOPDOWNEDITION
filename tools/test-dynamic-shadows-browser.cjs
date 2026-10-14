#!/usr/bin/env node
'use strict';
// Optional real-pixel checks: install Playwright; uses system Chromium when present.
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), { join } = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const html = fs.readFileSync(join(__dirname, '..', 'DFAB V8.html'));
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const executablePath = process.env.DFAB_CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const r = await page.evaluate(() => {
      game.running = false; _zoomLOD = 0; GameSettings.lampShadows = 'high';
      const left = { x: 120, y: 150, radius: 240, color: '#fff' }, right = { x: 400, y: 150, radius: 240, color: '#fff' };
      const model = { activeMap: { width: 600, height: 300, walls: [], buildings: [] }, lamps: [left, right], roomSystem: { active: false }, getAmbientDarkness: () => .8 };
      DynamicShadows.begin(model); DynamicShadows.noteHuman({ x: 250, y: 150, angle: 0 });
      const render = (lights, px, raw = false) => {
        const cv = document.createElement('canvas'); cv.width = 600; cv.height = 300;
        const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 600, 300); c.globalCompositeOperation = 'destination-out';
        for (const l of lights) {
          if (!raw && DynamicShadows.drawLight(c, l, 'hole')) continue;
          const g = c.createRadialGradient(l.x, l.y, 10, l.x, l.y, l.radius);
          g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 600, 300);
        }
        return c.getImageData(px, 150, 1, 1).data[3];
      };
      const shadow = render([left], 290), unshadowed = render([left], 290, true);
      const second = render([right], 290), secondReference = render([right], 290, true), both = render([left, right], 290);
      DynamicShadows.begin(model); DynamicShadows.noteVehicle({ x: 250, y: 150, angle: .2, length: 60, width: 24 });
      const body = render([left], 250), bodyReference = render([left], 250, true);
      return { shadow, unshadowed, second, secondReference, both, body, bodyReference };
    });
    assert.ok(r.shadow > r.unshadowed + 30, 'caster suppresses its source light');
    assert.ok(Math.abs(r.second - r.secondReference) <= 3, 'another lamp keeps its light in that shadow');
    assert.ok(r.both < r.second && r.both < r.shadow, 'overlapping lamps fill the shadow');
    assert.ok(Math.abs(r.body - r.bodyReference) <= 3, 'a vehicle receives its own lamp light');
    const extended = await page.evaluate(() => {
      _zoomLOD = 0; GameSettings.lampShadows = 'high';
      const lamp = { x: 230, y: 100, radius: 260, color: '#fff' };
      const door = new IndoorDoor({ x: 180, y: 180, w: 80, h: 8, type: 'hinged' });
      const model = { activeMap: { width: 600, height: 400, walls: [], buildings: [] }, lamps: [lamp], roomSystem: { active: true, doors: [door] }, getAmbientDarkness: () => .8 };
      const doorPixel = () => {
        DynamicShadows.begin(model);
        const cv = document.createElement('canvas'); cv.width = 600; cv.height = 400;
        const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 600, 400); c.globalCompositeOperation = 'destination-out';
        if (!DynamicShadows.drawLight(c, lamp, 'hole')) {
          const g = c.createRadialGradient(lamp.x, lamp.y, 10, lamp.x, lamp.y, lamp.radius); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g; c.fillRect(0, 0, 600, 400);
        }
        return c.getImageData(230, 270, 1, 1).data[3];
      };
      const shut = doorPixel(); door.angle = Math.PI / 2; door.openAmount = 1; const swung = doorPixel();
      const glass = new IndoorDoor({ x: 180, y: 180, w: 80, h: 8, type: 'sliding' }); model.roomSystem.doors = [glass];
      const transmitted = doorPixel(); glass.openAmount = 1; const retracted = doorPixel();
      game.activeMap = { width: 600, height: 350, walls: [], buildings: [] }; game.lamps = []; game.roomSystem.active = false; game.getAmbientDarkness = () => .8;
      const owner = { x: 100, y: 150, angle: 0, length: 60, width: 24 };
      const beam = { owner, cx: 130, cy: 150, L: 250, W: 60, color: '#fff' };
      const beamPixel = (casterY) => {
        DynamicShadows.begin(game); DynamicShadows.noteVehicle(owner); DynamicShadows.noteHuman({ x: 220, y: casterY, angle: 0 });
        const cv = document.createElement('canvas'); cv.width = 600; cv.height = 350;
        const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 600, 350); c.globalCompositeOperation = 'destination-out';
        game.lightCtx = c; game._drawBeam(beam);
        const source = DynamicShadows.sources.get(owner).get('headlight'), state = DynamicShadows.lights.get(source);
        return { alpha: c.getImageData(320, 150, 1, 1).data[3], bytes: state ? state.bytes : 0, paired: DynamicShadows.stats.pairs };
      };
      const inCone = beamPixel(150), outsideCone = beamPixel(280);
      return { shut, swung, transmitted, retracted, inCone, outsideCone };
    });
    assert.ok(extended.shut > extended.swung + 40, 'hinged leaf rotates its actual shadow');
    assert.ok(extended.transmitted > extended.retracted + 15 && extended.transmitted < extended.shut - 15, 'glass attenuates light and retraction removes its cast');
    assert.ok(extended.inCone.alpha > extended.outsideCone.alpha + 20, 'headlight caster darkens the beam only when inside its cone');
    assert.ok(extended.inCone.paired === 1 && extended.outsideCone.paired === 0, 'emitter is excluded and off-axis casters are filtered');
    assert.ok(extended.inCone.bytes < 100000, 'tight beam bounds and shared hole/color bitmap limit storage');
    const gamma = await page.evaluate(() => {
      game.running=false;_zoomLOD=0;
      const lamps=[{x:100,y:100,radius:180,color:'#ff9d60'},{x:270,y:90,radius:170,color:'#60aaff'}];
      const model={activeMap:{width:400,height:240,walls:[],buildings:[]},lamps,roomSystem:{active:false},getAmbientDarkness:()=>.8};
      const body={x:180,y:100,angle:0};
      const render=(quality,veil=false)=>{
        GameSettings.lampShadows=quality;DynamicShadows.begin(model);DynamicShadows.noteHuman(body);
        const cv=document.createElement('canvas');cv.width=400;cv.height=240;const c=cv.getContext('2d');GammaShadows.begin(c);
        c.fillStyle='rgba(22,10,48,.8)';c.fillRect(0,0,400,240);c.globalCompositeOperation='destination-out';
        for(const lamp of lamps){c.globalAlpha=.8;DynamicShadows.drawLight(c,lamp,'hole');}
        const paintVeil=g=>{g.fillStyle='rgba(40,15,60,.3)';g.fillRect(150,0,100,240);};
        if(GammaShadows.active)GammaShadows.split(c,veil?paintVeil:null);else if(veil){c.globalCompositeOperation='source-over';c.globalAlpha=1;paintVeil(c);}
        c.globalCompositeOperation='lighter';for(const lamp of lamps){c.globalAlpha=.08;DynamicShadows.drawLight(c,lamp,'color');}
        c.globalAlpha=1;GammaShadows.finish(c);
        return {data:Array.from(c.getImageData(0,0,400,240).data),stats:{...GammaShadows.stats}};
      };
      const compare=veil=>{const high=render('high',veil),gamma=render('gamma',veil);let worst=0,total=0;
        // Compare premultiplied RGB: transparent pixel readback can magnify rounding differences.
        for(let i=0;i<high.data.length;i+=4)for(let k=0;k<4;k++){const a=k===3?high.data[i+3]:high.data[i+k]*high.data[i+3]/255,b=k===3?gamma.data[i+3]:gamma.data[i+k]*gamma.data[i+3]/255;const d=Math.abs(a-b);worst=Math.max(worst,d);total+=d;}
        return {worst,mean:total/high.data.length,stats:gamma.stats,samples:[[20,20],[200,100],[350,200]].map(([x,y])=>({high:high.data.slice((y*400+x)*4,(y*400+x)*4+4),gamma:gamma.data.slice((y*400+x)*4,(y*400+x)*4+4)}))};};
      const plain=compare(false),veiled=compare(true);render('gamma',true);const warm=render('gamma',true).stats;
      GammaShadows.failed=true;const fallback=compare(true);GammaShadows.failed=false;
      const gl=GammaShadows.gl,draw=gl.drawArrays;gl.drawArrays=()=>{throw new Error('simulate GPU failure');};const interrupted=compare(true);gl.drawArrays=draw;GammaShadows.failed=false;
      return {plain,veiled,warm,fallback,interrupted};
    });
    assert.equal(gamma.plain.stats.backend,'webgl2','Gamma must run the real GPU resolve');
    assert.equal(gamma.plain.stats.draws,1,'all shadowed light contributions resolve in ONE GPU draw');
    assert.ok(gamma.plain.mean<1 && gamma.veiled.mean<1 && gamma.plain.worst<8 && gamma.veiled.worst<8,'Gamma preserves High pixels and room veil order');
    assert.equal(gamma.warm.uploads,0,'stationary cached masks stay on the GPU');
    assert.ok(gamma.interrupted.mean<1 && gamma.interrupted.stats.backend==='high-fallback','GPU failure replays queued contributions without losing lighting');
    assert.ok(gamma.fallback.mean<1 && gamma.fallback.stats.backend==='high-fallback','unavailable WebGL falls back to High');
    const scene = await page.evaluate(() => {
      game.getAmbientDarkness=()=>.8;game._doLoadMap('apt_949');game.bakeStaticLighting();game.worldMinutes=22*60;game.running=true;game.paused=false;
      GameSettings.adaptiveLighting=false;GameSettings.lampShadows='gamma';
      for(let i=0;i<3;i++){_frameTime+=100;game.draw();}
      return {gamma:{...GammaShadows.stats},shadows:{...DynamicShadows.stats}};
    });
    assert.equal(scene.gamma.backend,'webgl2','real apartment scene uses Gamma');
    assert.equal(scene.gamma.draws,1,'real lighting engine runs a single Gamma resolve');
    const profiler = await page.evaluate(() => {
      GameSettings.profilerMode='full';game.showProfiler=true;DevOverlay.sync(game);DevOverlay._shadowPanel(game);
      const panel=()=>document.querySelector('#dev-prof .dp-shadows').textContent;
      const active=panel(),visible=getComputedStyle(document.querySelector('#dev-prof .dp-shadows')).display!=='none';
      GammaShadows.failed=true;game.draw();DevOverlay._shadowPanel(game);const fallback=panel();
      // A new frame with no light resolve must not inherit the previous backend status.
      game._renderDrawId++;DevOverlay._shadowPanel(game);const idle=panel();
      GameSettings.lampShadows='high';DevOverlay._shadowPanel(game);const high=panel();GammaShadows.failed=false;
      return {active,visible,fallback,idle,high};
    });
    assert.ok(profiler.visible && profiler.active.includes('WebGL2 active') && profiler.active.includes('GPU resolves 1/frame'),'Full profiler shows successful WebGL resolve');
    assert.ok(profiler.fallback.includes('High fallback — WebGL2 inactive'),'profiler exposes actual unavailable-WebGL fallback');
    assert.ok(profiler.idle.includes('Gamma idle') && !profiler.idle.includes('WebGL2 active'),'profiler rejects a stale rendering result');
    assert.ok(profiler.high.includes('Canvas 2D') && !profiler.high.includes('GPU resolves'),'High hides obsolete Gamma counters');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log(JSON.stringify({ passed: true, pixels: r, extended, gamma, scene, profiler }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
