/** Actual offline Studio shell: responsive diamond panels, native keyboard/touch and document isolation. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  errors = [],
  requests = [],
  report = {};
const server = http.createServer((req, res) => {
  if (req.url.endsWith(".js")) {
    const file = path.resolve(root, "." + req.url);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader("Content-Type", "text/javascript");
    res.end(fs.readFileSync(file));
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html>");
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
    // A lightweight source fixture checks ownership without constructing a renderer.
    report.lifetime = await p.evaluate(async () => {
      const { PanelDock } = await import("/engine/penthouse/panel-dock.js");
      const host = document.createElement("main"),
        panel = document.createElement("aside");
      panel.id = "fixture-panel";
      host.append(panel);
      document.body.append(host);
      const entries = [
          { key: "library", panel, label: "Library", side: "left" },
        ],
        options = {
          root: host,
          entries,
          compact: matchMedia("(max-width:760px)"),
          defaults: { wide: [], compact: [] },
        };
      const first = new PanelDock(options),
        old = host.querySelector("button");
      old.click();
      if (panel.inert) throw new Error("Panel did not open");
      first.dispose();
      first.dispose();
      if (
        entries[0].button ||
        host.querySelector("button") ||
        panel.hasAttribute("aria-hidden")
      )
        throw new Error("Dock retained caller or DOM state");
      const second = new PanelDock(options);
      old.click();
      if (second.current.size) throw new Error("Disposed listener retained");
      host.querySelector("button").click();
      const independent = new Set(second.current);
      second.suspend(true);
      second.suspend(false);
      if (second.current.size !== independent.size)
        throw new Error("Suspend lost state");
      second.dispose();
      host.remove();
      return {
        remount: true,
        callerUnchanged: true,
        oldListenerRemoved: true,
        suspendRestored: true,
      };
    });
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
    const button = (key) => p.locator(`[data-panel-toggle=${key}]`),
      data = async () => {
        const d = p.waitForEvent("download");
        await p.locator("#save").click();
        return JSON.parse(fs.readFileSync(await (await d).path(), "utf8"));
      };
    /** A screenshot must show the final state rather than the first frame of a slide. */
    const shot = async (name) => {
      await p.waitForFunction(() =>
        [...document.querySelectorAll(".dock-panel")].every((e) =>
          e.dataset.panelOpen === "true"
            ? getComputedStyle(e).transform === "none"
            : getComputedStyle(e).visibility === "hidden",
        ),
      );
      await p.screenshot({
        path: path.join(root, "artifacts/" + name),
        timeout: 120000,
        animations: "disabled",
      });
    };
    const before = await data();
    console.log("Shell: startup / offline styles / ownership");
    assert.equal(
      await button("directory").getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(
      await button("properties").getAttribute("aria-expanded"),
      "true",
    );
    await button("properties").click();
    await button("directory").click();
    await p.waitForFunction(
      () =>
        document.querySelector("#world").clientWidth ===
        document.querySelector("main").clientWidth,
    );
    for (const key of ["directory", "properties"]) {
      assert.equal(
        await button(key).locator(".panel-control-label").isVisible(),
        true,
      );
      const r = await button(key).boundingBox();
      assert.ok(r.width >= 44 && r.height >= 44);
    }
    await shot("studio-diamonds-desktop-clear.png");
    await button("directory").click();
    await button("properties").click();
    await p.locator("#project").selectOption("freelancer.enni-slice.v1");
    await shot("studio-diamonds-desktop.png");
    console.log("Shell: desktop collapse / expand");
    // Phone panels slide over a stable full-size viewport, with separate layout choices.
    await p.setViewportSize({ width: 412, height: 892 });
    await p.waitForFunction(
      () => document.querySelector("main").dataset.compact === "true",
    );
    assert.equal(
      await button("properties").getAttribute("aria-expanded"),
      "false",
    );
    await p.locator('[data-panel-toggle=viewport]').click();
    await p.locator("#reset-view").click();
    await p.locator('[data-panel-toggle=viewport]').click();
    const canvas = await p.locator("#world").boundingBox();
    await shot("studio-diamonds-phone-clear.png");
    await button("directory").tap();
    await p.locator("#show-materials").click();
    await shot("studio-diamonds-phone-directory.png");
    await p.locator("[data-material-id]").first().click();
    assert.equal(
      await button("directory").getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(
      await button("properties").getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(await p.locator("#library").evaluate((e) => e.inert), true);
    const overlayCanvas = await p.locator("#world").boundingBox();
    assert.equal(overlayCanvas.height, canvas.height);
    assert.equal(overlayCanvas.width, canvas.width);
    await shot("studio-diamonds-phone-properties.png");
    assert.equal(await p.locator("#library").isVisible(), false);
    assert.equal(await p.locator("#properties").isVisible(), true);
    console.log("Shell: compact panels / stable viewport");
    await button("properties").focus();
    await p.keyboard.press("Escape");
    assert.equal(
      await button("properties").getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(
      await button("properties").evaluate((e) => document.activeElement === e),
      true,
    );
    await p.keyboard.press("Enter");
    assert.equal(
      await button("properties").getAttribute("aria-expanded"),
      "true",
    );
    await p.locator("#play").click();
    await p.waitForFunction(
      () =>
        document.querySelector("#status").dataset.mode === "play" &&
        document.querySelector("#status").textContent.includes("Clinic Way"),
    );
    assert.equal(await button("properties").isVisible(), false);
    await p.locator("#play").click();
    await p.waitForFunction(
      () => document.querySelector("#status").dataset.mode === "edit",
    );
    assert.equal(
      await button("properties").getAttribute("aria-expanded"),
      "true",
    );
    console.log("Shell: Play restoration");
    await p.setViewportSize({ width: 1440, height: 960 });
    await p.waitForFunction(
      () => document.querySelector("main").dataset.compact === "false",
    );
    assert.equal(
      await button("directory").getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(
      await button("properties").getAttribute("aria-expanded"),
      "true",
    );
    await p.locator("#project").selectOption("project:atrium");
    assert.deepEqual(await data(), before);
    assert.equal(await p.locator("#undo").isDisabled(), true);
    await p.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await p
        .locator("main")
        .evaluate((e) => getComputedStyle(e).transitionDuration),
      "0s",
    );
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    report.panels = {
      desktopIndependent: true,
      compactExclusive: true,
      labels: true,
      keyboard: true,
      largeTargets: true,
      stablePhoneViewport: true,
      playRestoration: true,
      documentUnchanged: true,
      reducedMotion: true,
    };
    report.errors = errors;
    report.requests = requests;
    fs.writeFileSync(
      path.join(root, "artifacts/studio-shell-results.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log("Studio diamond shell acceptance passed");
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
