#!/usr/bin/env node
/*
 * Demo shot of the bay tower (buildings/bay-tower.js). It isn't on any map yet: this swaps it in for the brick
 * apartment at (1975, 1983) on the hub, frames it in Cinematic View and saves a screenshot.
 *
 *   node tools/build.mjs && node tools/demo-bay-tower.cjs out.png [minutes] [viewX viewY zoom] [width height] [scale]
 *
 * The lean's vantage is the player (PX, PY env; default 1950, 2520, down the street to the south-west); the view is
 * panned from there to (viewX, viewY), so the walls lean as they would to someone standing there. Needs Playwright.
 */
const { chromium } = require('playwright');
const path = require('path');
const [out = 'bay-tower.png', mins = 1380, vx = 2120, vy = 2090, zoom = 2.5, W = 1000, H = 1250, dsf = 1] = process.argv.slice(2);
const PX = +(process.env.PX || 1950), PY = +(process.env.PY || 2520), LOT = [1975, 1983];
(async () => {
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dsf })).newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('file://' + path.resolve('DFAB V8.html')); await page.waitForTimeout(2500);
    await page.evaluate(([LOT, mins, PX, PY]) => {
        game.resetGameState(); game.story.update = () => {}; game._doLoadMap('sdc', null); game.enterWorld();
        const M = game.activeMap, i = M.buildings.findIndex(b => (b.x | 0) === LOT[0] && (b.y | 0) === LOT[1]);
        const o = M.buildings[i], n = createBayTower(o.x, o.y); M.buildings[i] = n;
        // its lights for the old building's, without the old door or the street tree that stood where the bay is
        M.lamps = M.lamps.filter(l => !o.attachedLights.includes(l)); M.lamps.push(...n.attachedLights);
        M.transitions = M.transitions.filter(t => t !== o.attachedTransition);
        M.foliage = M.foliage.filter(t => !(Math.abs(t.x - (o.x + 150)) < 130 && t.y > o.y + 180 && t.y < o.y + 320));
        game.invalidateRenderSpatial();
        game.worldMinutes = +mins; game.player.x = PX; game.player.y = PY;
    }, [LOT, mins, PX, PY]);
    for (let i = 0; i < 25; i++) { await page.evaluate((m) => { game.worldMinutes = +m; }, mins); await page.waitForTimeout(60); }
    await page.evaluate(([x, y, z]) => pauseMenu.enterCinematic({ focus: { x, y, zoom: z } }), [+vx, +vy, +zoom]);
    await page.addStyleTag({ content: '#cine-bar, #cinematic-hint, #cine-grade { display: none !important; }' });
    await page.evaluate(() => { if (game.weather) { game.weather.isRaining = false; game.weather.drops.length = 0; game.weather.splashes.length = 0; } });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: out });
    await browser.close();
    if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
    console.log('saved', out);
})();
