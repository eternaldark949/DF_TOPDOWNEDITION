/**
 * Penthouse / procedural humanoid: a reusable articulated figure with generated clothing.
 *
 * Ownership: this toy builds an invisible joint hierarchy and rounded body parts through
 * World only. It owns no scheduler, GPU resource or game identity. Games supply the
 * parameter/palette/outfit document (for example Freelancer's 949 preset) and a wardrobe
 * catalogue, and decide when to pose it; Lobby phases call poseHumanoid() through the
 * game's registered callbacks.
 *
 * Units: metres, radians and linear RGB. Axes follow World: x right, y back, z up.
 * A humanoid faces local -Y, matching the planar motor's heading convention.
 *
 * Look: the body shape is ported from the 2D game's procedural humanoid (src/ui/bodies.js
 * on main). Its per-gender canon gives tapered limbs [near, belly, belly position, far]
 * whose touching ends share one radius, a torso with deltoid caps, a wide pelvis and a big
 * stylised head; its builds scale breadth, depth, head, hips and shoulders. Each part is
 * one rounded instance (Basement rounded-shapes.js): segments meet in continuous joints
 * exactly as the 2D outlines do. Clothes are those same shapes grown outward over the
 * spans a garment covers (garments.js), so every outfit fits every body.
 *
 * Status (decision 0020): rigid rounded segments. There is no skinning, IK, cloth or hair
 * simulation, faces or ground contact on slopes yet; skirts and hair are static volumes.
 */
import { createMaterial } from "../basement/material.js";
import { eulerRotation } from "../basement/rotation.js";
import { roundedProfile } from "../basement/rounded-shapes.js";
import { GARMENT_FINISHES, GARMENT_SLOTS, garmentCoverage, resolveOutfit, validateOutfit } from "./garments.js";

/** Bump when the generated skeleton or the meaning of a parameter changes. */
export const HUMANOID_GENERATOR_VERSION = 2;

/**
 * The 2D game's body canon, in its own drawing unit (1 unit = height ÷ 131 here, which
 * puts the classic female shoulders at 0.37 m across the deltoids for 1.68 m). Fields keep
 * the 2D names: sh shoulder joints at ±sh, del deltoid radius, tf/tb chest front and back,
 * chest/back half-breadths there, bust {x forward, y apart, r}, hf/hb pelvis front/back,
 * hw half-breadth at the hip bones, leg thigh spacing (±leg), and limb tapers
 * [near radius, belly radius, belly position 0..1, far radius]. `waist` (half-breadth at
 * the waist) is new: a top-down drawing never needed it.
 */
export const BODY_CANON = Object.freeze({
  female: { sh: 10.5, del: 4.0, tf: 6.0, tb: -7.2, chest: 7.8, back: 8.8, waist: 7.0, bust: { x: 5.4, y: 4.9, r: 3.3 },
    hf: 3.0, hb: -9.0, hw: 12.0, leg: 5.4,
    thigh: [4.7, 4.5, 0.28, 3.3], calf: [3.3, 3.6, 0.3, 2.05], upper: [3.5, 3.35, 0.35, 2.55], fore: [2.55, 2.7, 0.22, 1.8], hand: 1.0, foot: 1.0 },
  androgynous: { sh: 11.0, del: 4.3, tf: 6.3, tb: -7.8, chest: 8.8, back: 9.4, waist: 8.1, bust: null,
    hf: 2.6, hb: -8.0, hw: 11.2, leg: 5.0,
    thigh: [4.75, 4.55, 0.28, 3.45], calf: [3.45, 3.75, 0.3, 2.2], upper: [3.8, 3.6, 0.35, 2.75], fore: [2.75, 2.9, 0.22, 1.95], hand: 1.04, foot: 1.02 },
  male: { sh: 12.5, del: 4.8, tf: 6.6, tb: -8.0, chest: 10.0, back: 10.8, waist: 9.4, bust: null,
    hf: 2.5, hb: -7.5, hw: 10.8, leg: 4.9,
    thigh: [4.85, 4.65, 0.28, 3.6], calf: [3.6, 3.95, 0.3, 2.35], upper: [4.2, 4.0, 0.35, 3.0], fore: [3.0, 3.2, 0.22, 2.1], hand: 1.1, foot: 1.05 },
});

/** The 2D builds: breadth (w), depth (d), head, and extra hip/shoulder emphasis. */
export const BODY_BUILDS = Object.freeze({
  classic: { w: 1, d: 1, head: 1 },
  slim: { w: 0.88, d: 0.92, head: 0.98 },
  athletic: { w: 1.05, d: 1.02, head: 1.0, shoulder: 1.08 },
  curvy: { w: 1.04, d: 1.04, head: 1.0, hip: 1.25 },
  broad: { w: 1.15, d: 1.08, head: 1.02, shoulder: 1.1 },
  heavy: { w: 1.2, d: 1.22, head: 1.05, hip: 1.1 },
});

/** Canon units per metre of height, and the 2D head (16 across) in those units. */
const UNITS_PER_HEIGHT = 131,
  HEAD = Object.freeze({ width: 16, depth: 17.2, height: 19.5 });

/**
 * One table drives validation, review sliders and documentation, so a new parameter
 * cannot be accepted by one surface and ignored by another. `slider` is the useful
 * interactive span; min/max are hard limits. Shape values multiply the canon (1 = as the
 * 2D game draws that gender and build).
 */
export const HUMANOID_PARAMETERS = Object.freeze(
  [
    // Overall scale and the vertical division of the body.
    ["height", "Height", "m", 1.2, 2.2, 1.45, 2.0, "Body"],
    ["headSize", "Head size", "× canon", 0.7, 1.3, 0.8, 1.2, "Body"],
    ["legLength", "Leg length", "× height", 0.4, 0.6, 0.44, 0.56, "Body"],
    ["armLength", "Arm length", "× height", 0.35, 0.5, 0.38, 0.47, "Body"],
    ["neckLength", "Neck length", "× height", 0.02, 0.08, 0.025, 0.065, "Body"],
    ["footLength", "Foot length", "× height", 0.12, 0.18, 0.13, 0.17, "Body"],
    // Horizontal masses relative to the canon for the chosen gender and build.
    ["shoulders", "Shoulders", "× canon", 0.8, 1.25, 0.85, 1.2, "Shape"],
    ["waist", "Waist", "× canon", 0.8, 1.3, 0.85, 1.25, "Shape"],
    ["hips", "Hips", "× canon", 0.8, 1.35, 0.85, 1.3, "Shape"],
    ["bust", "Bust", "× canon", 0, 1.6, 0, 1.4, "Shape"],
    ["limbs", "Limb thickness", "× canon", 0.75, 1.35, 0.8, 1.25, "Shape"],
    ["stance", "Stance width", "m", 0, 0.2, 0, 0.16, "Shape"],
    // Posture is a resting attitude; gait adds bounded motion on top of it.
    ["spineLean", "Spine lean", "rad", -0.2, 0.3, -0.1, 0.2, "Posture"],
    ["headTilt", "Head tilt", "rad", -0.3, 0.3, -0.2, 0.2, "Posture"],
    ["armSpread", "Arm spread", "rad", 0, 0.4, 0.02, 0.3, "Posture"],
    // Carried load: dimensions describe the outline; mass shapes secondary motion only.
    ["backpackWidth", "Pack width", "m", 0.2, 0.6, 0.24, 0.52, "Backpack"],
    ["backpackHeight", "Pack height", "m", 0.25, 0.75, 0.3, 0.66, "Backpack"],
    ["backpackDepth", "Pack depth", "m", 0.1, 0.4, 0.12, 0.34, "Backpack"],
    ["backpackDrop", "Pack drop", "m", -0.1, 0.3, -0.05, 0.22, "Backpack"],
    ["backpackMass", "Pack mass", "kg", 0, 30, 0, 24, "Backpack"],
  ].map(([key, label, unit, min, max, low, high, group]) =>
    Object.freeze({ key, label, unit, min, max, slider: [low, high], group }),
  ),
);

/** Discrete choices. Hair styles are static volumes, not strand or chain simulation. */
export const HUMANOID_CHOICES = Object.freeze({
  gender: Object.freeze(Object.keys(BODY_CANON)),
  build: Object.freeze(Object.keys(BODY_BUILDS)),
  hair: Object.freeze(["none", "short", "bun", "ponytail", "curls"]),
  backpack: Object.freeze([true, false]),
});

/** Body material slots a palette must fill; garments carry their own colours. */
export const HUMANOID_PALETTE_SLOTS = Object.freeze(["skin", "hair", "bag", "strap"]);

/**
 * Validate a complete humanoid document without filling defaults or mutating input.
 * The returned object is a frozen deep copy, so later UI edits cannot alter a
 * validated preset in place; edits validate a new candidate instead. Outfit garments
 * are checked against a wardrobe when the figure is generated.
 */
export function validateHumanoid(document) {
  if (!document || typeof document !== "object") throw new TypeError("Humanoid document must be an object");
  if (document.schemaVersion !== 2 || document.kind !== "humanoid") throw new Error("Expected a schema-2 humanoid document");
  if (document.generatorVersion !== HUMANOID_GENERATOR_VERSION)
    throw new Error(`Humanoid generator ${document.generatorVersion} is not installed`);
  for (const key of ["id", "name"])
    if (typeof document[key] !== "string" || !document[key].length || document[key].length > 80)
      throw new Error(`Humanoid ${key} must contain 1–80 characters`);
  const known = new Set(["schemaVersion", "kind", "id", "name", "generatorVersion", "parameters", "palette", "outfit"]);
  for (const key of Object.keys(document)) if (!known.has(key)) throw new Error(`Unknown humanoid field: ${key}`);
  const p = document.parameters,
    palette = document.palette;
  if (!p || typeof p !== "object") throw new Error("Missing humanoid parameters");
  const keys = new Set([...HUMANOID_PARAMETERS.map((d) => d.key), ...Object.keys(HUMANOID_CHOICES)]);
  for (const key of Object.keys(p)) if (!keys.has(key)) throw new Error(`Unknown humanoid parameter: ${key}`);
  for (const d of HUMANOID_PARAMETERS)
    if (!Number.isFinite(p[d.key]) || p[d.key] < d.min || p[d.key] > d.max)
      throw new RangeError(`${d.label} must be ${d.min}–${d.max} ${d.unit}`);
  for (const [key, options] of Object.entries(HUMANOID_CHOICES))
    if (!options.includes(p[key])) throw new RangeError(`${key} must be one of ${options.join(", ")}`);
  if (!palette || typeof palette !== "object") throw new Error("Missing palette");
  for (const key of Object.keys(palette)) if (!HUMANOID_PALETTE_SLOTS.includes(key)) throw new Error(`Unknown palette slot: ${key}`);
  for (const slot of HUMANOID_PALETTE_SLOTS) {
    const c = palette[slot];
    if (!Array.isArray(c) || c.length !== 3 || !c.every((n) => Number.isFinite(n) && n >= 0 && n <= 1))
      throw new RangeError(`Palette ${slot} needs three linear RGB values in 0–1`);
  }
  validateOutfit(document.outfit);
  // The stylised head is large; the legs and neck must still leave room for a torso.
  const headFraction = (HEAD.height * p.headSize * BODY_BUILDS[p.build].head) / UNITS_PER_HEIGHT;
  if (headFraction + p.neckLength + p.legLength > 0.8) throw new RangeError("Head, neck and legs leave no room for a torso");
  return deepFreeze(structuredClone(document));
}

/** Freeze nested authored data once at validation, rather than at every read. */
function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * The canon for a gender and build with the document's shape multipliers applied, as in
 * the 2D bodyCanon(): shoulder emphasis widens deltoids and chest, hip emphasis widens
 * hips, seat and thigh spacing. Breadth values scale by the build's w, depth by d.
 */
function shapedCanon(p) {
  const base = BODY_CANON[p.gender],
    b = BODY_BUILDS[p.build],
    C = structuredClone(base);
  if (b.shoulder) {
    const k = b.shoulder;
    C.sh *= k; C.del *= 1 + (k - 1) * 0.8; C.chest *= 1 + (k - 1) * 0.6; C.back *= 1 + (k - 1) * 0.7;
  }
  if (b.hip) {
    const k = b.hip;
    C.hw *= k; C.hb *= 1 + (k - 1) * 0.6; C.leg *= 1 + (k - 1) * 0.5;
  }
  C.sh *= p.shoulders; C.del *= 0.5 + p.shoulders * 0.5; C.chest *= p.shoulders; C.back *= p.shoulders;
  C.waist *= p.waist;
  C.hw *= p.hips; C.hb *= 0.4 + p.hips * 0.6; C.leg *= 0.5 + p.hips * 0.5;
  // Builds stretch the 2D frame: breadth across the shoulders, depth front to back.
  for (const key of ["sh", "chest", "back", "waist", "hw", "leg"]) C[key] *= b.w;
  for (const key of ["tf", "tb", "hf", "hb"]) C[key] *= b.d;
  const limb = ((b.w + b.d) / 2) * p.limbs;
  for (const key of ["thigh", "calf", "upper", "fore"]) C[key] = [C[key][0] * limb, C[key][1] * limb, C[key][2], C[key][3] * limb];
  C.del *= limb / p.limbs;
  C.bust = C.bust && p.bust > 0 ? { x: C.bust.x * b.d, y: C.bust.y * b.w, r: C.bust.r * p.bust } : null;
  C.head = b.head * p.headSize;
  return C;
}

/**
 * Derive joint positions and segment sizes from validated parameters. Pure data: the
 * same function serves construction, tests and any future rig/IK consumer.
 * All z values are measured from the ground in the rest pose; `u` is the canon unit.
 */
export function humanoidMeasurements(p) {
  const H = p.height,
    u = H / UNITS_PER_HEIGHT,
    C = shapedCanon(p),
    head = { width: HEAD.width * u * C.head, depth: HEAD.depth * u * C.head, height: HEAD.height * u * C.head },
    neck = p.neckLength * H,
    foot = { length: p.footLength * H, height: 0.032 * H, width: 6.6 * u * C.foot },
    hipZ = p.legLength * H,
    // Knee sits slightly above the leg's midpoint, as on a real skeleton.
    thighLength = (hipZ - foot.height) * 0.52,
    shinLength = hipZ - foot.height - thighLength,
    chinZ = H - head.height,
    // Top of the shoulders (the chest dome); the neck rises from just below it.
    shoulderZ = chinZ - neck,
    // The waist joint divides the trunk; the chest above it carries arms, bust and pack.
    waistZ = hipZ + (shoulderZ - hipZ) * 0.4,
    arm = p.armLength * H,
    hand = arm * 0.2,
    upperArmLength = (arm - hand) * 0.54,
    forearmLength = arm - hand - upperArmLength,
    chestDepth = (C.tf - C.tb) * u;
  return {
    u,
    canon: C,
    height: H,
    head,
    neck: { length: neck, radius: head.width * 0.22 },
    hipZ,
    waistZ,
    shoulderZ,
    chinZ,
    hipSpacing: C.leg * u + p.stance / 2,
    shoulderSpacing: C.sh * u,
    // Shoulder joints sit under the deltoid caps, a little below the top of the shoulders.
    shoulderJointZ: shoulderZ - C.del * u * 0.9,
    thighLength,
    shinLength,
    upperArmLength,
    forearmLength,
    hand: { length: hand, width: 5.8 * u * C.hand, thickness: C.fore[3] * u * 2.5 },
    foot,
    chest: { width: (C.chest + C.back) * u, depth: chestDepth, waistWidth: C.waist * 2 * u, height: shoulderZ - waistZ },
    pelvis: { waistWidth: C.waist * 2 * u, hipWidth: C.hw * 2 * u, depth: (C.hf - C.hb) * u, height: waistZ - hipZ },
    backpack: {
      width: p.backpackWidth,
      height: p.backpackHeight,
      depth: p.backpackDepth,
      // Top of the pack sits at the shoulder line, lowered by the authored drop.
      top: shoulderZ - waistZ - p.backpackDrop,
    },
  };
}

/** The 2D profile's hump, matching the shader exactly (rounded-shapes.js). */
function hump(t, peak) {
  return t < peak ? 0.5 - 0.5 * Math.cos((Math.PI * t) / peak) : 0.5 + 0.5 * Math.cos((Math.PI * (t - peak)) / (1 - peak));
}

/**
 * A body region: a rounded shape running from a near dome centre (`origin`, in its joint's
 * frame) along `axis` for `length`, with near radii ax/ay and a profile. Built from a 2D
 * limb taper [near, belly, belly position, far] when one is given.
 */
function region(joint, { origin, axis = "down", ax, ay, length, taper = 1, depthTaper = taper, bulge = 0, peak = 0.5, widthOnly = false }) {
  return { joint, origin, axis, ax, ay, length, taper, depthTaper, bulge: Math.max(-0.95, Math.min(0.95, bulge)), peak, widthOnly };
}
function limbRegion(joint, origin, taper2d, length, u, depthRatio = 1) {
  const [near, belly, at, far] = taper2d,
    t = far / near;
  return region(joint, { origin, ax: near * u, ay: near * u * depthRatio, length, taper: t, peak: at, bulge: belly / near - (1 + (t - 1) * at) });
}
/** Profile scale along a region: width (x) when `width`, else depth (y), as the shader does. */
const regionScale = (R, t, width = false) =>
  Math.max(0.02, 1 + ((width ? R.taper : R.depthTaper) - 1) * t + (!R.widthOnly || width ? R.bulge * hump(t, R.peak) : 0));

/** Shape axes: hanging regions need no rotation; forward (feet) turns +z to +y. */
const AXES = {
  down: { vector: [0, 0, -1], rotation: [0, 0, 0, 1] },
  forward: { vector: [0, -1, 0], rotation: eulerRotation(-Math.PI / 2, 0, 0) },
};

/**
 * Build one humanoid in `world`. Returns a rig whose `root` owns every descendant,
 * so `world.remove(rig.root)` (or rig.dispose()) removes the whole figure.
 * Options: x/y/yaw place the root; `wardrobe` (validateWardrobe) resolves the outfit;
 * `materials` may share live per-slot body materials; otherwise private materials are
 * created from the palette. Garment materials are always private to this figure.
 */
export function createHumanoid({ world, document, wardrobe = null, x = 0, y = 0, yaw = 0, materials = null }) {
  // Always validate: frozen data is not proof that it passed this generator's rules.
  const doc = validateHumanoid(document),
    p = doc.parameters,
    m = humanoidMeasurements(p),
    C = m.canon,
    u = m.u,
    outfit = resolveOutfit(doc.outfit, wardrobe),
    slots =
      materials ??
      Object.fromEntries(
        HUMANOID_PALETTE_SLOTS.map((slot) => [
          slot,
          // Soft skin sheen and satin hair; bags and straps stay matte.
          createMaterial({ baseColor: doc.palette[slot], ...(slot === "skin" ? { specularSharpness: 0.42, reflectivity: 0.035 } : slot === "hair" ? { specularSharpness: 0.62, reflectivity: 0.05 } : {}) }),
        ]),
      );
  // One material per worn garment, keyed by its outfit position, so the review's
  // silhouette override can restore each garment's own colour and finish.
  const garmentMaterials = outfit.map((g) => createMaterial({ baseColor: g.color, ...GARMENT_FINISHES[g.finish] }));
  const parts = [],
    root = world.create({ x, y, yaw });
  /** Invisible pivot: shape-less entities cost no GPU instance. */
  const joint = (parent, px, py, pz) => world.create({ parent, x: px, y: py, z: pz });
  /** Record a visible part with its material key, so overrides can restore it. */
  const add = (parent, key, position, size, rounded, rotation = [0, 0, 0, 1]) => {
    const material = typeof key === "number" ? garmentMaterials[key] : slots[key];
    const entity = world.create({
      parent,
      x: position[0],
      y: position[1],
      z: position[2],
      rotation,
      shape: { size, material, rounded, ambientBlocker: false, castShadow: true },
    });
    parts.push({ entity, slot: key });
    return entity;
  };
  /** A sphere (or ellipsoid with `stretch`): a rounded shape shorter than its two domes. */
  const sphere = (parent, key, position, r, stretch = [1, 1, 1]) =>
    add(parent, key, position, [2 * r * stretch[0], 2 * r * stretch[1], 2 * r * stretch[2]], ROUND);

  /**
   * Draw the span [a, b] of a region, grown outward by `grow` metres. The body itself is
   * the span [0, 1] with no growth: one instance whose profile the shader evaluates
   * exactly. A garment span is split at the region's bulge peak and into pieces no longer
   * than a third of the region, each refitted to the grown profile at its ends and middle,
   * so thin layers (3 mm stockings) never let the skin show through. Ends that stop inside
   * the region are flat hems; ends at the region's own ends keep its domes, so a stocking
   * that reaches the knee wraps the joint as the skin does.
   */
  const span = (R, a, b, grow, key) => {
    if (grow === 0 && a === 0 && b === 1) return piece(R, 0, 1, 0, key, true, true);
    const cuts = [a];
    if (R.peak > a + 0.02 && R.peak < b - 0.02) cuts.push(R.peak);
    cuts.push(b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const n = Math.ceil((cuts[i + 1] - cuts[i]) / 0.34 - 1e-9);
      for (let k = 0; k < n; k++) {
        const t0 = cuts[i] + ((cuts[i + 1] - cuts[i]) * k) / n,
          t1 = cuts[i] + ((cuts[i + 1] - cuts[i]) * (k + 1)) / n,
          first = i === 0 && k === 0,
          last = i + 2 === cuts.length && k + 1 === n;
        // Inner joins overlap slightly; their flat discs are hidden inside the neighbour.
        piece(R, first ? t0 : t0 - 0.01, last ? t1 : t1 + 0.01, grow, key, first && a === 0, last && b === 1);
      }
    }
  };
  /** One rounded instance covering [a, b] of R; `roundNear`/`roundFar` keep the domes. */
  const piece = (R, a, b, grow, key, roundNear, roundFar) => {
    a = Math.max(0, a);
    b = Math.min(1, b);
    // True grown radii at both ends, per axis: width and depth taper independently.
    const wa = R.ax * regionScale(R, a, true) + grow,
      wb = R.ax * regionScale(R, b, true) + grow,
      da = R.ay * regionScale(R, a) + grow,
      db = R.ay * regionScale(R, b) + grow,
      taper = wb / wa,
      depthTaper = db / da;
    // The body itself keeps the region's exact profile. A garment piece refits the
    // bulge (measured on the width) at the region's peak if inside, else its middle.
    const local = grow === 0 ? R.peak : R.peak > a && R.peak < b ? (R.peak - a) / (b - a) : 0.5,
      tm = a + local * (b - a),
      bulge = grow === 0 ? R.bulge : Math.max(-0.95, Math.min(0.95, (R.ax * regionScale(R, tm, true) + grow) / wa - (1 + (taper - 1) * local)));
    const flatNear = !roundNear,
      flatFar = !roundFar,
      r0 = Math.min(wa, da),
      r1 = Math.min(wb, db),
      c0 = flatNear ? r0 * 0.002 : r0,
      c1 = flatFar ? r1 * 0.002 : r1,
      body = (b - a) * R.length,
      size = [2 * wa, 2 * da, body + c0 + c1],
      along = a * R.length + size[2] / 2 - c0,
      { vector, rotation } = AXES[R.axis];
    return add(
      R.joint,
      key,
      [R.origin[0] + vector[0] * along, R.origin[1] + vector[1] * along, R.origin[2] + vector[2] * along],
      size,
      roundedProfile({ taper, depthTaper, bulge, peak: Math.max(0.01, Math.min(0.99, local)), flatNear, flatFar, widthOnly: R.widthOnly }),
      rotation,
    );
  };

  // ── Trunk ──────────────────────────────────────────────────────────────────────
  // Pelvis: the root of the trunk; gait sets its height again (bob). Its region runs from
  // the waist down past the hip joints, widest at the hip bones (width-only bulge), with
  // the seat behind the hip joints as in the 2D outline (hf … hb).
  // Footwear and legwear thicken the sole; the whole body stands on them, so the grown
  // sole (not the bare foot) meets the ground.
  const lift = outfit.reduce((sum, g) => sum + (garmentCoverage(g).foot ? (g.thickness ?? GARMENT_SLOTS[g.slot].thickness) : 0), 0);
  const pelvis = joint(root, 0, 0, m.hipZ + lift);
  const ph = m.pelvis.height,
    pelvisDepth = m.pelvis.depth / 2,
    pelvisLength = ph,
    hipAt = 0.5,
    waistHalf = m.pelvis.waistWidth / 2,
    // A small far dome tucks under between the thighs instead of hanging below them.
    pelvisTaper = 0.68,
    pelvisDepthTaper = 0.62;
  const pelvisRegion = region(pelvis, {
    origin: [0, -((C.hf + C.hb) / 2) * u, ph],
    ax: waistHalf,
    ay: pelvisDepth,
    length: pelvisLength,
    taper: pelvisTaper,
    depthTaper: pelvisDepthTaper,
    peak: hipAt,
    bulge: m.pelvis.hipWidth / 2 / waistHalf - (1 + (pelvisTaper - 1) * hipAt),
    widthOnly: true,
  });
  // Waist joint: spine lean and counter-twist bend here, above the hips.
  const waist = joint(pelvis, 0, 0, m.waistZ - m.hipZ);
  // Chest: shoulders down to the waist, narrowing (taper) with a slight ribcage swell.
  // Its top dome is the shoulder line; deltoid caps sit over its outer corners.
  const chestDepth = m.chest.depth / 2,
    chestHalf = m.chest.width / 2,
    chestTaper = waistHalf / chestHalf,
    chestRegion = region(waist, {
      origin: [0, -((C.tf + C.tb) / 2) * u, m.chest.height - Math.min(chestHalf, chestDepth)],
      ax: chestHalf,
      ay: chestDepth,
      length: m.chest.height - Math.min(chestHalf, chestDepth) + 0.01,
      taper: chestTaper,
      peak: 0.32,
      bulge: 0.05,
      widthOnly: true,
    });
  // Neck: a cylinder from inside the head down into the shoulders.
  const neck = joint(waist, 0, 0, m.chest.height - 0.02);
  const neckLength = m.chinZ - (m.shoulderZ - 0.02),
    neckRegion = region(neck, { origin: [0, m.neck.radius * 0.15, neckLength + 0.01], ax: m.neck.radius, ay: m.neck.radius, length: neckLength + 0.02, taper: 1.08 });
  const head = joint(neck, 0, 0, neckLength);
  const hw = m.head.width,
    hd = m.head.depth,
    hh = m.head.height;

  // ── Limbs ──────────────────────────────────────────────────────────────────────
  // Arms hang from shoulder pivots under the deltoids, legs from hip pivots in the pelvis.
  // Each 2D taper becomes one region; its far radius equals the next segment's near
  // radius, so elbows and knees stay joined at any bend.
  const arms = [-1, 1].map((side) => {
    const shoulder = joint(waist, side * m.shoulderSpacing, 0, m.shoulderJointZ - m.waistZ);
    const upper = limbRegion(shoulder, [0, 0, 0], C.upper, m.upperArmLength, u);
    const elbow = joint(shoulder, 0, 0, -m.upperArmLength);
    const fore = limbRegion(elbow, [0, 0, 0], C.fore, m.forearmLength, u);
    const wrist = joint(elbow, 0, 0, -m.forearmLength);
    // Hands: thin across the arm (x), as wide as the palm front to back (y).
    const hr = m.hand.thickness / 2,
      hand = region(wrist, { origin: [0, 0, -hr * 0.4], ax: hr, ay: m.hand.width / 2, length: m.hand.length - hr * 1.8, taper: 0.82, bulge: 0.12, peak: 0.35 });
    return { side, shoulder, elbow, wrist, regions: { upperArm: upper, forearm: fore, hand } };
  });
  const legs = [-1, 1].map((side) => {
    const hip = joint(pelvis, side * m.hipSpacing, 0, 0);
    const thigh = limbRegion(hip, [0, 0, 0], C.thigh, m.thighLength, u, 1.04);
    const knee = joint(hip, 0, 0, -m.thighLength);
    const calf = limbRegion(knee, [0, 0, 0], C.calf, m.shinLength, u, 1.06);
    const ankle = joint(knee, 0, 0, -m.shinLength);
    // Foot: heel to toes along -Y, sole at the ground in the rest pose. Local y of the
    // rotated shape is vertical, so ay is half the foot's height.
    const f = m.foot,
      fy = f.height / 2,
      heel = Math.min(f.width * 0.4, fy),
      foot = region(ankle, {
        origin: [0, f.length * 0.24 - heel, -f.height + fy],
        axis: "forward",
        ax: f.width * 0.4,
        ay: fy,
        length: f.length - heel * 2.15,
        taper: 1.12,
        bulge: 0.14,
        peak: 0.62,
        widthOnly: true,
      });
    return { side, hip, knee, ankle, regions: { thigh, calf, foot } };
  });

  // ── Skin ───────────────────────────────────────────────────────────────────────
  const regions = { neck: [neckRegion], chest: [chestRegion], pelvis: [pelvisRegion] };
  for (const key of ["upperArm", "forearm", "hand"]) regions[key] = arms.map((a) => a.regions[key]);
  for (const key of ["thigh", "calf", "foot"]) regions[key] = legs.map((l) => l.regions[key]);
  for (const list of Object.values(regions)) for (const R of list) span(R, 0, 1, 0, "skin");
  // Deltoid caps ride on the arms, so they lift and swing with the shoulder joint.
  const deltoid = C.del * u,
    // Shifted toward the chest and down, so the cap merges into the shoulder dome and arm.
    deltoids = arms.map((a) => ({ joint: a.shoulder, position: [-a.side * deltoid * 0.18, 0, -deltoid * 0.12], r: deltoid * 0.95 }));
  for (const d of deltoids) sphere(d.joint, "skin", d.position, d.r, [1, 1, 1.2]);
  // Bust (female canon): two spheres on the chest front, as in the 2D canon.
  const bust = C.bust
    ? [-1, 1].map((side) => ({
        // Pushed back into the chest by a third of its radius so it reads as one form.
        position: [side * C.bust.y * u * 0.85, -C.bust.x * u - (C.tf + C.tb) * u * 0.5 + C.bust.r * u * 0.62, chestRegion.origin[2] - chestRegion.length * 0.24],
        r: C.bust.r * u * 1.15,
      }))
    : [];
  for (const b of bust) sphere(waist, "skin", b.position, b.r, BUST_STRETCH);
  // Head: an egg, wider at the crown than the jaw, plus ears. Its top is exactly `height`.
  // Taper only: a bulge on a body this short would read as a belt around the face.
  add(head, "skin", [0, -hd * 0.04, hh / 2], [hw, hd, hh], roundedProfile({ taper: 0.8 }));
  for (const side of [-1, 1]) sphere(head, "skin", [side * hw * 0.48, hd * 0.04, hh * 0.46], hw * 0.09, [0.6, 1, 1.35]);
  addHair(add, sphere, head, p.hair, hh, hw, hd);

  // ── Clothes ────────────────────────────────────────────────────────────────────
  // Each garment grows the regions it covers by its thickness over the layer below.
  // Thickness accumulates in wear order, so a jacket sits over a top over legwear.
  const worn = {};
  outfit.forEach((g, index) => {
    const coverage = garmentCoverage(g),
      thickness = g.thickness ?? GARMENT_SLOTS[g.slot].thickness,
      grow = (name) => (worn[name] = (worn[name] ?? 0) + thickness);
    for (const [name, [a, b]] of Object.entries(coverage)) {
      const g0 = grow(name);
      for (const R of regions[name]) span(R, a, b, g0, index);
    }
    if (coverage.chest) {
      const [a, b] = coverage.chest,
        g0 = worn.chest;
      // A top over the bust covers it too; sleeves carry the deltoid caps.
      for (const s of bust) if (a <= 0.38 && b >= 0.2) sphere(waist, index, s.position, s.r + g0, BUST_STRETCH);
      if (coverage.upperArm?.[0] === 0) for (const d of deltoids) sphere(d.joint, index, d.position, d.r + g0, [1, 1, 1.2]);
    }
    if (g.skirt) {
      // Fitted from the waist over the hips, then a static flared cone to the hem.
      // Cloth simulation (the 2D game's chains) is future work: legs can pass through it.
      const g0 = grow("pelvis"),
        R = pelvisRegion;
      span(R, 0, R.peak, g0, index);
      // The cone is centred between the hip joints (not on the seat) and starts wide and
      // deep enough to contain the thighs' upper domes at rest.
      const thighR = C.thigh[0] * u,
        top = R.origin[2] - R.peak * R.length,
        hem = -g.skirt.length * m.thighLength,
        nearX = Math.max(R.ax * regionScale(R, R.peak, true), m.hipSpacing + thighR) + g0,
        nearY = Math.max(R.ay * regionScale(R, R.peak) + Math.abs(R.origin[1]), thighR * 1.15) + g0,
        length = top - hem,
        flare = g.skirt.flare;
      add(pelvis, index, [0, 0, top - length / 2], [nearX * 2, nearY * 2, length], roundedProfile({ taper: flare, flatNear: true, flatFar: true, bulge: 0.04, peak: 0.3 }));
    }
  });

  // Backpack: attached to the chest so it follows lean/twist; its own pivot carries
  // bounded secondary swing. Packs and straps stay boxes: they are boxy objects.
  let pack = null;
  if (p.backpack) {
    const b = m.backpack,
      back = chestRegion.origin[1] + chestDepth;
    pack = joint(waist, 0, back, b.top);
    add(pack, "bag", [0, b.depth / 2 + 0.005, -b.height / 2], [b.width, b.depth, b.height]);
    add(pack, "bag", [0, b.depth * 0.62, -b.height * 0.64], [b.width * 0.72, b.depth * 0.5, b.height * 0.42]);
    add(pack, "strap", [0, b.depth / 2, -0.02], [b.width * 0.86, b.depth * 0.9, 0.05]);
    for (const side of [-1, 1]) add(waist, "strap", [side * chestHalf * 0.5, chestRegion.origin[1] - chestDepth * 1.02, m.chest.height * 0.62], [0.04, 0.02, m.chest.height * 0.62]);
  }

  return {
    document: doc,
    measurements: m,
    root,
    pelvis,
    waist,
    neck,
    head,
    arms,
    legs,
    pack,
    parts,
    outfit,
    lift,
    materials: slots,
    garmentMaterials,
    // Secondary-motion state belongs to this instance only.
    motion: { packPitch: 0, packRoll: 0, packPitchRate: 0, packRollRate: 0, lean: 0, lastSpeed: 0 },
    /** Show every part with one material (silhouette review) or restore palette and garments. */
    override(material = null) {
      for (const { entity, slot } of parts) entity.shape.material = material ?? (typeof slot === "number" ? garmentMaterials[slot] : slots[slot]);
    },
    /** Remove the figure and all descendants from its world. */
    dispose() {
      world.remove(root);
    },
  };
}

/** Shared profile for spheres and ellipsoids. */
const ROUND = roundedProfile();
/** Bust volumes are wider than deep and slightly tall, so they read as soft forms. */
const BUST_STRETCH = Object.freeze([1.12, 0.78, 1.05]);

/**
 * Hair volumes enlarge the head outline the way real hair does; no strands. Curls are a
 * deterministic cluster of spheres over the crown, back and sides (949's look in the 2D
 * game), leaving the face clear.
 */
function addHair(add, sphere, head, style, hh, hw, hd) {
  if (style === "none") return;
  // A cap over the crown and back of the head is shared by every style.
  add(head, "hair", [0, hd * 0.1, hh * 0.68], [hw * 1.08, hd * 1.06, hh * 0.7], ROUND);
  if (style === "bun") sphere(head, "hair", [0, hd * 0.5, hh * 0.84], hw * 0.24);
  if (style === "ponytail") {
    sphere(head, "hair", [0, hd * 0.52, hh * 0.66], hw * 0.14);
    add(head, "hair", [0, hd * 0.62, hh * 0.3], [hw * 0.26, hd * 0.24, hh * 0.8], roundedProfile({ taper: 0.45, bulge: 0.2, peak: 0.3 }), eulerRotation(0.18, 0, 0));
  }
  if (style === "curls") {
    // Rings of curls on an ellipsoid shell; small deterministic size variation keeps the
    // outline lumpy rather than a smooth helmet. Points facing the face are skipped.
    const rings = [[-0.1, 11], [0.25, 11], [0.6, 9], [0.95, 6], [1.3, 3], [1.57, 1]];
    let n = 0;
    for (const [elevation, count] of rings)
      for (let i = 0; i < count; i++) {
        const azimuth = (i / count) * Math.PI * 2 + elevation * 1.7,
          dx = Math.cos(elevation) * Math.sin(azimuth),
          dy = Math.cos(elevation) * Math.cos(azimuth),
          dz = Math.sin(elevation);
        if (dy < -0.25 && elevation < 0.85) continue;
        const size = hw * (0.17 + 0.04 * Math.sin(n++ * 2.39));
        sphere(head, "hair", [dx * hw * 0.56, hd * 0.08 + dy * hd * 0.56, hh * 0.62 + dz * hh * 0.4], size);
      }
  }
}

/** Write a quaternion into an entity's existing rotation storage (no allocation per frame). */
function setRotation(entity, x, y, z) {
  const q = eulerRotation(x, y, z);
  for (let i = 0; i < 4; i++) entity.rotation[i] = q[i];
}

/**
 * Pose one rig. `state` is the caller's authoritative movement, never read from input:
 *   phase   gait phase in radians (one stride = 2π)
 *   amount  0 standing … 1 full walk
 *   turn    signed yaw rate (rad/s), used for lean into turns
 *   accel   forward acceleration (m/s²), used for pack inertia
 *   dt      seconds since the previous pose, for the bounded pack spring
 * Angle conventions: rotating a hanging limb by +x swings it backward (+Y).
 */
export function poseHumanoid(rig, { phase = 0, amount = 0, turn = 0, accel = 0, dt = 0 } = {}) {
  const p = rig.document.parameters,
    m = rig.measurements,
    a = Math.max(0, Math.min(1, amount)),
    s = Math.sin(phase),
    c = Math.cos(phase);
  // Pelvis bob: lowest at double support (twice per stride), with a slight twist.
  rig.pelvis.z = m.hipZ + rig.lift - 0.022 * a * (0.5 + 0.5 * Math.cos(2 * phase)) * (m.height / 1.7);
  setRotation(rig.pelvis, 0, 0, 0.07 * a * s);
  // Lean: resting posture, a little forward while walking, and toward the turn centre.
  const motion = rig.motion,
    targetLean = Math.max(-0.22, Math.min(0.22, turn * a * 0.09));
  motion.lean += (targetLean - motion.lean) * Math.min(1, dt * 8);
  // +x pitches the upper body forward (toward -Y); +y rolls it toward +X.
  setRotation(rig.waist, p.spineLean + 0.05 * a, motion.lean, -0.1 * a * s);
  setRotation(rig.head, p.headTilt - 0.03 * a, -motion.lean * 0.5, 0.05 * a * s);
  for (const leg of rig.legs) {
    // Right leg is half a stride behind the left.
    const ls = leg.side < 0 ? s : -s,
      lc = leg.side < 0 ? c : -c,
      swing = -0.4 * a * ls,
      // Knee bends mostly while the leg travels forward (swing phase).
      knee = a * (0.08 + 0.62 * Math.max(0, lc) * Math.max(0, 0.4 + ls));
    setRotation(leg.hip, swing, 0, 0);
    setRotation(leg.knee, knee, 0, 0);
    // Keep the sole roughly level with the ground instead of pointing with the shin.
    setRotation(leg.ankle, -(swing + knee) * 0.75, 0, 0);
  }
  for (const arm of rig.arms) {
    // Arms counter-swing their opposite leg; the spread keeps hands clear of the hips.
    const as = arm.side < 0 ? s : -s;
    setRotation(arm.shoulder, 0.3 * a * as, -arm.side * p.armSpread, 0);
    setRotation(arm.elbow, -(0.12 + 0.28 * a * Math.max(0, -as)), 0, 0);
  }
  if (rig.pack) {
    // Bounded damped spring: acceleration tips the pack back, turning swings it out.
    // Heavier packs respond more slowly and swing further; mass never adds energy.
    const mass = Math.max(1, p.backpackMass),
      stiffness = 70 / Math.sqrt(mass),
      damping = 2 * 0.55 * Math.sqrt(stiffness),
      step = Math.min(dt, 1 / 30);
    if (step > 0) {
      const pitchForce = -stiffness * motion.packPitch - damping * motion.packPitchRate + accel * 0.08 * Math.sqrt(mass);
      const rollForce = -stiffness * motion.packRoll - damping * motion.packRollRate + turn * a * 0.25 * Math.sqrt(mass);
      motion.packPitchRate += pitchForce * step;
      motion.packRollRate += rollForce * step;
      motion.packPitch = Math.max(-0.3, Math.min(0.3, motion.packPitch + motion.packPitchRate * step));
      motion.packRoll = Math.max(-0.3, Math.min(0.3, motion.packRoll + motion.packRollRate * step));
    }
    // Gait bounce adds a small rhythmic pitch on top of the spring.
    setRotation(rig.pack, motion.packPitch + 0.03 * a * Math.cos(2 * phase), motion.packRoll, 0);
  }
}
