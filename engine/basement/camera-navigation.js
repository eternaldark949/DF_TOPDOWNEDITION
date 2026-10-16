/** Basement / camera navigation mathematics. No DOM, input devices or scheduling.
 * Focus is the orbit pivot. Pan and zoom use its view plane, so front/side views remain
 * usable without trying to intersect a parallel ground plane. Units are metres/radians. */
export class CameraNavigation {
  /** Zoom limits protect close inspection and finite scene coverage without allocating targets. */
  constructor(
    camera,
    { minZoom = 0.25, maxZoom = 200, orbitSpeed = 0.006 } = {},
  ) {
    this.camera = camera;
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.orbitSpeed = orbitSpeed;
  }
  /** Copy only navigation fields; never serialize camera matrices or methods. */
  snapshot() {
    return this.camera.snapshot();
  }
  restore(pose) {
    Object.assign(this.camera, pose);
  }
  /** A point on the pivot's view plane under a surface-relative CSS coordinate. */
  point(x, y, width, height) {
    const c = this.camera;
    c.update(width / height);
    const sx = ((x - width / 2) * 2 * c.focusHalfHeight) / height,
      sy = ((height / 2 - y) * 2 * c.focusHalfHeight) / height;
    return [
      c.x + c.right[0] * sx + c.up[0] * sy,
      c.y + c.right[1] * sx + c.up[1] * sy,
      c.z + c.up[2] * sy,
    ];
  }
  /** Dragging the image right/down moves its contents with the pointer, at any view angle. */
  pan(dx, dy, width, height) {
    const c = this.camera;
    c.update(width / height);
    const scale = (2 * c.focusHalfHeight) / height;
    for (const [i, key] of ["x", "y", "z"].entries())
      c[key] += (-c.right[i] * dx + c.up[i] * dy) * scale;
  }
  /** Preserve the focus-plane point under the cursor while resizing or dollying. */
  zoom(factor, x, y, width, height) {
    const c = this.camera,
      before = this.point(x, y, width, height);
    const size = Math.max(
      this.minZoom,
      Math.min(this.maxZoom, c.focusHalfHeight * factor),
    );
    if (c.projection === "perspective") c.distance = size / Math.tan(c.fov / 2);
    else c.halfHeight = size;
    const after = this.point(x, y, width, height);
    for (const [i, key] of ["x", "y", "z"].entries())
      c[key] += before[i] - after[i];
  }
  /** Yaw wraps to avoid growing angles; a small pole margin prevents an inverted drag basis. */
  orbit(dx, dy) {
    const c = this.camera;
    c.azimuth = Math.atan2(
      Math.sin(c.azimuth - dx * this.orbitSpeed),
      Math.cos(c.azimuth - dx * this.orbitSpeed),
    );
    c.elevation = Math.max(
      -Math.PI / 2 + 0.005,
      Math.min(Math.PI / 2 - 0.005, c.elevation + dy * this.orbitSpeed),
    );
  }
  /** Fit all eight AABB corners in the current view, including a configurable breathing margin. */
  frame(bounds, width, height, padding = 1.15) {
    if (!bounds) return;
    const c = this.camera;
    [c.x, c.y, c.z] = bounds.min.map((n, i) => (n + bounds.max[i]) / 2);
    c.update(width / height);
    let sx = 0,
      sy = 0,
      distance = 0;
    for (const x of [bounds.min[0], bounds.max[0]])
      for (const y of [bounds.min[1], bounds.max[1]])
        for (const z of [bounds.min[2], bounds.max[2]]) {
          const d = [x - c.x, y - c.y, z - c.z];
          // Each corner has its own view depth; a flat screen-space fit can clip the near side.
          const right = Math.abs(d.reduce((n, v, i) => n + v * c.right[i], 0));
          const up = Math.abs(d.reduce((n, v, i) => n + v * c.up[i], 0));
          const back = d.reduce((n, v, i) => n + v * c.back[i], 0);
          distance = Math.max(
            distance,
            back +
              Math.max(
                c.near,
                (Math.max(up, (right * height) / width) * padding) /
                  Math.tan(c.fov / 2),
              ),
          );

          sx = Math.max(
            sx,
            Math.abs(d.reduce((n, v, i) => n + v * c.right[i], 0)),
          );
          sy = Math.max(
            sy,
            Math.abs(d.reduce((n, v, i) => n + v * c.up[i], 0)),
          );
        }
    if (c.projection === "perspective") {
      c.distance = Math.max(c.near * 2, distance);
      return;
    }
    c.halfHeight = Math.max(
      this.minZoom,
      Math.min(this.maxZoom, Math.max(sy, (sx * height) / width) * padding),
    );
  }
}
