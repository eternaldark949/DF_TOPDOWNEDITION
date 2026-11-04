// Darklands draft (buildings/suburb-house.js, entities/marionettes.js), in a shot on an empty outdoor map:
// node tools/demo-darklands.cjs out.png [scene minutes zoom W H dsf]
//   scene: 'street' (three houses), 'swarm' (949 and a swarm of marionettes), 'close' (marionettes up close)
const { chromium } = require('playwright'); const path = require('path');
const [out = 'darklands.png', scene = 'street', mins = 1380, zoom = 1, W = 1400, H = 900, dsf = 1] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dsf })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.resolve('DFAB V8.html')); await page.waitForTimeout(2500);
  const info = await page.evaluate(([scene, mins]) => {
    game.resetGameState(); game.story.update = () => {};
    // An empty suburb street: a lawn, the asphalt, the pavement (set before the load: the ground is baked from it)
    Object.assign(MAP_DATA.ollo_test, { floorColor: '#1d2219', floorZones: [{ x: 0, y: 980, w: 2000, h: 160, color: '#26272a' }, { x: 0, y: 940, w: 2000, h: 40, color: '#4a4945' }] });
    game._doLoadMap('ollo_test', null); game.enterWorld(); game.worldMinutes = +mins;
    const m = game.activeMap;
    m.transitions = (m.transitions || []).filter(t => !t._ollo); m.landmarks = [];
    m._v3Buildings = []; m.buildingColliders = []; m.lamps = (m.lamps || []).filter(() => false); m.props = []; m.npcs = [];
    const houses = [
      createSuburbHouse(120, 560, { scheme: 'ash', garage: 'E', boarded: [1, 5], lit: [3], seed: 11 }),
      createSuburbHouse(560, 560, { scheme: 'sage', garage: 'W', boarded: [], lit: [6], seed: 23 }),
      createSuburbHouse(1000, 560, { scheme: 'blue', garage: 'E', boarded: [0, 2, 4, 6], lit: [], seed: 31 }),
      createSuburbHouse(1440, 560, { scheme: 'cream', garage: 'W', boarded: [3], lit: [1, 2], seed: 41 })
    ];
    m.buildings = houses;
    for (const b of houses) m.buildingColliders.push(...b.getCollisionShapes());
    for (const b of houses) for (const l of (b.attachedLights || [])) m.lamps.push(l);
    for (let x = 100; x < 2000; x += 330) m.lamps.push(new LampEntity({ x, y: 955, lampType: 3, color: '#cfd8ff', lightRadius: 260 }));
    game.lamps = m.lamps;
    if (game.groundBaker) { game.groundBaker.invalidate(); game.groundBaker.mapId = null; }
    game.invalidateRenderSpatial();
    game.enemies = [];
    const P = game.player;
    if (scene === 'swarm' || scene === 'close') {
      P.x = 820; P.y = 870;
      const ring = scene === 'close' ? 5 : 11;
      for (let i = 0; i < ring; i++) {
        const a = i / ring * Math.PI * 2, r = scene === 'close' ? 70 : 110 + (i % 3) * 40;
        const mm = new Marionette(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * 0.8);
        game.enemies.push(mm);
      }
    } else { P.x = 1000; P.y = 1060; }
    return { player: [P.x, P.y], buildings: houses.length };
  }, [scene, mins]);
  for (let i = 0; i < 20; i++) { await page.evaluate((m) => { game.worldMinutes = +m; }, mins); await page.waitForTimeout(60); }
  const focus = scene === 'street' ? { x: +(process.env.FX || 1000), y: +(process.env.FY || 820), zoom: +zoom } : { x: 820, y: 840, zoom: +zoom };
  await page.evaluate((f) => pauseMenu.enterCinematic({ focus: f }), focus);
  await page.addStyleTag({ content: '#cine-bar, #cinematic-hint, #cine-grade { display: none !important; }' });
  await page.evaluate(() => { if (game.weather) { game.weather.isRaining = false; game.weather.drops.length = 0; game.weather.splashes.length = 0; } });
  if (scene !== 'street') {                     // let the swarm move a moment, then hold one in its tell
    await page.evaluate(() => { pauseMenu.exitCinematic && pauseMenu.exitCinematic(); });
    await page.waitForTimeout(900);
    await page.evaluate(() => { const e = game.enemies; if (e[0]) { e[0]._setState('tell'); } if (e[2]) { e[2]._setState('tell'); } });
    await page.waitForTimeout(200);
    await page.evaluate((f) => pauseMenu.enterCinematic({ focus: f }), focus);
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out });
  console.log(JSON.stringify(info), errs.slice(0, 6));
  await browser.close();
})();
