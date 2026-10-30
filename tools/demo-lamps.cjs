// Indoor lamp fixtures (entities/lamps.js) in a shot: node tools/demo-lamps.cjs out.png map x y [minutes zoom W H dsf]
// The gameplay camera on a landscape phone by default: she stands at x, y in the map at that hour.
const { chromium } = require('playwright'); const path = require('path');
const [out = 'lamps.png', map = 'apt_949', x = 400, y = 300, mins = 1380, zoom = 1.06, W = 844, H = 390, dsf = 2] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dsf, hasTouch: true, isMobile: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.resolve('DFAB V8.html')); await page.waitForTimeout(2500);
  await page.evaluate(([map, x, y, mins, zoom]) => {
    game.resetGameState(); game.story.update = () => {}; game._doLoadMap(map, null); game.enterWorld(); game.worldMinutes = +mins;
    game.player.x = +x; game.player.y = +y; game.camera.zoom = +zoom;
  }, [map, x, y, mins, zoom]);
  for (let i = 0; i < 30; i++) { await page.evaluate(([m, z, x, y]) => { game.worldMinutes = +m; game.camera.zoom = +z; game.player.x = +x; game.player.y = +y; }, [mins, zoom, x, y]); await page.waitForTimeout(60); }
  await page.screenshot({ path: out });
  console.log(JSON.stringify(await page.evaluate(() => [game.activeMap && game.activeMap.id, game.state, game.lamps && game.lamps.length])), errs.slice(0, 6));
  await browser.close();
})();
