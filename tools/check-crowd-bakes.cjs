// The crowd's bakes against drawing each body live, in Chromium (needs Playwright):
//   node tools/check-crowd-bakes.cjs
// In each venue, every body the crowd draws from a bake (legacy/ui/crowd-impostors.js CrowdBakes: a walk frame, or a
// pose frame for someone standing or seated) is also drawn live, both into a little canvas of its own at the
// view's scale and turn, and the pixels compared. A bake is drawn at its own resolution and scaled, so edges
// soften a little: pmean is the average difference per painted pixel (0..255), big the share of painted pixels
// that changed by more than a quarter. Walk frames and pose frames are reported apart (both are a moment held:
// a swinging umbrella or a glint is frozen in the bake); it fails if pose frames stray from the live body
// clearly further than walk frames do (POSE_VS_WALK times their pmean, or PMEAN_FLOOR, whichever is more).
// SHEET=<dir> also writes each venue's first bodies side by side (live | baked; green: a pose frame).
const { chromium } = require('playwright'); const path = require('path');
const POSE_VS_WALK = 1.25, PMEAN_FLOOR = 15;
const venues = [['cozy_cafe_interior', 600, 800, 10 * 60], ['moon_city_nightclub', 800, 700, 23 * 60], ['sdc', 4890, 2300, 14 * 60]];
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  if (process.env.SHEET) await page.addInitScript(() => { window.__SHEET = true; });
  await page.goto('file://' + path.resolve(__dirname, '..', 'DFAB V8.html')); await page.waitForTimeout(2500);
  for (const [map, x, y, mins] of venues) {
    await page.evaluate(([map, x, y, mins]) => {
      game.resetGameState(); game.story.update = () => {}; game._doLoadMap(map, null); game.enterWorld();
      game.worldMinutes = mins; game.player.x = x; game.player.y = y; GameSettings.crowdQuality = 'high'; window.__sheet = window.__SHEET ? [] : null;
      if (map === 'cozy_cafe_interior' && game.cafeLife) game.cafeLife.reset(game);
    }, [map, x, y, mins]);
    for (let i = 0; i < 80; i++) { await page.evaluate(([x, y, m]) => { game.player.x = x; game.player.y = y; game.worldMinutes = m; }, [x, y, mins]); await page.waitForTimeout(50); }
    const r = await page.evaluate(() => {
      const S = 160, out = { walk: [], pose: [] };
      const cell = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
      const orig = drawCrowdHumanoid;
      drawCrowdHumanoid = function (ctx, e, c) {
        const m = ctx.getTransform(), k = Math.hypot(m.a, m.b), rot = Math.atan2(m.b, m.a);
        const at = (g) => { g.setTransform(m.a, m.b, m.c, m.d, S / 2, S / 2); };
        const B = cell(), gb = B.getContext('2d'); at(gb);
        const standing = !(syncHumanoidGait(e) && syncHumanoidGait(e).speed > CONFIG.GAIT.STOP_SPEED);
        if (CrowdBakes.draw(gb, e, c)) {
          const A = cell(), ga = A.getContext('2d'); at(ga);
          drawProceduralHumanoid(ga, e, c);
          const a = ga.getImageData(0, 0, S, S).data, b = gb.getImageData(0, 0, S, S).data;
          let painted = 0, sum = 0, big = 0;
          for (let i = 0; i < a.length; i += 4) {
            if (!a[i + 3] && !b[i + 3]) continue;
            painted++;
            const pa = a[i + 3] / 255, pb = b[i + 3] / 255;
            const d = Math.max(Math.abs(a[i] * pa - b[i] * pb), Math.abs(a[i + 1] * pa - b[i + 1] * pb), Math.abs(a[i + 2] * pa - b[i + 2] * pb), Math.abs(a[i + 3] - b[i + 3]));
            sum += d; if (d > 64) big++;
          }
          if (painted) (standing ? out.pose : out.walk).push([sum / painted, big / painted, c.pose || '-']);
          if (window.__sheet && window.__sheet.length < 16) window.__sheet.push([A, B, standing]);
        }
        return orig(ctx, e, c);
      };
      for (let i = 0; i < 6; i++) game.draw();
      drawCrowdHumanoid = orig;
      const sum = L => L.length ? { n: L.length, pmean: +(L.reduce((s, v) => s + v[0], 0) / L.length).toFixed(2), big: +(L.reduce((s, v) => s + v[1], 0) / L.length).toFixed(3),
                                      worst: L.slice().sort((p, q) => q[0] - p[0])[0].map(v => typeof v === 'number' ? +v.toFixed(3) : v) } : null;
      let sheet = null;
      if (window.__sheet) { const L = window.__sheet, c = document.createElement('canvas'); c.width = S * 2 * 2; c.height = S * L.length; const g = c.getContext('2d'); g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
        L.forEach(([A, B, st], i) => { g.drawImage(A, 0, i * S); g.drawImage(B, S, i * S); g.fillStyle = st ? '#0f0' : '#f00'; g.fillRect(S * 2 + 4, i * S + 4, 10, 10); });
        sheet = c.toDataURL(); window.__sheet = []; }
      return { walk: sum(out.walk), pose: sum(out.pose), sheet };
    });
    if (r.sheet && process.env.SHEET) require('fs').writeFileSync(process.env.SHEET + '/' + map + '.png', Buffer.from(r.sheet.split(',')[1], 'base64'));
    delete r.sheet; console.log(map, JSON.stringify(r));
    const P = r.pose, W = r.walk;
    if (P && P.pmean > Math.max(PMEAN_FLOOR, W ? W.pmean * POSE_VS_WALK : 0)) { console.error('pose frames stray from the live body'); process.exitCode = 1; }
  }
  console.log(errs.slice(0, 4)); await browser.close();
})();
