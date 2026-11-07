// WebGL humanoid trial: Canvas 2D vs WebGL timings for 26, 200 and 1000 people, plus a 300-person crowd's frames.
// node tools/bench-webgl-humanoid.cjs "$PWD/DFAB V8.html" src/penthouse/gl-humanoid.js <out dir for PNG frames>
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [file, glsrc, outDir] = process.argv.slice(2);
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; let seed = 7; Math.random = () => (seed = seed * 16807 % 2147483647) / 2147483647; });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('file://' + file); await page.waitForFunction(() => typeof game !== 'undefined' && game.canvas, null, { timeout: 120000 }); await page.waitForTimeout(1500);
  await page.addScriptTag({ content: fs.readFileSync(glsrc, 'utf8') });
  const res = await page.evaluate(() => {
    GameSettings.crowdQuality = 'ultra'; game.loop = () => {}; game.resetGameState(); game.story.update = () => {}; game._doLoadMap('moon_city_nightclub', null); game.running = false; game.enterWorld(); game.loop = () => {}; game.onStep = () => {};
    const R = (s) => { let h = 0; for (const ch of s) h = h * 31 + ch.charCodeAt(0) | 0; let x = Math.abs(h) + 1; return () => (x = x * 16807 % 2147483647) / 2147483647; };
    const looks = []; for (let i = 0; i < 40; i++) looks.push([ROLE_LOOKS.clubgoer, ROLE_LOOKS.cafegoer, (r) => ROLE_LOOKS.pedestrian(Pedestrian.APPEARANCES[i % Pedestrian.APPEARANCES.length], r), (r) => ROLE_LOOKS.mc_staff('bouncer', r)][i % 4](R('k' + i)));
    const W = 915, H = 412;
    const people = (n, w, h) => Array.from({ length: n }, (_, i) => { const e = { x: Math.random() * w, y: Math.random() * h, angle: Math.random() * 6.28, walkPhase: Math.random() * 6, type: 'npc', look: looks[i % looks.length] }; e.cfg = { stance: 'idle', ...e.look, ...(i % 7 === 3 ? { pose: 'dance' } : {}) }; e.walks = i % 7 !== 3; return e; });
    const step = (P) => { for (const e of P) if (e.walks) { e.walkPhase += 0.22; e.x += Math.cos(e.angle) * 0.9; e.y += Math.sin(e.angle) * 0.9; e.angle += 0.01; } };
    let gt = 0; const tick = () => { frame_clock.advanceTick(); gt += 1 / 30; frame_clock.setGameTime(gt); };
    // Canvas 2D at zoom 1.5 on a game-sized canvas
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const c = c2.getContext('2d');
    const glc = document.createElement('canvas'); glc.width = W; glc.height = H; const G = new glHumanoidRenderer(glc), gl = G.gl, px = new Uint8Array(4);
    const Z = 1.5, out = {};
    for (const n of [26, 200, 1000]) {
      const PC = people(n, W / Z, H / Z), PG = people(n, W / Z, H / Z);
      const canvasFrame = () => { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); for (const e of PC) { c.setTransform(Z, 0, 0, Z, e.x * Z, e.y * Z); c.rotate(e.angle); drawProceduralHumanoid(c, e, e.cfg); } c.getImageData(0, 0, 1, 1); };
      let cpu = 0, gpu = 0;
      const glFrame = () => { const t0 = performance.now(); G.begin(W / (2 * Z), H / (2 * Z), Z); for (const e of PG) G.addBody(e, e.cfg); const t1 = performance.now(); G.flush(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t2 = performance.now(); cpu += t1 - t0; gpu += t2 - t1; };
      const frames = n >= 1000 ? 6 : 20;
      for (let i = 0; i < 3; i++) { tick(); step(PC); step(PG); canvasFrame(); glFrame(); }
      cpu = gpu = 0; let tc = 0;
      for (let i = 0; i < frames; i++) { tick(); step(PC); step(PG); const t0 = performance.now(); canvasFrame(); tc += performance.now() - t0; glFrame(); }
      out[n] = { canvas: tc / frames, glCpu: cpu / frames, glDraw: gpu / frames, shapes: G.count };
    }
    // crowd GIF frames: 300 people
    const P = people(300, W / Z, H / Z), frames = [];
    const o = document.createElement('canvas'); o.width = W; o.height = H; const oc = o.getContext('2d');
    for (let f = 0; f < 60; f++) { tick(); step(P); for (const e of P) { if (e.x < 0) e.x += W / Z; if (e.x > W / Z) e.x -= W / Z; if (e.y < 0) e.y += H / Z; if (e.y > H / Z) e.y -= H / Z; }
      G.begin(W / (2 * Z), H / (2 * Z), Z); for (const e of P) G.addBody(e, e.cfg); G.flush();
      oc.fillStyle = '#26232e'; oc.fillRect(0, 0, W, H); oc.drawImage(glc, 0, 0); oc.fillStyle = '#e8e4f0'; oc.font = '600 14px sans-serif'; oc.fillText('WebGL: 300 people, one draw call', 10, 20);
      frames.push(o.toDataURL('image/png')); }
    return { out, frames, renderer: gl.getParameter(gl.RENDERER) };
  });
  console.log('renderer', res.renderer); console.log(JSON.stringify(res.out, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v, 1));
  res.frames.forEach((d, i) => fs.writeFileSync(`${outDir}/c${String(i).padStart(3, '0')}.png`, Buffer.from(d.split(',')[1], 'base64')));
  await b.close();
})();
