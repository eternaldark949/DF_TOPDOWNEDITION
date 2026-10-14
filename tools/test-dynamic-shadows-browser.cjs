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
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log(JSON.stringify({ passed: true, pixels: r, extended }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
