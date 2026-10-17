/** Offline acceptance for the three-surface Studio and its original SVG control family.
 * DOM/SVG decorate interface controls only; a guard rejects every Canvas2D request. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  report = {},
  errors = [],
  requests = [];
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + req.url);
  if (req.url.endsWith(".js") && file.startsWith(root + path.sep)) {
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
    // A source fixture validates every path and shared decoration cleanup without a renderer.
    report.icons = await p.evaluate(async () => {
      const { IconControls } = await import(
          "/engine/penthouse/icon-controls.js"
        ),
        { WORKSPACE_ICONS } = await import(
          "/engine/penthouse/workspace-icons.js"
        ),
        { Penthouse } = await import("/engine/penthouse/penthouse.js"),
        { Directory } = await import("/engine/directory/directory.js");
      const directory = new Directory();
      for (const [name, factory] of Object.entries(new Penthouse().libraries))
        directory.register(name, factory);
      const catalog = directory.create("ui.icons");
      if (catalog !== WORKSPACE_ICONS || !Object.isFrozen(catalog))
        throw new Error("Catalog ownership");
      const host = document.createElement("div"),
        button = document.createElement("button"),
        text = document.createTextNode("Original");
      button.title = "Original tooltip";
      button.append(text);
      host.append(button);
      document.body.append(host);
      const controls = new IconControls(catalog);
      for (const name of Object.keys(catalog)) {
        const svg = controls.vector(name, document);
        host.append(svg);
        if (!(svg.firstChild.getTotalLength() > 0))
          throw new Error("Invalid SVG: " + name);
        svg.remove();
      }
      controls.set(button, "play", "Play", { compact: true });
      controls.set(button, "stop", "Stop", { compact: true });
      if (
        button.querySelectorAll("svg").length !== 1 ||
        button.getAttribute("aria-label") !== "Stop"
      )
        throw new Error("Dynamic control state");
      try {
        controls.set(button, "missing", "Bad");
        throw new Error("Unknown icon accepted");
      } catch (e) {
        if (!e.message.includes("Unknown workspace icon")) throw e;
      }
      controls.dispose();
      controls.dispose();
      if (
        button.firstChild !== text ||
        button.hasAttribute("aria-label") ||
        button.title !== "Original tooltip" ||
        button.className
      )
        throw new Error("Borrowed DOM not restored");
      const remount = new IconControls(catalog);
      remount.set(button, "select", "Select");
      remount.dispose();
      host.remove();
      directory.dispose();
      return {
        count: Object.keys(catalog).length,
        allPathsValid: true,
        registeredCatalog: true,
        dynamicState: true,
        disposeRemount: true,
      };
    });
    // Retired controller instances must never keep changing shared view preferences.
    report.controllerLifetime = await p.evaluate(async () => {
      const { ViewportPanel } = await import(
          "/editor/workspace/viewport-panel.js"
        ),
        { IconControls } = await import("/engine/penthouse/icon-controls.js"),
        { WORKSPACE_ICONS } = await import(
          "/engine/penthouse/workspace-icons.js"
        );
      const root = document.createElement("div");
      root.innerHTML =
        '<button id="lens"></button><select id="projection"><option value="orthographic">Orthographic</option></select><input id="fov"><select id="view"></select><select id="snap"></select><button data-view-command="grid"></button><aside id="viewport-options"></aside>';
      document.body.append(root);
      let calls = 0;
      const preferences = {
          value: { grid: false, lights: true },
          set(k, v) {
            calls++;
            this.value[k] = v;
          },
        },
        icons = new IconControls(WORKSPACE_ICONS),
        options = {
          root,
          icons,
          preferences,
          renderer: {
            camera: { projection: "orthographic", fov: Math.PI / 3 },
          },
          viewport: { cancel() {} },
          onError: (e) => {
            throw e;
          },
        };
      const button = root.querySelector("[data-view-command=grid]"),
        first = new ViewportPanel(options);
      button.click();
      first.dispose();
      first.dispose();
      button.click();
      if (calls !== 1) throw new Error("Disposed controller retained listener");
      const second = new ViewportPanel(options);
      button.click();
      if (calls !== 2 || preferences.value.grid !== false)
        throw new Error("Controller remount duplicated action");
      second.dispose();
      icons.dispose();
      root.remove();
      return { disposeRemount: true, singleAction: true };
    });
    // Contact sheet shows the exact catalog used by controls, rather than separate concept art.
    await p.evaluate(async () => {
      const { IconControls } = await import(
          "/engine/penthouse/icon-controls.js"
        ),
        { WORKSPACE_ICONS } = await import(
          "/engine/penthouse/workspace-icons.js"
        ),
        icons = new IconControls(WORKSPACE_ICONS);
      document.body.style.cssText =
        "margin:0;padding:36px;background:#0a0a0f;color:#eee8df;font:14px system-ui";
      const title = document.createElement("h1");
      title.textContent = "ETRNLNINE · Studio icon family";
      title.style.cssText = "font:28px Georgia;color:#e4c995;margin:0 0 24px";
      document.body.append(title);
      const grid = document.createElement("div");
      grid.style.cssText =
        "display:grid;grid-template-columns:repeat(8,1fr);gap:12px";
      document.body.append(grid);
      for (const name of Object.keys(WORKSPACE_ICONS)) {
        const card = document.createElement("div"),
          svg = icons.vector(name, document),
          label = document.createElement("span");
        card.style.cssText =
          "height:160px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:#15101f;border:1px solid #3d304e;border-radius:6px";
        svg.style.cssText = "width:36px;height:36px;color:#ceadff";
        label.textContent = name;
        label.style.color = "#c2b6cf";
        card.append(svg, label);
        grid.append(card);
      }
      icons.dispose();
    });
    await p.screenshot({
      path: path.join(root, "artifacts/viewport-ui-icons.png"),
      timeout: 120000,
    });
    await p.evaluate(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (kind === "2d") throw new Error("Canvas2D forbidden");
        return get.call(this, kind, ...args);
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
      section = (key) => p.locator(`[data-viewport-section=${key}-section]`),
      canvas = () => p.locator("#world").boundingBox();
    const exported = async () => {
      const wait = p.waitForEvent("download");
      await p.locator("#save").click();
      return JSON.parse(fs.readFileSync(await (await wait).path(), "utf8"));
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
        path: path.join(root, `artifacts/viewport-ui-${name}.png`),
        animations: "disabled",
        timeout: 120000,
      });
    };
    await p.locator("#project").selectOption("freelancer.enni-slice.v1");
    const before = await exported();
    const original = await canvas();
    await node("viewport").click();
    assert.deepEqual(await canvas(), original);
    await section("guides").click();
    await p.locator("#viewport-options [data-view-command=grid]").click();
    assert.equal(await p.locator("#grid").getAttribute("aria-pressed"), "true");
    await p.locator("#viewport-options [data-view-command=lights]").click();
    assert.equal(
      await p.locator("#lights").getAttribute("aria-pressed"),
      "false",
    );
    for (const key of ["axes", "outlines"])
      await p.locator(`#viewport-options [data-view-command=${key}]`).click();
    await p.waitForFunction(
      () => document.querySelector("#status").dataset.guides === "2",
    );
    await section("camera").click();
    await p.locator("#projection").selectOption("perspective");
    assert.equal(
      await p.locator("#lens").getAttribute("aria-label"),
      "Perspective",
    );
    await p.locator("#fov").fill("70");
    await p.locator("#fov").dispatchEvent("change");
    await p.locator("#fov").fill("");
    await p.locator("#fov").dispatchEvent("change");
    assert.equal(Number(await p.locator("#fov").inputValue()), 70);
    await p.locator("#error").click();
    await p.locator("#fov").fill("200");
    await p.locator("#fov").dispatchEvent("change");
    assert.equal(Number(await p.locator("#fov").inputValue()), 70);
    await p.locator("#error").click();
    await p.locator("#fov").fill("50");
    await p.locator("#fov").dispatchEvent("change");
    await shot("desktop-camera");
    await section("appearance").click();
    await p.getByLabel("Bloom look", { exact: true }).selectOption("luxe");
    await shot("desktop-appearance");
    assert.equal(await p.locator("#camera-section").getAttribute("open"), null);
    assert.equal(
      await section("appearance").getAttribute("aria-pressed"),
      "true",
    );
    await node("viewport").click();
    await p.locator("#lens").click();
    assert.equal(
      await p.locator("#lens").getAttribute("aria-label"),
      "Orthographic",
    );
    await p.locator("#grid").click();
    assert.equal(
      await p
        .locator("#viewport-options [data-view-command=grid]")
        .getAttribute("aria-pressed"),
      "false",
    );
    assert.deepEqual(await exported(), before);
    assert.equal(await p.locator("#undo").isDisabled(), true);
    console.log(
      "Viewport: shared commands / sections / lens / validation / document isolation",
    );
    await p.setViewportSize({ width: 412, height: 892 });
    await p.waitForFunction(
      () => document.querySelector("main").dataset.compact === "true",
    );
    const phone = await canvas();
    assert.equal(phone.width, 412);
    assert.equal(phone.x, 0);
    await node("directory").tap();
    await node("viewport").tap();
    assert.equal(await p.locator("#library").evaluate((e) => e.inert), true);
    assert.deepEqual(await canvas(), phone);
    await section("camera").click();
    await p.locator("#reset-view").click();
    await node("viewport").click();
    await shot("phone-clear");
    await node("viewport").click();
    await section("camera").click();
    await shot("phone-camera");
    await section("guides").click();
    // Axes release/recreate the ground layer. Enni's empty-origin marker retains
    // the shared foreground layer when the optional selection outline is hidden.
    for (const key of ["axes", "outlines"])
      await p.locator(`#viewport-options [data-view-command=${key}]`).click();
    await p.waitForFunction(
      () => document.querySelector("#status").dataset.guides === "1",
    );
    for (const key of ["axes", "outlines"])
      await p.locator(`#viewport-options [data-view-command=${key}]`).click();
    await p.waitForFunction(
      () => document.querySelector("#status").dataset.guides === "2",
    );
    await shot("phone-guides");
    await section("appearance").click();
    await shot("phone-appearance");
    // The other two nodes must remain genuinely touchable in the clear rail.
    await node("properties").tap();
    assert.equal(
      await p.locator("#viewport-options").evaluate((e) => e.inert),
      true,
    );
    await node("viewport").tap();
    assert.equal(await p.locator("#properties").evaluate((e) => e.inert), true);
    await node("directory").tap();
    assert.equal(
      await p.locator("#viewport-options").evaluate((e) => e.inert),
      true,
    );
    await node("viewport").tap();
    for (const key of ["directory", "properties", "viewport"]) {
      const r = await node(key).boundingBox();
      assert.ok(r.width >= 44 && r.height >= 44);
      assert.ok(r.x >= 0 && r.x + r.width <= 412);
    }
    await node("viewport").focus();
    await p.keyboard.press("Escape");
    assert.equal(await node("viewport").getAttribute("aria-expanded"), "false");
    await p.keyboard.press("Enter");
    await p.locator("#play").click();
    await p.waitForFunction(
      () =>
        document.querySelector("#status").dataset.mode === "play" &&
        document.querySelector("#status").dataset.guides === "0" &&
        document.querySelector("#status").textContent.includes("Clinic Way"),
    );
    assert.equal(await node("viewport").isVisible(), false);
    assert.equal(
      await p.locator("#play svg").getAttribute("data-icon"),
      "stop",
    );
    await p.locator("#play").click();
    await p.waitForFunction(
      () => document.querySelector("#status").dataset.mode === "edit",
    );
    assert.equal(await node("viewport").getAttribute("aria-expanded"), "true");
    assert.equal(
      await p.locator("#play svg").getAttribute("data-icon"),
      "play",
    );
    assert.deepEqual(await exported(), before);
    await p.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await p
        .locator("#viewport-options")
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
    report.viewport = {
      threeCoordinatedPanels: true,
      stableCanvas: true,
      sectionShortcuts: true,
      sharedGuideState: true,
      worldAxes: true,
      selectionBoundsOutline: true,
      optionalGuideRelease: true,
      sharedLensState: true,
      validatesFov: true,
      documentUnchanged: true,
      keyboard: true,
      touch: true,
      playRestoration: true,
      reducedMotion: true,
    };
    report.errors = errors;
    report.requests = requests;
    fs.writeFileSync(
      path.join(root, "artifacts/viewport-ui-results.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log("Viewport UI acceptance passed");
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
