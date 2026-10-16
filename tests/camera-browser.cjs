/** Offline native-input camera acceptance. Software GL/emulated touch does not prove device speed. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  html = fs.readFileSync(path.join(root, "dist/ETRNLNINE-Studio.html"), "utf8"),
  errors = [],
  requests = [],
  report = {};
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html>");
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
        viewport: { width: 1280, height: 900 },
        hasTouch: true,
        acceptDownloads: true,
      }),
      p = await context.newPage();
    p.setDefaultTimeout(120000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${server.address().port}`);
    await p.evaluate(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (kind === "2d") throw new Error("Canvas2D forbidden");
        return get.call(this, kind, ...args);
      };
    });
    p.on("request", (r) => requests.push(r.url()));
    await p.setContent(html);
    await p.waitForFunction(
      () => document.querySelector("#status").dataset.camera,
    );
    const camera = () =>
        p.locator("#status").getAttribute("data-camera").then(JSON.parse),
      waitChange = (old) =>
        p.waitForFunction(
          (old) =>
            document.querySelector("#status").dataset.camera !==
            JSON.stringify(old),
          old,
        ),
      data = async () => {
        const wait = p.waitForEvent("download");
        await p.locator("#save").click();
        return JSON.parse(fs.readFileSync(await (await wait).path(), "utf8"));
      };
    const authored = await data(),
      selected = await p.locator("#selection-id").textContent();
    let r = await p.locator("#world").boundingBox(),
      a = { x: r.x + r.width * 0.5, y: r.y + r.height * 0.55 };
    let before = await camera();
    await p.mouse.move(a.x, a.y);
    await p.mouse.down({ button: "middle" });
    await p.mouse.move(a.x + 70, a.y + 40, { steps: 5 });
    await p.mouse.up({ button: "middle" });
    await waitChange(before);
    let after = await camera();
    assert.notEqual(after.azimuth, before.azimuth);
    assert.notEqual(after.elevation, before.elevation);
    assert.equal(await p.locator("#selection-id").textContent(), selected);
    before = after;
    await p.mouse.down({ button: "right" });
    await p.mouse.move(a.x + 110, a.y + 65, { steps: 5 });
    await p.mouse.up({ button: "right" });
    await waitChange(before);
    after = await camera();
    assert.notDeepEqual(
      [after.x, after.y, after.z],
      [before.x, before.y, before.z],
    );
    before = after;
    await p.mouse.wheel(0, -250);
    await waitChange(before);
    assert.ok((await camera()).halfHeight < before.halfHeight);
    // Escape rolls back an unfinished camera gesture, independently of document history.
    before = await camera();
    await p.mouse.down({ button: "middle" });
    await p.mouse.move(a.x + 180, a.y + 100, { steps: 4 });
    await waitChange(before);
    await p.keyboard.press("Escape");
    await p.mouse.up({ button: "middle" });
    await p.waitForFunction(
      (old) =>
        document.querySelector("#status").dataset.camera ===
        JSON.stringify(old),
      before,
    );
    await p.keyboard.press("f");
    await p.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#status").dataset.camera)
          .halfHeight < 5,
    );
    await p.keyboard.press("Home");
    await p.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#status").dataset.camera)
          .halfHeight > 10,
    );
    assert.deepEqual(await data(), authored);
    console.log(
      "Camera: mouse orbit / pan / wheel / Escape / frame selection and all",
    );
    // Real touch streams: pinch/pan while a placement tool is armed must create no placement.
    await p.setViewportSize({ width: 412, height: 892 });
    await p.locator("#mobile-library").click();
    await p.locator("#show-assets").click();
    await p.locator(".asset-card").first().click();
    r = await p.locator("#world").boundingBox();
    const touch = await context.newCDPSession(p),
      one = { x: r.x + r.width * 0.35, y: r.y + r.height * 0.55 },
      two = { x: one.x + 70, y: one.y },
      send = (type, points) =>
        touch.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: points.map((v, i) => ({ ...v, id: i + 1 })),
        });
    before = await camera();
    await send("touchStart", [one]);
    await send("touchStart", [one, two]);
    await send("touchMove", [
      { x: one.x - 25, y: one.y + 25 },
      { x: two.x + 25, y: two.y + 25 },
    ]);
    await send("touchEnd", []);
    await waitChange(before);
    after = await camera();
    assert.ok(after.halfHeight < before.halfHeight);
    assert.notDeepEqual(
      [after.x, after.y, after.z],
      [before.x, before.y, before.z],
    );
    assert.deepEqual(await data(), authored);
    // A second finger rolls back a real, already-previewed object Move gesture.
    await p.locator("#mobile-library").click();
    await p.locator("#show-hierarchy").click();
    await p.locator(`#hierarchy [data-id="${selected}"]`).click();
    await p.locator("#viewport-options").evaluate((e) => (e.open = true));
    await p.locator("#view").selectOption("top");
    await p.locator("#frame-selected").click();
    await p.locator("#viewport-options").evaluate((e) => (e.open = false));
    await p.locator("#move").click();
    r = await p.locator("#world").boundingBox();
    const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      moved = { x: center.x + 60, y: center.y };
    const revision = Number(
      await p.locator("#status").getAttribute("data-revision"),
    );
    await send("touchStart", [center]);
    await send("touchMove", [moved]);
    await p.waitForFunction(
      (rev) => Number(document.querySelector("#status").dataset.revision) > rev,
      revision,
    );
    const second = { x: center.x - 80, y: center.y };
    await send("touchStart", [moved, second]);
    await send("touchMove", [
      { x: moved.x + 20, y: moved.y + 20 },
      { x: second.x - 20, y: second.y + 20 },
    ]);
    await send("touchEnd", []);
    assert.deepEqual(await data(), authored);
    assert.equal(await p.locator("#undo").isDisabled(), true);
    // Explicit one-finger camera mode works without changing the selected document object.
    await p.locator("#orbit").click();
    before = await camera();
    await send("touchStart", [one]);
    await send("touchMove", [{ x: one.x + 60, y: one.y + 35 }]);
    await send("touchEnd", []);
    await waitChange(before);
    assert.notEqual((await camera()).azimuth, before.azimuth);
    before = await camera();
    await send("touchStart", [one]);
    await send("touchMove", [{ x: one.x + 80, y: one.y + 50 }]);
    await waitChange(before);
    await send("touchCancel", []);
    await p.waitForFunction(
      (old) =>
        document.querySelector("#status").dataset.camera ===
        JSON.stringify(old),
      before,
    );
    assert.deepEqual(await data(), authored);
    // Navigation is disabled during Play and the edit camera is restored on Stop.
    before = await camera();
    await p.locator("#play").click();
    await p.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("Amber Atrium"),
    );
    await p.locator("#play").click();
    await p.waitForFunction(
      (old) =>
        document.querySelector("#status").dataset.mode === "edit" &&
        document.querySelector("#status").dataset.camera ===
          JSON.stringify(old),
      before,
    );
    await p.locator("#project").selectOption("freelancer.enni-slice.v1");
    await p.locator("#select").click();
    await p.screenshot({
      path: path.join(root, "artifacts/camera-phone.png"),
      timeout: 120000,
    });
    await p.setViewportSize({ width: 1440, height: 960 });
    await p.screenshot({
      path: path.join(root, "artifacts/camera-desktop.png"),
      timeout: 120000,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    report.workflow = {
      mouseOrbit: true,
      pan: true,
      cursorZoom: true,
      cancel: true,
      frameSelected: true,
      frameAll: true,
      pinchWithoutPlacement: true,
      secondFingerCancelsObjectMove: true,
      touchOrbit: true,
      touchCancel: true,
      playRestoresCamera: true,
      authoredUnchanged: true,
    };
    report.errors = errors;
    report.requests = requests;
    fs.writeFileSync(
      path.join(root, "artifacts/camera-results.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log("Camera acceptance passed");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
