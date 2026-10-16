/** Material pixels, independent presentation and offline contextual material authoring.
 * Uses native WebGL only; software rendering/emulated touch do not benchmark a phone. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  report = {},
  errors = [],
  server = http.createServer((req, res) => {
    if (req.url === "/fixture") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><canvas style="width:400px;height:300px"></canvas>',
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
    const p = await browser.newPage();
    p.setDefaultTimeout(120000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${server.address().port}/fixture`);
    report.pixels = await p.evaluate(async () => {
      const { ETRNLNINE } = await import("/engine/etrnlnine.js"),
        { createMaterial } = await import("/engine/basement/material.js");
      const e = new ETRNLNINE(document.querySelector("canvas"), {
          pixelRatio: 1,
          occlusion: { mode: "off" },
        }),
        r = e.basement.renderer,
        g = r.gl,
        w = e.directory.adopt(e.basement.createWorld()),
        m = createMaterial({
          baseColor: [0, 0, 0],
          emissionColor: [0, 0.1, 1],
          emissionStrength: 3,
        });
      e.directory.create("toy.box", {
        world: w,
        z: 1,
        size: [2, 2, 2],
        material: m,
      });
      w.resolve();
      const batch = r.createBatch(w, 16);
      r.camera.halfHeight = 4;
      r.lighting.ambient.fill(0);
      r.lighting.colors.fill(0);
      r.lighting.configureDirectional({ color: [0, 0, 0] });
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
      const delta = (a, b) => {
        let n = 0;
        for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 2) n++;
        return n;
      };
      const blue = image();
      m.baseColor = [1, 0, 0];
      const redBase = image(),
        baseDifference = delta(blue, redBase);
      m.emissionColor = [1, 0.1, 0];
      const redEmission = image(),
        emissionDifference = delta(blue, redEmission);
      r.presentation.configure({ mode: "hdr" });
      image();
      const hdrOnly = {
        presentation: r.presentation.inspect(),
        bloom: r.bloom.inspect(),
      };
      r.bloom.configure({ mode: "low" });
      image();
      const both = {
        presentation: r.presentation.inspect(),
        bloom: r.bloom.inspect(),
      };
      r.bloom.configure({ mode: "high" });
      image();
      const sceneRetained = r.presentation.targets;
      r.bloom.configure({ mode: "low" });
      image();
      const effectDoesNotOwnScene = r.presentation.targets === sceneRetained;
      // Refuse an effect attachment after shared HDR is already live. The scene must survive.
      r.bloom.configure({ mode: "high" });
      const checkFramebuffer = g.checkFramebufferStatus.bind(g);
      let filterAttempts = 0;
      g.checkFramebufferStatus = () => {
        filterAttempts++;
        return g.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
      };
      image();
      image();
      const filterFailure = {
        attempts: filterAttempts,
        bloom: r.bloom.inspect(),
        presentation: r.presentation.inspect(),
        sceneRetained: r.presentation.targets === sceneRetained,
      };
      g.checkFramebufferStatus = checkFramebuffer;
      r.bloom.configure({ mode: "low" });
      image();
      const filterRecovered = r.bloom.inspect().effectiveMode === "low";
      r.bloom.configure({ mode: "off" });
      image();
      const afterFilterOff = {
        presentation: r.presentation.inspect(),
        bloom: r.bloom.inspect(),
      };
      r.presentation.configure({ mode: "direct" });
      r.bloom.configure({ mode: "high" });
      image();
      const forcedDirect = {
        presentation: r.presentation.inspect(),
        bloom: r.bloom.inspect(),
      };
      const error = g.getError();
      batch.dispose();
      e.dispose();
      return {
        baseDifference,
        emissionDifference,
        hdrOnly,
        both,
        effectDoesNotOwnScene,
        filterFailure,
        filterRecovered,
        afterFilterOff,
        forcedDirect,
        error,
        cleanup: {
          buffers: r.stats.buffers,
          programs: r.stats.programs,
          vaos: r.stats.vaos,
        },
      };
    });
    assert.equal(report.pixels.baseDifference, 0);
    assert.ok(report.pixels.emissionDifference > 100);
    assert.equal(report.pixels.hdrOnly.presentation.effectiveMode, "hdr");
    assert.equal(report.pixels.hdrOnly.bloom.targetBytes, 0);
    assert.equal(report.pixels.effectDoesNotOwnScene, true);
    assert.equal(report.pixels.filterFailure.attempts, 1);
    assert.equal(report.pixels.filterFailure.bloom.targetBytes, 0);
    assert.equal(report.pixels.filterFailure.bloom.programs, 0);
    assert.equal(report.pixels.filterFailure.presentation.effectiveMode, "hdr");
    assert.equal(report.pixels.filterFailure.sceneRetained, true);
    assert.equal(report.pixels.filterRecovered, true);
    assert.equal(
      report.pixels.afterFilterOff.presentation.effectiveMode,
      "hdr",
    );
    assert.equal(report.pixels.afterFilterOff.bloom.targetBytes, 0);
    assert.equal(report.pixels.forcedDirect.presentation.targetBytes, 0);
    assert.equal(report.pixels.forcedDirect.bloom.targetBytes, 0);
    assert.equal(report.pixels.error, 0);
    assert.deepEqual(report.pixels.cleanup, {
      buffers: 0,
      programs: 0,
      vaos: 0,
    });
    console.log(
      "Materials: independent emissive pixels / HDR ownership passed",
    );
    await p.close();
    const context = await browser.newContext({
        viewport: { width: 1440, height: 960 },
        hasTouch: true,
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
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.setContent(
      fs.readFileSync(path.join(root, "dist/ETRNLNINE-Studio.html"), "utf8"),
    );
    await page.waitForFunction(
      () => document.querySelector("#status").dataset.camera,
    );
    await page.locator("#project").selectOption("freelancer.enni-slice.v1");
    const exported = async () => {
      const pending = page.waitForEvent("download");
      await page.locator("#save").click();
      return JSON.parse(fs.readFileSync(await (await pending).path(), "utf8"));
    };
    const base = await exported(),
      asset = base.assets.find((a) => a.id === "enni.sign"),
      original = base.scenes[0].entities.find((e) => e.asset === asset.id),
      part = asset.parts.find((p) => p.shape),
      materialId = part.shape.material;
    console.log("Materials: editing linked definition");
    await page.locator("#show-materials").click();
    await page.locator(`[data-material-id="${materialId}"]`).click();
    await page.waitForFunction(
      (id) => document.querySelector("#selection-id").textContent === id,
      materialId,
    );
    assert.ok(
      Number(
        await page
          .locator("[data-material-users]")
          .getAttribute("data-material-users"),
      ) > 1,
    );
    const edit = async (label, value) => {
      const input = page.getByRole("spinbutton", { name: label, exact: true });
      await input.fill(String(value));
      await input.dispatchEvent("input");
      await input.press("Enter");
    };
    await edit("Base colour R", 0.02);
    await edit("Emission colour R", 0.1);
    await edit("Emission colour G", 0.5);
    await edit("Emission colour B", 1);
    await edit("Emission strength", 5);
    let changed = await exported(),
      m = changed.materials.find((m) => m.id === materialId);
    assert.equal(m.baseColor[0], 0.02);
    assert.deepEqual(m.emissionColor, [0.1, 0.5, 1]);
    assert.equal(m.emissionStrength, 5);
    assert.equal(changed.schemaVersion, 2);
    assert.deepEqual(changed.scenes, base.scenes);
    await page.locator("#undo").click();
    assert.equal(
      (await exported()).materials.find((m) => m.id === materialId)
        .emissionStrength,
      base.materials.find((m) => m.id === materialId).emissionStrength,
    );
    await page.locator("#redo").click();
    console.log("Materials: shared edits / undo passed; making private copy");
    await page.locator("#show-hierarchy").click();
    await page.locator(`#hierarchy [data-id="${original.id}"]`).click();
    await page.locator("#duplicate").click();
    const copyId = await page.locator("#selection-id").textContent();
    await page.locator("[data-material-action=single-user]").click();
    changed = await exported();
    const copy = changed.scenes[0].entities.find((e) => e.id === copyId),
      privateId = copy.materialOverrides[part.id];
    assert.notEqual(privateId, materialId);
    assert.ok(
      asset.parts
        .filter((p) => p.shape)
        .every((p) => copy.materialOverrides[p.id] === privateId),
    );
    assert.equal(
      changed.scenes[0].entities.find((e) => e.id === original.id)
        .materialOverrides,
      undefined,
    );
    await edit("Emission strength", 1);
    changed = await exported();
    assert.equal(
      changed.materials.find((m) => m.id === privateId).emissionStrength,
      1,
    );
    assert.equal(
      changed.materials.find((m) => m.id === materialId).emissionStrength,
      5,
    );
    // The regular inspector's cancel behavior applies to materials too.
    const input = page.getByRole("spinbutton", {
      name: "Emission strength",
      exact: true,
    });
    await input.fill("3");
    await input.dispatchEvent("input");
    await input.press("Escape");
    assert.equal(
      (await exported()).materials.find((m) => m.id === privateId)
        .emissionStrength,
      1,
    );
    console.log("Materials: private override / cancel passed; checking Play");
    // Move the test duplicate out of the facade view; its private binding remains in the file.
    await edit("Position X", original.position[0] + 40);
    const saved = await exported();
    await page.locator("#play").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#status").dataset.mode === "play" &&
        document.querySelector("#status").textContent.includes("Clinic Way"),
    );
    await page.locator("#play").click();
    await page.waitForFunction(
      () => document.querySelector("#status").dataset.mode === "edit",
    );
    assert.deepEqual(await exported(), saved);
    console.log("Materials: Play isolation passed; capturing editor");
    await page.locator("#show-materials").click();
    await page.locator(`[data-material-id="${materialId}"]`).click();
    await page.locator('[data-panel-toggle=viewport]').click();
    await page.locator("#projection").selectOption("perspective");
    await page.locator(".engine-appearance").evaluate((e) => (e.open = true));
    await page.locator("[data-bloom=mode]").selectOption("low");
    await page.waitForFunction(
      () =>
        document.querySelector(".engine-appearance output").dataset
          .effective === "low",
    );
    await page.locator('[data-viewport-section=guides-section]').click();
    // A clean presentation view still uses the same native renderer and editable material.
    if ((await page.locator("#grid").getAttribute("aria-pressed")) === "true")
      await page.locator("#viewport-options [data-view-command=grid]").click();
    if ((await page.locator("#lights").getAttribute("aria-pressed")) === "true")
      await page.locator("#viewport-options [data-view-command=lights]").click();
    await page.locator('[data-panel-toggle=viewport]').click();
    await page.locator("#library").evaluate((e) => {
      e.scrollTop = 0;
    });
    await page.screenshot({
      path: path.join(root, "artifacts/material-studio-desktop.png"),
      timeout: 120000,
    });
    await page.setViewportSize({ width: 412, height: 892 });
    await page.screenshot({
      path: path.join(root, "artifacts/material-studio-phone.png"),
      timeout: 120000,
    });
    // Export/import preserves all material identities, overrides and values.
    await page.locator("#file").setInputFiles({
      name: "materials.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
    await page.waitForFunction(
      () => document.querySelector("#status").dataset.revision === "0",
    );
    assert.deepEqual(await exported(), saved);
    // New/duplicate definitions and per-part assignment use the same document commands.
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.locator("#show-materials").click();
    await page.locator("[data-material-action=new]").click();
    const newId = await page.locator("#selection-id").textContent();
    const name = page.getByRole("textbox", {
      name: "Material name",
      exact: true,
    });
    await name.fill("Moonlit pearl");
    await name.press("Enter");
    const created = await exported();
    assert.equal(created.materials.length, saved.materials.length + 1);
    assert.equal(
      created.materials.find((m) => m.id === newId).name,
      "Moonlit pearl",
    );
    await page.locator("[data-material-action=duplicate]").click();
    const duplicatedId = await page.locator("#selection-id").textContent();
    assert.notEqual(duplicatedId, newId);
    assert.equal(
      (await exported()).materials.length,
      saved.materials.length + 2,
    );
    await page.locator("#show-hierarchy").click();
    await page.locator(`#hierarchy [data-id="${original.id}"]`).click();
    await page
      .getByLabel("Assigned material", { exact: true })
      .selectOption(newId);
    const assigned = (await exported()).scenes[0].entities.find(
      (e) => e.id === original.id,
    );
    assert.deepEqual(assigned.materialOverrides, { [part.id]: newId });
    await page.locator("#undo").click();
    assert.equal(
      (await exported()).scenes[0].entities.find((e) => e.id === original.id)
        .materialOverrides,
      undefined,
    );
    console.log(
      "Materials: creation / rename / duplicate / part assignment passed",
    );
    report.editor = {
      sharedEdit: true,
      independentEmission: true,
      undoRedo: true,
      singleUser: true,
      cancel: true,
      playIsolated: true,
      roundTrip: true,
      createRenameDuplicateAssign: true,
      requests,
    };
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    report.errors = errors;
    await context.close();
    fs.writeFileSync(
      path.join(root, "artifacts/material-results.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log("Material and presentation acceptance passed");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
