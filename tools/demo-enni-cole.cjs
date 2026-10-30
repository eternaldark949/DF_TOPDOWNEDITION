// Enni Cole (buildings/enni-cole.js) in a shot: node tools/demo-enni-cole.cjs out.png [minutes dx dy zoom W H dsf]
// The gameplay camera: she stands dx, dy from the middle of its front (world px, +y out into the street), at zoom
// (the phone's ~1.06), on a landscape phone by default. env CINE=1: the cinematic camera on that spot instead.
const { chromium } = require('playwright'); const path = require('path');
const [out = 'enni-cole.png', mins = 1380, dx = 0, dy = 260, zoom = 1.06, W = 844, H = 390, dsf = 2] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dsf, hasTouch: true, isMobile: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.resolve('DFAB V8.html')); await page.waitForTimeout(2500);
  const at = await page.evaluate(([mins, dx, dy, zoom]) => {
    game.resetGameState(); game.story.update = () => {}; game._doLoadMap('sdc', null); game.enterWorld(); game.worldMinutes = +mins;
    const b = game.activeMap.buildings.find(b => b.id === 'enni_cole');
    game.player.x = b.x + b.w / 2 + +dx; game.player.y = b.y + b.h + +dy; game.camera.zoom = +zoom;
    if (game.weather) game.weather.setCondition('clear', 9999, true);
    return [b.x, b.y, b.w, b.h];
  }, [mins, dx, dy, zoom]);
  for (let i = 0; i < 30; i++) { await page.evaluate(([m, z]) => { game.worldMinutes = +m; game.camera.zoom = +z; const w = game.weather; if (w) { w.isRaining = false; w.intensity = 0; w.drops.length = 0; w.splashes.length = 0; } }, [mins, zoom]); await page.waitForTimeout(60); }
  if (process.env.CINE) {
    await page.evaluate(([x, y, z]) => pauseMenu.enterCinematic({ focus: { x, y, zoom: z } }), [at[0] + at[2] / 2 + +dx, at[1] + at[3] + +dy - 200, +zoom]);
    await page.addStyleTag({ content: '#cine-bar, #cinematic-hint, #cine-grade { display: none !important; }' });
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ building: at, view: await page.evaluate(() => game.view && [game.view.x | 0, game.view.y | 0, game.view.zoom, game.canvas.width, game.canvas.height, leanCamHeight() | 0, game.worldMinutes % 1440 | 0, game.paused, game.state]) }), errs.slice(0, 6));
  await browser.close();
})();
