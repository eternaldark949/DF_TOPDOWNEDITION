/**
 * Penthouse / reusable native WebGL authoring guides. No DOM IDs, scheduler or game
 * names. The application supplies scene/selection/preferences and owns this lifetime.
 * Grid/axes are depth-tested; markers, selection bounds and the dial are foreground
 * guides, never world entities.
 */
import {
  rotationAxis,
  planeBasis,
  rayPlane,
} from "../basement/rotation-gesture.js";

/** World-space rotation ring: fixed CSS size, actual axis plane, shared hit/draw geometry. */
export function rotationRing(camera, entity, axis, space, height) {
  const normal = rotationAxis(entity.rotation, axis, space),
    basis = planeBasis(normal);
  return {
    center: entity.position,
    normal,
    basis,
    radius: camera.worldUnitsPerPixel(entity.position, height) * 48,
  };
}
/** Angular coordinate in the ring's plane; null when the view is nearly edge-on. */
export function ringAngle(ring, ray) {
  const hit = rayPlane(ray, ring.center, ring.normal);
  if (!hit) return null;
  const delta = hit.map((n, i) => n - ring.center[i]);
  return {
    angle: Math.atan2(
      delta.reduce((n, v, i) => n + v * ring.basis[1][i], 0),
      delta.reduce((n, v, i) => n + v * ring.basis[0][i], 0),
    ),
    radius: Math.hypot(...delta),
  };
}
export class AuthoringGuides {
  /** Preference data stays with Studio; these resources only represent the current view. */
  constructor(renderer) {
    this.renderer = renderer;
    this.grid = null;
    this.widgets = null;
    this.key = "";
    this.groundKey = "";
    this.boundsKey = "";
    this.bounds = null;
  }
  /** Return explicit passes for Renderer.render; no work or resource allocation in Play. */
  layersFor({
    scene,
    selected,
    revision,
    mode,
    axis,
    space,
    grid,
    lights,
    axes = false,
    outlines = false,
    selectionBounds = null,
  }) {
    const r = this.renderer;
    if (r.lost) return [];
    // A newly opened document can reuse scene IDs/revision zero; object identity invalidates it.
    if (this.scene !== scene) {
      this.scene = scene;
      this.key = "";
      this.boundsKey = "";
      this.bounds = null;
    }
    if (!grid && !axes && this.grid) {
      this.grid.dispose();
      this.grid = null;
      this.groundKey = "";
    }
    const groundKey = String(grid) + "/" + axes;
    if ((grid || axes) && (!this.grid || this.groundKey !== groundKey)) {
      if (!this.grid) this.grid = r.lines.create(1024);
      this.grid.begin();
      if (grid)
        for (let n = -30; n <= 30; n++) {
          const color =
            n === 0
              ? [0.72, 0.5, 0.25, 0.75]
              : n % 5 === 0
                ? [0.72, 0.56, 0.34, 0.3]
                : [0.72, 0.56, 0.34, 0.12];
          this.grid.segment([n, -30, 0.065], [n, 30, 0.065], color);
          this.grid.segment([-30, n, 0.065], [30, n, 0.065], color);
        }
      // World axes are six metres from the origin, independent of grid visibility.
      // They share the bounded depth-tested guide layer, never World/collider geometry.
      if (axes) {
        const start = [0, 0, 0.07];
        for (const [end, color] of [
          [
            [6, 0, 0.07],
            [1, 0.35, 0.3, 0.95],
          ],
          [
            [0, 6, 0.07],
            [0.35, 0.9, 0.55, 0.95],
          ],
          [
            [0, 0, 6.07],
            [0.65, 0.5, 1, 0.95],
          ],
        ])
          this.grid.segment(start, end, color);
      }
      this.grid.end();
      this.groundKey = groundKey;
    }
    const target = scene.entities.find((e) => e.id === selected),
      dial = mode === "rotate" && target && !target.locked;
    const outline = outlines && target && selectionBounds;
    if (!lights && !dial && !outline) {
      if (this.widgets) this.widgets.dispose();
      this.widgets = null;
      this.key = "";
      return this.grid ? [this.grid] : [];
    }
    const camera = r.camera,
      h = r.canvas.clientHeight;
    const key = [
      scene.id,
      revision,
      selected,
      mode,
      axis,
      space,
      lights,
      !!outline,
      // Only screen-sized markers/dials depend on camera pose. A world-space
      // selection box keeps its buffer unchanged while the camera moves.
      ...(lights || dial
        ? [
            camera.x,
            camera.y,
            camera.z,
            camera.azimuth,
            camera.elevation,
            camera.halfHeight,
            camera.projection,
            camera.distance,
            camera.fov,
            camera.near,
            camera.far,
            r.canvas.clientWidth,
            h,
          ]
        : []),
    ].join("/");
    if (!this.widgets) {
      this.widgets = r.lines.create(1024, { depthTest: false });
      this.key = "";
    }
    if (key !== this.key) {
      camera.update(r.canvas.clientWidth / h);
      this.widgets.begin();
      if (outline) {
        // Resolve actual world-shape bounds only when document/selection changes. Camera
        // motion can rebuild screen-sized widgets without rescanning the selected assembly.
        const boundsKey = [scene.id, revision, selected].join("/");
        if (this.boundsKey !== boundsKey) {
          this.bounds = selectionBounds();
          this.boundsKey = boundsKey;
        }
        if (this.bounds) {
          const { min, max } = this.bounds,
            corners = [];
          for (let n = 0; n < 8; n++)
            corners.push(
              [0, 1, 2].map((i) => (n & (1 << i) ? max[i] : min[i])),
            );
          for (let n = 0; n < 8; n++)
            for (let i = 0; i < 3; i++)
              if (!(n & (1 << i)))
                this.widgets.segment(
                  corners[n],
                  corners[n | (1 << i)],
                  [1, 0.85, 0.48, 0.95],
                );
        }
      }
      if (lights)
        for (const light of scene.lights) {
          const color =
              light.id === selected
                ? [1, 0.92, 0.63, 1]
                : [0.91, 0.68, 0.32, 0.95],
            center = light.position;
          const pixel = camera.worldUnitsPerPixel(center, h);
          if (
            !camera.project(
              { x: center[0], y: center[1], z: center[2] },
              r.canvas.clientWidth,
              h,
            ).visible
          )
            continue;
          const p = (x, y) =>
            center.map(
              (v, i) => v + pixel * (camera.right[i] * x + camera.up[i] * y),
            );
          for (const [a, b] of [
            [
              [0, 8],
              [7, 0],
            ],
            [
              [7, 0],
              [0, -8],
            ],
            [
              [0, -8],
              [-7, 0],
            ],
            [
              [-7, 0],
              [0, 8],
            ],
            [
              [-3, 0],
              [3, 0],
            ],
            [
              [0, -3],
              [0, 3],
            ],
          ])
            this.widgets.segment(p(...a), p(...b), color);
        }
      if (dial) {
        const ring = rotationRing(camera, target, axis, space, h),
          color =
            axis === "x"
              ? [1, 0.42, 0.36, 1]
              : axis === "y"
                ? [0.45, 0.9, 0.67, 1]
                : [0.87, 0.7, 1, 1];
        const p = (angle) =>
          ring.center.map(
            (v, i) =>
              v +
              ring.radius *
                (Math.cos(angle) * ring.basis[0][i] +
                  Math.sin(angle) * ring.basis[1][i]),
          );
        for (let i = 0; i < 72; i++)
          this.widgets.segment(
            p((i * Math.PI) / 36),
            p(((i + 1) * Math.PI) / 36),
            color,
          );
        for (let i = 0; i < 12; i++) {
          const angle = (i * Math.PI) / 6,
            a = p(angle),
            b = a.map((v, j) => v + (a[j] - ring.center[j]) * 0.12);
          this.widgets.segment(a, b, color);
        }
      }
      this.widgets.end();
      this.key = key;
    }
    return [this.grid, this.widgets].filter(Boolean);
  }
  /** Pick readable light icons in CSS pixels, independently of physical geometry/collision. */
  pickLight(scene, x, y, width, height) {
    const camera = this.renderer.camera;
    let closest = null,
      distance = 22 * 22;
    for (const light of scene.lights) {
      const [px, py, pz] = light.position,
        p = camera.project({ x: px, y: py, z: pz }, width, height),
        d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (p.visible && d < distance) {
        distance = d;
        closest = light;
      }
    }
    return closest;
  }
  /** Hidden guides release all buffers/VAOs and their shared program ownership immediately. */
  clear() {
    this.grid?.dispose();
    this.widgets?.dispose();
    this.grid = this.widgets = null;
    this.key = this.groundKey = this.boundsKey = "";
    this.bounds = null;
    this.scene = null;
  }
  dispose() {
    this.clear();
  }
}
