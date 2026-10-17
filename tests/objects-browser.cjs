/** Offline Studio acceptance: origin/component hierarchy, locks and common precise sliders.
 * Software WebGL/emulated touch verify behavior, not physical-device performance. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  report = {},
  errors = [];
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><title>Object fixture</title>");
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
        viewport: { width: 1440, height: 960 },
        hasTouch: true,
        acceptDownloads: true,
      }),
      p = await context.newPage();
    p.setDefaultTimeout(120000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${server.address().port}`);
    await p.evaluate(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (k, ...args) {
        if (k === "2d") throw new Error("Canvas2D forbidden");
        return get.call(this, k, ...args);
      };
    });
    const requests = [];
    p.on("request", (r) => requests.push(r.url()));
    await p.setContent(
      fs.readFileSync(path.join(root, "dist/ETRNLNINE-Studio.html"), "utf8"),
    );
    await p.waitForFunction(
      () => document.querySelector("#status").dataset.camera,
    );
    await p.locator("#project").selectOption("freelancer.enni-slice.v1");
    const exported = async () => {
      const pending = p.waitForEvent("download");
      await p.locator("#save").click();
      return JSON.parse(fs.readFileSync(await (await pending).path(), "utf8"));
    };
    const base = await exported(),
      scene = base.scenes[0],
      materialId = base.assets.find((a) => a.id === "enni.shell").parts[0].shape
        .material;
    const selected = async (id) =>
      p.waitForFunction(
        (id) => document.querySelector("#selection-id").textContent === id,
        id,
      );
    const choose = async (id) => {
      if (
        (await p
          .locator("[data-panel-toggle=directory]")
          .getAttribute("aria-expanded")) === "false"
      )
        await p.locator("[data-panel-toggle=directory]").click();
      await p.locator("#show-hierarchy").click();
      await p.locator(`#hierarchy [data-id="${id}"]`).click();
      await selected(id);
    };
    await choose("enni:building");
    assert.ok(
      await p
        .getByRole("spinbutton", { name: "Position X", exact: true })
        .isDisabled(),
    );
    assert.equal(
      await p
        .locator('#hierarchy [data-id="enni:building"]')
        .locator("..")
        .locator("[data-lock-state]")
        .getAttribute("data-lock-state"),
      "locked",
    );
    await p.getByRole("button", { name: "Unlock object", exact: true }).click();
    assert.ok(
      await p
        .getByRole("spinbutton", { name: "Position X", exact: true })
        .isEnabled(),
    );
    await p.locator("#undo").click();
    assert.ok(
      await p
        .getByRole("spinbutton", { name: "Position X", exact: true })
        .isDisabled(),
    );
    console.log("Objects: locked surfaces inspectable / undoable icons");
    await p.locator("[data-panel-toggle=viewport]").click();
    await p.locator("#view").selectOption("top");
    await p.locator("[data-panel-toggle=viewport]").click();
    const worldPoint = async (x, y) => {
      const b = await p.locator("#world").boundingBox(),
        c = JSON.parse(await p.locator("#status").getAttribute("data-camera"));
      return {
        x: b.x + b.width / 2 + ((x - c.x) * b.height) / (2 * c.halfHeight),
        y: b.y + b.height / 2 - ((y - c.y) * b.height) / (2 * c.halfHeight),
      };
    };
    const roof = await worldPoint(0, 8);
    await p.mouse.click(roof.x, roof.y);
    await selected("enni:origin");
    await p
      .getByRole("button", { name: "Enter components", exact: true })
      .click();
    await p.mouse.click(roof.x, roof.y);
    await selected("enni:building");
    assert.ok(
      await p
        .getByRole("spinbutton", { name: "Position X", exact: true })
        .isDisabled(),
    );
    await p.locator("#hierarchy").evaluate((e) => (e.scrollTop = 0));
    await p.screenshot({
      animations: "disabled",
      path: path.join(root, "artifacts/objects-locked-building.png"),
      timeout: 120000,
    });
    assert.equal(
      await p
        .getByRole("combobox", { name: "Surface part", exact: true })
        .inputValue(),
      "roof",
    );
    console.log("Objects: surface hits respect Scene / Enni context");
    await p.getByRole("button", { name: "New object", exact: true }).click();
    const originId = await p.locator("#selection-id").textContent();
    await p
      .getByRole("textbox", { name: "Object name", exact: true })
      .fill("Studio origin");
    await p
      .getByRole("textbox", { name: "Object name", exact: true })
      .press("Enter");
    let data = await exported(),
      node = data.scenes[0].entities.find((e) => e.id === originId);
    assert.equal(node.asset, null);
    assert.equal(node.parent, "enni:origin");
    assert.equal(node.name, "Studio origin");
    await p
      .getByRole("button", { name: "Enter components", exact: true })
      .click();
    await p.locator("#show-assets").click();
    await p.locator('[data-asset="street.cypress"]').click();
    const place = await worldPoint(3, -5);
    await p.mouse.click(place.x, place.y);
    const childId = await p.locator("#selection-id").textContent();
    data = await exported();
    const child = data.scenes[0].entities.find((e) => e.id === childId);
    assert.equal(child.parent, originId);
    assert.equal(child.asset, "street.cypress");
    await choose(originId);
    await p.locator("#duplicate").click();
    const copyId = await p.locator("#selection-id").textContent();
    data = await exported();
    const copyChild = data.scenes[0].entities.find((e) => e.parent === copyId);
    assert.equal(copyChild.asset, child.asset);
    assert.notEqual(copyChild.id, childId);
    await choose(copyChild.id);
    await p
      .getByRole("button", { name: "Make geometry unique", exact: true })
      .click();
    data = await exported();
    assert.notEqual(
      data.scenes[0].entities.find((e) => e.id === copyChild.id).asset,
      child.asset,
    );
    assert.equal(
      data.scenes[0].entities.find((e) => e.id === childId).asset,
      child.asset,
    );
    await choose(copyId);
    await p.getByRole("button", { name: "Lock object", exact: true }).click();
    await choose(copyChild.id);
    assert.ok(
      await p
        .getByRole("spinbutton", { name: "Position X", exact: true })
        .isDisabled(),
    );
    const inherited = p
      .locator(`#hierarchy [data-id="${copyChild.id}"]`)
      .locator("..")
      .locator("[data-lock-state=inherited]");
    assert.ok(await inherited.isDisabled());
    assert.match(
      await inherited.getAttribute("aria-label"),
      /Locked by Studio origin/,
    );
    console.log(
      "Objects: empty creation / attachment / linked branch copy / unique geometry / inherited lock",
    );
    // Transform tools operate in world space even though child fields remain local.
    const { objectPoses } = await import(
      require("node:url").pathToFileURL(
        path.join(root, "engine/basement/objects.js"),
      ).href
    );
    await choose(originId);
    for (const [label, value] of [
      ["Rotation Z", 45],
      ["Uniform scale", 2],
    ]) {
      await p
        .getByRole("spinbutton", { name: label, exact: true })
        .fill(String(value));
      await p
        .getByRole("spinbutton", { name: label, exact: true })
        .press("Enter");
    }
    await choose(childId);
    const beforeMove = await exported(),
      beforePose = objectPoses(beforeMove.scenes[0]).get(childId),
      start = await worldPoint(beforePose.position[0], beforePose.position[1]);
    await p.locator("#move").click();
    await p.mouse.move(start.x, start.y);
    await p.mouse.down();
    await p.mouse.move(start.x + 24, start.y + 16, { steps: 3 });
    await p.mouse.up();
    data = await exported();
    const movedPose = objectPoses(data.scenes[0]).get(childId);
    assert.ok(
      Math.hypot(
        movedPose.position[0] - beforePose.position[0],
        movedPose.position[1] - beforePose.position[1],
      ) > 0.2,
    );
    assert.ok(
      Math.abs(
        movedPose.position[0] * 2 - Math.round(movedPose.position[0] * 2),
      ) < 1e-6,
    );
    await p.locator("#undo").click();
    data = await exported();
    objectPoses(data.scenes[0])
      .get(childId)
      .position.forEach((n, i) =>
        assert.ok(Math.abs(n - beforePose.position[i]) < 1e-6),
      );
    await p.locator("#rotate").click();
    const center = await worldPoint(
      beforePose.position[0],
      beforePose.position[1],
    );
    await p.mouse.move(center.x + 48, center.y);
    await p.mouse.down();
    await p.mouse.move(center.x, center.y - 48, { steps: 4 });
    await p.mouse.up();
    data = await exported();
    assert.ok(
      Math.abs(
        data.scenes[0].entities.find((e) => e.id === childId).rotation[2],
      ) > 0.5,
    );
    await p.locator("#undo").click();
    console.log(
      "Objects: world-space move / rotation under rotated, scaled parent",
    );
    // Reload source to isolate the common control acceptance from tree/history operations.
    await p.locator("#file").setInputFiles({
      name: "origins.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(base)),
    });
    await p.waitForFunction(
      () => document.querySelector("#status").dataset.revision === "0",
    );
    if (
      (await p
        .locator("[data-panel-toggle=directory]")
        .getAttribute("aria-expanded")) === "false"
    )
      await p.locator("[data-panel-toggle=directory]").click();
    await p.locator("#show-materials").click();
    await p.locator(`[data-material-id="${materialId}"]`).click();
    const number = () =>
        p.getByRole("spinbutton", { name: "Reflectivity", exact: true }),
      slider = () =>
        p.getByRole("slider", { name: "Reflectivity slider", exact: true });
    await number().fill("0.123456789123");
    await number().press("Enter");
    assert.equal(
      (await exported()).materials.find((m) => m.id === materialId)
        .reflectivity,
      0.123456789123,
    );
    await p.locator("#undo").click();
    assert.equal(
      (await exported()).materials.find((m) => m.id === materialId)
        .reflectivity,
      undefined,
    );
    await p.locator("#redo").click();
    let box = await slider().boundingBox();
    await p.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
    await p.mouse.up();
    let changed = await exported();
    assert.ok(
      changed.materials.find((m) => m.id === materialId).reflectivity > 0.6,
    );
    await p.locator("#undo").click();
    assert.equal(
      (await exported()).materials.find((m) => m.id === materialId)
        .reflectivity,
      0.123456789123,
    );
    // Native touch cancellation rolls back the entire range gesture, not just its final sample.
    box = await slider().boundingBox();
    const cdp = await context.newCDPSession(p);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width * 0.2, y: box.y + 22 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: box.x + box.width * 0.7, y: box.y + 22 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    assert.equal(
      (await exported()).materials.find((m) => m.id === materialId)
        .reflectivity,
      0.123456789123,
    );
    await slider().focus();
    await p.keyboard.press("ArrowRight");
    await p.keyboard.press("Escape");
    assert.equal(
      (await exported()).materials.find((m) => m.id === materialId)
        .reflectivity,
      0.123456789123,
    );
    await number().fill("0.08");
    await number().press("Enter");
    await p
      .getByRole("spinbutton", { name: "Specular sharpness", exact: true })
      .fill("0.8");
    await p
      .getByRole("spinbutton", { name: "Specular sharpness", exact: true })
      .press("Enter");
    await p.setViewportSize({ width: 412, height: 892 });
    // Match-media delivery follows viewport resize; wait for the dock to adopt its layout.
    await p.waitForFunction(
      () => document.querySelector("#workspace").dataset.compact === "true",
    );
    if (
      (await p
        .locator("[data-panel-toggle=properties]")
        .getAttribute("aria-expanded")) === "false"
    )
      await p.locator("[data-panel-toggle=properties]").click();
    await p
      .locator("#properties")
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    await p.screenshot({
      animations: "disabled",
      path: path.join(root, "artifacts/objects-number-phone.png"),
      timeout: 120000,
    });
    // Present the same native scene with its contextual lock UI and the shared luxe look.
    await p.setViewportSize({ width: 1440, height: 960 });
    await p.waitForFunction(
      () => document.querySelector("#workspace").dataset.compact === "false",
    );
    await choose("enni:origin");
    await p
      .getByRole("button", { name: "Enter components", exact: true })
      .click();
    await choose("enni:building");
    await p.locator("[data-panel-toggle=viewport]").click();
    await p.locator("#view").selectOption("oblique");
    await p.locator("#projection").selectOption("perspective");
    await p.locator("[data-viewport-section=appearance-section]").click();
    await p
      .getByRole("combobox", { name: "Bloom look", exact: true })
      .selectOption("luxe");
    await p.waitForFunction(
      () =>
        document.querySelector(".engine-appearance output").dataset
          .effective === "low",
    );
    await p.locator("[data-panel-toggle=viewport]").click();
    if (
      (await p
        .locator("[data-panel-toggle=tools]")
        .getAttribute("aria-expanded")) === "true"
    )
      await p.locator("[data-panel-toggle=tools]").click();
    await p.locator("#library").evaluate((e) => (e.scrollTop = 0));
    await p.locator("#properties").evaluate((e) => (e.scrollTop = 0));
    await p.screenshot({
      animations: "disabled",
      path: path.join(root, "artifacts/objects-locked-building.png"),
      timeout: 120000,
    });
    report.objects = {
      selectLocked: true,
      lockUndo: true,
      contextPicking: true,
      emptyOrigins: true,
      parentAttachment: true,
      linkedDuplication: true,
      uniqueGeometry: true,
      inheritedLock: true,
      parentedWorldTools: true,
    };
    report.numbers = {
      exactManualValues: true,
      oneUndoPerDrag: true,
      touchCancel: true,
      escape: true,
    };
    report.errors = errors;
    report.requests = requests;
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    fs.writeFileSync(
      path.join(root, "artifacts/objects-results.json"),
      JSON.stringify(report, null, 2),
    );
    console.log("Object and number acceptance passed");
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
