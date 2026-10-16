/** Offline UI acceptance: one reusable widget, viewport-only settings and phone controls. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  report = {},
  server = http.createServer((q, res) => {
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
    for (const target of ["Studio", "Freelancer"]) {
      const context = await browser.newContext({
          viewport: { width: 412, height: 892 },
          hasTouch: true,
          isMobile: true,
          acceptDownloads: true,
        }),
        p = await context.newPage(),
        errors = [],
        requests = [];
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
      await p.setContent(
        fs.readFileSync(
          path.join(root, `dist/ETRNLNINE-${target}.html`),
          "utf8",
        ),
      );
      const mode = p.locator("[data-bloom=mode]"),
        status = p.locator(".engine-appearance output");
      let before;
      const exported = async () => {
        const pending = p.waitForEvent("download");
        await p.locator("#save").click();
        return JSON.parse(
          fs.readFileSync(await (await pending).path(), "utf8"),
        );
      };
      if (target === "Studio") {
        await p.waitForFunction(
          () => document.querySelector("#status").dataset.camera,
        );
        await p.locator("#project").selectOption("freelancer.enni-slice.v1");
        before = await exported();
        await p.locator("#viewport-options").evaluate((e) => (e.open = true));
        await p.locator("#projection").selectOption("perspective");
      } else
        await p.waitForFunction(
          () => document.querySelector("#status").dataset.actor,
        );
      await p.locator(".engine-appearance").evaluate((e) => (e.open = true));
      await mode.selectOption("low");
      await p.waitForFunction(
        () =>
          document.querySelector(".engine-appearance output").dataset
            .effective === "low",
      );
      for (const [key, value] of [
        ["strength", ".85"],
        ["radius", "1.5"],
        ["threshold", "1"],
        ["exposure", "1.25"],
      ]) {
        const input = p.locator(
          `[data-${key === "exposure" ? "presentation" : "bloom"}=${key}]`,
        );
        await input.fill(value);
        await input.dispatchEvent("change");
      }
      const bytes = Number(await status.getAttribute("data-bytes"));
      assert.ok(bytes > 0);
      if (target === "Studio") {
        assert.deepEqual(await exported(), before);
        assert.equal(await p.locator("#undo").isDisabled(), true);
        await p.locator("#viewport-options").evaluate((e) => (e.open = false));
        await p.locator("#play").click();
        await p.waitForFunction(
          () =>
            document.querySelector("#status").dataset.mode === "play" &&
            document
              .querySelector("#status")
              .textContent.includes("Clinic Way"),
        );
        await p.locator("#play").click();
        await p.waitForFunction(
          () => document.querySelector("#status").dataset.mode === "edit",
        );
        await p.locator("#viewport-options").evaluate((e) => (e.open = true));
        assert.equal(await mode.inputValue(), "low");
        assert.equal(
          Number(await p.locator("[data-bloom=strength]").inputValue()),
          0.85,
        );
        assert.deepEqual(await exported(), before);
        await p.screenshot({
          path: path.join(root, "artifacts/bloom-studio-controls-phone.png"),
          timeout: 120000,
        });
        await p.locator("#viewport-options").evaluate((e) => (e.open = false));
        await p.setViewportSize({ width: 1440, height: 960 });
        await p.screenshot({
          path: path.join(root, "artifacts/bloom-studio-desktop.png"),
          timeout: 120000,
        });
      } else {
        await p.locator("#quality").selectOption("off");
        await p.waitForFunction(
          () => document.querySelector("[data-bloom=mode]").value === "off",
        );
        // The coordinator releases Auto HDR on its next frame, independently of the filter.
        // Wait for the resource report rather than treating the requested mode as completion.
        await p.waitForFunction(
          () =>
            document.querySelector(".engine-appearance output").dataset
              .bytes === "0",
        );
        assert.equal(await status.getAttribute("data-bytes"), "0");
        await p.locator("#quality").selectOption("mobile");
        await mode.selectOption("low");
        await p.waitForFunction(
          () =>
            document.querySelector(".engine-appearance output").dataset
              .effective === "low",
        );
        const oldActor = await p.locator("#status").getAttribute("data-actor");
        await p.locator("#restart").click();
        await p.waitForFunction(
          (old) => document.querySelector("#status").dataset.actor !== old,
          oldActor,
        );
        assert.equal(await mode.inputValue(), "low");
      }
      if (target === "Studio")
        await p.locator("#viewport-options").evaluate((e) => (e.open = true));
      for (let i = 0; i < 2; i++) {
        await mode.selectOption("off");
        await p.waitForFunction(
          () =>
            document.querySelector(".engine-appearance output").dataset
              .bytes === "0",
        );
        await mode.selectOption("low");
        await p.waitForFunction(
          () =>
            document.querySelector(".engine-appearance output").dataset
              .effective === "low",
        );
      }
      await mode.selectOption("off");
      await p.waitForFunction(
        () =>
          document.querySelector(".engine-appearance output").dataset.bytes ===
          "0",
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, []);
      report[target] = { bytes, cycles: 2, errors, requests };
      await context.close();
      console.log(`${target} bloom controls passed`);
    }
    fs.writeFileSync(
      path.join(root, "artifacts/bloom-ui-results.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
