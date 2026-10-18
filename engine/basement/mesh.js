/**
 * Basement / mesh: validated triangle meshes in the engine's one skinned vertex format.
 *
 * A MeshData is immutable CPU data: the interleaved vertex bytes the GPU receives, the
 * index list, bounds, and (for a skinned mesh) the skeleton it is bound to. It owns no GL
 * handle; the renderer turns it into a GpuMesh (gpu-mesh.js) and the Directory leases that
 * (directory/mesh-library.js). Authored mesh documents and generated bodies both end here.
 *
 * Vertex format, 32 bytes, shared by rigid and skinned meshes:
 *   bytes  0–11  position  3 × float32, metres in the mesh frame (z-up)
 *   bytes 12–23  normal    3 × float32, unit length
 *   bytes 24–27  joints    4 × uint8, skeleton joint indices
 *   bytes 28–31  weights   4 × uint8 normalised, summing to exactly 255
 * Rigid meshes store joint 0 with weight 255; the shader ignores both for them.
 *
 * Reach: culling must contain every pose the mesh can take. With rotation-only poses
 * (skeleton.js), a joint can sit no farther from the mesh origin than the sum of the bone
 * lengths above it, and a vertex no farther than its joint's reach plus its rest distance
 * to that joint. Linear blend skinning places a vertex at a weighted average of those
 * candidates, so the largest one bounds it. `reach` is that bound; `radius` is the rest one.
 */
import { jointRestPosition } from "./skeleton.js";

/** Bytes per vertex in the interleaved buffer. */
export const MESH_STRIDE = 32;
/** Vertex budget per mesh. Above 65,535 vertices indices switch to 32-bit. */
export const MAX_MESH_VERTICES = 262144;

/**
 * Validate and pack a mesh.
 *   positions  Float32Array | number[], 3 per vertex
 *   normals    the same length; computed with computeNormals() when omitted
 *   indices    triangles, 3 per face, counter-clockwise seen from outside
 *   joints     4 per vertex (skinned meshes only), indices into `skeleton`
 *   weights    4 per vertex; any non-negative values, normalised and quantised here
 *   skeleton   from createSkeleton(); presence makes the mesh skinned
 */
export function createMesh({ positions, normals = null, indices, joints = null, weights = null, skeleton = null } = {}) {
  const vertexCount = positions?.length / 3;
  if (!Number.isInteger(vertexCount) || vertexCount < 3 || vertexCount > MAX_MESH_VERTICES) throw new RangeError(`Mesh needs 3–${MAX_MESH_VERTICES} vertices`);
  if (!indices || indices.length < 3 || indices.length % 3) throw new RangeError("Mesh indices must list whole triangles");
  for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i])) throw new RangeError("Mesh positions must be finite");
  for (let i = 0; i < indices.length; i++) if (!Number.isInteger(indices[i]) || indices[i] < 0 || indices[i] >= vertexCount) throw new RangeError("Mesh index out of range");
  normals ??= computeNormals(positions, indices);
  if (normals.length !== positions.length) throw new RangeError("Mesh needs one normal per vertex");
  const skinned = skeleton !== null;
  if (skinned !== (joints !== null) || skinned !== (weights !== null)) throw new Error("A skinned mesh needs joints, weights and a skeleton together");
  if (skinned && (joints.length !== vertexCount * 4 || weights.length !== vertexCount * 4)) throw new RangeError("Skinned meshes need four joints and four weights per vertex");

  const buffer = new ArrayBuffer(vertexCount * MESH_STRIDE),
    floats = new Float32Array(buffer),
    bytes = new Uint8Array(buffer),
    min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  let radius = 0, reach = 0;
  const jointReach = skinned ? skeletonReach(skeleton) : null,
    jointPositions = skinned ? Array.from({ length: skeleton.count }, (_, j) => jointRestPosition(skeleton, j)) : null,
    quantised = [0, 0, 0, 0];
  for (let v = 0; v < vertexCount; v++) {
    const f = (v * MESH_STRIDE) / 4, b = v * MESH_STRIDE;
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    floats[f] = x; floats[f + 1] = y; floats[f + 2] = z;
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2], nl = Math.hypot(nx, ny, nz);
    if (!(nl > 0)) throw new RangeError(`Mesh normal ${v} is zero or not finite`);
    floats[f + 3] = nx / nl; floats[f + 4] = ny / nl; floats[f + 5] = nz / nl;
    for (const [axis, value] of [x, y, z].entries()) { min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value); }
    const rest = Math.hypot(x, y, z);
    radius = Math.max(radius, rest);
    if (!skinned) { bytes[b + 24] = 0; bytes[b + 28] = 255; reach = radius; continue; }
    quantiseWeights(weights, v * 4, quantised);
    for (let i = 0; i < 4; i++) {
      const joint = joints[v * 4 + i];
      if (!Number.isInteger(joint) || joint < 0 || joint >= skeleton.count) throw new RangeError(`Mesh vertex ${v} names joint ${joint}, outside its skeleton`);
      bytes[b + 24 + i] = joint;
      bytes[b + 28 + i] = quantised[i];
      if (quantised[i]) {
        const p = jointPositions[joint];
        reach = Math.max(reach, jointReach[joint] + Math.hypot(x - p[0], y - p[1], z - p[2]));
      }
    }
  }
  const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
  return Object.freeze({
    vertexCount,
    vertices: buffer,
    indices: IndexArray.from(indices),
    indexType: IndexArray === Uint32Array ? "uint32" : "uint16",
    skinned,
    skeleton,
    bounds: Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) }),
    radius,
    reach,
  });
}

/**
 * How far each joint can get from the mesh origin under rotation-only poses: a root stays
 * at its rest offset; a child adds its bone length to its parent's reach.
 */
export function skeletonReach(skeleton) {
  const reach = new Float64Array(skeleton.count), t = skeleton.translations;
  for (let j = 0; j < skeleton.count; j++) {
    const bone = Math.hypot(t[j * 3], t[j * 3 + 1], t[j * 3 + 2]), parent = skeleton.parents[j];
    reach[j] = parent < 0 ? bone : reach[parent] + bone;
  }
  return reach;
}

/**
 * Normalise four weights and quantise them to bytes summing to exactly 255, giving the
 * rounding remainder to the largest weight so a vertex never gains or loses size.
 */
export function quantiseWeights(weights, offset, out) {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const w = weights[offset + i];
    if (!Number.isFinite(w) || w < 0) throw new RangeError("Skin weights must be finite and non-negative");
    sum += w;
  }
  if (!(sum > 0)) throw new RangeError("Every skinned vertex needs a positive weight");
  let total = 0, largest = 0;
  for (let i = 0; i < 4; i++) {
    out[i] = Math.round((weights[offset + i] / sum) * 255);
    total += out[i];
    if (out[i] > out[largest]) largest = i;
  }
  out[largest] += 255 - total;
  return out;
}

/** Area-weighted smooth vertex normals. Hard edges need split vertices in the input. */
export function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    // Cross product length is twice the triangle area: larger faces weigh more.
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { normals[o] += nx; normals[o + 1] += ny; normals[o + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (length > 0) { normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length; }
    else normals[i + 2] = 1; // Isolated vertices get an arbitrary but valid normal.
  }
  return normals;
}

/**
 * Loft builder: skin a tube through a list of cross-section rings. This is the body
 * builder's primitive (each humanoid region becomes rings) and works for any limb, hose
 * or tentacle. Rings are ellipses perpendicular to the path, oriented by parallel
 * transport so the surface does not twist. Ends close with flat caps of their own
 * vertices (a hard edge), and the seam around the tube shares vertices (no crease).
 *   rings  [{ center: [x,y,z], radius: [across, deep], joints?: [4], weights?: [4] }]
 *   around segments around the tube (3–64)
 *   up     reference direction for the ring's "deep" axis at the first ring
 * Returns plain arrays for createMesh(); joints/weights are present only when every ring
 * carries them.
 */
export function loft({ rings, around = 16, capNear = true, capFar = true, up = [0, 1, 0] } = {}) {
  if (!Array.isArray(rings) || rings.length < 2 || rings.length > 1024) throw new RangeError("Loft needs 2–1024 rings");
  if (!Number.isInteger(around) || around < 3 || around > 64) throw new RangeError("Loft needs 3–64 segments around");
  const skinned = rings.every((r) => r.joints && r.weights);
  if (!skinned && rings.some((r) => r.joints || r.weights)) throw new Error("Either every loft ring carries joints and weights, or none does");
  const positions = [], normals = [], indices = [], joints = [], weights = [];
  // Parallel transport: carry the previous ring's side vector onto each new tangent.
  let side = null;
  const frames = rings.map((ring, i) => {
    if (!Array.isArray(ring.center) || ring.center.length !== 3 || !ring.center.every(Number.isFinite)) throw new RangeError(`Loft ring ${i} needs a finite centre`);
    if (!Array.isArray(ring.radius) || ring.radius.length !== 2 || !ring.radius.every((r) => Number.isFinite(r) && r >= 0)) throw new RangeError(`Loft ring ${i} needs two non-negative radii`);
    const prev = rings[Math.max(0, i - 1)].center, next = rings[Math.min(rings.length - 1, i + 1)].center;
    const tangent = normalise([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]);
    if (!tangent) throw new RangeError(`Loft ring ${i} repeats its neighbour's centre`);
    if (!side) side = normalise(cross(up, tangent)) ?? normalise(cross([1, 0, 0], tangent));
    const along = dot(side, tangent);
    side = normalise([side[0] - tangent[0] * along, side[1] - tangent[1] * along, side[2] - tangent[2] * along]) ?? side;
    return { tangent, side, deep: cross(tangent, side) };
  });
  // Append one vertex (position, unit normal and, for skinned lofts, the ring's joints and
  // weights). Returns its index for the triangle lists below.
  const push = (point, normal, ring) => {
    positions.push(...point); normals.push(...normal);
    if (skinned) { joints.push(...ring.joints); weights.push(...ring.weights); }
    return positions.length / 3 - 1;
  };
  rings.forEach((ring, i) => {
    const { side, deep, tangent } = frames[i], [a, b] = ring.radius;
    // Radius slope along the path tilts normals on tapered sections.
    const prev = rings[Math.max(0, i - 1)], next = rings[Math.min(rings.length - 1, i + 1)];
    const span = Math.max(1e-9, distance(prev.center, next.center));
    const slopeA = (next.radius[0] - prev.radius[0]) / span, slopeB = (next.radius[1] - prev.radius[1]) / span;
    for (let j = 0; j < around; j++) {
      const theta = (j / around) * Math.PI * 2, c = Math.cos(theta), s = Math.sin(theta);
      const point = [0, 1, 2].map((k) => ring.center[k] + side[k] * a * c + deep[k] * b * s);
      // Ellipse normal in the ring plane (b·cos, a·sin), tilted by the taper slope.
      const nx = b * c, ny = a * s, inPlane = Math.hypot(nx, ny) || 1, slope = -(slopeA * c * c + slopeB * s * s);
      const normal = normalise([0, 1, 2].map((k) => (side[k] * nx + deep[k] * ny) / inPlane + tangent[k] * slope)) ?? [...side];
      push(point, normal, ring);
    }
  });
  for (let i = 0; i + 1 < rings.length; i++)
    for (let j = 0; j < around; j++) {
      const a = i * around + j, b = i * around + ((j + 1) % around), c = a + around, d = b + around;
      // Counter-clockwise seen from outside: (b − a) × (c − a) points along the ring's radius.
      indices.push(a, b, c, b, d, c);
    }
  // Close one end with a fan: a centre vertex plus a copy of the ring's vertices that
  // carry the flat cap normal, so the rim keeps a hard edge while the tube stays smooth.
  // `flip` marks the near end, whose outward normal points back along the path.
  const cap = (index, flip) => {
    const ring = rings[index], tangent = frames[index].tangent.map((n) => (flip ? -n : n));
    const centre = push(ring.center, tangent, ring), first = positions.length / 3;
    for (let j = 0; j < around; j++) push(positions.slice((index * around + j) * 3, (index * around + j) * 3 + 3), tangent, ring);
    for (let j = 0; j < around; j++) {
      const a = first + j, b = first + ((j + 1) % around);
      // Around × around = +tangent, so the far cap keeps that order and the near one flips it.
      if (flip) indices.push(centre, b, a); else indices.push(centre, a, b);
    }
  };
  if (capNear) cap(0, true);
  if (capFar) cap(rings.length - 1, false);
  return skinned ? { positions, normals, indices, joints, weights } : { positions, normals, indices };
}

/*
 * Small 3-vector helpers for the loft builder. They work on plain [x, y, z] arrays and
 * allocate their results: loft() runs once when a mesh is built, never per frame, so
 * clarity wins over reuse here. Hot paths (skeleton.js, the renderer) avoid allocation.
 */

/** Right-handed cross product a × b. */
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
/** Dot product a · b. */
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
/** Euclidean distance between two points, in metres. */
function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
/** Unit-length copy of v, or null when v is too short to have a direction (callers then
 * fall back to another reference axis or report a degenerate ring). */
function normalise(v) { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : null; }
