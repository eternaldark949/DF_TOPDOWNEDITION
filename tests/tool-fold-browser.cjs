/** Real offline Studio: independently folded tools preserve mode, touch navigation,
 * document identity, focus and per-layout/Play choices through the shared PanelDock. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  errors = [],
  requests = [],
  report = {},
  server = http.createServer((_, r) => {
    r.setHeader("Content-Type", "text/html");
    r.end("<!doctype html>");
  });
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
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
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (type === "2d") throw new Error("Canvas2D forbidden");
        return get.call(this, type, ...args);
      };
    });
    p.on("request", (r) => requests.push(r.url()));
    await p.setContent(
      fs.readFileSync(path.join(root, "dist/ETRNLNINE-Studio.html"), "utf8"),
    );
    await p.waitForFunction(
      () => document.querySelector("#status").dataset.camera,
    );
    const node = (key) => p.locator(`[data-panel-toggle=${key}]`),
      tools = p.locator("#tools"),
      camera = () => p.locator("#status").getAttribute("data-camera");
    const data = async () => {
      const d = p.waitForEvent("download");
      await p.locator("#save").click();
      return JSON.parse(fs.readFileSync(await (await d).path(), "utf8"));
    };
    const shot = async (name) => {
      await p.waitForFunction(() =>
        [...document.querySelectorAll(".dock-panel")].every((e) =>
          e.dataset.panelOpen === "true"
            ? getComputedStyle(e).transform === "none"
            : getComputedStyle(e).visibility === "hidden",
        ),
      );
      await p.screenshot({
        path: path.join(root, `artifacts/tool-fold-${name}.png`),
        animations: "disabled",
        timeout: 120000,
      });
    };
    const before = await data(),
      rect = await p.locator("#world").boundingBox(),
      selected = await p.locator("#selection-id").textContent();
    assert.equal(await node("tools").getAttribute("aria-expanded"), "true");
    await p.locator("#rotate").click();
    await node("tools").focus();
    await p.keyboard.press("Escape");
    assert.equal(await tools.evaluate((e) => e.inert), true);
    assert.equal(await node("tools").getAttribute("aria-expanded"), "false");
    assert.equal(await p.locator("#rotate").isVisible(), false);
    assert.deepEqual(await p.locator("#world").boundingBox(), rect);
    assert.equal(
      await p.locator("body").getAttribute("data-navigation"),
      "rotate",
    );
    assert.equal(
      await node("tools").evaluate((e) => e === document.activeElement),
      true,
    );
    await p.keyboard.press("Enter");
    assert.equal(
      await p.locator("#rotate").getAttribute("aria-pressed"),
      "true",
    );
    await node("tools").click();
    console.log("Tools fold: desktop canvas / current mode / keyboard");
    await p.setViewportSize({ width: 412, height: 892 });
    await p.waitForFunction(
      () => document.querySelector("#stage").dataset.compact === "true",
    );
    assert.equal(await node("tools").getAttribute("aria-expanded"), "true");
    const phone = await p.locator("#world").boundingBox();
    await node("tools").tap();
    await node("directory").tap();
    await node("viewport").tap();
    assert.equal(await node("tools").getAttribute("aria-expanded"), "false");
    await node("tools").tap();
    assert.equal(await node("viewport").getAttribute("aria-expanded"), "true");
    await node("viewport").tap();
    await p.locator("#pan").tap();
    await p.locator("#pan").focus();
    await p.keyboard.press("Escape");
    assert.equal(await node("tools").getAttribute("aria-expanded"), "false");
    assert.equal(
      await node("tools").evaluate((e) => e === document.activeElement),
      true,
    );
    assert.equal(
      await p.locator("body").getAttribute("data-navigation"),
      "pan",
    );
    assert.deepEqual(await p.locator("#world").boundingBox(), phone);
    const touch = await context.newCDPSession(p),
      old = await camera(),
      a = { x: phone.x + phone.width * 0.5, y: phone.y + phone.height * 0.65 };
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [a],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: a.x + 50, y: a.y + 30 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await p.waitForFunction(
      (old) => document.querySelector("#status").dataset.camera !== old,
      old,
    );
    assert.equal(await p.locator("#selection-id").textContent(), selected);
    assert.deepEqual(await data(), before);
    assert.equal(await p.locator("#undo").isDisabled(), true);
    for (const open of [false, true]) {
      if (open) await node("tools").tap();
      await p.locator("#play").click();
      await p.waitForFunction(
        () =>
          document.querySelector("#status").dataset.mode === "play" &&
          document
            .querySelector("#status")
            .textContent.includes("Amber Atrium"),
      );
      assert.equal(await node("tools").isVisible(), false);
      assert.equal(await tools.evaluate((e) => e.inert), true);
      await p.locator("#play").click();
      await p.waitForFunction(
        () => document.querySelector("#status").dataset.mode === "edit",
      );
      assert.equal(
        await node("tools").getAttribute("aria-expanded"),
        String(open),
      );
    }
    await p.setViewportSize({ width: 1440, height: 960 });
    await p.waitForFunction(
      () => document.querySelector("#stage").dataset.compact === "false",
    );
    assert.equal(await node("tools").getAttribute("aria-expanded"), "false");
    await p.setViewportSize({ width: 412, height: 892 });
    await p.waitForFunction(
      () => document.querySelector("#stage").dataset.compact === "true",
    );
    assert.equal(await node("tools").getAttribute("aria-expanded"), "true");
    assert.deepEqual(await data(), before);
    console.log(
      "Tools fold: independent drawers / touch pan / clean history / Play and layout restoration",
    );
    // A resize must return focus from newly hidden Tools to its own reopening node.
    // The outer drawer dock must not blur a control owned by the nested stage dock.
    await node("tools").tap();
    await p.setViewportSize({ width: 1440, height: 960 });
    await p.waitForFunction(
      () => document.querySelector("#stage").dataset.compact === "false",
    );
    await node("tools").click();
    await p.locator("#pan").focus();
    await p.setViewportSize({ width: 412, height: 892 });
    await p.waitForFunction(
      () => document.querySelector("#stage").dataset.compact === "true",
    );
    assert.equal(await node("tools").getAttribute("aria-expanded"), "false");
    assert.equal(
      await node("tools").evaluate((e) => e === document.activeElement),
      true,
    );
    await node("tools").tap();
    await p.locator("#project").selectOption("freelancer.enni-slice.v1");
    await shot("phone-open");
    await node("tools").tap();
    await shot("phone-collapsed");
    assert.equal(
      await node("tools").locator(".panel-control-label").isVisible(),
      true,
    );
    const hit = await node("tools").boundingBox();
    assert.ok(hit.width >= 44 && hit.height >= 44);
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await p.setViewportSize({ width: 1440, height: 960 });
    await p.waitForFunction(
      () => document.querySelector("#stage").dataset.compact === "false",
    );
    await node("directory").click();
    await node("properties").click();
    if ((await node("tools").getAttribute("aria-expanded")) === "true")
      await node("tools").click();
    await shot("desktop-collapsed");
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    report.behavior = {
      independentToolbar: true,
      stableCanvas: true,
      retainsTool: true,
      keyboardFocus: true,
      nestedResizeFocus: true,
      touchPanWhileFolded: true,
      noDocumentEdits: true,
      playRestoresOpenAndClosed: true,
      layoutChoices: true,
      largeTarget: true,
    };
    report.errors = errors;
    report.requests = requests;
    fs.writeFileSync(
      path.join(root, "artifacts/tool-fold-results.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log("Tool fold acceptance passed");
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
