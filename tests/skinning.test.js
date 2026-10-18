/** Skeletons, skinned meshes, the loft builder, the animate phase and mesh leases (no GPU). */
import test from "node:test";
import assert from "node:assert/strict";
import { createSkeleton, SkeletonPose, affineFromRotation, MAX_JOINTS } from "../engine/basement/skeleton.js";
import { createMesh, loft, quantiseWeights, MESH_STRIDE } from "../engine/basement/mesh.js";
import { rotateVector } from "../engine/basement/rotation.js";
import { Runtime } from "../engine/lobby/runtime.js";
import { Directory } from "../engine/directory/directory.js";
import { MeshLibrary } from "../engine/directory/mesh-library.js";
import { tubeRecipe, tubeKey } from "../engine/penthouse/skinned-tube.js";

/** CPU mirror of skinning.js placeVertex for a skinned vertex: blend rows, then apply. */
function skinVertex(mesh, pose, v) {
  const f = new Float32Array(mesh.vertices), b = new Uint8Array(mesh.vertices), o = (v * MESH_STRIDE) / 4;
  const rows = new Float64Array(12);
  for (let i = 0; i < 4; i++) {
    const w = b[v * MESH_STRIDE + 28 + i] / 255, j = b[v * MESH_STRIDE + 24 + i];
    for (let k = 0; k < 12; k++) rows[k] += w * pose.palette[j * 12 + k];
  }
  const [x, y, z] = [f[o], f[o + 1], f[o + 2]];
  return [0, 1, 2].map((r) => rows[r * 4] * x + rows[r * 4 + 1] * y + rows[r * 4 + 2] * z + rows[r * 4 + 3]);
}

const close = (a, b, eps = 1e-5) => a.every((n, i) => Math.abs(n - b[i]) < eps);

test("affine rotation matches the quaternion convention used by world transforms", () => {
  const q = [0.2, -0.4, 0.3, 0.8].map((n, _, a) => n / Math.hypot(...a)), m = affineFromRotation(q, [1, 2, 3], new Float64Array(12));
  const out = rotateVector(q, 0.5, -0.7, 0.25, [0, 0, 0]);
  const viaMatrix = [0, 1, 2].map((r) => m[r * 4] * 0.5 + m[r * 4 + 1] * -0.7 + m[r * 4 + 2] * 0.25 + m[r * 4 + 3]);
  assert.ok(close(viaMatrix, [out[0] + 1, out[1] + 2, out[2] + 3], 1e-12));
});

test("skeletons validate their hierarchy and rest poses skin to identity", () => {
  assert.throws(() => createSkeleton({ joints: [] }), /1–64/);
  assert.throws(() => createSkeleton({ joints: [{ name: "a", parent: 1, translation: [0, 0, 0] }, { name: "b", parent: null, translation: [0, 0, 0] }] }), /earlier joint/);
  assert.throws(() => createSkeleton({ joints: [{ name: "a", translation: [0, 0, 0] }, { name: "a", parent: 0, translation: [0, 0, 1] }] }), /Duplicate/);
  assert.throws(() => createSkeleton({ joints: [{ name: "a", translation: [0, 0, 0], rotation: [0, 0, 0, 2] }] }), /unit quaternion/);
  assert.throws(() => createSkeleton({ joints: Array.from({ length: MAX_JOINTS + 1 }, (_, i) => ({ name: `j${i}`, parent: i ? i - 1 : null, translation: [0, 0, -0.1] })) }), /1–64/);
  const tilt = [Math.sin(0.3), 0, 0, Math.cos(0.3)];
  const skeleton = createSkeleton({ joints: [{ name: "root", translation: [0.1, 0, 1], rotation: tilt }, { name: "mid", parent: 0, translation: [0, 0, -0.4], rotation: tilt }, { name: "tip", parent: 1, translation: [0, 0.05, -0.3] }] });
  const pose = new SkeletonPose(skeleton);
  for (let j = 0; j < 3; j++) assert.ok(close(Array.from(pose.palette.subarray(j * 12, j * 12 + 12)), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]), `joint ${j}`);
  assert.equal(pose.joint("mid"), 1);
  assert.throws(() => pose.joint("elbow"), /Unknown joint/);
});

test("bending a joint moves only the vertices it weighs, around the joint", () => {
  const { skeleton, mesh } = tubeRecipe({ length: 1, joints: 2, radius: 0.05, taper: 1, rings: 21 });
  const pose = new SkeletonPose(skeleton), revision = pose.revision;
  assert.equal(pose.update(), false, "no change, no new revision");
  assert.equal(pose.revision, revision);
  pose.bend(1, [1, 0, 0], Math.PI / 2);
  assert.equal(pose.update(), true);
  assert.equal(pose.revision, revision + 1);
  const positions = new Float32Array(mesh.vertices);
  let tipCentre = null, rootRing = null;
  for (let v = 0; v < mesh.vertexCount; v++) {
    const o = (v * MESH_STRIDE) / 4, p = [positions[o], positions[o + 1], positions[o + 2]], out = skinVertex(mesh, pose, v);
    if (p[2] > -0.05) rootRing ??= [p, out];
    if (Math.abs(p[0]) < 1e-6 && Math.abs(p[1]) < 1e-6 && p[2] < -0.999) tipCentre = out;
  }
  // The upper segment is untouched; the lower one swings +90° about x at the elbow (z -0.5).
  assert.ok(close(rootRing[0], rootRing[1]));
  assert.ok(close(tipCentre, [0, 0.5, -0.5], 1e-4), `tip at ${tipCentre}`);
});

test("mesh reach bounds every rotation-only pose", () => {
  const { skeleton, mesh } = tubeRecipe({ joints: 4, length: 1.2 });
  assert.ok(mesh.reach >= mesh.radius);
  const pose = new SkeletonPose(skeleton);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let trial = 0; trial < 40; trial++) {
    for (let j = 0; j < skeleton.count; j++) pose.bend(j, [random(), random(), random() + 0.01], random() * Math.PI);
    pose.update();
    for (let v = 0; v < mesh.vertexCount; v += 7) assert.ok(Math.hypot(...skinVertex(mesh, pose, v)) <= mesh.reach + 1e-5);
  }
});

test("meshes validate input and quantise weights to exactly 255", () => {
  const out = [0, 0, 0, 0];
  assert.deepEqual(quantiseWeights([1, 1, 1, 0], 0, out).reduce((a, b) => a + b), 255);
  assert.throws(() => quantiseWeights([0, 0, 0, 0], 0, out), /positive weight/);
  const skeleton = createSkeleton({ joints: [{ name: "a", translation: [0, 0, 0] }] });
  const triangle = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] };
  assert.equal(createMesh(triangle).skinned, false);
  assert.throws(() => createMesh({ ...triangle, indices: [0, 1, 3] }), /out of range/);
  assert.throws(() => createMesh({ ...triangle, skeleton }), /together/);
  assert.throws(() => createMesh({ ...triangle, skeleton, joints: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], weights: Array(12).fill(1) }), /outside its skeleton/);
  const rigid = createMesh(triangle);
  assert.equal(rigid.indexType, "uint16");
  assert.equal(rigid.vertices.byteLength, 3 * MESH_STRIDE);
  assert.deepEqual(rigid.bounds.max, [1, 1, 0]);
});

test("lofted surfaces face outward and caps close the ends", () => {
  const { positions, normals, indices } = loft({ rings: [{ center: [0, 0, 0], radius: [0.2, 0.1] }, { center: [0.1, 0, -0.5], radius: [0.15, 0.1] }, { center: [0.3, 0.1, -1], radius: [0.05, 0.05] }], around: 12 });
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map((n) => n * 3);
    const u = [0, 1, 2].map((k) => positions[b + k] - positions[a + k]), v = [0, 1, 2].map((k) => positions[c + k] - positions[a + k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(...n) < 1e-9) continue;
    const average = [0, 1, 2].map((k) => normals[a + k] + normals[b + k] + normals[c + k]);
    assert.ok(n[0] * average[0] + n[1] * average[1] + n[2] * average[2] > 0, `triangle ${i / 3} faces inward`);
  }
  // 3 rings × 12 sides, plus two caps of 12 triangles each.
  assert.equal(indices.length / 3, 2 * 12 * 2 + 24);
  assert.throws(() => loft({ rings: [{ center: [0, 0, 0], radius: [1, 1] }, { center: [0, 0, 0], radius: [1, 1] }] }), /repeats/);
});

test("the animate phase runs once per frame after updates and before render, even paused", () => {
  const frames = [], runtime = new Runtime({ request: (cb) => frames.push(cb), cancel: () => {}, step: 0.1 }), order = [];
  runtime.on("update", () => order.push("update"));
  runtime.on("animate", (alpha) => order.push(`animate ${alpha.toFixed(2)}`));
  runtime.on("render", (alpha) => order.push(`render ${alpha.toFixed(2)}`));
  runtime.start();
  frames.shift()(0);
  frames.shift()(250);
  assert.deepEqual(order, ["animate 0.00", "render 0.00", "update", "update", "animate 0.50", "render 0.50"]);
  order.length = 0;
  runtime.pause("menu");
  frames.shift()(400);
  assert.deepEqual(order, ["animate 1.00", "render 1.00"]);
  runtime.dispose();
});

test("mesh libraries share one resident mesh per key and free it with the last lease", () => {
  const made = [], renderer = { createMesh: (data) => { const mesh = { data, disposed: false, dispose() { this.disposed = true; } }; made.push(mesh); return mesh; } };
  const directory = new Directory(), a = new MeshLibrary(directory, renderer, "scene.a"), b = new MeshLibrary(directory, renderer, "scene.b");
  let builds = 0;
  const build = () => { builds++; return tubeRecipe().mesh; };
  const key = tubeKey();
  assert.equal(key, tubeKey({}), "equal options give equal keys");
  assert.notEqual(key, tubeKey({ joints: 4 }));
  const first = a.acquire(key, build), again = a.acquire(key, build), second = b.acquire(key, build);
  assert.equal(first, again);
  assert.equal(first, second);
  assert.equal(builds, 1);
  a.dispose(); a.dispose();
  assert.equal(made[0].disposed, false, "scene b still holds it");
  b.release(key);
  assert.equal(made[0].disposed, true);
  assert.equal(directory.resources.size, 0);
  assert.throws(() => a.acquire(key, build), /disposed/);
  directory.dispose();
});
