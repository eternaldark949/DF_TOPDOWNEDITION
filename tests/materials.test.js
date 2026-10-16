/** Linked material contracts: migration, shared identity, private bindings and safe source data. */
import test from "node:test";
import assert from "node:assert/strict";
import { createMaterial } from "../engine/basement/material.js";
import {
  validateProject,
  upgradeProject,
  copyData,
  parseProject,
} from "../engine/basement/project.js";
import {
  assignMaterial,
  isolateMaterial,
  partMaterial,
  materialUsage,
} from "../engine/basement/material-authoring.js";
import { ProjectDocument } from "../engine/basement/document.js";
import { SceneInstance } from "../engine/directory/scene-instance.js";
import { World, Identities } from "../engine/basement/world.js";
import { assembly } from "../engine/penthouse/assembly.js";
import { ATRIUM_PROJECT } from "../examples/atrium/project.js";
import { Presentation } from "../engine/basement/presentation.js";
const directory = { create: (_name, options) => assembly(options) };
/** Two placements use one source asset, giving genuine links rather than equal copied RGB. */
function data() {
  const p = copyData(ATRIUM_PROJECT),
    e = p.scenes[0].entities.find((e) => !e.locked);
  p.scenes[0].entities.push({
    ...copyData(e),
    id: "test-copy",
    position: [e.position[0] + 2, ...e.position.slice(1)],
  });
  return {
    p,
    e,
    other: p.scenes[0].entities.at(-1),
    part: p.assets.find((a) => a.id === e.asset).parts.find((x) => x.shape),
  };
}
test("Version-one ingress migrates once, preserving geometry IDs and radiance; current data validates without mutation", () => {
  const original = copyData(ATRIUM_PROJECT),
    legacy = copyData(original);
  legacy.schemaVersion = 1;
  for (const a of legacy.assets)
    for (const p of a.parts)
      if (p.shape) {
        const m = original.materials.find((m) => m.id === p.shape.material);
        p.shape.color = m.baseColor;
        p.shape.emission = m.emissionStrength;
        delete p.shape.material;
      }
  delete legacy.materials;
  const before = JSON.stringify(legacy),
    up = upgradeProject(legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(up.schemaVersion, 2);
  assert.deepEqual(up.scenes, original.scenes);
  assert.deepEqual(
    up.assets.map((a) => a.parts.map((p) => p.id)),
    original.assets.map((a) => a.parts.map((p) => p.id)),
  );
  for (let i = 0; i < up.assets.length; i++)
    for (let j = 0; j < up.assets[i].parts.length; j++) {
      const s = up.assets[i].parts[j].shape,
        o = legacy.assets[i].parts[j].shape;
      if (!s) continue;
      const m = up.materials.find((m) => m.id === s.material);
      assert.deepEqual(m.baseColor, o.color);
      m.emissionColor.forEach((v, k) =>
        assert.equal(v * m.emissionStrength, o.color[k] * o.emission),
      );
    }
  assert.equal(upgradeProject(up), up);
  assert.equal(validateProject(up), up);
  assert.equal(parseProject(JSON.stringify(legacy)).schemaVersion, 2);
  const bad = copyData(legacy);
  bad.assets[0].parts[0].shape.emission = NaN;
  assert.throws(() => upgradeProject(bad));
});
test("Runtime links share identity, live edits retain geometry, and Play copies are isolated", () => {
  const { p, e, other, part } = data(),
    world = new World("test", new Identities()),
    s = new SceneInstance(directory, world, p, p.scenes[0]),
    a = s.part(e.id, part.id),
    b = s.part(other.id, part.id),
    shared = a.shape.material,
    id = a.id;
  assert.equal(shared, b.shape.material);
  assert.notEqual(
    shared,
    p.materials.find((m) => m.id === part.shape.material),
  );
  const next = copyData(p);
  next.materials.find((m) => m.id === part.shape.material).emissionColor = [
    0.1, 0.2, 1,
  ];
  s.apply(next.scenes[0], next);
  assert.equal(a.id, id);
  assert.equal(a.shape.material, shared);
  assert.deepEqual(b.shape.material.emissionColor, [0.1, 0.2, 1]);
  const play = new SceneInstance(
    directory,
    new World("play", new Identities()),
    copyData(next),
    next.scenes[0],
  );
  play.part(e.id, part.id).shape.material.emissionStrength = 7;
  assert.notEqual(shared.emissionStrength, 7);
  assert.notEqual(
    next.materials.find((m) => m.id === part.shape.material).emissionStrength,
    7,
  );
  play.dispose();
  s.dispose();
  s.dispose();
  assert.equal(s.materials.values.size, 0);
  assert.equal(world.entities.size, 0);
  assert.throws(() => s.apply(next.scenes[0], next), /disposed/);
});
test("Single-user overrides isolate one placement and survive undo/redo without ID collisions", () => {
  const { p, e, other, part } = data(),
    doc = new ProjectDocument(p),
    old = part.shape.material,
    id = doc.allocateId("material");
  assert.ok(!p.materials.some((m) => m.id === id));
  doc.edit("Private material", (next) =>
    isolateMaterial(
      next,
      next.scenes[0].entities.find((x) => x.id === e.id),
      old,
      id,
    ),
  );
  const a = doc.data.scenes[0].entities.find((x) => x.id === e.id),
    b = doc.data.scenes[0].entities.find((x) => x.id === other.id);
  assert.equal(partMaterial(a, part), id);
  assert.equal(partMaterial(b, part), old);
  assert.equal(materialUsage(doc.data, id).instances, 1);
  validateProject(doc.data);
  doc.undo();
  assert.deepEqual(doc.data, p);
  doc.redo();
  assert.equal(
    partMaterial(
      doc.data.scenes[0].entities.find((x) => x.id === e.id),
      part,
    ),
    id,
  );
});
test("Invalid material references/domains and inline v2 appearance fail before adoption; prototype IDs stay data", () => {
  for (const edit of [
    (p) => (p.materials[0].emissionStrength = Infinity),
    (p) => (p.materials[0].baseColor = [-1, 0, 0]),
    (p) => (p.assets[0].parts[0].shape.material = "missing"),
    (p) => (p.assets[0].parts[0].shape.color = [1, 1, 1]),
    (p) =>
      (p.scenes[0].entities[0].materialOverrides = {
        missing: p.materials[0].id,
      }),
  ]) {
    const p = copyData(ATRIUM_PROJECT);
    edit(p);
    assert.throws(() => validateProject(p));
  }
  const { p, e, part } = data();
  part.id = "__proto__";
  assignMaterial(e, part.id, part.shape.material);
  assert.equal(Object.getPrototypeOf(e.materialOverrides), Object.prototype);
  assert.equal(Object.hasOwn(e.materialOverrides, "__proto__"), true);
  assert.equal(partMaterial(copyData(e), part), part.shape.material);
  validateProject(p);
  const m = createMaterial({
    baseColor: [0, 0, 0],
    emissionColor: [1, 0.2, 0],
    emissionStrength: 4,
  });
  assert.deepEqual(m.baseColor, [0, 0, 0]);
  assert.equal(m.emissionStrength, 4);
});
test("Cancelled cooperative instantiation releases its material links and partial geometry", () => {
  const { p } = data(),
    world = new World("cancel", new Identities()),
    g = SceneInstance.prepare(directory, world, p, p.scenes[0]);
  g.next();
  assert.ok(world.entities.size > 0);
  g.return();
  assert.equal(world.entities.size, 0);
});
test("Presentation owns exposure and independent HDR policy; bloom configuration has no exposure authority", () => {
  const r = { gl: {}, stats: { programs: 0 }, canvas: { width: 1, height: 1 } },
    p = new Presentation(r),
    before = p.settings,
    c = p.background.slice();
  for (const value of [{ exposure: 0 }, { mode: "fake" }, { threshold: 1 }]) {
    assert.throws(() => p.configure(value), RangeError);
    assert.equal(p.settings, before);
  }
  p.configure({ exposure: 2, mode: "direct" });
  p.background.forEach((v, i) => assert.ok(v > c[i]));
  assert.equal(p.prepare(true), false);
  p.dispose();
  p.dispose();
  assert.throws(() => p.configure({ mode: "hdr" }), /disposed/);
});

test('Anchor-only legacy scenes migrate without inventing unused material resources',()=>{const p=copyData(ATRIUM_PROJECT);p.schemaVersion=1;delete p.materials;for(const a of p.assets)for(const part of a.parts)part.shape=null;const up=upgradeProject(p);assert.deepEqual(up.materials,[]);assert.equal(validateProject(up),up);});
