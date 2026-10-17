/** Procedural humanoid: document validation, rest-pose measurements, generated clothing,
 * bounded posing and rebuild ownership, tested at World level without a GPU or review DOM.
 * Also checks the rounded-shape record packing against a JavaScript mirror of the shader. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createHumanoid,
  poseHumanoid,
  validateHumanoid,
  humanoidMeasurements,
  HUMANOID_PARAMETERS,
} from "../engine/penthouse/humanoid.js";
import { Penthouse } from "../engine/penthouse/penthouse.js";
import { World, Identities } from "../engine/basement/world.js";
import { rotateVector } from "../engine/basement/rotation.js";
import { STELLA_949, FREELANCER_WARDROBE } from "../games/freelancer/humanoid/preset.js";
import { validateWardrobe, generateOutfit, garmentCoverage, GARMENT_SLOTS } from "../engine/penthouse/garments.js";
import { roundedProfile, packRoundedLane, packTaperLane, roundedGeometry } from "../engine/basement/rounded-shapes.js";

const wardrobe = FREELANCER_WARDROBE;

/** World-space vertical extent of every visible part, from resolved poses. */
function verticalExtent(world) {
  let low = Infinity,
    high = -Infinity;
  const corner = new Float64Array(3);
  for (const e of world.entities.values()) {
    if (!e.shape || !e.pose.visible) continue;
    const [w, d, h] = e.shape.size;
    for (const sx of [-0.5, 0.5])
      for (const sy of [-0.5, 0.5])
        for (const sz of [-0.5, 0.5]) {
          rotateVector(e.pose.rotation, sx * w * e.pose.scale, sy * d * e.pose.scale, sz * h * e.pose.scale, corner);
          low = Math.min(low, e.pose.z + corner[2]);
          high = Math.max(high, e.pose.z + corner[2]);
        }
  }
  return { low, high };
}

const edit = (patch) => {
  const copy = structuredClone(STELLA_949);
  Object.assign(copy.parameters, patch);
  return copy;
};

test("949 preset validates; documents are frozen copies and invalid edits are refused", () => {
  assert.ok(Object.isFrozen(STELLA_949.parameters));
  const source = structuredClone(STELLA_949),
    checked = validateHumanoid(source);
  assert.notEqual(checked, source);
  assert.deepEqual(checked, source);
  assert.throws(() => validateHumanoid(edit({ height: 3 })), /Height/);
  assert.throws(() => validateHumanoid(edit({ surprise: 1 })), /Unknown humanoid parameter/);
  assert.throws(() => validateHumanoid(edit({ hair: "mohawk" })), /hair/);
  assert.throws(() => validateHumanoid(edit({ gender: "robot" })), /gender/);
  assert.throws(() => validateHumanoid(edit({ legLength: 0.6, neckLength: 0.08 })), /no room for a torso/);
  assert.throws(() => validateHumanoid({ ...structuredClone(STELLA_949), generatorVersion: 1 }), /not installed/);
  assert.throws(() => validateHumanoid({ ...structuredClone(STELLA_949), schemaVersion: 1 }), /schema-2/);
  const missing = structuredClone(STELLA_949);
  delete missing.palette.skin;
  assert.throws(() => validateHumanoid(missing), /skin/);
  const badOutfit = structuredClone(STELLA_949);
  badOutfit.outfit = [{ garment: "tshirt", colour: [1, 0, 0] }];
  assert.throws(() => validateHumanoid(badOutfit), /garment, color/);
  // A garment the wardrobe lacks is refused when the figure is generated.
  const unknown = structuredClone(STELLA_949);
  unknown.outfit = [{ garment: "cape" }];
  assert.throws(() => createHumanoid({ world: new World("x", new Identities()), document: validateHumanoid(unknown), wardrobe }), /not in wardrobe/);
  assert.throws(() => createHumanoid({ world: new World("x", new Identities()), document: STELLA_949 }), /needs a wardrobe/);
  // Every parameter in the shared table is present in the preset and inside its slider span.
  for (const d of HUMANOID_PARAMETERS) {
    assert.ok(d.slider[0] >= d.min && d.slider[1] <= d.max, d.key);
    assert.ok(Number.isFinite(STELLA_949.parameters[d.key]), d.key);
  }
});

test("Rest pose stands on the ground at the authored height across the parameter range", () => {
  const patches = [{}, { height: 1.45, legLength: 0.47 }, { height: 2, headSize: 0.8, legLength: 0.55 }, { backpack: true, hair: "none" }];
  for (const gender of ["female", "androgynous", "male"])
    for (const build of ["classic", "slim", "athletic", "curvy", "broad", "heavy"]) patches.push({ gender, build, hair: "ponytail" });
  for (const patch of patches) {
    const world = new World("rest", new Identities()),
      document = edit(patch),
      rig = createHumanoid({ world, document, wardrobe });
    poseHumanoid(rig, {});
    world.snapshot();
    world.resolve();
    const { low, high } = verticalExtent(world),
      H = document.parameters.height;
    // Shoe soles are grown by the shoe's thickness, so they may sit a few millimetres low.
    assert.ok(Math.abs(low) < 0.012, `soles reach the ground (${low})`);
    // Hair volumes (curls) may rise up to 7 cm above the skull, and soles lift the body;
    // the skull defines the authored height.
    assert.ok(high >= H - 0.01 && high < H + rig.lift + 0.07, `top ${high} vs height ${H}`);
    for (const { entity } of rig.parts) assert.ok(entity.shape.size.every((n) => Number.isFinite(n) && n > 0), "every part has a real size");
    const m = humanoidMeasurements(document.parameters);
    assert.ok(Math.abs(m.thighLength + m.shinLength + m.foot.height - m.hipZ) < 1e-9);
    assert.ok(m.shoulderZ > m.waistZ && m.waistZ > m.hipZ);
  }
});

test("Walking and turning poses stay unit, bounded and grounded; pack inertia cannot explode", () => {
  const world = new World("walk", new Identities()),
    rig = createHumanoid({ world, document: edit({ backpack: true }), wardrobe });
  let lowest = Infinity;
  for (let i = 0; i < 600; i++) {
    world.snapshot();
    // Deliberately extreme driving input: the spring must remain clamped and finite.
    poseHumanoid(rig, { phase: i * 0.11, amount: 1, turn: (i % 120 < 60 ? 1 : -1) * 40, accel: i % 50 === 0 ? 400 : -30, dt: 1 / 60 });
    world.resolve();
    for (const e of world.entities.values()) assert.ok(Math.abs(Math.hypot(...e.rotation) - 1) < 1e-9);
    assert.ok(Math.abs(rig.motion.packPitch) <= 0.3 && Math.abs(rig.motion.packRoll) <= 0.3);
    assert.ok(Number.isFinite(rig.motion.packPitchRate) && Number.isFinite(rig.motion.packRollRate));
    assert.ok(Math.abs(rig.motion.lean) <= 0.22);
    lowest = Math.min(lowest, verticalExtent(world).low);
  }
  // Swing-phase knees lift the shins; nothing should sink far below the ground plane.
  assert.ok(lowest > -0.06, `lowest point ${lowest}`);
});

test("Rebuild and disposal remove every figure entity; overrides restore palette slots", () => {
  const world = new World("own", new Identities()),
    baseline = world.entities.size,
    library = new Penthouse().libraries["toy.humanoid"];
  let rig = library({ world, document: STELLA_949, wardrobe });
  const count = world.entities.size - baseline;
  assert.ok(count > 30 && rig.parts.length >= 30);
  const black = { baseColor: [0, 0, 0], emissionColor: [0, 0, 0], emissionStrength: 0, specularColor: [1, 1, 1], specularSharpness: 0.5, reflectivity: 0 };
  rig.override(black);
  assert.ok(rig.parts.every(({ entity }) => entity.shape.material === black));
  rig.override(null);
  // Body parts return to their palette slot, garment parts to their own garment material.
  assert.ok(rig.parts.every(({ entity, slot }) => entity.shape.material === (typeof slot === "number" ? rig.garmentMaterials[slot] : rig.materials[slot])));
  for (let i = 0; i < 20; i++) {
    rig.dispose();
    rig = createHumanoid({ world, document: edit({ height: 1.5 + i * 0.02 }), wardrobe });
    assert.equal(world.entities.size - baseline, count);
  }
  rig.dispose();
  assert.equal(world.entities.size, baseline);
  // With a backpack the pack pivot exists; without one posing still works.
  const packed = createHumanoid({ world, document: edit({ backpack: true }), wardrobe });
  assert.ok(packed.pack);
  packed.dispose();
  const bare = createHumanoid({ world, document: STELLA_949, wardrobe });
  assert.equal(bare.pack, null);
  poseHumanoid(bare, { amount: 1, phase: 1, dt: 1 / 60 });
});

test("Garments grow the body they cover; any generated outfit fits any body", () => {
  const nude = structuredClone(STELLA_949);
  nude.outfit = [];
  const world = new World("wear", new Identities()),
    bare = createHumanoid({ world, document: validateHumanoid(nude), wardrobe }),
    bareParts = bare.parts.length;
  bare.dispose();
  // Thigh-highs cover thigh, calf and foot on both legs: at least six more parts.
  const stockings = structuredClone(nude);
  stockings.outfit = [{ garment: "thigh-highs" }];
  const worn = createHumanoid({ world, document: validateHumanoid(stockings), wardrobe });
  const legwear = worn.parts.filter(({ slot }) => slot === 0);
  assert.ok(legwear.length >= 6 && worn.parts.length - bareParts === legwear.length);
  // Every legwear part is a rounded shape, never a box, with flat hems where it stops.
  assert.ok(legwear.every(({ entity }) => entity.shape.rounded));
  assert.ok(legwear.some(({ entity }) => entity.shape.rounded.flatNear));
  worn.dispose();
  // A seeded generator yields the same outfit twice; every outfit builds on every body.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const first = generateOutfit(wardrobe, { random }),
    again = (seed = 7, generateOutfit(wardrobe, { random }));
  assert.deepEqual(first, again);
  for (let i = 0; i < 40; i++) {
    const doc = structuredClone(STELLA_949);
    doc.outfit = generateOutfit(wardrobe, { random, colors: [[0.2, 0.1, 0.3]] });
    doc.parameters.gender = ["female", "androgynous", "male"][i % 3];
    doc.parameters.build = ["classic", "slim", "athletic", "curvy", "broad", "heavy"][i % 6];
    const slots = doc.outfit.map((e) => wardrobe.garments.get(e.garment).slot);
    for (const slot of ["top", "bottom", "shoes"]) assert.ok(slots.includes(slot), `${slot} always present`);
    const rig = createHumanoid({ world, document: validateHumanoid(doc), wardrobe });
    for (const { entity } of rig.parts) assert.ok(entity.shape.size.every((n) => Number.isFinite(n) && n > 0));
    rig.dispose();
  }
  assert.equal(world.entities.size, 0);
  // Wardrobe validation names the bad garment; shorthands expand to region spans.
  assert.throws(() => validateWardrobe({ schemaVersion: 1, kind: "wardrobe", id: "w", garments: [{ id: "x", name: "X", slot: "hat", color: [0, 0, 0], finish: "matte", chest: [0, 1] }] }), /Garment x: slot/);
  assert.throws(() => validateWardrobe({ schemaVersion: 1, kind: "wardrobe", id: "w", garments: [{ id: "x", name: "X", slot: "top", color: [0, 0, 0], finish: "velvet", chest: [0, 1] }] }), /finish/);
  assert.throws(() => validateWardrobe({ schemaVersion: 1, kind: "wardrobe", id: "w", garments: [{ id: "x", name: "X", slot: "top", color: [0, 0, 0], finish: "matte", chest: [0.5, 0.2] }] }), /chest/);
  assert.deepEqual(garmentCoverage({ sleeve: "long", legs: "shorts", chest: [0, 1] }), { upperArm: [0, 1], forearm: [0, 0.94], thigh: [0, 0.4], chest: [0, 1] });
  assert.ok(Object.keys(GARMENT_SLOTS).every((slot) => [...wardrobe.garments.values()].some((g) => g.slot === slot)), "the Freelancer wardrobe fills every slot");
});

test("Rounded-shape lanes decode exactly as the shader reads them; the mesh is indexed and closed", () => {
  // JavaScript mirror of SHAPE_GLSL's decode, in Float32 like the GPU attribute.
  const decode = (poseW, sizeW) => {
    const w = Math.fround(poseW),
      s = Math.fround(sizeW),
      code = Math.floor(s),
      flags = Math.floor(code / 100);
    return { taper: Math.floor(w) / 1000, depthTaper: (w - Math.floor(w)) * 4.0001, peak: (code - flags * 100) / 100, flags, bulge: (s - code) * 2 - 1 };
  };
  for (const profile of [
    { taper: 0.05, depthTaper: 3.99, bulge: -0.95, peak: 0.01, flatNear: true, flatFar: true, widthOnly: true },
    { taper: 1, bulge: 0, peak: 0.5 },
    { taper: 0.68, depthTaper: 0.62, bulge: 0.84, peak: 0.5, widthOnly: true },
    { taper: 3.99, bulge: 0.95, peak: 0.99, flatFar: true },
  ]) {
    const r = roundedProfile(profile),
      d = decode(packTaperLane(r), packRoundedLane(r));
    assert.ok(Math.abs(d.taper - r.taper) <= 0.0005, `taper ${d.taper} vs ${r.taper}`);
    assert.ok(Math.abs(d.depthTaper - r.depthTaper) <= 0.003, `depth taper ${d.depthTaper} vs ${r.depthTaper}`);
    assert.ok(Math.abs(d.peak - r.peak) <= 0.005);
    assert.ok(Math.abs(d.bulge - r.bulge) <= 0.0005, `bulge ${d.bulge} vs ${r.bulge}`);
    assert.equal(d.flags, (r.flatNear ? 1 : 0) + (r.flatFar ? 2 : 0) + (r.widthOnly ? 4 : 0));
  }
  // Boxes keep pose.w = 0; a rounded record can never encode 0.
  assert.ok(packTaperLane(roundedProfile({ taper: 0.05 })) >= 50);
  assert.throws(() => roundedProfile({ taper: 0 }), /tapers/);
  const { vertices, indices } = roundedGeometry();
  assert.equal(vertices.length % 6, 0);
  assert.ok(indices.length % 3 === 0 && Math.max(...indices) < vertices.length / 6 && vertices.length / 6 < 65536);
});
