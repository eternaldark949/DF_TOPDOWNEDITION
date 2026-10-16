/** Real offline game + Studio acceptance. SwiftShader/emulated touch is not a phone benchmark. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  report = {},
  errors = [];
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html>");
    return;
  }
  const file = path.resolve(root, "." + req.url.split("?")[0]);
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
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html>");
  }
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`,
    browser = await chromium.launch({
      executablePath: process.env.ETRNLNINE_CHROMIUM || "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
  try {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      }),
      p = await context.newPage();
    p.setDefaultTimeout(180000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/");
    await p.evaluate(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (kind === "2d") throw new Error("Canvas2D forbidden");
        return get.call(this, kind, ...args);
      };
    });
    const requests = [];
    p.on("request", (r) => requests.push(r.url()));
    await p.setContent(
      fs.readFileSync(
        path.join(root, "dist/ETRNLNINE-Freelancer.html"),
        "utf8",
      ),
    );
    await p.waitForFunction(
      () => document.querySelector("#status").dataset.scene === "clinic-way",
    );
    const actor = await p.locator("#status").getAttribute("data-actor");
    // Interacting away from a doorway cannot teleport the player.
    await p.keyboard.press("e");
    await p.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("visible"),
    );
    assert.equal(
      await p.locator("#status").getAttribute("data-scene"),
      "clinic-way",
    );
    console.log("Freelancer: standalone startup / out-of-range interaction");
    // Walk using actual keyboard bindings until the authored contextual prompt appears.
    await p.keyboard.down("w");
    try {
      await p.waitForFunction(
        () => document.querySelector("#status").dataset.nearby === "enni:door",
        {},
        { timeout: 240000 },
      );
    } finally {
      await p.keyboard.up("w");
    }
    await p.keyboard.press("e");
    await p.waitForFunction(
      () =>
        document.querySelector("#status").dataset.scene === "enni-vestibule",
    );
    assert.equal(await p.locator("#status").getAttribute("data-actor"), actor);
    await p.screenshot({
      path: path.join(root, "artifacts/freelancer-interior.png"),
      timeout: 180000,
    });
    await p.keyboard.press("e");
    await p.waitForFunction(
      () => document.querySelector("#status").dataset.scene === "clinic-way",
    );
    assert.equal(await p.locator("#status").getAttribute("data-actor"), actor);
    assert.equal(
      await p.locator("#status").getAttribute("data-committed"),
      "2",
    );
    // Fresh presses, rather than a held key, are necessary for every doorway transition.
    for (let i = 0; i < 2; i++) {
      await p.keyboard.press("e");
      await p.waitForFunction(
        () =>
          document.querySelector("#status").dataset.scene === "enni-vestibule",
      );
      await p.keyboard.press("e");
      await p.waitForFunction(
        () => document.querySelector("#status").dataset.scene === "clinic-way",
      );
    }
    assert.equal(
      await p.locator("#status").getAttribute("data-committed"),
      "6",
    );
    assert.equal(await p.locator("#status").getAttribute("data-resident"), "2");
    assert.equal(await p.locator("#status").getAttribute("data-actor"), actor);
    assert.equal(await p.locator("#status").getAttribute("data-failed"), "0");
    console.log(
      "Freelancer: approach / enter / return / three round trips with stable identity",
    );
    await p.screenshot({
      path: path.join(root, "artifacts/freelancer-street.png"),
      timeout: 180000,
    });
    await p.setViewportSize({ width: 412, height: 892 });
    await p.screenshot({
      path: path.join(root, "artifacts/freelancer-phone.png"),
      timeout: 180000,
    });
    assert.deepEqual(requests, []);
    report.game = {
      roundTrips: 3,
      stableActor: true,
      keyboardApproach: true,
      outOfRangeRefused: true,
      resident: 2,
      requests,
    };
    await context.close();
    // Exercise the shared Studio through its installed project selector, not a game-specific editor.
    const mobile = await browser.newContext({
        viewport: { width: 412, height: 892 },
        isMobile: true,
        hasTouch: true,
        acceptDownloads: true,
      }),
      studio = await mobile.newPage();
    studio.setDefaultTimeout(180000);
    studio.on("pageerror", (e) => errors.push(e.message));
    await studio.goto(base + "/");
    await studio.setContent(
      fs.readFileSync(path.join(root, "dist/ETRNLNINE-Studio.html"), "utf8"),
    );
    await studio.waitForFunction(
      () => document.querySelector("#status").dataset.mode === "edit",
    );
    await studio.locator("#project").selectOption("freelancer.enni-slice.v1");
    await studio.waitForFunction(
      () =>
        document.querySelector("#selection-id").textContent ===
        "street:planter:0",
    );
    const exportData = async () => {
      const wait = studio.waitForEvent("download");
      await studio.locator("#save").click();
      return JSON.parse(fs.readFileSync(await (await wait).path(), "utf8"));
    };
    const before = await exportData();
    await studio.locator("#duplicate").click();
    const duplicate = await studio.locator("#selection-id").textContent();
    assert.notEqual(duplicate, "street:planter:0");
    await studio.locator("#undo").click();
    assert.deepEqual(await exportData(), before);
    await studio.locator("#scene").selectOption("1");
    await studio.waitForFunction(() =>
      document
        .querySelector("#selection-id")
        .textContent.includes("interior:planter"),
    );
    await studio.locator("#scene").selectOption("0");
    await studio.locator("#play").click();
    await studio.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("Clinic Way"),
    );
    await studio.locator("#play").click();
    await studio.waitForFunction(
      () =>
        document.querySelector("#status").dataset.mode === "edit" &&
        document.querySelector("#status").dataset.worlds === "1",
    );
    assert.deepEqual(await exportData(), before);
    await studio.setViewportSize({ width: 1440, height: 960 });
    await studio.screenshot({
      path: path.join(root, "artifacts/freelancer-studio.png"),
      timeout: 180000,
    });
    report.studio = {
      projectSelector: true,
      duplicateUndo: true,
      bothScenes: true,
      playIsolated: true,
    };
    await mobile.close();
    // Controlled public-source fixture verifies failed commits and full resource cleanup without
    // queueing a continuously rendered GPU screenshot workload. Only the test drives these phases.
    const f = await browser.newPage();
    await f.goto(base + "/");
    await f.evaluate(async () => {
      const { ETRNLNINE } = await import("/engine/etrnlnine.js"),
        { createFreelancerScene } = await import("/games/freelancer/scene.js");
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "width:320px;height:240px";
      document.body.append(canvas);
      const controlsHost = document.createElement("div");
      document.body.append(controlsHost);
      const engine = new ETRNLNINE(canvas, {
          profiling: { enabled: true },
          occlusion: { mode: "geometry" },
          lighting: { shadows: { mode: "low" } },
        }),
        scene = createFreelancerScene(engine, { controlsHost });
      window.fixture = { engine, scene, controlsHost };
    });
    await f.waitForFunction(() => {
      fixture.engine.lobby.preparation.advance();
      return !!fixture.scene.journey.actor;
    });
    assert.deepEqual(
      await f.evaluate(() => {
        const j = fixture.scene.journey;
        j.interact();
        return {
          pending: !!j.travel.pending,
          committed: j.travel.stats.committed,
        };
      }),
      { pending: false, committed: 0 },
    );
    // Three controlled idle submissions distinguish initial upload from unchanged geometry.
    const capture = await f.evaluate(() => {
      const { engine } = fixture,
        profiler = engine.basement.profiler;
      for (let i = 0; i < 3; i++) {
        profiler.beginFrame(null);
        engine.lobby.emit("update", 1 / 60, i / 60);
        engine.lobby.emit("render", 1);
        profiler.endFrame(i / 60);
      }
      return {
        profile: profiler.capture(undefined, "Freelancer idle submission"),
        uploadedBytes: engine.basement.renderer.stats.uploadedBytes,
      };
    });
    assert.equal(capture.uploadedBytes, 0);
    fs.writeFileSync(
      path.join(root, "artifacts/freelancer-profile.json"),
      JSON.stringify(capture.profile, null, 2) + "\n",
    );
    report.profile = {
      idleUploadedBytes: capture.uploadedBytes,
      frame: capture.profile.frame.id,
    };
    await f.evaluate(() => {
      const j = fixture.scene.journey;
      j.actor.root.x = 0;
      j.actor.root.y = -4.5;
      j.interact();
    });
    await f.waitForFunction(() => {
      fixture.engine.lobby.preparation.advance();
      return fixture.scene.journey.travel.pending?.ready;
    });
    await f.evaluate(() => {
      const j = fixture.scene.journey;
      j.actor.root.y = -10;
      j.travel.advance(0);
    });
    assert.equal(
      await f.evaluate(() => fixture.scene.journey.travel.stats.failed),
      1,
    );
    assert.equal(
      await f.evaluate(() => fixture.scene.journey.current.scene.id),
      "clinic-way",
    );
    // A held standard-gamepad A button must not acquire a fresh edge at a doorway commit.
    await f.evaluate(() => {
      const { engine, scene } = fixture;
      scene.journey.actor.root.y = -4.5;
      engine.basement.input.gamepads = () => [
        { connected: true, axes: [0, 0], buttons: [{ pressed: true }] },
      ];
      engine.basement.input.sample();
      engine.lobby.emit("update", 1 / 60, 1);
    });
    await f.waitForFunction(() => {
      fixture.engine.lobby.preparation.advance();
      return fixture.scene.journey.travel.pending?.ready;
    });
    const held = await f.evaluate(() => {
      const { engine, scene } = fixture;
      engine.lobby.emit("boundary", 1);
      for (let i = 0; i < 3; i++) {
        engine.basement.input.sample();
        engine.lobby.emit("update", 1 / 60, 1 + i / 60);
      }
      return {
        committed: scene.journey.travel.stats.committed,
        pending: !!scene.journey.travel.pending,
        scene: scene.journey.current.scene.id,
      };
    });
    assert.deepEqual(held, {
      committed: 1,
      pending: false,
      scene: "enni-vestibule",
    });
    report.heldGamepadNoBounce = true;
    report.cleanup = await f.evaluate(() => {
      const { engine, scene, controlsHost } = fixture;
      scene.dispose();
      const beforeEngine = {
        worlds: engine.directory.worlds.size,
        definitions: engine.directory.residency.definitions.size,
        records: engine.directory.residency.records.size,
        controls: controlsHost.children.length,
        jobs: engine.lobby.preparation.jobs.size,
      };
      engine.dispose();
      return {
        ...beforeEngine,
        buffers: engine.basement.renderer.stats.buffers,
        programs: engine.basement.renderer.stats.programs,
        vaos: engine.basement.renderer.stats.vaos,
      };
    });
    assert.deepEqual(report.cleanup, {
      worlds: 0,
      definitions: 0,
      records: 0,
      controls: 0,
      jobs: 0,
      buffers: 0,
      programs: 0,
      vaos: 0,
    });
    report.errors = errors;
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(root, "artifacts/freelancer-results.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log("Freelancer acceptance passed");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
