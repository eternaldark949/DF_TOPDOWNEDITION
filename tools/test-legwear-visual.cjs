#!/usr/bin/env node
'use strict';
// Optional real-browser coverage check. Install Playwright + Chromium, then run
// node tools/test-legwear-visual.cjs [game.html]. Pixel checks use the shipped renderer.
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(pathToFileURL(resolve(process.argv[2] || 'DFAB V8.html')).href);
    const result = await page.evaluate(() => {
      // Isolate existing leg passes without changing their geometry or draw order.
      const source = _drawHumanoidBody.toString(), marker = '// 4. Hips & Skirt';
      if (!source.includes(marker)) throw new Error('Leg render boundary missing');
      _drawHumanoidBody = eval('(' + source.replace(marker, 'if (config._legsOnly) return;\n' + marker) + ')');
      const cv = document.createElement('canvas'); cv.width = cv.height = 300;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const items = Object.values(COSMETICS_REGISTRY).filter(e => e.data.shoes?.type === 'thigh_heels');
      let checks = 0; const failures = [];
      function draw(item, phase, speed, skinColor) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 300, 300);
        const e = { x: 0, y: 0, angle: 0, walkPhase: phase, type: 'preview',
          _gait: { speed, dirX: 1, dirY: 0, tick: _simTick, prevX: 0, prevY: 0 } };
        ctx.setTransform(4, 0, 0, 4, 150, 150);
        drawProceduralHumanoid(ctx, e, { gender: 'female', skinColor, shoes: item.data.shoes,
          hair: null, top: null, bottom: null, noShadow: true, pose: 'none', _legsOnly: true });
        return { pixels: ctx.getImageData(0, 0, 300, 300).data, geometry: _humanoidDrawBuffers.get(e).geometry };
      }
      // Change only the skin color. A covered knee must not change with it. Probe inside
      // the joint radius, avoiding silhouette antialiasing and the intentionally bare cuff.
      for (const lod of [0, 1, 2]) {
        _zoomLOD = lod;
        for (const item of items) for (const speed of [0, 1, 3, 6]) for (let f = 0; f < 32; f++) {
          const a = draw(item, f * Math.PI / 16, speed, '#ff20bb');
          const b = draw(item, f * Math.PI / 16, speed, '#20ffbb');
          let changed = 0;
          for (const [kx, ky] of a.geometry.knees) {
            for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) {
              if (x*x + y*y > 100) continue;
              const px = Math.round(150 + kx * 4) + x, py = Math.round(150 + ky * 4) + y;
              const k = (py * 300 + px) * 4;
              if (Math.abs(a.pixels[k] - b.pixels[k]) > 3 || Math.abs(a.pixels[k+1] - b.pixels[k+1]) > 3) changed++;
            }
          }
          checks++;
          if (changed && failures.length < 12) failures.push({ id: item.id, lod, speed, phase: f, changed });
        }
      }
      _zoomLOD = 0;
      const animation = {};
      for (const finish of ['sparkle', 'velvet']) {
        const item = items.find(e => e.data.shoes.finish === finish);
        if (!item) continue;
        _gameTimeSec = 0; const a = draw(item, Math.PI/2, 3, '#c68e63').pixels;
        _gameTimeSec = 1; const b = draw(item, Math.PI/2, 3, '#c68e63').pixels;
        animation[finish] = a.some((v, i) => v !== b[i]);
      }
      return { variants: items.length, checks, failures, animation };
    });
    console.log(JSON.stringify(result, null, 2));
    assert.deepEqual(errors, [], 'no browser errors');
    assert.deepEqual(result.failures, [], 'skin must not show through the boot at either knee');
    assert.equal(result.variants, 6, 'original and five new finishes');
    assert.deepEqual(result.animation, { sparkle: true, velvet: false }, 'sparkles shimmer; velvet remains steady');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
