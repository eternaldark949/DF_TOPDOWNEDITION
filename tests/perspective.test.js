/** Projection contracts: independent matrix multiplication checks the CPU/GPU boundary. */
import test from "node:test";
import assert from "node:assert/strict";
import { Camera } from "../engine/basement/camera.js";
import { CameraNavigation } from "../engine/basement/camera-navigation.js";
import { rayBox } from "../engine/basement/picking.js";
const close = (a, b, t = 1e-5) =>
  assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
const mul = (m, p) =>
  [0, 1, 2, 3].map((i) => p.reduce((n, v, j) => n + v * m[j * 4 + i], 0));
for (const mode of ["orthographic", "perspective"]) {
  test(`${mode}: matrix/inverse, CSS projection and ray agree at arbitrary orientation`, () => {
    const c = new Camera();
    Object.assign(c, { x: 12, y: -6, z: 3, azimuth: 0.7, elevation: 0.4 });
    c.setProjection(mode);
    c.update(1.6);
    const p = [10, -5, 4, 1],
      clip = mul(c.matrix, p),
      back = mul(c.inverse, clip);
    back.slice(0, 3).forEach((v, i) => close(v / back[3], p[i], 0.002));
    const css = c.project({ x: p[0], y: p[1], z: p[2] }, 960, 600);
    close(css.x, (clip[0] / clip[3] + 1) * 480, 0.001);
    close(css.y, (1 - clip[1] / clip[3]) * 300, 0.001);
    const ray = c.ray(css.x, css.y, 960, 600),
      delta = p.slice(0, 3).map((v, i) => v - ray.origin[i]),
      t = delta.reduce((n, v, i) => n + v * ray.direction[i], 0);
    delta.forEach((v, i) => close(v, ray.direction[i] * t));
    assert.ok(t > 0 && t < ray.maxDistance);
    for (const z of [-1, 0, 0.9, 1]) {
      const world = c.unproject(0.3, -0.2, z),
        v = mul(c.matrix, [...world, 1]);
      close(v[2] / v[3], z, 0.0001);
    }
  });
  test(`${mode}: zoom/pan preserve focus-plane anchors; portrait framing fits depth`, () => {
    const c = new Camera(),
      n = new CameraNavigation(c);
    c.setProjection(mode);
    for (const view of ["oblique", "front", "side", "top"]) {
      c.preset(view);
      const p = n.point(85, 155, 412, 700);
      n.zoom(0.65, 85, 155, 412, 700);
      n.point(85, 155, 412, 700).forEach((v, i) => close(v, p[i]));
      const before = c.project({ x: p[0], y: p[1], z: p[2] }, 412, 700);
      n.pan(33, -17, 412, 700);
      const after = c.project({ x: p[0], y: p[1], z: p[2] }, 412, 700);
      close(after.x - before.x, 33);
      close(after.y - before.y, -17);
    }
    c.preset("oblique");
    const bounds = { min: [-10, -15, -3], max: [20, 4, 24] };
    n.frame(bounds, 412, 700);
    for (const x of [-10, 20])
      for (const y of [-15, 4])
        for (const z of [-3, 24])
          assert.ok(c.project({ x, y, z }, 412, 700).visible);
    const pose = n.snapshot();
    n.orbit(40, 30);
    n.zoom(2, 100, 200, 412, 700);
    c.setProjection(mode === "perspective" ? "orthographic" : "perspective");
    n.restore(pose);
    assert.deepEqual(n.snapshot(), pose);
  });
}
test("Perspective near/far, behind-eye rejection, conservative near-plane overlap and clipped picking", () => {
  const c = new Camera();
  c.setProjection("perspective");
  c.preset("front");
  Object.assign(c, { distance: 10, near: 1, far: 30 });
  c.update(1);
  const at = (d) => c.eye.map((v, i) => v - c.back[i] * d);
  for (const [d, visible] of [
    [-2, false],
    [0.5, false],
    [2, true],
    [29, true],
    [32, false],
  ]) {
    const p = at(d);
    assert.equal(c.sphereVisible(...p, 0.01), visible);
    assert.equal(
      c.project({ x: p[0], y: p[1], z: p[2] }, 600, 600).visible,
      visible,
    );
  }
  assert.ok(c.sphereVisible(...at(0.9), 0.3));
  assert.equal(c.sphereVisible(100, 0, 0, 1), false);
  const ray = c.ray(300, 300, 600, 600),
    box = (d) => {
      const p = at(d);
      return {
        pose: { x: p[0], y: p[1], z: p[2], rotation: [0, 0, 0, 1], scale: 1 },
        shape: { size: [0.2, 0.2, 0.2] },
      };
    };
  assert.equal(rayBox(ray, box(40)), null);
  assert.equal(rayBox(ray, box(0.3)), null);
  assert.ok(rayBox(ray, box(5)) > 0);
  close(
    c.worldUnitsPerPixel(at(20), 600) / c.worldUnitsPerPixel(at(10), 600),
    2,
  );
  c.elevation = -0.3;
  assert.equal(c.ground(300, 300, 600, 600, -20), null);
});
test("Lens switching preserves pivot-plane scale and validates projection names", () => {
  const c = new Camera();
  c.update(1);
  const size = c.focusHalfHeight;
  c.setProjection("perspective");
  close(c.focusHalfHeight, size);
  c.setProjection("orthographic");
  close(c.halfHeight, size);
  assert.throws(() => c.setProjection("fish"), /projection/);
});

test("Perspective editor markers reject clipped lights and rings share depth-aware draw/pick geometry", async () => {
  const { AuthoringGuides, rotationRing, ringAngle } = await import(
    "../engine/penthouse/authoring-guides.js"
  );
  const c = new Camera();
  c.setProjection("perspective");
  c.preset("top");
  c.distance = 20;
  c.update(1);
  const guides = new AuthoringGuides({ camera: c });
  const near = { id: "near", position: [0, 0, 2] },
    behind = { id: "behind", position: [0, 0, 22] };
  assert.equal(
    guides.pickLight({ lights: [near, behind] }, 300, 300, 600, 600),
    near,
  );
  assert.equal(
    guides.pickLight({ lights: [behind] }, 300, 300, 600, 600),
    null,
  );
  const entity = { position: [0, 0, 2], rotation: [0, 0, 0, 1] },
    ring = rotationRing(c, entity, "z", "world", 600);
  const point = ring.center.map((n, i) => n + ring.basis[0][i] * ring.radius),
    pixel = c.project({ x: point[0], y: point[1], z: point[2] }, 600, 600);
  close(Math.hypot(pixel.x - 300, pixel.y - 300), 48);
  const hit = ringAngle(ring, c.ray(pixel.x, pixel.y, 600, 600));
  close(hit.radius, ring.radius);
  close(hit.angle, 0);
  assert.equal(
    ringAngle(ring, { ...c.ray(pixel.x, pixel.y, 600, 600), maxDistance: 1 }),
    null,
  );
});
