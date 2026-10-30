// The Ashgrove on the hub (buildings/ashgrove.js), in a shot: node tools/demo-ashgrove.cjs out.png [minutes viewX viewY zoom W H dsf]
// env PX PY: the vantage (the player; the lean leans away from it). Defaults: night, from Foundry Rd.
const { chromium } = require('playwright'); const path = require('path');
const [out = 'ashgrove.png', mins = 1380, vx = 8680, vy = 9380, zoom = 1.1, W = 1300, H = 1300, dsf = 1] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dsf })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.resolve('DFAB V8.html')); await page.waitForTimeout(2500);
  await page.evaluate(([mins, px, py]) => { game.resetGameState(); game.story.update = () => {}; game._doLoadMap('sdc', null); game.enterWorld(); game.worldMinutes = +mins; game.player.x = +px; game.player.y = +py; }, [mins, process.env.PX || 8680, process.env.PY || 10000]);
  for (let i = 0; i < 25; i++) { await page.evaluate((m) => { game.worldMinutes = +m; }, mins); await page.waitForTimeout(60); }
  await page.evaluate(([x, y, z]) => pauseMenu.enterCinematic({ focus: { x, y, zoom: z } }), [+vx, +vy, +zoom]);
  await page.addStyleTag({ content: '#cine-bar, #cinematic-hint, #cine-grade { display: none !important; }' });
  await page.evaluate(() => { if (game.weather) { game.weather.isRaining = false; game.weather.drops.length = 0; game.weather.splashes.length = 0; } });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out });
  console.log(JSON.stringify(await page.evaluate(() => ({ cam: [game.camera.x, game.camera.y], view: game.view }))), errs.slice(0, 6));
  await browser.close();
})();
