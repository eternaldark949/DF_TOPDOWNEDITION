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

/**
 * The tube's parameter catalog: the single source for defaults, validation limits, units
 * and editor controls (Studio draws mesh-asset fields from it, as the humanoid review page
 * draws HUMANOID_PARAMETERS). Add a parameter here, never in one surface only.
 *   key      authored JSON name       min/max  inclusive validation limits
 *   integer  whole numbers only       step     editor slider step
 *   unit     display unit ("m", "×" for a ratio, "" for a count)
 */
export const TUBE_PARAMETERS = Object.freeze([
  { key: "length", label: "Length", value: 0.8, min: 0.05, max: 10, step: 0.01, unit: "m" },
  { key: "radius", label: "Radius", value: 0.07, min: 0.005, max: 2, step: 0.005, unit: "m" },
  { key: "taper", label: "Tip taper", value: 0.7, min: 0.05, max: 4, step: 0.01, unit: "×" },
  { key: "joints", label: "Joints", value: 3, min: 1, max: 32, step: 1, unit: "", integer: true },
  { key: "rings", label: "Rings", value: 33, min: 4, max: 256, step: 1, unit: "", integer: true },
  { key: "around", label: "Sides", value: 18, min: 3, max: 64, step: 1, unit: "", integer: true },
  { key: "blend", label: "Joint blend", value: 0.3, min: 0.02, max: 0.5, step: 0.01, unit: "×" },
].map(Object.freeze));

const DEFAULTS = Object.freeze(Object.fromEntries(TUBE_PARAMETERS.map((p) => [p.key, p.value])));

/**
 * Validated, complete options. Units: metres; taper = tip radius ÷ root radius; blend is a
 * fraction of one segment. Omitted keys take defaults; unknown keys are rejected so a typo
 * in authored JSON fails validation instead of silently building the default tube.
 */
export function tubeOptions(options = {}) {
  for (const key of Object.keys(options)) if (!Object.hasOwn(DEFAULTS, key)) throw new RangeError(`Unknown tube parameter ${key}`);
  const o = { ...DEFAULTS, ...options };
  for (const { key, min, max, integer } of TUBE_PARAMETERS) {
    if (!Number.isFinite(o[key]) || o[key] < min || o[key] > max) throw new RangeError(`Tube ${key} must be ${min}–${max}`);
    if (integer && !Number.isInteger(o[key])) throw new RangeError(`Tube ${key} must be an integer`);
  }
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
