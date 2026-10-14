#!/usr/bin/env node
'use strict';
// Completed-frame readback is deliberately outside the draw-submission timing.
// This headless benchmark identifies regressions; it cannot predict device FPS.
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'DFAB V8.html'));
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.DFAB_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const result = await page.evaluate(() => {
      game.loop = () => {}; game.running = true; game.paused = false;
      GameSettings.adaptiveLighting = false; game.getAmbientDarkness = () => .8;
      const samples = [], percentile = (a, p) => [...a].sort((a,b) => a-b)[Math.floor((a.length-1)*p)];
      const renderer = document.createElement('canvas').getContext('webgl2');
      const ext = renderer?.getExtension('WEBGL_debug_renderer_info');
      for (const map of ['apt_949', 'moon_city_nightclub']) {
        game._doLoadMap(map); game.bakeStaticLighting(); game.worldMinutes = 22*60;
        for (const soft of [false, true]) for (const moving of [false, true]) {
          GameSettings.softShadows = soft;
          // Alternate order across rounds to reduce warm-up/order bias.
          for (let round = 0; round < 3; round++) for (const quality of round % 2 ? ['gamma','high'] : ['high','gamma']) {
            GameSettings.lampShadows = quality;
            const draw = [], completed = [];
            const x = game.player.x;
            for (let i = 0; i < 45; i++) {
              _frameTime += 16.667;
              if (moving) game.player.x = x + Math.sin(i*.15)*20;
              const t = performance.now(); game.draw(); const submitted = performance.now();
              game.ctx.getImageData(0,0,1,1); const done = performance.now();
              if (i >= 15) { draw.push(submitted-t); completed.push(done-t); }
            }
            game.player.x = x;
            samples.push({map,soft,moving,round,quality,drawMedian:percentile(draw,.5),completedMedian:percentile(completed,.5),completedP90:percentile(completed,.9),gamma:{...GammaShadows.stats},shadows:{...DynamicShadows.stats},layer:[game.lightCanvas.width,game.lightCanvas.height]});
          }
        }
      }
      game.running = false;
      return {renderer:ext ? renderer.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',samples};
    });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify(result, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
