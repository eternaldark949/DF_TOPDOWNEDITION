/** Navigation invariants independent of pointer rate, pixel ratio, or editor application. */
import test from "node:test";
import assert from "node:assert/strict";
import { Camera } from "../engine/basement/camera.js";
import { CameraNavigation } from "../engine/basement/camera-navigation.js";
import { worldBounds } from "../engine/basement/asset-bounds.js";
import { World, Identities } from "../engine/basement/world.js";
import { eulerRotation } from "../engine/basement/rotation.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);
test("Cursor anchored zoom and view-plane pan work in oblique, front, side and top views", () => {
  for (const view of ["oblique", "front", "side", "top"]) {
    const c = new Camera(),
      n = new CameraNavigation(c);
    c.preset(view);
    const p = n.point(63, 81, 800, 600);
    n.zoom(0.4, 63, 81, 800, 600);
    n.point(63, 81, 800, 600).forEach((v, i) => close(v, p[i]));
    const before = c.project({ x: p[0], y: p[1], z: p[2] }, 800, 600);
    n.pan(75, -24, 800, 600);
    const after = c.project({ x: p[0], y: p[1], z: p[2] }, 800, 600);
    close(after.x - before.x, 75);
    close(after.y - before.y, -24);
  }
});
test("Frame fits transformed geometry and preserves orbit orientation", () => {
  const world = new World("bounds", new Identities()),
    root = world.create({
      x: 12,
      y: -5,
      z: 3,
      rotation: eulerRotation(0.4, 0.6, 0.3),
      scale: 2,
    }),
    part = world.create({ parent: root, x: 2, shape: { size: [2, 3, 5] } });
  world.snapshot();
  const bounds = worldBounds(world, new Set([part.id])),
    c = new Camera(),
    n = new CameraNavigation(c),
    az = c.azimuth,
    elev = c.elevation;
  n.frame(bounds, 412, 700);
  assert.equal(c.azimuth, az);
  assert.equal(c.elevation, elev);
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const p = c.project({ x, y, z }, 412, 700);
        assert.ok(p.x > 0 && p.x < 412 && p.y > 0 && p.y < 700);
      }
  world.dispose();
});
test("Orbit and zoom remain finite at poles/limits; cancellation restores only camera state", () => {
  const c = new Camera(),
    n = new CameraNavigation(c),
    start = n.snapshot();
  n.orbit(1e6, 1e6);
  assert.ok(c.elevation < Math.PI / 2);
  assert.ok(Math.abs(c.azimuth) <= Math.PI);
  n.zoom(0.00000001, 0, 0, 800, 600);
  assert.equal(c.halfHeight, 0.25);
  n.zoom(1e10, 0, 0, 800, 600);
  assert.equal(c.halfHeight, 200);
  n.restore(start);
  assert.deepEqual(n.snapshot(), start);
  assert.ok(c.matrix instanceof Float32Array);
});

/** Constructor rejection and normal disposal both remove listeners/subscriptions exactly once. */
test("Navigation ownership cleans a rejected subscription and repeated disposal", async () => {
  const { ViewportNavigation } = await import(
    "../engine/penthouse/viewport-navigation.js"
  );
  class Target extends EventTarget {
    constructor() {
      super();
      this.listeners = new Set();
    }
    addEventListener(type, fn, options) {
      super.addEventListener(type, fn, options);
      this.listeners.add(fn);
    }
    removeEventListener(type, fn, options) {
      super.removeEventListener(type, fn, options);
      this.listeners.delete(fn);
    }
    hasPointerCapture() {
      return false;
    }
  }
  const canvas = new Target(),
    host = new Target(),
    camera = new Camera();
  assert.throws(
    () =>
      new ViewportNavigation({
        canvas,
        host,
        camera,
        subscribe: () => {
          throw new Error("Scope budget");
        },
      }),
    /Scope budget/,
  );
  assert.equal(canvas.listeners.size, 0);
  assert.equal(host.listeners.size, 0);
  let removed = 0;
  const nav = new ViewportNavigation({
    canvas,
    host,
    camera,
    subscribe: () => () => removed++,
  });
  nav.dispose();
  nav.dispose();
  assert.equal(removed, 1);
  assert.equal(canvas.listeners.size, 0);
  assert.equal(host.listeners.size, 0);
});
