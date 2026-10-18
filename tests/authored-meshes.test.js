/**
 * Project schema v4: authored mesh assets and joint poses as ordinary content (decision 0023).
 * Covers validation against the generator catalog, v3 → v4 ingress, recipe-keyed sharing
 * through Directory leases, scene reconciliation of poses/recipes, and mesh-aware bounds.
 * A fake renderer stands in for the GPU: it records which MeshData became resident and
 * whether each copy was freed, which is all the Directory/scene contract promises.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { copyData, validateProject, upgradeProject, PROJECT_SCHEMA_VERSION } from "../engine/basement/project.js";
import { ASSEMBLY_GENERATORS, assembly } from "../engine/penthouse/assembly.js";
import { MESH_GENERATORS, meshLibraries } from "../engine/penthouse/mesh-generators.js";
import { TUBE_PARAMETERS, tubeOptions } from "../engine/penthouse/skinned-tube.js";
import { Directory } from "../engine/directory/directory.js";
import { AuthoredMeshes } from "../engine/directory/authored-meshes.js";
import { SceneInstance } from "../engine/directory/scene-instance.js";
import { World, Identities } from "../engine/basement/world.js";
import { assetBounds, worldBounds } from "../engine/basement/asset-bounds.js";
import { ATRIUM_PROJECT } from "../examples/atrium/project.js";

const options = { generators: ASSEMBLY_GENERATORS, meshGenerators: MESH_GENERATORS };
const half = Math.SQRT1_2;

/** GPU stand-in: resident copies expose the GpuMesh fields scenes and bounds read. */
function fakeRenderer() {
  const made = [];
  return {
    made,
    createMesh(data) {
      const mesh = { data, skinned: data.skinned, skeleton: data.skeleton, reach: data.reach, disposed: false, dispose() { this.disposed = true; } };
      made.push(mesh);
      return mesh;
    },
  };
}

/** A Directory with the two library families authored scenes use. */
function directory() {
  const d = new Directory();
  d.register("toy.assembly", assembly);
  for (const [name, factory] of Object.entries(meshLibraries())) d.register(name, factory);
  return d;
}

/** Atrium plus one tube mesh, a limb asset that uses it twice, and one posed placement. */
function fixture() {
  const p = copyData(ATRIUM_PROJECT), s = p.scenes[0], material = p.materials[0].id;
  p.meshes.push({ id: "mesh:arm", name: "Arm", generator: "mesh.tube", generatorVersion: 1, parameters: { length: 1, joints: 2 } });
  const part = (id, x) => ({ id, parent: null, position: [x, 0, 0], rotation: [0, 0, 0, 1], shape: { mesh: "mesh:arm", size: [1, 1, 1], material, castShadow: true, ambientBlocker: false } });
  p.assets.push({ id: "asset:limbs", name: "Limbs", generator: "toy.assembly", generatorVersion: 1, parts: [part("part:left", -0.5), part("part:right", 0.5)], colliders: [] });
  s.entities.push({
    id: "limbs", name: "Limbs", asset: "asset:limbs", tag: null, locked: false, parent: null,
    position: [0, 0, 2], rotation: [0, 0, 0, 1], scale: 1,
    // A quarter turn of the elbow about its local x axis.
    poses: { "part:left": { joint1: [half, 0, 0, half] } },
  });
  return { p, s, entity: s.entities.at(-1) };
}

test("Schema v4 validates mesh recipes, mesh parts and joint poses against the generator catalog", () => {
  assert.equal(PROJECT_SCHEMA_VERSION, 4);
  const { p } = fixture();
  validateProject(p, options);
  const broken = [
    (p) => (p.meshes[0].generator = "mesh.unknown"),
    (p) => (p.meshes[0].generatorVersion = 2),
    (p) => (p.meshes[0].parameters.joints = 0),
    (p) => (p.meshes[0].parameters.lenght = 1), // typo: unknown keys fail loudly
    (p) => (p.meshes[0].parameters.joints = 2.5),
    (p) => p.meshes.push({ ...p.meshes[0] }), // duplicate ID
    (p) => (p.assets.at(-1).parts[0].shape.mesh = "mesh:missing"),
    (p) => (p.scenes[0].entities.at(-1).poses = { "part:missing": {} }),
    (p) => (p.scenes[0].entities.at(-1).poses = { "part:left": { joint9: [0, 0, 0, 1] } }),
    (p) => (p.scenes[0].entities.at(-1).poses = { "part:left": { joint1: [0, 0, 0, 2] } }),
    (p) => (p.scenes[0].entities.at(-1).poses = []),
  ];
  for (const edit of broken) {
    const copy = copyData(p);
    edit(copy);
    assert.throws(() => validateProject(copy, options), undefined, edit.toString());
  }
  // Without the catalog (headless tools), structure still validates but joints are unknown.
  validateProject(p);
});

test("The tube's parameter catalog is the single source for defaults, limits and editor steps", () => {
  const defaults = tubeOptions();
  for (const p of TUBE_PARAMETERS) {
    assert.equal(defaults[p.key], p.value);
    assert.ok(p.min <= p.value && p.value <= p.max && p.step > 0, p.key);
    assert.throws(() => tubeOptions({ [p.key]: p.max + 1 }));
  }
  assert.equal(MESH_GENERATORS["mesh.tube"].parameters, TUBE_PARAMETERS);
  assert.deepEqual(MESH_GENERATORS["mesh.tube"].joints({ joints: 4 }), ["joint0", "joint1", "joint2", "joint3"]);
});

test("Version three ingress adds an empty mesh library and older versions reject mesh data", () => {
  const v3 = copyData(ATRIUM_PROJECT);
  v3.schemaVersion = 3;
  delete v3.meshes;
  const upgraded = upgradeProject(v3);
  assert.equal(upgraded.schemaVersion, 4);
  assert.deepEqual(upgraded.meshes, []);
  assert.equal(v3.meshes, undefined, "ingress copies; the source is untouched");
  const { p } = fixture();
  p.schemaVersion = 3;
  assert.throws(() => upgradeProject(p), /schema version 4/);
});

test("Equal recipes share one resident mesh; changed or unused recipes release their lease", () => {
  const { p } = fixture(), renderer = fakeRenderer(), d = directory();
  p.meshes.push({ ...copyData(p.meshes[0]), id: "mesh:twin", name: "Twin", parameters: { joints: 2, length: 1 } });
  const a = new AuthoredMeshes(d, renderer, p.meshes, "scene:a"), b = new AuthoredMeshes(d, renderer, p.meshes, "scene:b");
  const arm = a.get("mesh:arm");
  assert.equal(a.get("mesh:twin"), arm, "parameter order does not change the content key");
  assert.equal(b.get("mesh:arm"), arm, "two scenes share through the Directory");
  assert.equal(renderer.made.length, 1);
  // Editing one recipe builds a new mesh on next use; the old one survives while shared.
  p.meshes[0] = { ...p.meshes[0], parameters: { length: 2, joints: 2 } };
  a.sync(p.meshes);
  const longer = a.get("mesh:arm");
  assert.notEqual(longer, arm);
  a.retain(new Set(["mesh:arm"]));
  assert.equal(arm.disposed, false, "scene a released it (its twin is unused), but scene b still holds a lease");
  b.dispose();
  assert.equal(arm.disposed, true);
  a.dispose();
  assert.equal(longer.disposed, true);
  assert.throws(() => a.get("mesh:arm"), /disposed/);
  assert.throws(() => new AuthoredMeshes(d, null, p.meshes, "headless").get("mesh:arm"), /renderer/);
});

test("Scene instances pose skinned parts from authored offsets and swap meshes when recipes change", () => {
  const { p, s, entity } = fixture(), renderer = fakeRenderer(), d = directory();
  validateProject(p, options);
  const world = new World("meshes", new Identities()), live = new SceneInstance(d, world, p, s, { renderer });
  const left = live.part("limbs", "part:left"), right = live.part("limbs", "part:right");
  assert.equal(left.shape.mesh, right.shape.mesh, "two parts of one asset share the mesh");
  assert.notEqual(left.skin, right.skin, "but each owns its pose");
  const elbow = left.skin.joint("joint1");
  // Rest rotation is identity, so the authored offset becomes the local rotation.
  assert.deepEqual([...left.skin.local.slice(elbow * 4, elbow * 4 + 4)].map((n) => +n.toFixed(6)), [half, 0, 0, half].map((n) => +n.toFixed(6)));
  assert.deepEqual([...right.skin.local.slice(elbow * 4, elbow * 4 + 4)], [0, 0, 0, 1]);
  const revision = left.skin.revision, skin = left.skin, id = left.id;
  // Removing the authored entry returns the joint to rest without rebuilding anything.
  delete entity.poses;
  live.apply(s, p);
  assert.equal(left.skin, skin);
  assert.ok(left.skin.revision > revision);
  assert.deepEqual([...left.skin.local.slice(elbow * 4, elbow * 4 + 4)], [0, 0, 0, 1]);
  // A recipe with a different skeleton swaps mesh and pose but keeps the runtime entity.
  const old = left.shape.mesh;
  p.meshes[0].parameters.joints = 3;
  entity.poses = { "part:right": { joint2: [0, half, 0, half] } };
  validateProject(p, options);
  live.apply(s, p);
  assert.equal(live.part("limbs", "part:left").id, id);
  assert.notEqual(left.shape.mesh, old);
  assert.equal(left.skin.skeleton.count, 3);
  assert.equal(old.disposed, true, "the replaced recipe is released once no part draws it");
  assert.equal(right.skin.local[right.skin.joint("joint2") * 4 + 1].toFixed(6), half.toFixed(6));
  // A scene with mesh parts but no renderer cannot become resident.
  assert.throws(() => new SceneInstance(d, new World("headless", new Identities()), p, s), /renderer/);
  live.dispose();
  assert.ok(renderer.made.every((m) => m.disposed));
});

test("Placement and selection bounds measure mesh parts from their rest bounds, scaled by size", () => {
  const { p, s } = fixture(), renderer = fakeRenderer(), d = directory();
  const world = new World("bounds", new Identities()), live = new SceneInstance(d, world, p, s, { renderer });
  const mesh = live.meshes.get("mesh:arm"), asset = p.assets.at(-1);
  // The tube hangs from its origin down -z by its length (1 m), radius 0.07 m.
  const b = assetBounds(asset, (id) => live.meshes.get(id).data.bounds);
  assert.ok(Math.abs(b.min[2] - mesh.data.bounds.min[2]) < 1e-6 && b.min[2] < -0.99);
  assert.ok(Math.abs(b.max[0] - (0.5 + mesh.data.bounds.max[0])) < 1e-6);
  // Without a resolver a mesh is treated as a unit box (documented fallback).
  assert.ok(Math.abs(assetBounds(asset).min[2] + 0.5) < 1e-9);
  asset.parts[0].shape.size = [1, 1, 2];
  assert.ok(assetBounds(asset, (id) => live.meshes.get(id).data.bounds).min[2] < -1.99);
  world.snapshot();
  world.resolve();
  const part = live.part("limbs", "part:left"), w = worldBounds(world, new Set([part.id]));
  assert.ok(Math.abs(w.min[2] - (2 + mesh.data.bounds.min[2])) < 1e-5, `${w.min}`);
  live.dispose();
});
