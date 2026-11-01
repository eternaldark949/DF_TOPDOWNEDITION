// The dream star map (world/dream-planet.js) in a still: node tools/demo-dream-planet.cjs out.png [world time angle W H dsf]
const { chromium } = require('playwright'); const path = require('path');
const [out = 'dream.png', world = 0, time = 4, angle = 0.8, W = 844, H = 390, dsf = 2] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dsf })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.resolve('DFAB V8.html')); await page.waitForTimeout(2000);
  const ms = await page.evaluate(([world, time, angle]) => {
    DreamStarMap.open({ world: +world, time: +time, paused: true }); DreamStarMap.planet.angle = +angle;
    const t0 = performance.now(); for (let i = 0; i < 10; i++) DreamStarMap.draw(); return (performance.now() - t0) / 10;
  }, [world, time, angle]);
  await page.waitForTimeout(200);
  await page.screenshot({ path: out });
  console.log('frame ms', ms.toFixed(1), errs.slice(0, 6));
  await browser.close();
})();
