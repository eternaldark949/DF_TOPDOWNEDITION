/** Procedural humanoid: document validation, rest-pose measurements, bounded posing and
 * rebuild ownership, tested at World level without a GPU or review DOM. */
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
import { STELLA_949 } from "../games/freelancer/humanoid/preset.js";

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
  assert.throws(() => validateHumanoid(edit({ thigh: 0.24, hipWidth: 0.3 })), /Thighs/);
  assert.throws(() => validateHumanoid(edit({ waistWidth: 0.45, shoulderWidth: 0.3, hipWidth: 0.3 })), /Waist/);
  assert.throws(() => validateHumanoid({ ...structuredClone(STELLA_949), generatorVersion: 2 }), /not installed/);
  const missing = structuredClone(STELLA_949);
  delete missing.palette.legwear;
  assert.throws(() => validateHumanoid(missing), /legwear/);
  // Every parameter in the shared table is present in the preset and inside its slider span.
  for (const d of HUMANOID_PARAMETERS) {
    assert.ok(d.slider[0] >= d.min && d.slider[1] <= d.max, d.key);
    assert.ok(Number.isFinite(STELLA_949.parameters[d.key]), d.key);
  }
});

test("Rest pose stands on the ground at the authored height across the parameter range", () => {
  for (const patch of [{}, { height: 1.45, legLength: 0.47 }, { height: 2, headHeight: 0.115, legLength: 0.55 }, { backpack: false, hair: "none" }]) {
    const world = new World("rest", new Identities()),
      document = edit(patch),
      rig = createHumanoid({ world, document });
    poseHumanoid(rig, {});
    world.snapshot();
    world.resolve();
    const { low, high } = verticalExtent(world),
      H = document.parameters.height;
    assert.ok(Math.abs(low) < 0.012, `soles reach the ground (${low})`);
    // Hair caps may rise a few centimetres above the skull; the skull defines height.
    assert.ok(high >= H - 0.01 && high < H + 0.06, `top ${high} vs height ${H}`);
    const m = humanoidMeasurements(document.parameters);
    assert.ok(Math.abs(m.thighLength + m.shinLength + m.foot.height - m.hipZ) < 1e-9);
    assert.ok(m.shoulderZ > m.waistZ && m.waistZ > m.hipZ);
  }
});

test("Walking and turning poses stay unit, bounded and grounded; pack inertia cannot explode", () => {
  const world = new World("walk", new Identities()),
    rig = createHumanoid({ world, document: STELLA_949 });
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
  let rig = library({ world, document: STELLA_949 });
  const count = world.entities.size - baseline;
  assert.ok(count > 30 && rig.parts.length >= 30);
  const black = { baseColor: [0, 0, 0], emissionColor: [0, 0, 0], emissionStrength: 0, specularColor: [1, 1, 1], specularSharpness: 0.5, reflectivity: 0 };
  rig.override(black);
  assert.ok(rig.parts.every(({ entity }) => entity.shape.material === black));
  rig.override(null);
  assert.ok(rig.parts.every(({ entity, slot }) => entity.shape.material === rig.materials[slot]));
  for (let i = 0; i < 20; i++) {
    rig.dispose();
    rig = createHumanoid({ world, document: edit({ height: 1.5 + i * 0.02 }) });
    assert.equal(world.entities.size - baseline, count);
  }
  rig.dispose();
  assert.equal(world.entities.size, baseline);
  // Without a backpack the pack pivot is absent and posing still works.
  const bare = createHumanoid({ world, document: edit({ backpack: false }) });
  assert.equal(bare.pack, null);
  poseHumanoid(bare, { amount: 1, phase: 1, dt: 1 / 60 });
});
