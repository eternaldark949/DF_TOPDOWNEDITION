/** Basement / shared z-up camera. Focus is the orbit pivot, never an implicit eye.
 * Drawing, clipping, picking and screen-space effects use one view/projection pair.
 * Orthographic remains the default so game presentation does not change in Studio.
 */
const POSE_KEYS = [
  "x",
  "y",
  "z",
  "halfHeight",
  "azimuth",
  "elevation",
  "projection",
  "distance",
  "fov",
  "near",
  "far",
];
export class Camera {
  /** Distances are metres, angles radians; FOV is vertical. Clip settings affect perspective only. */
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.halfHeight = 21;
    this.azimuth = 0;
    this.elevation = Math.atan2(0.65, 0.76);
    this.projection = "orthographic";
    this.fov = (50 * Math.PI) / 180;
    this.distance = this.halfHeight / Math.tan(this.fov / 2);
    this.near = 0.1;
    this.far = 1000;
    this.matrix = new Float32Array(16);
    this.inverse = new Float32Array(16);
    this.right = [1, 0, 0];
    this.up = [0, 0.65, 0.76];
    this.back = [0, -0.76, 0.65];
    this.planes = new Float32Array(24);
    this.eye = [0, 0, 0];
    this.projectionScale = [1, 1];
  }
  /** One complete pose contract for navigation cancellation and edit/Play isolation. */
  snapshot() {
    return Object.fromEntries(POSE_KEYS.map((key) => [key, this[key]]));
  }
  /** Switch lenses without changing the apparent size on the focus plane. */
  setProjection(mode) {
    if (!["orthographic", "perspective"].includes(mode))
      throw new Error("Unknown camera projection");
    if (mode === this.projection) return;
    if (mode === "perspective")
      this.distance = this.halfHeight / Math.tan(this.fov / 2);
    else this.halfHeight = this.focusHalfHeight;
    this.projection = mode;
  }
  get focusHalfHeight() {
    return this.projection === "perspective"
      ? this.distance * Math.tan(this.fov / 2)
      : this.halfHeight;
  }
  /** Basis and exact analytical inverse: no general matrix inversion. */
  update(aspect) {
    const c = Math.cos(this.azimuth),
      s = Math.sin(this.azimuth),
      e = Math.sin(this.elevation),
      f = Math.cos(this.elevation);
    const r = this.right,
      u = this.up,
      b = this.back,
      m = this.matrix,
      v = this.inverse;
    r[0] = c;
    r[1] = s;
    r[2] = 0;
    u[0] = -s * e;
    u[1] = c * e;
    u[2] = f;
    b[0] = s * f;
    b[1] = -c * f;
    b[2] = e;
    const focus = [this.x, this.y, this.z];
    if (this.projection === "perspective") {
      const sy = 1 / Math.tan(this.fov / 2),
        sx = sy / aspect,
        A = -(this.far + this.near) / (this.far - this.near),
        B = (-2 * this.far * this.near) / (this.far - this.near);
      this.projectionScale[0] = sx;
      this.projectionScale[1] = sy;
      for (let i = 0; i < 3; i++) this.eye[i] = focus[i] + b[i] * this.distance;
      for (let i = 0; i < 3; i++) {
        m[i * 4] = r[i] * sx;
        m[i * 4 + 1] = u[i] * sy;
        m[i * 4 + 2] = b[i] * A;
        m[i * 4 + 3] = -b[i];
        v[i] = r[i] / sx;
        v[4 + i] = u[i] / sy;
        v[8 + i] = this.eye[i] / B;
        v[12 + i] = (this.eye[i] * A) / B - b[i];
      }
      const dot = (a) => a.reduce((n, t, i) => n + t * this.eye[i], 0);
      m[12] = -dot(r) * sx;
      m[13] = -dot(u) * sy;
      m[14] = B - A * dot(b);
      m[15] = dot(b);
      v[3] = v[7] = 0;
      v[11] = 1 / B;
      v[15] = A / B;
    } else {
      const h = this.halfHeight,
        w = h * aspect;
      this.projectionScale[0] = 1 / w;
      this.projectionScale[1] = 1 / h;
      for (let i = 0; i < 3; i++) {
        this.eye[i] = focus[i] + b[i] * 200;
        m[i * 4] = r[i] / w;
        m[i * 4 + 1] = u[i] / h;
        m[i * 4 + 2] = -b[i] / 200;
        m[i * 4 + 3] = 0;
        v[i] = r[i] * w;
        v[4 + i] = u[i] * h;
        v[8 + i] = -b[i] * 200;
        v[12 + i] = focus[i];
      }
      const dot = (a) => a.reduce((n, t, i) => n + t * focus[i], 0);
      m[12] = -dot(r) / w;
      m[13] = -dot(u) / h;
      m[14] = dot(b) / 200;
      m[15] = 1;
      v[3] = v[7] = v[11] = 0;
      v[15] = 1;
    }
    // Normalize once per camera update, not once per visible instance.
    for (let axis = 0; axis < 3; axis++)
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1,
          offset = (axis * 2 + side) * 4;
        const a = m[3] + sign * m[axis],
          b = m[7] + sign * m[4 + axis],
          c = m[11] + sign * m[8 + axis],
          length = Math.hypot(a, b, c);
        this.planes[offset] = a / length;
        this.planes[offset + 1] = b / length;
        this.planes[offset + 2] = c / length;
        this.planes[offset + 3] = (m[15] + sign * m[12 + axis]) / length;
      }
  }
  /** Named orientations preserve projection, pivot and distance. */
  preset(name) {
    const views = {
      oblique: [0, Math.atan2(0.65, 0.76)],
      top: [0, Math.PI / 2],
      front: [0, 0],
      side: [Math.PI / 2, 0],
    };
    if (!views[name]) throw new Error("Unknown camera view");
    [this.azimuth, this.elevation] = views[name];
  }
  /** Homogeneous unprojection is also the reference for depth reconstruction tests. */
  unproject(x, y, z) {
    // CPU queries use double precision; GPU uniforms remain Float32. Avoid subtracting
    // nearly equal inverse-matrix terms at kilometre-scale far planes during picking.
    if (this.projection === "perspective") {
      const depth =
        (2 * this.far * this.near) /
        (this.far + this.near - z * (this.far - this.near));
      return [0, 1, 2].map(
        (i) =>
          this.eye[i] +
          depth *
            ((this.right[i] * x) / this.projectionScale[0] +
              (this.up[i] * y) / this.projectionScale[1] -
              this.back[i]),
      );
    }
    const focus = [this.x, this.y, this.z];
    return focus.map(
      (n, i) =>
        n +
        (this.right[i] * x) / this.projectionScale[0] +
        (this.up[i] * y) / this.projectionScale[1] -
        this.back[i] * z * 200,
    );
  }

  /** Clipped ray starts at the near plane. maxDistance excludes invisible far-plane objects. */
  ray(x, y, width, height) {
    this.update(width / height);
    const nx = (x / width) * 2 - 1,
      ny = 1 - (y / height) * 2;
    const origin = this.unproject(nx, ny, -1),
      end = this.unproject(nx, ny, 1),
      direction = end.map((n, i) => n - origin[i]),
      maxDistance = Math.hypot(...direction);
    return {
      origin,
      direction: direction.map((n) => n / maxDistance),
      maxDistance,
    };
  }
  /** Reject parallel, behind-camera and beyond-far construction-plane intersections. */
  ground(x, y, width, height, z = 0) {
    const ray = this.ray(x, y, width, height);
    if (Math.abs(ray.direction[2]) < 1e-6) return null;
    const t = (z - ray.origin[2]) / ray.direction[2];
    if (t < 0 || t > ray.maxDistance) return null;
    return {
      x: ray.origin[0] + t * ray.direction[0],
      y: ray.origin[1] + t * ray.direction[1],
      z,
    };
  }
  /** CSS projection plus clipping information for foreground editor markers. */
  project(p, width, height) {
    this.update(width / height);
    const d = [p.x - this.x, p.y - this.y, p.z - this.z],
      dot = (a) => a.reduce((n, t, i) => n + t * d[i], 0);
    const depth =
      this.projection === "perspective" ? this.distance - dot(this.back) : 1;
    const x = (dot(this.right) * this.projectionScale[0]) / depth,
      y = (dot(this.up) * this.projectionScale[1]) / depth;
    const z =
      this.projection === "perspective"
        ? (this.far + this.near) / (this.far - this.near) -
          (2 * this.far * this.near) / ((this.far - this.near) * depth)
        : -dot(this.back) / 200;
    return {
      x: ((x + 1) * width) / 2,
      y: ((1 - y) * height) / 2,
      depth: z,
      visible:
        depth > 0 && Math.abs(x) <= 1 && Math.abs(y) <= 1 && Math.abs(z) <= 1,
    };
  }

  /** World length represented by one CSS pixel at this point's view depth. */
  worldUnitsPerPixel(point, height) {
    if (this.projection !== "perspective")
      return (this.halfHeight * 2) / height;
    const d =
      this.distance -
      ((point[0] - this.x) * this.back[0] +
        (point[1] - this.y) * this.back[1] +
        (point[2] - this.z) * this.back[2]);
    return (Math.max(this.near, d) * 2 * Math.tan(this.fov / 2)) / height;
  }
  /** Conservative six-plane sphere test. Shadow casters deliberately do not use this. */
  sphereVisible(x, y, z, radius) {
    const p = this.planes;
    for (let i = 0; i < 24; i += 4)
      if (p[i] * x + p[i + 1] * y + p[i + 2] * z + p[i + 3] < -radius)
        return false;
    return true;
  }
}
