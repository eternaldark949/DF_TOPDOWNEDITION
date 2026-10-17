/** Native specular pixels and the shared mobile colour workflow. This is software GL
 * and emulated touch acceptance, not a physical-phone performance measurement. */
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
      '<!doctype html><canvas style="width:400px;height:320px"></canvas>',
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
        : file.endsWith(".css")
          ? "text/css"
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
    const context = await browser.newContext({
        viewport: { width: 412, height: 892 },
        hasTouch: true,
        isMobile: true,
        acceptDownloads: true,
      }),
      page = await context.newPage();
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
    report.surface = await page.evaluate(async () => {
      const { ETRNLNINE } = await import("/engine/etrnlnine.js"),
        { createMaterial } = await import("/engine/basement/material.js");
      const e = new ETRNLNINE(document.querySelector("canvas"), {
          pixelRatio: 1,
          occlusion: { mode: "off" },
        }),
        r = e.basement.renderer,
        g = r.gl,
        w = e.directory.adopt(e.basement.createWorld());
      const m = createMaterial({
        baseColor: [0, 0, 0],
        reflectivity: 0,
        specularSharpness: 0.3,
      });
      e.directory.create("toy.box", {
        world: w,
        z: -0.1,
        size: [6, 6, 0.2],
        material: m,
      });
      w.resolve();
      const batch = r.createBatch(w, 16);
      r.camera.halfHeight = 4;
      r.camera.preset("top");
      r.camera.setProjection("perspective");
      r.lighting.ambient.fill(0);
      r.lighting.colors.fill(0);
      r.lighting.positions.fill(0);
      r.lighting.configureDirectional({ color: [0, 0, 0] });
      r.lighting.setPoint(0, {
        position: [0, 0, 3],
        color: [2, 2, 2],
        radius: 20,
      });
      const image = () => {
        r.render(batch);
        const b = new Uint8Array(r.canvas.width * r.canvas.height * 4);
        g.readPixels(
          0,
          0,
          r.canvas.width,
          r.canvas.height,
          g.RGBA,
          g.UNSIGNED_BYTE,
          b,
        );
        return b;
      };
      const metrics = (b) => {
        let sum = 0,
          peak = 0,
          lit = 0,
          red = 0,
          green = 0;
        for (let i = 0; i < b.length; i += 4) {
          sum += b[i];
          peak = Math.max(peak, b[i]);

          red += b[i];
          green += b[i + 1];
        }
        for (let i = 0; i < b.length; i += 4) if (b[i] > peak * 0.5) lit++;
        return { sum, peak, lit, red, green };
      };
      const dark = image();
      m.reflectivity = 0.12;
      const soft = image();
      m.specularSharpness = 0.78;
      const sharp = image();
      m.specularColor = [1, 0.04, 0.01];
      const tinted = image();
      const uploads = r.totals.uploads;
      image();
      const unchangedUploads = r.totals.uploads;
      r.camera.setProjection("orthographic");
      const ortho = image();
      r.camera.setProjection("perspective");
      r.lighting.setPoint(0, {
        position: [1, 0, 3],
        color: [2, 2, 2],
        radius: 20,
      });
      const moved = image();
      r.lighting.setPoint(0, {
        position: [0, 0, 3],
        color: [0, 0, 0],
        radius: 20,
      });
      r.lighting.configureDirectional({
        direction: [0.2, 0, 1],
        color: [1, 1, 1],
      });
      const sun = image();
      r.presentation.configure({ mode: "hdr" });
      r.bloom.configure({ mode: "low", threshold: 0.2 });
      image();
      const hdr = r.presentation.inspect();
      const diff = (a, b) => a.reduce((n, v, i) => n + Math.abs(v - b[i]), 0);
      const out = {
        dark: metrics(dark),
        soft: metrics(soft),
        sharp: metrics(sharp),
        tinted: metrics(tinted),
        lensDifference: diff(tinted, ortho),
        movedDifference: diff(tinted, moved),
        sun: metrics(sun),
        stableUpload: uploads === unchangedUploads,
        recordFloats: batch.recordFloats,
        hdr: hdr.effectiveMode,
        error: g.getError(),
      };
      e.dispose();
      out.resources = {
        buffers: r.stats.buffers,
        programs: r.stats.programs,
        vaos: r.stats.vaos,
      };
      return out;
    });
    console.log("Surface pixel metrics", JSON.stringify(report.surface));
    const s = report.surface;
    assert.ok(s.soft.sum > s.dark.sum + 5000);
    assert.ok(s.sharp.peak > s.soft.peak);
    assert.ok(s.sharp.lit < s.soft.lit);
    assert.ok(s.tinted.red > s.tinted.green * 1.5);
    assert.ok(s.lensDifference > 1000);
    assert.ok(s.movedDifference > 1000);
    assert.ok(s.sun.sum > s.dark.sum);
    assert.ok(s.stableUpload);
    assert.equal(s.recordFloats, 24);
    assert.equal(s.hdr, "hdr");
    assert.equal(s.error, 0);
    assert.deepEqual(s.resources, { buffers: 0, programs: 0, vaos: 0 });
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.setContent(
      fs.readFileSync(path.join(root, "dist/ETRNLNINE-Studio.html"), "utf8"),
    );
    await page.waitForFunction(
      () => document.querySelector("#status").dataset.camera,
    );
    const exported = async () => {
      const p = page.waitForEvent("download");
      await page.locator("#save").click();
      return JSON.parse(fs.readFileSync(await (await p).path(), "utf8"));
    };
    const base = await exported(),
      entity = base.scenes[0].entities.find((e) => !e.locked),
      asset = base.assets.find((a) => a.id === entity.asset),
      id = asset.parts.find((p) => p.shape).shape.material;
    await page.locator("[data-panel-toggle=directory]").click();
    await page.locator("#show-materials").click();
    await page.locator(`[data-material-id="${id}"]`).click();
    const open = async (name) =>
      page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
    const accept = async () =>
      page.getByRole("button", { name: "Apply colour", exact: true }).click();
    const value = async (label, n) => {
      const input = page.getByRole("spinbutton", { name: label, exact: true });
      await input.fill(String(n));
    };
    await open("Base colour");
    const original = base.materials.find((m) => m.id === id).baseColor;
    // Opening/closing unchanged preserves full authored precision and creates no undo entry.
    await accept();
    assert.deepEqual(
      (await exported()).materials.find((m) => m.id === id).baseColor,
      original,
    );
    assert.ok(await page.locator("#undo").isDisabled());
    await open("Base colour");
    await value("Base colour R", 0.123456789123);
    await page.keyboard.press("Escape");
    assert.deepEqual(
      (await exported()).materials.find((m) => m.id === id).baseColor,
      original,
    );
    assert.ok(await page.locator("#undo").isDisabled());
    await open("Base colour");
    await value("Base colour R", 0.123456789123);
    await value("Base colour G", 0.4);
    await value("Base colour B", 0.8);
    await accept();
    assert.equal(
      await page.evaluate(() => document.activeElement?.dataset.colorKey),
      "baseColor",
    );
    const changed = await exported();
    assert.deepEqual(
      changed.materials.find((m) => m.id === id).baseColor,
      [0.123456789123, 0.4, 0.8],
    );
    await page.locator("#undo").click();
    assert.deepEqual(
      (await exported()).materials.find((m) => m.id === id).baseColor,
      original,
    );
    assert.ok(await page.locator("#undo").isDisabled());
    await page.locator("#redo").click();
    await open("Emission colour");
    await value("Emission colour R", 4);
    await value("Emission colour G", 0.5);
    await value("Emission colour B", 0.1);
    await accept();
    assert.deepEqual(
      (await exported()).materials.find((m) => m.id === id).emissionColor,
      [4, 0.5, 0.1],
    );
    const beforeSpecular = await exported();
    await open("Specular colour");
    assert.ok(
      await page
        .getByRole("spinbutton", {
          name: "Specular colour Intensity",
          exact: true,
        })
        .isDisabled(),
    );
    const wheel = page.getByRole("slider", {
        name: "Specular colour hue and saturation",
        exact: true,
      }),
      rect = await wheel.boundingBox();
    const cdp = await context.newCDPSession(page),
      point = { x: rect.x + rect.width * 0.8, y: rect.y + rect.height * 0.5 };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: point.x - 20, y: point.y + 20 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    assert.equal(
      Number(
        await page
          .getByRole("spinbutton", { name: "Specular colour R", exact: true })
          .inputValue(),
      ),
      1,
    );
    await accept();
    assert.deepEqual(
      await exported(),
      beforeSpecular,
      "Cancelled wheel gesture preserves omitted optional fields",
    );
    await open("Specular colour");
    await wheel.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await page
      .getByRole("textbox", { name: "Specular colour Hex", exact: true })
      .fill("#ffbb55");
    await page.screenshot({
      path: path.join(root, "artifacts/surface-color-wheel-phone.png"),
      timeout: 120000,
    });
    await accept();
    for (const [label, n] of [
      ["Reflectivity", 0.12],
      ["Specular sharpness", 0.8],
    ]) {
      await value(label, n);
      await page
        .getByRole("spinbutton", { name: label, exact: true })
        .press("Enter");
    }
    const saved = await exported(),
      m = saved.materials.find((m) => m.id === id);
    assert.equal(m.reflectivity, 0.12);
    assert.equal(m.specularSharpness, 0.8);
    assert.ok(m.specularColor[0] > m.specularColor[1]);
    await open("Emission colour");
    await page
      .getByRole("textbox", { name: "Emission colour Hex", exact: true })
      .fill("invalid");
    await accept();
    assert.ok(
      await page
        .getByRole("dialog", { name: "Emission colour picker" })
        .isVisible(),
    );
    await page.keyboard.press("Escape");
    // Repeated opens and cancellation remove modal focus ownership and leave scene/history intact.
    for (let i = 0; i < 3; i++) {
      await open("Base colour");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
    assert.deepEqual(await exported(), saved);
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.screenshot({
      path: path.join(root, "artifacts/surface-material-inspector.png"),
      timeout: 120000,
    });
    report.color = {
      exactLinearValues: true,
      oneUndoPerDialog: true,
      cancelRestores: true,
      HDR: true,
      touchCancel: true,
      keyboardWheel: true,
      hex: true,
      invalidBlocked: true,
      repeatedModalCleanup: true,
      offlineRequests: requests.length,
    };
    assert.equal(requests.length, 0);
    assert.deepEqual(errors, []);
    report.errors = errors;
    fs.writeFileSync(
      path.join(root, "artifacts/surface-results.json"),
      JSON.stringify(report, null, 2),
    );
    await context.close();
    console.log("Surface and colour acceptance passed");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
