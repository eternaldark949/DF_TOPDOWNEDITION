// The render system's batching (and clip trimming) against drawing every shape on its own with its whole clip, in
// Chromium (needs Playwright):
//   node tools/check-render-batching.cjs
// For each city view, every render queue flushed in the frame (the trees' and street lamps', FoliageLampDepth; the tiered
// buildings' ledges, TierKit.ledgeQueue) is drawn twice into a canvas of its own, unbatched and batched, and the pixels
// compared. Batching only changes where two faces share an edge (it's drawn
// once, without the faint seam two fills leave): pmean is the average difference per painted pixel (0..255),
// opaqueBig the opaque pixels that changed by more than a quarter. It fails if those grow.
const { chromium } = require('playwright'); const path = require('path');
const shots=[['sdc',4890,2300,1320],['sdc',2000,1100,1320],['sdc',2000,1100,840],['sdc',522,1100,780]];
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'DFAB V8.html')); await page.waitForTimeout(2500);
  for (const [map,x,y,mins] of shots) {
    await page.evaluate(([map,x,y,mins]) => { game.resetGameState(); game.story.update=()=>{}; game._doLoadMap(map,null); game.enterWorld(); game.worldMinutes=mins; game.player.x=x; game.player.y=y; }, [map,x,y,mins]);
    for (let i=0;i<20;i++){ await page.evaluate(([x,y,m])=>{game.player.x=x;game.player.y=y;game.worldMinutes=m;},[x,y,mins]); await page.waitForTimeout(50); }
    const r = await page.evaluate(() => {
      // Every queue flushed this frame (the trees' and lamps', the tiered buildings' ledges): drawn twice into a canvas of its own
      const P = renderQueue.prototype, orig = P.flush, acc = {};
      P.flush = function (ctx) {
        const n = this.n; if (!n) return orig.call(this, ctx);
        const name = this === FoliageLampDepth.queue ? 'trees' : this === TierKit.ledgeQueue ? 'ledges' : 'other';
        const W = ctx.canvas.width, H = ctx.canvas.height, m = ctx.getTransform();
        // (the ledges' reference is also unsorted: as submitted, face by face, the way they were drawn before they were queued)
        const sorted = this.sort;
        const draw = batch => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.setTransform(m); this.batch = batch; this.trim = batch; this.sort = batch || name !== 'ledges' ? sorted : false; this.n = n; orig.call(this, x); return { data: x.getImageData(0, 0, W, H).data, stats: { ...this.stats } }; };
        const A = draw(false), B = draw(true);
        const o = acc[name] || (acc[name] = { pmax: 0, p32: 0, psum: 0, painted: 0, big: 0, opaqueBig: 0, shapes: 0, batches: 0 });
        o.shapes += A.stats.shapes; o.batches += B.stats.batches;
        for (let i = 0; i < A.data.length; i += 4) {
          if (A.data[i + 3]) o.painted++;
          const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]), Math.abs(A.data[i + 3] - B.data[i + 3]));
          const pa = A.data[i + 3] / 255, pb = B.data[i + 3] / 255;
          const pd = Math.max(Math.abs(A.data[i] * pa - B.data[i] * pb), Math.abs(A.data[i + 1] * pa - B.data[i + 1] * pb), Math.abs(A.data[i + 2] * pa - B.data[i + 2] * pb), Math.abs(A.data[i + 3] - B.data[i + 3]));
          if (pd > o.pmax) o.pmax = pd; if (pd > 32) o.p32++; o.psum += pd;
          if (d > 64) { o.big++; if (A.data[i + 3] === 255 && B.data[i + 3] === 255) o.opaqueBig++; }
        }
        this.batch = true; this.trim = true; this.sort = sorted; this.n = n; return orig.call(this, ctx);
      };
      try { game.draw(); } finally { P.flush = orig; }
      for (const o of Object.values(acc)) { o.pmean = (o.psum / Math.max(1, o.painted)).toFixed(2); o.pmax = Math.round(o.pmax); delete o.psum; }
      return { samples: null, queues: acc };
    });
    const { samples, ...shown } = r;
    console.log(map, x, y, JSON.stringify(shown));
    for (const [name, q] of Object.entries(r.queues)) if (q.opaqueBig > 0 || +q.pmean > 2) { console.error(name + ': batching changed the picture'); process.exitCode = 1; }
  }
  console.log(errs.slice(0,4)); await browser.close();
})();
