/**
 * Penthouse / procedural humanoid: a reusable articulated mannequin for proportion review.
 *
 * Ownership: this toy builds an invisible joint hierarchy and box body segments through
 * World only. It owns no scheduler, GPU resource or game identity. Games supply the
 * parameter/palette document (for example Freelancer's 949 preset) and decide when to
 * pose it; Lobby phases call poseHumanoid() through the game's registered callbacks.
 *
 * Units: metres, radians and linear RGB. Axes follow World: x right, y back, z up.
 * A humanoid faces local -Y, matching the planar motor's heading convention.
 *
 * Status: the silhouette-review stage agreed in decision 0007 (recorded in 0020). Segments are
 * oriented boxes with two-part tapers; there is no mesh, skinning, IK, cloth or hair
 * simulation yet. Proportions and posture are the subject, not surface detail.
 */
import { createMaterial } from "../basement/material.js";
import { eulerRotation } from "../basement/rotation.js";

/** Bump when the generated skeleton or the meaning of a parameter changes. */
export const HUMANOID_GENERATOR_VERSION = 1;

/**
 * One table drives validation, review sliders and documentation, so a new parameter
 * cannot be accepted by one surface and ignored by another. `slider` is the useful
 * interactive span; min/max are hard limits. Fractions are of total standing height.
 */
export const HUMANOID_PARAMETERS = Object.freeze(
  [
    // Overall scale and the vertical division of the body.
    ["height", "Height", "m", 1.2, 2.2, 1.45, 2.0, "Body"],
    ["headHeight", "Head height", "× height", 0.1, 0.2, 0.115, 0.16, "Body"],
    ["legLength", "Leg length", "× height", 0.4, 0.6, 0.44, 0.56, "Body"],
    ["armLength", "Arm length", "× height", 0.35, 0.5, 0.38, 0.47, "Body"],
    ["neckLength", "Neck length", "× height", 0.02, 0.08, 0.025, 0.065, "Body"],
    // Horizontal masses. Widths are full extents, not half-widths.
    ["shoulderWidth", "Shoulder width", "m", 0.25, 0.55, 0.3, 0.48, "Torso"],
    ["chestDepth", "Chest depth", "m", 0.14, 0.34, 0.16, 0.3, "Torso"],
    ["waistWidth", "Waist width", "m", 0.18, 0.45, 0.2, 0.4, "Torso"],
    ["hipWidth", "Hip width", "m", 0.24, 0.5, 0.26, 0.44, "Torso"],
    ["headWidth", "Head width", "× head height", 0.6, 0.95, 0.66, 0.88, "Torso"],
    // Limb thickness at the root of each segment; the far half tapers by `limbTaper`.
    ["upperArm", "Upper arm", "m", 0.06, 0.16, 0.065, 0.13, "Limbs"],
    ["forearm", "Forearm", "m", 0.05, 0.13, 0.055, 0.11, "Limbs"],
    ["thigh", "Thigh", "m", 0.1, 0.24, 0.11, 0.21, "Limbs"],
    ["calf", "Calf", "m", 0.07, 0.17, 0.08, 0.15, "Limbs"],
    ["limbTaper", "Limb taper", "far / near", 0.55, 1, 0.6, 0.95, "Limbs"],
    ["footLength", "Foot length", "× height", 0.12, 0.18, 0.13, 0.17, "Limbs"],
    ["stance", "Stance width", "m", 0, 0.2, 0, 0.16, "Limbs"],
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

/** Discrete outline choices. Hair styles are silhouette volumes, not strand simulation. */
export const HUMANOID_CHOICES = Object.freeze({
  hair: Object.freeze(["none", "short", "bun", "ponytail"]),
  backpack: Object.freeze([true, false]),
});

/** Material slots a game palette must fill. Thigh-high legwear has its own slot. */
export const HUMANOID_PALETTE_SLOTS = Object.freeze([
  "skin",
  "hair",
  "top",
  "bottoms",
  "legwear",
  "shoes",
  "bag",
  "strap",
]);

/**
 * Validate a complete humanoid document without filling defaults or mutating input.
 * The returned object is a frozen deep copy, so later UI edits cannot alter a
 * validated preset in place; edits validate a new candidate instead.
 */
export function validateHumanoid(document) {
  if (!document || typeof document !== "object")
    throw new TypeError("Humanoid document must be an object");
  if (document.schemaVersion !== 1 || document.kind !== "humanoid")
    throw new Error("Expected a schema-1 humanoid document");
  if (document.generatorVersion !== HUMANOID_GENERATOR_VERSION)
    throw new Error(
      `Humanoid generator ${document.generatorVersion} is not installed`,
    );
  for (const key of ["id", "name"])
    if (typeof document[key] !== "string" || !document[key].length || document[key].length > 80)
      throw new Error(`Humanoid ${key} must contain 1–80 characters`);
  const p = document.parameters,
    palette = document.palette;
  if (!p || typeof p !== "object") throw new Error("Missing humanoid parameters");
  const known = new Set([
    ...HUMANOID_PARAMETERS.map((d) => d.key),
    ...Object.keys(HUMANOID_CHOICES),
  ]);
  for (const key of Object.keys(p))
    if (!known.has(key)) throw new Error(`Unknown humanoid parameter: ${key}`);
  for (const d of HUMANOID_PARAMETERS)
    if (!Number.isFinite(p[d.key]) || p[d.key] < d.min || p[d.key] > d.max)
      throw new RangeError(`${d.label} must be ${d.min}–${d.max} ${d.unit}`);
  for (const [key, options] of Object.entries(HUMANOID_CHOICES))
    if (!options.includes(p[key]))
      throw new RangeError(`${key} must be one of ${options.join(", ")}`);
  if (!palette || typeof palette !== "object") throw new Error("Missing palette");
  for (const key of Object.keys(palette))
    if (!HUMANOID_PALETTE_SLOTS.includes(key))
      throw new Error(`Unknown palette slot: ${key}`);
  for (const slot of HUMANOID_PALETTE_SLOTS) {
    const c = palette[slot];
    if (!Array.isArray(c) || c.length !== 3 || !c.every((n) => Number.isFinite(n) && n >= 0 && n <= 1))
      throw new RangeError(`Palette ${slot} needs three linear RGB values in 0–1`);
  }
  // Cross-parameter limits keep the body physically assemblable: arms must not
  // collapse into the torso and the hips must hold both thighs without overlap.
  if (p.thigh * 2 > p.hipWidth + 0.04)
    throw new RangeError("Thighs are wider than the hips can hold");
  if (p.waistWidth > Math.max(p.shoulderWidth, p.hipWidth))
    throw new RangeError("Waist must not exceed both shoulders and hips");
  if (p.headHeight + p.neckLength + p.legLength > 0.8)
    throw new RangeError("Head, neck and legs leave no room for a torso");
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
 * Derive joint positions and segment sizes from validated parameters. Pure data: the
 * same function serves construction, tests and any future rig/IK consumer.
 * All z values are measured from the ground in the rest pose.
 */
export function humanoidMeasurements(p) {
  const H = p.height,
    head = p.headHeight * H,
    neck = p.neckLength * H,
    foot = { length: p.footLength * H, height: 0.035 * H },
    hipZ = p.legLength * H,
    // Knee sits slightly above the leg's midpoint, as on a real skeleton.
    thighLength = (hipZ - foot.height) * 0.52,
    shinLength = hipZ - foot.height - thighLength,
    chinZ = H - head,
    shoulderZ = chinZ - neck,
    // The waist joint divides the trunk; the chest above it carries shoulders and pack.
    waistZ = hipZ + (shoulderZ - hipZ) * 0.42,
    arm = p.armLength * H,
    hand = arm * 0.22,
    upperArmLength = (arm - hand) * 0.53,
    forearmLength = arm - hand - upperArmLength;
  return {
    height: H,
    head: { height: head, width: head * p.headWidth, depth: head * 0.92 },
    neck: { length: neck, width: Math.max(0.07, head * 0.42) },
    hipZ,
    waistZ,
    shoulderZ,
    chinZ,
    hipSpacing: p.hipWidth / 2 - p.thigh / 2 + p.stance / 2,
    // Arm centres sit just inside the deltoid width, outside the narrower upper chest.
    shoulderSpacing: p.shoulderWidth / 2 - p.upperArm * 0.42,
    thighLength,
    shinLength,
    upperArmLength,
    forearmLength,
    hand: { length: hand, width: p.forearm * 0.95, depth: p.forearm * 0.45 },
    foot,
    pelvis: { width: p.hipWidth, depth: p.chestDepth * 0.95, height: (waistZ - hipZ) * 1.25 },
    chest: { width: p.shoulderWidth, depth: p.chestDepth, height: shoulderZ - waistZ },
    backpack: {
      width: p.backpackWidth,
      height: p.backpackHeight,
      depth: p.backpackDepth,
      // Top of the pack sits at the shoulder line, lowered by the authored drop.
      top: shoulderZ - waistZ - p.backpackDrop,
    },
  };
}

/**
 * Build one humanoid in `world`. Returns a rig whose `root` owns every descendant,
 * so `world.remove(rig.root)` (or rig.dispose()) removes the whole figure.
 * Options: x/y/yaw place the root; `materials` may share live per-slot materials;
 * otherwise private materials are created from the document palette.
 */
export function createHumanoid({ world, document, x = 0, y = 0, yaw = 0, materials = null }) {
  // Always validate: frozen data is not proof that it passed this generator's rules.
  const doc = validateHumanoid(document),
    p = doc.parameters,
    m = humanoidMeasurements(p),
    slots =
      materials ??
      Object.fromEntries(
        HUMANOID_PALETTE_SLOTS.map((slot) => [slot, createMaterial({ baseColor: doc.palette[slot] })]),
      );
  const parts = [],
    root = world.create({ x, y, yaw });
  /** Invisible pivot: shape-less entities cost no GPU instance. */
  const joint = (parent, px, py, pz) => world.create({ parent, x: px, y: py, z: pz });
  /** One visible box, recorded with its slot so materials can be overridden together. */
  const part = (parent, slot, px, py, pz, size) => {
    const entity = world.create({
      parent,
      x: px,
      y: py,
      z: pz,
      shape: { size, material: slots[slot], ambientBlocker: false, castShadow: true },
    });
    parts.push({ entity, slot });
    return entity;
  };
  /**
   * A limb segment hanging down -Z from its joint, as two stacked halves so the far
   * half can taper. Overlap hides the seam when the joint below rotates.
   */
  const segment = (parent, length, width, depth, nearSlot, farSlot = nearSlot) => {
    const far = p.limbTaper;
    part(parent, nearSlot, 0, 0, -length * 0.27, [width, depth, length * 0.56]);
    part(parent, farSlot, 0, 0, -length * 0.74, [width * far, depth * far, length * 0.54]);
  };

  // Pelvis: the root of the trunk. Its height is set again by gait (bob).
  const pelvis = joint(root, 0, 0, m.hipZ);
  // Two-box pelvis: full hip width at the hip joints, narrowing toward the waist, so the
  // front outline shows the waist-to-hip transition instead of one rectangular block.
  const ph = m.pelvis.height;
  part(pelvis, "bottoms", 0, 0, ph * 0.08, [m.pelvis.width * 0.96, m.pelvis.depth, ph * 0.62]);
  part(pelvis, "bottoms", 0, 0, ph * 0.5, [(p.waistWidth + p.hipWidth) / 2, m.pelvis.depth * 0.92, ph * 0.5]);
  // Waist joint: spine lean and counter-twist bend here, above the hips.
  const waist = joint(pelvis, 0, 0, m.waistZ - m.hipZ);
  const chestH = m.chest.height;
  part(waist, "top", 0, 0, chestH * 0.22, [p.waistWidth, p.chestDepth * 0.82, chestH * 0.5]);
  // Two-box chest: full width at the shoulders, a deeper narrower ribcage below,
  // which reads as a rounded torso in side view instead of one rectangle.
  // Shoulder width is measured across the deltoids, so the chest stops inside the arms
  // and the upper arms remain readable outside the ribcage from the front.
  part(waist, "top", 0, 0, chestH * 0.78, [p.shoulderWidth - p.upperArm * 1.2, p.chestDepth * 0.78, chestH * 0.42]);
  part(waist, "top", 0, -p.chestDepth * 0.04, chestH * 0.6, [Math.max(p.waistWidth * 1.05, p.shoulderWidth * 0.7), p.chestDepth, chestH * 0.46]);
  // Neck and head pivot from the top of the chest.
  const neck = joint(waist, 0, 0, chestH);
  part(neck, "skin", 0, 0, m.neck.length * 0.5, [m.neck.width, m.neck.width * 0.95, m.neck.length + 0.02]);
  const head = joint(neck, 0, 0, m.neck.length);
  const hh = m.head.height,
    hw = m.head.width,
    hd = m.head.depth;
  // Cranium reaches exactly the authored head height; the narrower jaw tucks under it.
  part(head, "skin", 0, -hd * 0.04, hh * 0.6, [hw, hd, hh * 0.8]);
  part(head, "skin", 0, -hd * 0.12, hh * 0.2, [hw * 0.74, hd * 0.72, hh * 0.36]);
  addHair(part, head, p.hair, hh, hw, hd);

  // Arms hang from shoulder pivots at the top outside corners of the chest.
  const arms = [-1, 1].map((side) => {
    const shoulder = joint(waist, side * m.shoulderSpacing, 0, chestH - p.upperArm * 0.45);
    segment(shoulder, m.upperArmLength, p.upperArm, p.upperArm * 0.95, "top", "skin");
    const elbow = joint(shoulder, 0, 0, -m.upperArmLength);
    segment(elbow, m.forearmLength, p.forearm, p.forearm * 0.9, "skin");
    const wrist = joint(elbow, 0, 0, -m.forearmLength);
    part(wrist, "skin", 0, 0, -m.hand.length / 2, [m.hand.depth, m.hand.width, m.hand.length]);
    return { side, shoulder, elbow, wrist };
  });

  // Legs: thigh-high legwear covers the lower thigh, shin and ankle.
  const legs = [-1, 1].map((side) => {
    const hip = joint(pelvis, side * m.hipSpacing, 0, 0);
    segment(hip, m.thighLength, p.thigh, p.thigh * 1.02, "bottoms", "legwear");
    const knee = joint(hip, 0, 0, -m.thighLength);
    segment(knee, m.shinLength, p.calf, p.calf * 1.05, "legwear");
    const ankle = joint(knee, 0, 0, -m.shinLength);
    const f = m.foot;
    // Foot extends forward (-Y) from the ankle; its sole rests on the ground at rest.
    part(ankle, "shoes", 0, -f.length * 0.28, -f.height * 0.5, [p.calf * 0.85, f.length, f.height]);
    return { side, hip, knee, ankle };
  });

  // Backpack: attached to the chest so it follows lean/twist; its own pivot carries
  // bounded secondary swing. Straps make the shoulder outline readable from the front.
  let pack = null;
  if (p.backpack) {
    const b = m.backpack;
    pack = joint(waist, 0, p.chestDepth / 2, b.top);
    part(pack, "bag", 0, b.depth / 2 + 0.005, -b.height / 2, [b.width, b.depth, b.height]);
    part(pack, "bag", 0, b.depth * 0.62, -b.height * 0.64, [b.width * 0.72, b.depth * 0.5, b.height * 0.42]);
    part(pack, "strap", 0, b.depth / 2, -0.02, [b.width * 0.86, b.depth * 0.9, 0.05]);
    for (const side of [-1, 1])
      part(waist, "strap", side * p.shoulderWidth * 0.24, -p.chestDepth * 0.5, chestH * 0.62, [0.04, 0.02, chestH * 0.62]);
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
    materials: slots,
    // Secondary-motion state belongs to this instance only.
    motion: { packPitch: 0, packRoll: 0, packPitchRate: 0, packRollRate: 0, lean: 0, lastSpeed: 0 },
    /** Show every part with one material (silhouette review) or restore the palette slots. */
    override(material = null) {
      for (const { entity, slot } of parts) entity.shape.material = material ?? slots[slot];
    },
    /** Remove the figure and all descendants from its world. */
    dispose() {
      world.remove(root);
    },
  };
}

/** Hair volumes enlarge the head outline the way real hair does; no strands. */
function addHair(part, head, style, hh, hw, hd) {
  if (style === "none") return;
  // A cap over the crown and back of the head is shared by every style.
  part(head, "hair", 0, hd * 0.06, hh * 0.82, [hw * 1.08, hd * 1.06, hh * 0.4]);
  if (style === "bun") part(head, "hair", 0, hd * 0.5, hh * 0.86, [hw * 0.46, hd * 0.42, hh * 0.36]);
  if (style === "ponytail") {
    part(head, "hair", 0, hd * 0.58, hh * 0.62, [hw * 0.34, hd * 0.3, hh * 0.3]);
    part(head, "hair", 0, hd * 0.66, hh * 0.18, [hw * 0.26, hd * 0.24, hh * 0.62]);
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
  rig.pelvis.z = m.hipZ - 0.022 * a * (0.5 + 0.5 * Math.cos(2 * phase)) * (m.height / 1.7);
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
