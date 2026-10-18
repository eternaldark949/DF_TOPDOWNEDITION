/**
 * Offline Studio acceptance for authored meshes (project schema v4, decision 0023):
 * create a tube mesh from the generator catalog, place it with the ordinary place tool,
 * pose a joint and edit the recipe through the shared inspector (one undo each, rest
 * omitted from JSON), refuse a recipe that would orphan a pose, and enter/leave Play
 * without changing the document. Software WebGL verifies behaviour, not performance.
 */
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
  res.end("<!doctype html><title>Mesh fixture</title>");
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath: process.env.ETRNLNINE_CHROMIUM || "/usr/bin/chromium",
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, hasTouch: true, acceptDownloads: true }),
      p = await context.newPage();
    p.setDefaultTimeout(120000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${server.address().port}`);
    const requests = [];
    p.on("request", (r) => requests.push(r.url()));
    await p.setContent(fs.readFileSync(path.join(root, "dist/ETRNLNINE-Studio.html"), "utf8"));
    await p.waitForFunction(() => document.querySelector("#status").dataset.camera);
    const exported = async () => {
      const pending = p.waitForEvent("download");
      await p.locator("#save").click();
      return JSON.parse(fs.readFileSync(await (await pending).path(), "utf8"));
    };
    const revision = () => p.locator("#status").getAttribute("data-revision");
    const field = (name) => p.getByRole("spinbutton", { name, exact: true });
    const enter = async (name, value) => {
      const before = await revision();
      await field(name).fill(String(value));
      await field(name).press("Enter");
      await p.waitForFunction((r) => document.querySelector("#status").dataset.revision !== r, before);
    };
    const base = await exported();
    assert.equal(base.schemaVersion, 4);
    assert.deepEqual(base.meshes, []);

    // Create: one command adds the recipe and its geometry source, then arms placement.
    if ((await p.locator("[data-panel-toggle=directory]").getAttribute("aria-expanded")) === "false")
      await p.locator("[data-panel-toggle=directory]").click();
    await p.locator("#show-assets").click();
    await p.locator('[data-mesh-generator="mesh.tube"]').click();
    assert.match(await p.locator("#tool-readout").textContent(), /^PLACE · Tube/);
    const box = await p.locator("#world").boundingBox();
    await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await p.waitForFunction(() => document.querySelector("#selection-id").textContent.startsWith("instance:"));
    const placedId = await p.locator("#selection-id").textContent();
    let data = await exported();
    const mesh = data.meshes[0], asset = data.assets.find((a) => a.parts[0].shape?.mesh === mesh.id),
      placed = data.scenes[0].entities.find((e) => e.id === placedId);
    assert.deepEqual({ generator: mesh.generator, version: mesh.generatorVersion, parameters: mesh.parameters }, { generator: "mesh.tube", version: 1, parameters: {} });
    assert.equal(placed.asset, asset.id);
    assert.equal(placed.poses, undefined, "a fresh placement stores no pose");
    console.log("Meshes: catalog command creates a recipe and a placeable source");

    // Pose: one inspector edit is one command; zero is rest and leaves no JSON behind.
    if ((await p.locator("[data-panel-toggle=properties]").getAttribute("aria-expanded")) === "false")
      await p.locator("[data-panel-toggle=properties]").click();
    await p.locator("[data-joint-pose]").waitFor();
    await enter("joint1 Y", 70);
    data = await exported();
    const q = data.scenes[0].entities.find((e) => e.id === placedId).poses["part:0"].joint1;
    assert.ok(Math.abs(q[1] - Math.sin((70 * Math.PI) / 360)) < 1e-6 && Math.abs(q[3] - Math.cos((70 * Math.PI) / 360)) < 1e-6, `${q}`);
    await p.keyboard.press("f");
    await p.waitForTimeout(500);
    fs.mkdirSync(path.join(root, "docs/milestones/authored-meshes"), { recursive: true });
    await p.screenshot({ animations: "disabled", path: path.join(root, "docs/milestones/authored-meshes/studio-posed-tube.png"), timeout: 120000 });
    await p.locator("#undo").click();
    data = await exported();
    assert.equal(data.scenes[0].entities.find((e) => e.id === placedId).poses, undefined, "one undo removes the pose");
    await p.locator("#redo").click();
    await enter("joint1 Y", 0);
    data = await exported();
    assert.equal(data.scenes[0].entities.find((e) => e.id === placedId).poses, undefined, "rest is omitted");
    console.log("Meshes: joint pose edits, undo/redo and rest omission");

    // Recipe: shared parameters rebuild the mesh; defaults are omitted, poses are guarded.
    await enter("Joints", 5);
    data = await exported();
    assert.deepEqual(data.meshes[0].parameters, { joints: 5 });
    await p.locator("[data-joint-pose]").getByRole("spinbutton", { name: "joint4 X", exact: true }).waitFor();
    await enter("joint4 X", 45);
    const guarded = JSON.stringify(await exported());
    await field("Joints").fill("3");
    await field("Joints").press("Enter");
    await p.locator("#error").waitFor({ state: "visible" });
    assert.match(await p.locator("#error").textContent(), /joint/i);
    await p.locator("#error").click();
    assert.equal(JSON.stringify(await exported()), guarded, "a refused recipe leaves the document unchanged");
    console.log("Meshes: recipe parameters rebuild every user and refuse orphaned poses");

    // Play builds its own instance from a detached copy; stopping restores the same file.
    await p.locator("#play").click();
    await p.waitForFunction(() => document.querySelector("#status").dataset.mode === "play");
    await p.waitForTimeout(800);
    await p.locator("#play").click();
    await p.waitForFunction(() => document.querySelector("#status").dataset.mode === "edit");
    assert.equal(JSON.stringify(await exported()), guarded, "Play does not edit the document");
    console.log("Meshes: Play isolation");

    report.meshes = { create: true, place: true, poseUndo: true, restOmitted: true, recipe: true, orphanGuard: true, playIsolation: true };
    report.errors = errors;
    report.requests = requests;
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    fs.writeFileSync(path.join(root, "artifacts/meshes-results.json"), JSON.stringify(report, null, 2));
    console.log("Authored mesh acceptance passed");
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
