/** Real native WebGL HDR/bloom evidence. Readbacks are test-only, never production work. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  report = {},
  errors = [];
const server = http.createServer((req, res) => {
  if (req.url === "/fixture") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      "<!doctype html><style>body{margin:0;background:#090912}canvas{width:512px;height:384px}</style><canvas></canvas>",
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
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".json")
          ? "application/json"
          : "text/html",
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
  try {
    const page = await browser.newPage({
      viewport: { width: 900, height: 700 },
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
    report.pixels = await page.evaluate(async () => {
      const { ETRNLNINE } = await import("/engine/etrnlnine.js"),
        engine = new ETRNLNINE(document.querySelector("canvas"), {
          pixelRatio: 1,
          occlusion: { mode: "off" },
        }),
        r = engine.basement.renderer,
        gl = r.gl;
      const world = engine.directory.adopt(engine.basement.createWorld());
      const emitter = engine.directory.create("toy.box", {
        world,
        z: 1,
        size: [0.35, 0.35, 2],
        color: [1, 0.5, 0.15],
        emission: 12,
      });
      engine.directory.create("toy.box", {
        world,
        z: -0.25,
        size: [12, 12, 0.5],
        color: [0.2, 0.15, 0.3],
      });
      world.resolve();
      const batch = r.createBatch(world, 16);
      r.camera.halfHeight = 4;
      r.lighting.ambient.fill(0.2);
      r.lighting.colors.fill(0);
      r.lighting.configureDirectional({ color: [0, 0, 0] });
      const image = () => {
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
        let changed = 0,
          brighter = 0;
        for (let i = 0; i < a.length; i += 4) {
          let d = 0;
          for (let c = 0; c < 3; c++) {
            d = Math.max(d, Math.abs(a[i + c] - b[i + c]));
            if (b[i + c] > a[i + c] + 2) brighter++;
          }
          if (d > 2) changed++;
        }
        return { changed, brighter };
      };
      const direct = image();
      r.bloom.configure({ mode: "low", strength: 0 });
      const hdr = image(),
        zero = r.bloom.inspect(),
        reference = r.bloom.targets;
      r.bloom.configure({ strength: 0.9 });
      const bloom = image(),
        on = r.bloom.inspect(),
        reused = reference === r.bloom.targets;
      image();
      const cached = reference === r.bloom.targets;
      r.bloom.configure({ strength: 0, exposure: 2 });
      const exposureDifference = difference(hdr, image());
      r.bloom.configure({ strength: 0.9, exposure: 1.25 });
      // A high threshold and a dark emitter prove extraction does not blur the whole scene.
      emitter.shape.emission = 0;
      r.bloom.configure({ threshold: 16, strength: 0 });
      const darkOff = image();
      r.bloom.configure({ strength: 1 });
      const darkOn = image();
      emitter.shape.emission = 12;
      r.bloom.configure({ threshold: 1, mode: "high" });
      image();
      const high = r.bloom.inspect();
      r.camera.setProjection("perspective");
      r.occlusion.configure({ mode: "screen" });
      r.lighting.configureDirectional({ color: [0.2, 0.2, 0.2] });
      r.lighting.configureShadows({ mode: "low" });
      image();
      const combined = {
        error: gl.getError(),
        ao: r.occlusion.inspect(),
        bloom: r.bloom.inspect(),
      };
      window.fixture = { engine, r, world, batch, image, reference };
      return {
        exposureDifference,
        directVsHdr: difference(direct, hdr),
        bloomDifference: difference(hdr, bloom),
        darkDifference: difference(darkOff, darkOn),
        zero,
        on,
        reused,
        cached,
        high,
        combined,
        error: gl.getError(),
      };
    });
    console.log(JSON.stringify(report.pixels, null, 2));
    assert.ok(report.pixels.exposureDifference.brighter > 100);
    assert.equal(report.pixels.zero.passes, 1);
    assert.equal(report.pixels.on.effectiveMode, "low");
    assert.equal(report.pixels.error, 0);
    assert.ok(report.pixels.bloomDifference.brighter > 100);
    assert.equal(report.pixels.darkDifference.changed, 0);
    assert.equal(report.pixels.reused, true);
    assert.equal(report.pixels.cached, true);
    assert.equal(report.pixels.combined.error, 0);
    // Guide colours bypass bloom; switching visibility cannot create a blurred guide halo.
    report.guides = await page.evaluate(() => {
      const f = window.fixture,
        r = f.r,
        gl = r.gl;
      r.camera.setProjection("orthographic");
      r.camera.preset("top");
      r.occlusion.configure({ mode: "off" });
      r.lighting.configureShadows({ mode: "off", pointIndex: -1 });
      const base = f.image(),
        layer = r.lines.create(2, { depthTest: false });
      layer.begin();
      layer.segment([-2, -1.99, 3], [2, -1.99, 3], [0.1, 1, 0.2, 1]);
      layer.end();
      r.render(f.batch, [layer]);
      const p = new Uint8Array(base.length);
      gl.readPixels(
        0,
        0,
        r.canvas.width,
        r.canvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        p,
      );
      let green = 0,
        changed = 0;
      for (let i = 0; i < p.length; i += 4) {
        if (p[i] === 26 && p[i + 1] === 255 && p[i + 2] === 51) green++;
        if (
          p[i] !== base[i] ||
          p[i + 1] !== base[i + 1] ||
          p[i + 2] !== base[i + 2]
        )
          changed++;
      }
      layer.dispose();
      const behind = r.lines.create(2);
      behind.begin();
      behind.segment([-2, -1.99, -1], [2, -1.99, -1], [0.1, 1, 0.2, 1]);
      behind.end();
      r.render(f.batch, [behind]);
      const q = new Uint8Array(base.length);
      gl.readPixels(
        0,
        0,
        r.canvas.width,
        r.canvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        q,
      );
      let occludedChanges = 0;
      for (let i = 0; i < q.length; i++)
        if (q[i] !== base[i]) occludedChanges++;
      behind.dispose();
      return { green, changed, occludedChanges, error: gl.getError() };
    });
    assert.equal(report.guides.occludedChanges, 0);
    assert.ok(report.guides.green > 100);
    assert.ok(report.guides.changed < 400);
    assert.equal(report.guides.error, 0);
    report.lifecycle = await page.evaluate(async () => {
      const f = window.fixture,
        r = f.r,
        gl = r.gl;
      const program = r.bloom.programs[0].program,
        old = r.bloom.targets;
      r.canvas.style.cssText = "width:256px;height:192px";
      f.image();
      const resize = {
        replaced: r.bloom.targets !== old,
        programReused: r.bloom.programs[0].program === program,
        width: r.bloom.targets.width,
      };
      const ext = gl.getExtension("WEBGL_lose_context");
      let restored = false;
      if (ext) {
        ext.loseContext();
        await new Promise((resolve) => setTimeout(resolve, 80));
        ext.restoreContext();
        await new Promise((resolve, reject) => {
          let tries = 0;
          const poll = () => {
            if (r.stats.contextRestores) resolve();
            else if (++tries > 100)
              reject(new Error("Context restore timed out"));
            else setTimeout(poll, 20);
          };
          poll();
        });
        f.image();
        restored = r.bloom.inspect().effectiveMode === "high";
      }
      // No capability retry loop, and a working antialiased direct render on refusal.
      r.bloom.configure({ mode: "off" });
      const original = gl.getExtension.bind(gl);
      let attempts = 0;
      gl.getExtension = (name) => {
        if (name === "EXT_color_buffer_float") {
          attempts++;
          return null;
        }
        return original(name);
      };
      r.bloom.configure({ mode: "low" });
      f.image();
      f.image();
      const refusal = { attempts, ...r.bloom.inspect() };
      gl.getExtension = original;
      r.bloom.configure({ mode: "low" });
      f.image();
      const recovered = r.bloom.inspect().effectiveMode === "low";
      for (let i = 0; i < 3; i++) {
        r.bloom.configure({ mode: "off" });
        f.image();
        r.bloom.configure({ mode: "low" });
        f.image();
      }
      return {
        resize,
        restoreSupported: !!ext,
        restored,
        refusal,
        recovered,
        error: gl.getError(),
      };
    });
    assert.deepEqual(report.lifecycle.resize, {
      replaced: true,
      programReused: true,
      width: 256,
    });
    if (report.lifecycle.restoreSupported)
      assert.equal(report.lifecycle.restored, true);
    assert.equal(report.lifecycle.refusal.attempts, 1);
    assert.equal(report.lifecycle.refusal.targetBytes, 0);
    assert.equal(report.lifecycle.refusal.programs, 0);
    assert.equal(report.lifecycle.recovered, true);
    assert.equal(report.lifecycle.error, 0);

    report.cleanup = await page.evaluate(() => {
      const f = window.fixture;
      f.r.bloom.configure({ mode: "off" });
      const disabled = f.r.bloom.inspect();
      f.batch.dispose();
      f.engine.directory.releaseWorld(f.world.id, f.world);
      f.engine.dispose();
      return { disabled, ...f.r.stats };
    });
    assert.equal(report.cleanup.disabled.targetBytes, 0);
    assert.equal(report.cleanup.buffers, 0);
    assert.equal(report.cleanup.programs, 0);
    assert.deepEqual(errors, []);
    // Matched Enni Cole captures use authored content and the public shared renderer.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(async () => {
      const { ETRNLNINE } = await import("/engine/etrnlnine.js");
      const { SceneInstance } = await import(
        "/engine/directory/scene-instance.js"
      );
      const { FREELANCER_PROJECT } = await import(
        "/games/freelancer/project.js"
      );
      document.body.style.cssText =
        "margin:0;background:#090912;overflow:hidden";
      const canvas = document.querySelector("canvas");
      canvas.style.cssText = "display:block;width:100vw;height:100vh";
      const engine = new ETRNLNINE(canvas, {
          pixelRatio: 1,
          occlusion: { mode: "geometry" },
          lighting: { shadows: { mode: "low" } },
          bloom: { mode: "high", strength: 0 },
        }),
        r = engine.basement.renderer,
        scene = FREELANCER_PROJECT.scenes[0],
        world = engine.directory.adopt(engine.basement.createWorld());
      const instance = new SceneInstance(
          engine.directory,
          world,
          FREELANCER_PROJECT,
          scene,
        ),
        batch = r.createBatch(world);
      r.lighting.configureDirectional(scene.sun);
      r.lighting.ambient.set(scene.ambient);
      scene.lights.forEach((light, i) => r.lighting.setPoint(i, light));
      Object.assign(r.camera, {
        x: 0,
        y: 7,
        z: 5.5,
        azimuth: 0.24,
        elevation: 0.25,
        halfHeight: 19.5,
      });
      r.camera.setProjection("perspective");
      window.enniFixture = {
        engine,
        r,
        instance,
        batch,
        render: () => r.render(batch),
      };
    });
    for (const [name, strength] of [
      ["off", 0],
      ["on", 0.85],
    ]) {
      await page.evaluate((strength) => {
        const f = window.enniFixture;
        f.r.bloom.configure({ strength });
        f.render();
      }, strength);
      await page.screenshot({
        path: path.join(root, `artifacts/bloom-enni-${name}.png`),
        timeout: 120000,
      });
    }
    report.enni = await page.evaluate(() => ({
      camera: window.enniFixture.r.camera.snapshot(),
      bloom: window.enniFixture.r.bloom.inspect(),
      error: window.enniFixture.r.gl.getError(),
    }));
    // A closer architectural view isolates the sign/window halo without changing source materials.
    await page.evaluate(() => {
      const f = window.enniFixture;
      Object.assign(f.r.camera, {
        x: 0,
        y: 7,
        z: 6.5,
        distance: 22,
        elevation: 0.1,
      });
      f.r.bloom.configure({ threshold: 0.65, radius: 1.5, scatter: 0.75 });
    });
    for (const [name, strength] of [
      ["off", 0],
      ["on", 1.25],
    ]) {
      await page.evaluate((strength) => {
        const f = window.enniFixture;
        f.r.bloom.configure({ strength });
        f.render();
      }, strength);
      await page.screenshot({
        path: path.join(root, `artifacts/bloom-enni-detail-${name}.png`),
        timeout: 120000,
      });
    }
    report.detail = await page.evaluate(() => ({
      camera: window.enniFixture.r.camera.snapshot(),
      bloom: window.enniFixture.r.bloom.inspect(),
    }));
    await page.setViewportSize({ width: 412, height: 892 });
    await page.evaluate(() => {
      const f = window.enniFixture;
      f.r.bloom.configure({ mode: "low" });
      f.r.camera.distance = 65;
      f.render();
    });
    await page.screenshot({
      path: path.join(root, "artifacts/bloom-enni-phone.png"),
      timeout: 120000,
    });
    report.phone = await page.evaluate(() =>
      window.enniFixture.r.bloom.inspect(),
    );
    await page.evaluate(() => {
      const f = window.enniFixture;
      f.instance.dispose();
      f.batch.dispose();
      f.engine.dispose();
    });
    assert.equal(report.enni.error, 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(root, "artifacts/bloom-results.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log("Bloom acceptance passed");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
