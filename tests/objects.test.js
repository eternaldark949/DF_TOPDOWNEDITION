/** Origin-first objects: authored/runtime identities, inherited restrictions, geometric
 * sharing and transform/collision agreement are tested independently of editor DOM. */
import test from "node:test";
import { Camera } from "../engine/basement/camera.js";
import { AuthoringGuides } from "../engine/penthouse/authoring-guides.js";
import assert from "node:assert/strict";
import {
  copyData,
  PROJECT_LIMITS,
  upgradeProject,
  validateProject,
} from "../engine/basement/project.js";
import {
  ancestors,
  descendants,
  lockOwner,
  objectPoses,
  objectPose,
  reparentObject,
} from "../engine/basement/objects.js";
import {
  rangeUnit,
  rangeValue,
  validateRange,
} from "../engine/basement/number-range.js";
import { World, Identities } from "../engine/basement/world.js";
import { SceneInstance } from "../engine/directory/scene-instance.js";
import { assembly } from "../engine/penthouse/assembly.js";
import { eulerRotation } from "../engine/basement/rotation.js";
import { ATRIUM_PROJECT } from "../examples/atrium/project.js";
import { FREELANCER_PROJECT } from "../games/freelancer/project.js";
import { portalPosition } from "../games/freelancer/portals.js";
import { StudioSession } from "../editor/workspace/session.js";
const directory = { create: (_name, options) => assembly(options) };
const origin = (id, parent = null) => ({
  id,
  name: id,
  asset: null,
  parent,
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: 1,
  locked: false,
});
const close = (a, b) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-7, `${a} vs ${b}`));
/** Canonical data is cloned so tests never mutate shipped source objects. */
function fixture() {
  const p = copyData(ATRIUM_PROJECT),
    s = p.scenes[0],
    child = s.entities.find((e) => e.tag === "prop");
  s.entities = [origin("house"), ...s.entities];
  child.parent = "house";
  return { p, s, child };
}
test("Version two ingress adds origins without changing flat geometry, IDs or source data", () => {
  const p = copyData(ATRIUM_PROJECT);
  p.schemaVersion = 2;
  for (const s of p.scenes) for (const e of s.entities) delete e.parent;
  const before = JSON.stringify(p),
    up = upgradeProject(p);
  assert.equal(JSON.stringify(p), before);
  assert.equal(up.schemaVersion, 4);
  assert.deepEqual(up.assets, p.assets);
  assert.ok(up.scenes.every((s) => s.entities.every((e) => e.parent === null)));
  assert.equal(upgradeProject(up), up);
});
test("Invalid parents, cycles, origin bindings, inherited scale overflow and malformed flags fail before adoption", () => {
  for (const edit of [
    (s) => (s.entities[0].parent = s.entities.at(-1).id),
    (s) => (s.entities[0].parent = s.entities[0].id),
    (s) => (s.entities[0].parent = "missing"),
    (s) => (s.entities[0].selectable = "yes"),
    (s) => (s.entities[0].visible = 1),
    (s) => (s.entities[0].materialOverrides = { x: "material:1" }),
    (s) => {
      s.entities[0].scale = 20;
      for (const e of s.entities.slice(1)) {
        e.parent = s.entities[0].id;
        e.scale = 20;
      }
      s.entities[2].parent = s.entities[1].id;
      s.entities[3].parent = s.entities[2].id;
    },
  ]) {
    const { p, s } = fixture();
    edit(s);
    assert.throws(() => validateProject(p));
  }
});
test("Parent transforms drive geometry, colliders and portal offsets; reparent retains world pose and runtime IDs", () => {
  const { p, s, child } = fixture(),
    parent = s.entities[0];
  parent.position = [10, 5, 0];
  parent.rotation = eulerRotation(0, 0, Math.PI / 2);
  parent.scale = 2;
  child.position = [1, 0, 0];
  const world = new World("tree", new Identities()),
    live = new SceneInstance(directory, world, p, s),
    root = live.root(child.id),
    id = root.id,
    poses = objectPoses(s);
  for (const [id, pose] of poses) assert.deepEqual(objectPose(s, id), pose);
  assert.equal(objectPose(s, "missing"), null);
  close([root.pose.x, root.pose.y, root.pose.z], poses.get(child.id).position);
  const partName = live.instances
    .get(child.id)
    .asset.parts.find((p) => p.shape).id;
  assert.equal(live.surfaceFor(live.part(child.id, partName)).partId, partName);
  assert.ok(live.colliders.length);
  const childItem = live.instances.get(child.id),
    source = childItem.asset.colliders[0],
    box = childItem.colliders[0];
  close([box.x, box.y], [10 - source.y * 2, 7 + source.x * 2]);
  const before = objectPoses(s).get(child.id);
  reparentObject(s, child.id, null);
  validateProject(p);
  live.apply(s, p);
  assert.equal(live.root(child.id).id, id);
  close(objectPoses(s).get(child.id).position, before.position);
  close(objectPoses(s).get(child.id).rotation, before.rotation);
  const game = copyData(FREELANCER_PROJECT),
    street = game.scenes[0],
    door = street.portals[0],
    old = portalPosition(street, door);
  street.entities[0].position = [2, 3, 0];
  close(
    portalPosition(street, door),
    old.map((n, i) => n + [2, 3, 0][i]),
  );
  live.dispose();
  assert.equal(world.entities.size, 0);
});
test("Removing only a parent retains a surviving child; visibility and inherited locks have distinct semantics", () => {
  const { p, s, child } = fixture();
  s.entities[0].locked = true;
  s.entities[0].visible = false;
  assert.equal(lockOwner(s, child.id).id, "house");
  assert.deepEqual(
    ancestors(s, child.id).map((e) => e.id),
    ["house"],
  );
  assert.ok(descendants(s, "house").has(child.id));
  assert.equal(descendants(s, null).size, 0);
  const world = new World("tree", new Identities()),
    live = new SceneInstance(directory, world, p, s),
    id = live.root(child.id).id;
  assert.equal(live.root(child.id).pose.visible, false);
  child.parent = null;
  s.entities.shift();
  live.apply(s, p);
  assert.equal(live.root(child.id).id, id);
  assert.equal(live.root(child.id).pose.visible, true);
  live.dispose();
});
test("Studio creates empty origins, duplicates linked branches, isolates source data and enforces inherited locks", () => {
  const ids = new Identities();
  const engine = {
    lobby: { on: () => () => {} },
    basement: {
      createWorld: () => new World(ids.create("world"), ids),
      renderer: { createBatch: () => ({ dispose() {} }) },
    },
  };
  const dir = {
    ...directory,
    adopt: (w) => w,
    releaseWorld: (_id, w) => w.dispose(),
    acquire: (_id, f) => ({ value: f(), release() {} }),
  };
  engine.directory = dir;
  const session = new StudioSession(engine, {
    project: ATRIUM_PROJECT,
    validate: validateProject,
    onChange: () => {},
    onStatus: () => {},
    selectInitial: (s) => s.entities.find((e) => !e.locked).id,
  });
  const id = session.createObject(),
    empty = session.preview.instance.instances.get(id);
  assert.equal(empty.parts.length, 0);
  assert.equal(empty.root.shape, null);
  session.enter(id);
  const child = session.place(ATRIUM_PROJECT.assets[0].id, {
    x: 1,
    y: 2,
    z: 0,
  });
  assert.equal(session.scene.entities.find((e) => e.id === child).parent, id);
  session.select(id);
  const copy = session.duplicate(),
    children = [...descendants(session.scene, copy)];
  assert.equal(children.length, 2);
  const copied = session.scene.entities.find((e) => e.parent === copy);
  assert.equal(
    copied.asset,
    session.scene.entities.find((e) => e.id === child).asset,
  );
  session.select(copied.id);
  const shared = copied.asset;
  const originRuntimeId = session.preview.instance.root(copied.id).id;
  session.makeGeometryUnique();
  assert.equal(session.preview.instance.root(copied.id).id, originRuntimeId);
  assert.notEqual(
    session.scene.entities.find((e) => e.id === copied.id).asset,
    shared,
  );
  session.toggleLock(copy);
  assert.throws(() => session.toggleLock(copied.id));
  assert.throws(() => session.duplicate());
  assert.equal(session.pickId(copied.id), null);
  session.enter(null);
  assert.equal(session.pickId(copied.id), copy);
  session.toggleLock(copy);
  session.select(copy);
  session.remove();
  assert.ok(!session.scene.entities.some((e) => e.id === copy));
  session.document.undo();
  assert.ok(session.scene.entities.some((e) => e.id === copy));
  session.dispose();
});
test("Useful slider curves preserve precision and endpoints while refusing invalid logarithmic domains", () => {
  for (const range of [
    { min: 0, max: 1 },
    { min: 0, max: 32, curve: "power" },
    { min: 0.05, max: 20, curve: "log" },
  ]) {
    validateRange(range);
    for (const v of [
      range.min,
      range.min + (range.max - range.min) * 0.001,
      range.max,
    ])
      assert.ok(Math.abs(rangeValue(range, rangeUnit(range, v)) - v) < 1e-9);
  }
  assert.throws(() => validateRange({ min: 0, max: 8, curve: "log" }));
  assert.throws(() => validateRange({ min: 1, max: 1 }));
});

test("A project can contain only empty origins without placeholder geometry or materials", () => {
  const p = copyData(ATRIUM_PROJECT);
  p.assets = [];
  p.materials = [];
  for (const s of p.scenes) s.entities = [origin("empty")];
  validateProject(p);
  const w = new World("empty", new Identities()),
    live = new SceneInstance(directory, w, p, p.scenes[0]);
  assert.equal(w.entities.size, 1);
  assert.equal(live.materials.values.size, 0);
  assert.equal(live.colliders.length, 0);
  live.dispose();
  assert.equal(w.entities.size, 0);
});

/** A fully valid origin-only project must leave room for every other native widget.
 * The strict line sink models the renderer's public vertex budget, not its GL internals. */
test("Maximum origin count coexists with lights, dial, axes and selection guides without overflowing", () => {
  const live = new Set(),
    camera = new Camera();
  const renderer = {
    camera,
    canvas: { clientWidth: 800, clientHeight: 600 },
    lines: {
      create(capacity) {
        const layer = {
          capacity,
          count: 0,
          begin() {
            this.count = 0;
          },
          segment() {
            this.count += 2;
            assert.ok(
              this.count <= this.capacity,
              "guide vertex budget exceeded",
            );
          },
          end() {},
          dispose() {
            live.delete(this);
          },
        };
        live.add(layer);
        return layer;
      },
    },
  };
  const guides = new AuthoringGuides(renderer),
    scene = {
      id: "origins-at-limit",
      entities: Array.from({ length: PROJECT_LIMITS.entities }, (_, i) =>
        origin("origin:" + i),
      ),
      lights: Array.from({ length: 8 }, (_, i) => ({
        id: "light:" + i,
        position: [0, 0, 1],
      })),
    };
  const layers = guides.layersFor({
    scene,
    selected: scene.entities[0].id,
    revision: 0,
    mode: "rotate",
    axis: "z",
    space: "world",
    grid: true,
    axes: true,
    outlines: true,
    lights: true,
    selectionBounds: () => ({ min: [-1, -1, -1], max: [1, 1, 1] }),
  });
  assert.equal(layers.length, 2);
  assert.ok(guides.widgets.count > 1024);
  assert.equal(live.size, 2);
  guides.clear();
  guides.dispose();
  assert.equal(live.size, 0);
});
