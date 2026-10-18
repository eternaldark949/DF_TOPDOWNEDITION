/**
 * Skinned meshes in a real WebGL 2 context: a lofted tube bends at its joints in the lit,
 * shadow and SSAO passes; rigid meshes draw beside boxes; the animate phase poses before
 * render; context loss restores the same pixels; leases and palettes free cleanly.
 * Software GL (SwiftShader) only: this proves correctness, not phone performance.
 */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  evidence = path.join(root, "docs/milestones/skinning");
const server = http.createServer((req, res) => {
  if (req.url === "/fixture") {
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><body style="margin:0;background:#000"><canvas style="width:960px;height:600px;display:block"></canvas></body>');
    return;
  }
  if (req.url === "/favicon.ico") { res.writeHead(204); res.end(); return; }
  const file = path.resolve(root, "." + req.url);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : "text/html");
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath: process.env.ETRNLNINE_CHROMIUM || "/usr/bin/chromium",
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
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
    const result = await page.evaluate(async () => {
      const { ETRNLNINE } = await import("/engine/etrnlnine.js"),
        { createMaterial } = await import("/engine/basement/material.js"),
        { SkeletonPose } = await import("/engine/basement/skeleton.js"),
        { createMesh, loft } = await import("/engine/basement/mesh.js"),
        { MeshLibrary } = await import("/engine/directory/mesh-library.js"),
        { tubeRecipe, tubeKey } = await import("/engine/penthouse/skinned-tube.js");
      const canvas = document.querySelector("canvas");
      const engine = new ETRNLNINE(canvas, { pixelRatio: 1, occlusion: { mode: "screen", strength: 0.8 }, lighting: { shadows: { mode: "high", extent: 8 } } });
      const r = engine.basement.renderer, gl = r.gl, baseline = { ...r.stats };
      const world = engine.directory.adopt(engine.basement.createWorld());
      engine.directory.create("toy.box", { world, z: -0.05, size: [8, 8, 0.1], material: createMaterial({ baseColor: [0.55, 0.55, 0.55] }) });
      engine.directory.create("toy.box", { world, x: 0, z: 1.55, size: [0.5, 0.3, 0.1], material: createMaterial({ baseColor: [0.3, 0.3, 0.32] }) });
      const library = new MeshLibrary(engine.directory, r, "test.skinning");
      const options = { length: 1.2, radius: 0.08, taper: 0.6, joints: 3 };
      const mesh = library.acquire(tubeKey(options), () => tubeRecipe(options).mesh);
      const red = createMaterial({ baseColor: [0.85, 0.06, 0.04] });
      const pose = new SkeletonPose(mesh.skeleton);
      const tube = world.create({ x: 0, y: 0, z: 1.5, shape: { size: [1, 1, 1], mesh, material: red }, skin: pose });
      // A rigid lofted mesh (no skeleton) beside it: pose.w -1, no palette row.
      const rigid = r.createMesh(createMesh(loft({ rings: [{ center: [0, 0, 0], radius: [0.18, 0.18] }, { center: [0, 0, 0.3], radius: [0.12, 0.12] }, { center: [0, 0, 0.5], radius: [0.02, 0.02] }] })));
      const blue = createMaterial({ baseColor: [0.05, 0.12, 0.85] });
      const cone = world.create({ x: 1.3, y: 0, z: 0, shape: { size: [1, 1, 1], mesh: rigid, material: blue } });
      const batch = r.createBatch(world, 64);
      r.camera.preset("front");
      r.camera.elevation = 0.35;
      r.camera.halfHeight = 1.4;
      r.camera.z = 0.85;
      r.lighting.configureDirectional({ direction: [0.8, -0.5, 1], color: [1.6, 1.5, 1.4] });
      const frame = () => {
        world.resolve();
        r.render(batch);
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let redCount = 0, redX = 0, redLow = canvas.height, blueCount = 0, dark = 0, darkX = 0;
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4, [R, G, B] = [pixels[i], pixels[i + 1], pixels[i + 2]];
            if (R > 50 && R > G * 2 && R > B * 2) { redCount++; redX += x; redLow = Math.min(redLow, y); }
            if (B > 50 && B > R * 2 && B > G * 1.4) blueCount++;
            // Shadowed floor: grey pixels in the lower half clearly darker than the sunlit
            // floor (about 200 here), weighted by how much light they lost.
            if (y < canvas.height / 2 && Math.abs(R - G) < 8 && Math.abs(G - B) < 16 && R < 185) { dark += 185 - R; darkX += x * (185 - R); }
          }
        return { red: redCount, redX: redCount ? redX / redCount : 0, redLow, blue: blueCount, shadow: dark, shadowX: dark ? darkX / dark : 0, error: gl.getError() };
      };
      r.lighting.configureShadows({ mode: "off" });
      const unshadowed = frame();
      r.lighting.configureShadows({ mode: "high" });
      const straight = frame();
      const sunUpdates = r.lighting.maps.sunUpdates;
      const stable = frame();
      const stableSun = r.lighting.maps.sunUpdates;
      // Bend the middle joint 80° sideways about y: the lower segment swings toward +x.
      pose.bend(1, [0, 1, 0], -1.4);
      pose.update();
      const bent = frame();
      const bentSun = r.lighting.maps.sunUpdates;
      const inspect = { meshes: batch.meshes.size, meshCount: batch.meshCount, palette: batch.paletteBytes, casters: r.lighting.maps.casters.meshCount, ao: r.occlusion.inspect().effectiveMode, palettes: r.stats.jointPalettes };

      // Context loss: everything rebuilds from retained data and draws the same silhouette.
      const lose = gl.getExtension("WEBGL_lose_context");
      const back = new Promise((resolve) => canvas.addEventListener("webglcontextrestored", resolve, { once: true }));
      lose.loseContext();
      await new Promise((resolve) => setTimeout(resolve, 50));
      lose.restoreContext();
      await back;
      const restored = frame();

      // The animate phase: pose from the Lobby, then render, on the real frame loop.
      let animated = 0, rendered = 0, order = "";
      const removeAnimate = engine.lobby.on("animate", (_alpha, time) => { pose.reset().bend(1, [0, 1, 0], Math.sin(time * 3)).bend(2, [0, 1, 0], 0.6); pose.update(); animated++; order += "a"; });
      const removeRender = engine.lobby.on("render", () => { world.resolve(); r.render(batch); rendered++; order += "r"; });
      engine.lobby.pause("document-hidden", false);
      engine.start();
      const revision = pose.revision;
      // Wait for frames, not wall time: software WebGL under load can render < 5 in 600 ms.
      for (const deadline = performance.now() + 15000; rendered < 6 && performance.now() < deadline; )
        await new Promise((resolve) => setTimeout(resolve, 50));
      engine.stop(); removeAnimate(); removeRender();
      const phase = { animated, rendered, alternating: /^(ar)+$/.test(order), revisions: pose.revision - revision };

      // Evidence: three tubes in rest, elbow and curl poses beside the rigid cone.
      const poses = [pose];
      pose.reset().update();
      for (const [x, bends] of [[-0.9, [[1, [0, 1, 0], -1.2]]], [0.9, [[0, [0, 1, 0], 0.5], [1, [0, 1, 0], 1.0], [2, [0, 1, 0], 1.1]]]]) {
        const p = new SkeletonPose(mesh.skeleton);
        for (const [joint, axis, angle] of bends) p.bend(joint, axis, angle);
        p.update(); poses.push(p);
        world.create({ x, y: 0, z: 1.5, shape: { size: [1, 1, 1], mesh, material: red }, skin: p });
        engine.directory.create("toy.box", { world, x, z: 1.55, size: [0.5, 0.3, 0.1], material: createMaterial({ baseColor: [0.3, 0.3, 0.32] }) });
      }
      cone.x = 1.9; cone.previous.x = 1.9;
      r.camera.halfHeight = 1.6;
      const lineup = frame();
      const shared = { meshes: batch.meshes.size, rows: batch.meshCount, palettes: r.stats.jointPalettes };
      window.fx = { engine, r, world, batch, library, rigid, frame };
      return { baseline, unshadowed, straight, stable, bent, sunUpdates, stableSun, bentSun, inspect, restored, phase, lineup, shared };
    });
    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, "skinned-tubes.png") });
    Object.assign(result, await page.evaluate(() => {
      const { engine, r, world, batch, library, rigid, frame } = window.fx;
      delete window.fx;

      // Cleanup: removing the meshes' entities frees streams and the palette on the next
      // sync; releasing the leases frees the GPU meshes.
      for (const entity of [...world.entities.values()]) if (entity.shape?.mesh) world.remove(entity);
      frame();
      const emptied = { meshes: batch.meshes.size, palettes: r.stats.jointPalettes, palette: batch.paletteBytes };
      library.dispose(); rigid.dispose();
      const released = { meshes: r.meshes.size, resources: engine.directory.resources.size };
      batch.dispose();
      engine.dispose();
      return { emptied, released, final: { buffers: r.stats.buffers, vaos: r.stats.vaos, programs: r.stats.programs, palettes: r.stats.jointPalettes } };
    }));
    console.log("Skinning", JSON.stringify(result, null, 1));
    const { straight, stable, bent, restored, phase, inspect, lineup, shared, emptied, released, final } = result;
    for (const f of [straight, stable, bent, restored, lineup]) assert.equal(f.error, 0, "no GL error");
    assert.ok(straight.red > 2000, "the skinned tube draws");
    assert.ok(straight.blue > 300, "the rigid mesh draws");
    assert.ok(straight.shadow > result.unshadowed.shadow + 20000, "meshes cast sun shadows");
    assert.deepEqual(stable, straight, "an unchanged pose renders identically");
    assert.equal(result.stableSun, result.sunUpdates, "an unchanged pose keeps the shadow cache");
    assert.ok(result.bentSun > result.stableSun, "a new pose refreshes the shadow map");
    assert.ok(bent.redX > straight.redX + 15, `the lower segment swings toward +x (${straight.redX} → ${bent.redX})`);
    assert.ok(bent.redLow > straight.redLow + 20, "a bent tube reaches less far down");
    assert.ok(Math.abs(bent.shadowX - straight.shadowX) > 5 || Math.abs(bent.shadow - straight.shadow) > 5000, "the shadow follows the bend");
    assert.deepEqual(inspect, { meshes: 2, meshCount: 2, palette: 192 * 32 * 16, casters: 2, ao: "screen", palettes: 2 });
    assert.deepEqual(restored, bent, "context restoration reproduces the same pixels");
    assert.ok(phase.animated > 3 && phase.animated === phase.rendered && phase.alternating, "animate runs once before each render");
    assert.ok(phase.revisions > 3, "the animated pose changes the palette each frame");
    assert.deepEqual(shared, { meshes: 2, rows: 4, palettes: 2 }, "three skinned figures share one mesh stream and one palette");
    assert.ok(lineup.red > straight.red * 2);
    assert.deepEqual(emptied, { meshes: 0, palettes: 0, palette: 0 }, "streams and palettes free when no mesh remains");
    assert.deepEqual(released, { meshes: 0, resources: 0 });
    assert.deepEqual(final, { buffers: 0, vaos: 0, programs: 0, palettes: 0 });
    assert.deepEqual(errors, []);
    console.log("Skinning browser acceptance passed.");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
