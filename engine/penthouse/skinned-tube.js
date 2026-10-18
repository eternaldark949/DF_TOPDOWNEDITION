/**
 * Penthouse / skinned tube: a bendable limb, hose or tentacle built from the Basement's
 * skeleton, loft and mesh mechanisms. It is the first proof of skeletal meshes and the
 * pattern the lofted body (plan stage 2) follows: a joint chain, rings along it, and
 * weights that hand each ring from one joint to the next across a short blend zone.
 *
 * Frame: the tube starts at the mesh origin and hangs down -z, like a limb from its
 * joint, so it needs no rotation to hang from a shoulder or hip.
 *
 * tubeRecipe() returns MeshData + its skeleton (CPU only). The caller makes it resident,
 * normally through a Directory MeshLibrary keyed by tubeKey(options), and gives each
 * figure its own SkeletonPose.
 */
import { createSkeleton } from "../basement/skeleton.js";
import { createMesh, loft } from "../basement/mesh.js";

const DEFAULTS = Object.freeze({ length: 0.8, radius: 0.07, taper: 0.7, joints: 3, rings: 33, around: 18, blend: 0.3 });

/** Validated, complete options. Units: metres; taper = tip radius ÷ root radius. */
export function tubeOptions(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const limits = { length: [0.05, 10], radius: [0.005, 2], taper: [0.05, 4], joints: [1, 32], rings: [4, 256], around: [3, 64], blend: [0.02, 0.5] };
  for (const [key, [min, max]] of Object.entries(limits))
    if (!Number.isFinite(o[key]) || o[key] < min || o[key] > max) throw new RangeError(`Tube ${key} must be ${min}–${max}`);
  for (const key of ["joints", "rings", "around"]) if (!Number.isInteger(o[key])) throw new RangeError(`Tube ${key} must be an integer`);
  return Object.freeze(o);
}

/** Stable library key: equal options share one GPU mesh. */
export function tubeKey(options = {}) {
  const o = tubeOptions(options);
  return `penthouse.tube:${Object.keys(DEFAULTS).map((k) => o[k]).join(",")}`;
}

/**
 * Build the skeleton and skinned mesh. Joint i sits at depth i × length ÷ joints; ring
 * weights switch from joint i-1 to joint i over ±blend of a segment around that joint,
 * with a smoothstep so the bend spreads instead of creasing.
 */
export function tubeRecipe(options = {}) {
  const o = tubeOptions(options), segment = o.length / o.joints;
  const skeleton = createSkeleton({
    joints: Array.from({ length: o.joints }, (_, i) => ({ name: `joint${i}`, parent: i ? i - 1 : null, translation: [0, 0, i ? -segment : 0] })),
  });
  const rings = Array.from({ length: o.rings }, (_, k) => {
    const t = k / (o.rings - 1), depth = t * o.length, r = o.radius * (1 + (o.taper - 1) * t);
    // Nearest joint boundary to this ring and how far past it the ring sits.
    const boundary = Math.min(o.joints - 1, Math.max(1, Math.round(depth / segment)));
    const offset = (depth - boundary * segment) / (o.blend * segment);
    const toward = o.joints < 2 ? 1 : smoothstep(-1, 1, offset);
    const weights = o.joints < 2 ? [1, 0, 0, 0] : [1 - toward, toward, 0, 0];
    return { center: [0, 0, -depth], radius: [r, r], joints: [Math.max(0, boundary - 1), boundary, 0, 0].map((j) => Math.min(j, o.joints - 1)), weights };
  });
  return { skeleton, mesh: createMesh({ ...loft({ rings, around: o.around }), skeleton }) };
}

/** Hermite ease from 0 at a to 1 at b with zero slope at both ends (GLSL smoothstep). The
 * flat ends keep weights from changing abruptly where a blend zone starts and stops. */
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
