/**
 * Basement / skeleton: joint hierarchies, rest poses and the per-instance skinning palette.
 *
 * A Skeleton is immutable shared data (one per rig asset). A SkeletonPose is one figure's
 * mutable joint state; each posed figure owns its own pose, while every figure of that rig
 * shares the skeleton. Nothing here schedules work, reads input or touches the GPU: callers
 * set joint rotations (normally during the Lobby's animate phase), call update(), and the
 * renderer reads `palette` when it packs the entity.
 *
 * Conventions (shared with world.js and rotation.js):
 *   - z-up, metres, unit quaternions [x, y, z, w].
 *   - Joint transforms are rigid: a rotation and a translation relative to the parent.
 *     There is no joint scale, so normals need no inverse-transpose.
 *   - Joints are listed parent before child, so one forward pass resolves the hierarchy.
 *   - Affine matrices are 12 floats, three rows of [r0 r1 r2 t] (row-major 3×4). The
 *     palette uploads those rows unchanged as three RGBA texels per joint (skinning.js).
 *
 * Stage-1 limit: poses change joint rotations only. Joint translations stay at rest, which
 * is what makes mesh reach bounds (mesh.js) conservative. Root motion belongs to the entity.
 */

/** Joint budget per skeleton. Bounded by the palette texture width (3 texels per joint). */
export const MAX_JOINTS = 64;

/** Write the rigid transform (rotation q, translation t) into a 3×4 row-major matrix. */
export function affineFromRotation(q, t, out, offset = 0) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  out[offset] = 1 - 2 * (yy + zz); out[offset + 1] = 2 * (xy - wz); out[offset + 2] = 2 * (xz + wy); out[offset + 3] = t[0];
  out[offset + 4] = 2 * (xy + wz); out[offset + 5] = 1 - 2 * (xx + zz); out[offset + 6] = 2 * (yz - wx); out[offset + 7] = t[1];
  out[offset + 8] = 2 * (xz - wy); out[offset + 9] = 2 * (yz + wx); out[offset + 10] = 1 - 2 * (xx + yy); out[offset + 11] = t[2];
  return out;
}

/** out = a × b for 3×4 affine matrices stored at offsets. out may not alias a or b. */
export function multiplyAffine(a, ao, b, bo, out, oo) {
  for (let r = 0; r < 3; r++) {
    const i = ao + r * 4, o = oo + r * 4;
    for (let c = 0; c < 4; c++)
      out[o + c] = a[i] * b[bo + c] + a[i + 1] * b[bo + 4 + c] + a[i + 2] * b[bo + 8 + c] + (c === 3 ? a[i + 3] : 0);
  }
  return out;
}

/** Inverse of a rigid 3×4 transform: transpose the rotation, rotate the negated translation. */
export function invertRigid(m, mo, out, oo) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[oo + r * 4 + c] = m[mo + c * 4 + r];
  for (let r = 0; r < 3; r++)
    out[oo + r * 4 + 3] = -(out[oo + r * 4] * m[mo + 3] + out[oo + r * 4 + 1] * m[mo + 7] + out[oo + r * 4 + 2] * m[mo + 11]);
  return out;
}

const finiteList = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);

/**
 * Validate and freeze a skeleton:
 *   { joints: [{ name, parent: index | null, translation: [x,y,z], rotation?: [x,y,z,w] }] }
 * `translation` and `rotation` are the rest transform relative to the parent (or to the
 * mesh origin for a root). Several roots are allowed. Returns frozen typed arrays plus the
 * rest-pose world matrices and their inverses (the bind matrices skinning undoes).
 */
export function createSkeleton({ joints } = {}) {
  if (!Array.isArray(joints) || !joints.length || joints.length > MAX_JOINTS) throw new RangeError(`Skeleton needs 1–${MAX_JOINTS} joints`);
  const count = joints.length,
    names = new Map(),
    parents = new Int16Array(count),
    translations = new Float32Array(count * 3),
    rotations = new Float32Array(count * 4),
    rest = new Float64Array(count * 12),
    inverseBind = new Float32Array(count * 12),
    scratch = new Float64Array(12),
    inverse = new Float64Array(12);
  joints.forEach((joint, i) => {
    const where = `Joint ${joint?.name ?? i}`;
    if (typeof joint?.name !== "string" || !joint.name.length || joint.name.length > 60) throw new Error(`${where}: name must contain 1–60 characters`);
    if (names.has(joint.name)) throw new Error(`Duplicate joint name ${joint.name}`);
    const parent = joint.parent ?? null;
    if (parent !== null && !(Number.isInteger(parent) && parent >= 0 && parent < i)) throw new Error(`${where}: parent must be an earlier joint index`);
    if (!finiteList(joint.translation, 3)) throw new RangeError(`${where}: translation needs three finite values`);
    const rotation = joint.rotation ?? [0, 0, 0, 1];
    if (!finiteList(rotation, 4) || Math.abs(Math.hypot(...rotation) - 1) > 0.001) throw new RangeError(`${where}: rotation must be a unit quaternion`);
    names.set(joint.name, i);
    parents[i] = parent ?? -1;
    translations.set(joint.translation, i * 3);
    rotations.set(rotation, i * 4);
    // Rest world matrix = parent's rest world × this joint's rest local.
    affineFromRotation(rotation, joint.translation, scratch, 0);
    if (parent === null) rest.set(scratch, i * 12);
    else multiplyAffine(rest, parent * 12, scratch, 0, rest, i * 12);
    invertRigid(rest, i * 12, inverse, 0);
    inverseBind.set(inverse, i * 12);
  });
  return Object.freeze({
    count,
    names,
    jointNames: Object.freeze(joints.map((j) => j.name)),
    parents,
    translations,
    rotations,
    rest: Float32Array.from(rest),
    inverseBind,
  });
}

/** Rest-pose world position of a joint (metres, in the mesh's frame). */
export function jointRestPosition(skeleton, index) {
  const m = skeleton.rest, o = index * 12;
  return [m[o + 3], m[o + 7], m[o + 11]];
}

/**
 * One figure's pose of a shared skeleton. All storage is allocated here, once; update()
 * allocates nothing, so posing every frame creates no garbage.
 *   local   rotations relative to the parent (start at rest)
 *   world   resolved joint transforms in the mesh frame (3×4 each)
 *   palette world × inverse bind: what the vertex shader blends (3×4 each, Float32)
 * `revision` increases only when the palette's Float32 values actually change, so the
 * renderer re-uploads and shadow caches refresh only for figures that moved.
 */
export class SkeletonPose {
  constructor(skeleton) {
    if (!skeleton?.inverseBind) throw new TypeError("SkeletonPose needs a skeleton from createSkeleton()");
    this.skeleton = skeleton;
    this.local = Float64Array.from(skeleton.rotations);
    this.world = new Float64Array(skeleton.count * 12);
    this.palette = new Float32Array(skeleton.count * 12);
    this.scratch = new Float64Array(12);
    this.product = new Float64Array(12);
    this.revision = 0;
    this.update();
  }

  /** Joint index by name; throws for unknown names so typos fail loudly. */
  joint(name) {
    const index = this.skeleton.names.get(name);
    if (index === undefined) throw new Error(`Unknown joint ${name}`);
    return index;
  }

  /** Set a joint's local rotation outright (a unit quaternion relative to its parent). */
  setRotation(index, q) {
    if (!(index >= 0 && index < this.skeleton.count)) throw new RangeError("Joint index out of range");
    const length = Math.hypot(q[0], q[1], q[2], q[3]);
    if (!(Math.abs(length - 1) < 0.01)) throw new RangeError("Joint rotation must be a unit quaternion");
    for (let i = 0; i < 4; i++) this.local[index * 4 + i] = q[i] / length;
    return this;
  }

  /**
   * Rotate a joint away from its rest rotation by `angle` radians about a local axis
   * (normalised here). Rest × delta, so the axis is in the joint's own rest frame.
   */
  bend(index, axis, angle) {
    const length = Math.hypot(axis[0], axis[1], axis[2]);
    if (!(length > 0) || !Number.isFinite(angle)) throw new RangeError("Bend needs a non-zero axis and a finite angle");
    const s = Math.sin(angle / 2) / length, b = [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
    const r = this.skeleton.rotations, o = index * 4, [x, y, z, w] = [r[o], r[o + 1], r[o + 2], r[o + 3]];
    // Hamilton product rest × delta (same order as rotation.js multiplyRotation).
    return this.setRotation(index, [w * b[0] + x * b[3] + y * b[2] - z * b[1], w * b[1] - x * b[2] + y * b[3] + z * b[0], w * b[2] + x * b[1] - y * b[0] + z * b[3], w * b[3] - x * b[0] - y * b[1] - z * b[2]]);
  }

  /** Return every joint to its rest rotation. */
  reset() {
    this.local.set(this.skeleton.rotations);
    return this;
  }

  /** Resolve world transforms and the palette. Returns whether the palette changed. */
  update() {
    const s = this.skeleton, local = this.scratch, product = this.product, t = [0, 0, 0], q = [0, 0, 0, 1];
    let changed = false;
    for (let i = 0; i < s.count; i++) {
      for (let k = 0; k < 4; k++) q[k] = this.local[i * 4 + k];
      for (let k = 0; k < 3; k++) t[k] = s.translations[i * 3 + k];
      affineFromRotation(q, t, local, 0);
      const parent = s.parents[i];
      if (parent < 0) this.world.set(local, i * 12);
      else multiplyAffine(this.world, parent * 12, local, 0, this.world, i * 12);
      multiplyAffine(this.world, i * 12, s.inverseBind, i * 12, product, 0);
      for (let k = 0; k < 12; k++) {
        const value = Math.fround(product[k]);
        if (this.palette[i * 12 + k] !== value) { this.palette[i * 12 + k] = value; changed = true; }
      }
    }
    if (changed) this.revision++;
    return changed;
  }
}
