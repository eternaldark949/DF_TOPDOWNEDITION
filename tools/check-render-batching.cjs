// The render system's batching (and clip trimming) against drawing every shape on its own with its whole clip, in
// Chromium (needs Playwright):
//   node tools/check-render-batching.cjs
// For each city view, the trees' and street lamps' queue (FoliageLampDepth) is drawn twice into a canvas of its own,
// unbatched and batched, and the pixels compared. Batching only changes where two faces share an edge (it's drawn
// once, without the faint seam two fills leave): pmean is the average difference per painted pixel (0..255),
// opaqueBig the opaque pixels that changed by more than a quarter. It fails if those grow.
const { chromium } = require('playwright'); const path = require('path');
const shots=[['sdc',4890,2300,1320],['sdc',2000,1100,1320],['sdc',522,1100,780]];
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'DFAB V8.html')); await page.waitForTimeout(2500);
  for (const [map,x,y,mins] of shots) {
    await page.evaluate(([map,x,y,mins]) => { game.resetGameState(); game.story.update=()=>{}; game._doLoadMap(map,null); game.enterWorld(); game.worldMinutes=mins; game.player.x=x; game.player.y=y; }, [map,x,y,mins]);
    for (let i=0;i<20;i++){ await page.evaluate(([x,y,m])=>{game.player.x=x;game.player.y=y;game.worldMinutes=m;},[x,y,mins]); await page.waitForTimeout(50); }
    const r = await page.evaluate(() => {
      const q = FoliageLampDepth.queue, orig = q.flush, main = game.ctx || game.canvas.getContext('2d');
      let out = null;
      q.flush = function (ctx) {
        const n = this.n, W = ctx.canvas.width, H = ctx.canvas.height, m = ctx.getTransform();
        const draw = batch => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.setTransform(m); this.batch = batch; this.trim = batch; this.n = n; orig.call(this, x); return { data: x.getImageData(0, 0, W, H).data, stats: { ...this.stats } }; };
        const A = draw(false), B = draw(true);
        let diff = 0, big = 0, maxd = 0, painted = 0, opaqueBig = 0; const samples=[]; let pmax=0,p32=0,psum=0;
        for (let i = 0; i < A.data.length; i += 4) {
          if (A.data[i + 3]) painted++;
          const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]), Math.abs(A.data[i + 3] - B.data[i + 3]));
          const pa=A.data[i+3]/255,pb=B.data[i+3]/255; const pd=Math.max(Math.abs(A.data[i]*pa-B.data[i]*pb),Math.abs(A.data[i+1]*pa-B.data[i+1]*pb),Math.abs(A.data[i+2]*pa-B.data[i+2]*pb),Math.abs(A.data[i+3]-B.data[i+3])); if(pd>pmax)pmax=pd; if(pd>32)p32++; psum+=pd; if (d) diff++; if (d > 64) { big++; if (A.data[i+3]===255&&B.data[i+3]===255) opaqueBig++; else if (samples.length<4) samples.push([...A.data.slice(i,i+4)],[...B.data.slice(i,i+4)]); } if (d > maxd) maxd = d;
        }
        out = { pmax:Math.round(pmax), p32, pmean:(psum/Math.max(1,painted)).toFixed(2), painted, diff, big, opaqueBig, samples, maxd, solo: A.stats, batched: B.stats };
        this.batch = true; this.trim = true; this.n = n; this.flush = orig; return orig.call(this, ctx);
      };
      game.draw();
      return out;
    });
    const { samples, ...shown } = r;
    console.log(map, x, y, JSON.stringify(shown));
    if (r.opaqueBig > 0 || +r.pmean > 2) { console.error('batching changed the picture'); process.exitCode = 1; }
  }
  console.log(errs.slice(0,4)); await browser.close();
})();
