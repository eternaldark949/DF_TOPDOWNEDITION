/** Native GL acceptance for the second lens: real depth/AO/shadow pixels and lifecycle.
 * Static submissions avoid making a software GPU's frame rate part of correctness. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  report = {};
const server = http.createServer((req, res) => {
  if (req.url === "/fixture") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><canvas style="width:640px;height:480px"></canvas>',
    );
    return;
  }
  if (req.url === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  const file = path.resolve(root, "." + req.url);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : "text/html",
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath: process.env.ETRNLNINE_CHROMIUM || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const errors = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 640 },
    });
    page.setDefaultTimeout(120000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
    await page.evaluate(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (kind === "2d") throw new Error("Canvas2D forbidden");
        return get.call(this, kind, ...args);
      };
    });
    report.render = await page.evaluate(async () => {
      const { ETRNLNINE } = await import("/engine/etrnlnine.js");
      const engine = new ETRNLNINE(document.querySelector("canvas"), {
          pixelRatio: 1,
        }),
        r = engine.basement.renderer,
        gl = r.gl,
        l = r.lighting;
      const world = engine.directory.adopt(engine.basement.createWorld()),
        box = (options) =>
          engine.directory.create("toy.box", { world, ...options });
      box({ z: -0.25, size: [22, 22, 0.5], color: [0.6, 0.6, 0.6] });
      box({ y: 2, z: 1.5, size: [5, 0.6, 3], color: [0.4, 0.35, 0.5] });
      box({ x: -2, y: -1, z: 1, size: [0.8, 0.8, 2], color: [0.55, 0.4, 0.2] });
      box({ x: 11, z: 6, size: [1, 1, 1] });
      world.resolve();
      const batch = r.createBatch(world, 64);
      Object.assign(r.camera, {
        halfHeight: 6,
        azimuth: 0.3,
        elevation: 0.5,
        z: 1,
      });
      r.camera.setProjection("perspective");
      r.occlusion.configure({ mode: "off" });
      l.ambient.fill(0);
      l.colors.fill(0);
      l.configureDirectional({ direction: [1, 0, 1], color: [1, 1, 1] });
      const pixels = () => {
        r.render(batch);
        const p = new Uint8Array(r.canvas.width * r.canvas.height * 4);
        gl.readPixels(
          0,
          0,
          r.canvas.width,
          r.canvas.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          p,
        );
        return p;
      };
      const difference = (a, b) => {
        let changed = 0;
        for (let i = 0; i < a.length; i += 4)
          if (
            Math.max(...[0, 1, 2].map((c) => Math.abs(a[i + c] - b[i + c]))) > 1
          )
            changed++;
        return changed;
      };
      l.configureShadows({ mode: "off" });
      const noSun = pixels();
      l.configureShadows({ mode: "low", extent: 16 });
      const sun = pixels();
      const sunChanged = difference(noSun, sun),
        first = l.maps.inspect();
      pixels();
      const cached = l.maps.inspect();
      const offscreenCaster = Array.from(
          { length: l.maps.casters.count },
          (_, i) => l.maps.casters.data[i * 16],
        ).includes(11),
        offscreenVisible = Array.from(
          { length: batch.count },
          (_, i) => batch.data[i * batch.recordFloats],
        ).includes(11);
      l.configureDirectional({ color: [0, 0, 0] });
      l.setPoint(0, { position: [0, -3, 3], color: [3, 2, 1], radius: 12 });
      l.configureShadows({ mode: "off" });
      const noPoint = pixels();
      l.configureShadows({ mode: "low", pointIndex: 0, pointResolution: 128 });
      const point = pixels();
      const pointChanged = difference(noPoint, point);
      l.configureShadows({ mode: "off", pointIndex: -1 });
      l.colors.fill(0);
      l.ambient.set([0.7, 0.6, 0.8]);
      r.occlusion.configure({ mode: "off" });
      const off = pixels();
      r.occlusion.configure({ mode: "geometry" });
      const geometry = pixels();
      r.occlusion.configure({ mode: "screen" });
      const screen = pixels();
      const geometryChanged = difference(off, geometry),
        screenChanged = difference(geometry, screen),
        screenTargets = r.occlusion.inspect();
      const pose = r.camera.snapshot();
      r.camera.setProjection("orthographic");
      pixels();
      Object.assign(r.camera, pose);
      pixels();
      const error = gl.getError();
      window.fixture = { engine, r, batch, pixels, world };
      return {
        sunChanged,
        pointChanged,
        geometryChanged,
        screenChanged,
        first,
        cached,
        offscreenCaster,
        offscreenVisible,
        screenTargets,
        error,
      };
    });
    for (const key of [
      "sunChanged",
      "pointChanged",
      "geometryChanged",
      "screenChanged",
    ])
      assert.ok(report.render[key] > 20, `${key} has measurable pixels`);
    assert.equal(report.render.first.sunUpdates, report.render.cached.sunUpdates);
  assert.equal(report.render.cached.frameDraws,0);
  assert.equal(report.render.offscreenCaster, true);
    assert.equal(report.render.offscreenVisible, false);
    assert.equal(report.render.error, 0);
    report.restore = await page.evaluate(async () => {
      const f = window.fixture,
        ext = f.r.gl.getExtension("WEBGL_lose_context");
      if (!ext) return { supported: false };
      const pose = f.r.camera.snapshot();
      ext.loseContext();
      await new Promise((r) => setTimeout(r, 80));
      ext.restoreContext();
      await new Promise((resolve, reject) => {
        let tries = 0;
        const poll = () => {
          if (f.r.stats.contextRestores) resolve();
          else if (++tries > 100)
            reject(new Error("Context restoration timed out"));
          else setTimeout(poll, 20);
        };
        poll();
      });
      const p = f.pixels();
      let varied = 0;
      for (let i = 0; i < p.length; i += 4) if (p[i] > 50) varied++;
      return {
        supported: true,
        pose,
        preserved:
          JSON.stringify(pose) === JSON.stringify(f.r.camera.snapshot()),
        varied,
        error: f.r.gl.getError(),
      };
    });
    if (report.restore.supported) {
      assert.equal(report.restore.preserved, true);
      assert.ok(report.restore.varied > 20);
      assert.equal(report.restore.error, 0);
    }
    report.cleanup = await page.evaluate(() => {
      const f = window.fixture;
      f.r.occlusion.configure({ mode: "off" });
      const targetsReleased = f.r.occlusion.targets === null;
      f.batch.dispose();
      f.engine.directory.releaseWorld(f.world.id, f.world);
      f.engine.dispose();
      return { targetsReleased, ...f.r.stats };
    });
    assert.equal(report.cleanup.targetsReleased, true);
    assert.equal(report.cleanup.buffers, 0);
    assert.equal(report.cleanup.programs, 0);
    assert.equal(report.cleanup.vaos, 0);
    assert.deepEqual(errors, []);
    report.errors = errors;
    fs.writeFileSync(
      path.join(root, "artifacts/perspective-render-results.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log("Perspective rendering acceptance passed");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
