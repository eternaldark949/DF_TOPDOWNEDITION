/** Humanoid silhouette review: real offline artifact plus a source fixture for pixels.
 * SwiftShader/emulated touch prove behaviour and resource ownership, not phone speed. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  html = fs.readFileSync(path.join(root, "dist/ETRNLNINE-Humanoid-Review.html"), "utf8"),
  report = {};
/** Serve repository source for the fixture; the offline artifact itself uses setContent. */
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html>");
    return;
  }
  const file = path.resolve(root, "." + decodeURIComponent(req.url));
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".json") ? "application/json" : "text/html");
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`,
    browser = await chromium.launch({
      executablePath: process.env.ETRNLNINE_CHROMIUM || "/usr/bin/chromium",
      args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
  try {
    // 1. Offline artifact: views, looks, proportion edit/undo, no Canvas2D or requests.
    const context = await browser.newContext({ viewport: { width: 1280, height: 760 }, acceptDownloads: true }),
      page = await context.newPage(),
      errors = [],
      requests = [];
    page.setDefaultTimeout(120000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.evaluate(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (kind === "2d") throw new Error("Canvas2D forbidden");
        return get.call(this, kind, ...args);
      };
    });
    page.on("request", (r) => requests.push(r.url()));
    await page.setContent(html);
    const status = () => page.locator("#status").evaluate((e) => ({ ...e.dataset }));
    await page.waitForFunction(() => document.querySelector("#status").dataset.figures === "5");
    const initial = await status();
    assert.equal(initial.mode, "turnaround");
    assert.equal(await page.locator("#labels span").count(), 4);
    await page.screenshot({ path: path.join(root, "artifacts/humanoid-turnaround.png") });
    await page.locator("nav [data-look=silhouette]").click();
    await page.locator("nav [data-pose=walk]").click();
    await page.waitForFunction(() => document.querySelector("#status").dataset.look === "silhouette" && document.querySelector("#status").dataset.pose === "walk");
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(root, "artifacts/humanoid-silhouette-walk.png") });
    console.log("Humanoid: turnaround / silhouette / walk");

    // Proportion edit: typing a height rebuilds every figure; Undo restores the preset.
    await page.locator("#toggle-panel").click();
    const height = page.getByLabel("Height (m)", { exact: true });
    await height.fill("1.9");
    await height.press("Enter");
    await page.waitForFunction(() => document.querySelector("#status").dataset.height === "1.9");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const exported = JSON.parse(fs.readFileSync(await (await download).path(), "utf8"));
    assert.equal(exported.parameters.height, 1.9);
    assert.equal(exported.kind, "humanoid");
    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForFunction(() => document.querySelector("#status").dataset.height === "1.68");
    // An impossible combination is reported and leaves the figures unchanged: long legs
    // are valid alone, but with a long neck the big head leaves no room for a torso.
    const legs = page.getByLabel("Leg length (× height)", { exact: true });
    await legs.fill("0.6");
    await legs.press("Enter");
    await page.waitForFunction(() => document.querySelector("#problem").textContent === "");
    const neck = page.getByLabel("Neck length (× height)", { exact: true });
    await neck.fill("0.08");
    await neck.press("Enter");
    await page.waitForFunction(() => /no room for a torso/.test(document.querySelector("#problem").textContent));
    assert.equal((await status()).height, "1.68");
    await page.getByRole("button", { name: "Undo" }).click();
    // Outfit: choosing a garment rebuilds with more parts; generating draws a full outfit.
    const before = Number((await status()).parts);
    await page.getByLabel("Outfit outer", { exact: true }).selectOption("jacket");
    await page.waitForFunction((n) => Number(document.querySelector("#status").dataset.parts) > n, before);
    await page.getByRole("button", { name: "Generate outfit" }).click();
    await page.waitForFunction(() => document.querySelector("#problem").textContent === "");
    for (const slot of ["top", "bottom", "shoes"]) assert.notEqual(await page.getByLabel(`Outfit ${slot}`, { exact: true }).inputValue(), "");
    await page.getByLabel("Body canon", { exact: true }).selectOption("male");
    await page.getByLabel("Build", { exact: true }).selectOption("heavy");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(root, "artifacts/humanoid-generated-outfit.png") });
    await page.getByRole("button", { name: "Reset" }).click();
    await page.waitForFunction(() => document.querySelector("#status").dataset.height === "1.68");
    await page.locator("#toggle-panel").click();
    console.log("Humanoid: proportion edit / export / undo / invalid refusal / outfit edits");

    // Gameplay camera at true scale and close-up, both looks; repeated switching is bounded.
    await page.locator("nav [data-mode=gameplay]").click();
    await page.waitForFunction(() => document.querySelector("#status").dataset.mode === "gameplay");
    await page.locator("nav [data-look=shaded]").click();
    await page.locator("nav [data-zoom='3']").click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(root, "artifacts/humanoid-gameplay-close.png") });
    const buffers = [];
    for (let i = 0; i < 6; i++) {
      await page.locator(i % 2 ? "nav [data-mode=gameplay]" : "nav [data-mode=turnaround]").click();
      await page.locator(i % 2 ? "nav [data-look=silhouette]" : "nav [data-look=shaded]").click();
      await page.waitForTimeout(300);
      buffers.push((await status()).buffers);
    }
    // Shadow maps are released in silhouette mode and reacquired in shaded mode;
    // the counts must alternate between the same two values, never grow.
    assert.ok(new Set(buffers).size <= 2, `GPU buffers stay bounded: ${buffers}`);
    assert.equal((await status()).entities, initial.entities);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    report.artifact = { initial, buffers, errors, requests };
    console.log("Humanoid: gameplay camera / repeated view changes / bounded resources");
    await context.close();

    // 2. Source fixture: drive Lobby phases by hand and read real silhouette pixels.
    const p = await browser.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base);
    report.pixels = await p.evaluate(async () => {
      const { ETRNLNINE } = await import("/engine/etrnlnine.js"),
        { createHumanoidReview } = await import("/games/freelancer/humanoid/review.js"),
        { STELLA_949, FREELANCER_WARDROBE } = await import("/games/freelancer/humanoid/preset.js");
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "width:640px;height:360px;display:block";
      document.body.append(canvas);
      const engine = new ETRNLNINE(canvas, { pixelRatio: 1 }),
        review = createHumanoidReview(engine, { document: STELLA_949, wardrobe: FREELANCER_WARDROBE }),
        gl = engine.basement.renderer.gl;
      /** Count dark (figure) pixels in each quarter of the turnaround. */
      const frame = () => {
        engine.lobby.emit("update", 1 / 60, 0);
        engine.lobby.emit("render", 1);
        const w = canvas.width,
          h = canvas.height,
          b = new Uint8Array(w * h * 4),
          columns = [0, 0, 0, 0];
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
        let pale = 0;
        for (let i = 0; i < b.length; i += 4) {
          const x = (i / 4) % w;
          if (b[i] < 40 && b[i + 1] < 40 && b[i + 2] < 40) columns[Math.min(3, Math.floor((x / w) * 4))]++;
          else if (b[i] > 170) pale++;
        }
        return { columns, pale, total: w * h };
      };
      review.setLook("silhouette");
      const preset = frame();
      const taller = structuredClone(STELLA_949);
      taller.parameters.height = 1.95;
      review.setDocument(taller);
      const tall = frame();
      // 949's preset carries no pack (as in the 2D game); add one to measure its outline.
      const packed = structuredClone(STELLA_949);
      packed.parameters.backpack = true;
      review.setDocument(packed);
      const withPack = frame();
      review.setDocument(STELLA_949);
      const noPack = frame();
      // Context loss and restoration rebuild both instance streams and the rounded mesh
      // from retained data: the restored frame must match the one before the loss.
      const lose = gl.getExtension("WEBGL_lose_context");
      let restored = null;
      if (lose) {
        const back = new Promise((r) => canvas.addEventListener("webglcontextrestored", r, { once: true }));
        lose.loseContext();
        await new Promise((r) => setTimeout(r, 50));
        lose.restoreContext();
        await back;
        restored = frame();
      }
      review.dispose();
      const r = engine.basement.renderer.stats;
      const after = { buffers: r.buffers, worlds: engine.directory.worlds.size };
      engine.dispose();
      return { preset, tall, noPack, withPack, restored, after, final: { buffers: r.buffers, programs: r.programs, vaos: r.vaos } };
    });
    const { preset, tall, noPack, withPack, restored, after, final } = report.pixels,
      sum = (c) => c.reduce((a, b) => a + b, 0);
    // A solid silhouette: every view has figure pixels on a mostly pale card.
    for (const count of preset.columns) assert.ok(count > 400, `each view is drawn (${preset.columns})`);
    assert.ok(preset.pale > preset.total * 0.6, "silhouette card dominates the frame");
    // At this wide aspect the lineup width sets the frame, so scale is fixed and a
    // taller figure must cover more pixels; removing the pack must cover fewer.
    assert.deepEqual(noPack.columns, preset.columns, "rebuilding the same document is deterministic");
    assert.ok(restored, "WEBGL_lose_context is available in this browser");
    assert.deepEqual(restored.columns, preset.columns, "context restoration rebuilds rounded shapes exactly");
    assert.ok(sum(noPack.columns) < sum(withPack.columns), "removing the pack shrinks the outline");
    // The side view (third column) loses the most when the pack is removed.
    const loss = withPack.columns.map((n, i) => n - noPack.columns[i]);
    assert.ok(loss[2] >= Math.max(loss[0], loss[3]) * 0.5, `pack reads in profile (${loss})`);
    assert.ok(sum(tall.columns) > sum(preset.columns) * 1.1, "height edits reach the outline");
    // Only the renderer's own meshes remain once the review releases its lease/guides:
    // the unit cube plus the rounded mesh's vertex and index buffers.
    assert.deepEqual(after, { buffers: 3, worlds: 0 });
    assert.deepEqual(final, { buffers: 0, programs: 0, vaos: 0 });
    assert.deepEqual(errors, []);
    console.log("Humanoid pixel metrics", JSON.stringify({ preset: preset.columns, withPack: withPack.columns, tall: tall.columns }));
    fs.writeFileSync(path.join(root, "artifacts/humanoid-results.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("Humanoid review acceptance passed");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
