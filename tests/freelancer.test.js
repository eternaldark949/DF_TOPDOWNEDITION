/** Game slice acceptance at pure-data boundaries: content, spatial queries, movement and doors. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FREELANCER_PROJECT,
  validateFreelancerProject,
} from "../games/freelancer/project.js";
import {
  portalPosition,
  portalLanding,
  nearbyPortal,
  legalPosition,
} from "../games/freelancer/portals.js";
import { SpatialGrid } from "../engine/basement/spatial-grid.js";
import { PlanarMotor } from "../engine/basement/planar-motor.js";
import { ArchitecturalParts } from "../engine/penthouse/architectural-parts.js";
import { strokeLettering } from "../engine/penthouse/stroke-lettering.js";
import { World, Identities } from "../engine/basement/world.js";
import { SceneInstance } from "../engine/directory/scene-instance.js";
import { assembly } from "../engine/penthouse/assembly.js";

test("Street and vestibule satisfy budgets, reciprocal doors and collision-safe spawns/arrivals", () => {
  const project = FREELANCER_PROJECT;
  for (const scene of project.scenes) {
    const world = new World(scene.id, new Identities()),
      instance = new SceneInstance(
        { create: (_name, options) => assembly(options) },
        world,
        project,
        scene,
      ),
      grid = new SpatialGrid();
    grid.rebuild(instance.colliders);
    const resource = { scene, grid };
    assert.ok(
      legalPosition(resource, {
        x: scene.spawn[0],
        y: scene.spawn[1],
        z: scene.spawn[2],
      }),
    );
    assert.ok(
      legalPosition(resource, portalLanding(scene, scene.portals[0].id)),
    );
    if (scene.id === "clinic-way")
      assert.equal(
        legalPosition(resource, { x: 0, y: -2.05, z: 0.1 }),
        false,
        "Closed entry blocks walking through its mesh",
      );
    world.dispose();
    grid.clear();
  }
  const bad = structuredClone(project);
  bad.scenes[0].portals[0].targetPortal = "missing";
  assert.throws(() => validateFreelancerProject(bad), /unresolved/);
});
test("Door interaction follows translated, rotated and scaled placed anchor", () => {
  const scene = structuredClone(FREELANCER_PROJECT.scenes[0]),
    portal = scene.portals[0],
    anchor = scene.entities.find((e) => e.id === portal.anchor);
  anchor.position = [5, 7, 0];
  anchor.scale = 2;
  anchor.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  const p = portalPosition(scene, portal);
  assert.ok(Math.abs(p[0] - 11.8) < 1e-8);
  assert.ok(Math.abs(p[1] - 7) < 1e-8);
  assert.equal(nearbyPortal(scene, { x: p[0], y: p[1] }), portal);
  assert.equal(nearbyPortal(scene, { x: p[0] + 4, y: p[1] }), null);
});
test("Spatial cells match narrow phase, handle negative cells/overflow and release references", () => {
  const grid = new SpatialGrid(2, 4),
    boxes = [
      { x: -3, y: -3, width: 2, depth: 2 },
      { x: 40, y: 40, width: 100, depth: 1 },
      ...Array.from({ length: 80 }, (_, i) => ({
        x: i * 3,
        y: 10,
        width: 1,
        depth: 1,
      })),
    ];
  grid.rebuild(boxes);
  assert.ok(grid.overlaps(-3, -3, 0.38));
  assert.equal(grid.overlaps(-7, -7, 0.38), false);
  assert.ok(grid.candidates < boxes.length / 2);
  assert.ok(grid.overlaps(1, 40, 0.38));
  assert.equal(grid.overlaps(0, 0, 10000), true);
  assert.throws(() => grid.overlaps(Infinity, 0, 1), /Invalid/);
  grid.clear();
  assert.equal(grid.count, 0);
  assert.equal(grid.seen.size, 0);
  assert.equal(grid.overflow.length, 0);
});
test("Motor refuses tunnelling, slides along walls and owns independent momentum", () => {
  const grid = new SpatialGrid();
  grid.rebuild([{ x: 1, y: 0, width: 0.05, depth: 20 }]);
  const root = { x: 0, y: 0, z: 0.1, yaw: 0 },
    motor = new PlanarMotor(root, { speed: 30, response: 100 });
  motor.update(0.25, 1, 1, (p) => !grid.overlaps(p.x, p.y, 0.38));
  assert.ok(root.x < 0.6);
  assert.ok(root.y > 3);
  assert.ok(motor.distance > 3);
  const other = new PlanarMotor({ x: 0, y: 0, z: 0.1, yaw: 0 });
  assert.equal(other.vx, 0);
  motor.reset();
  assert.equal(motor.vy, 0);
  assert.throws(() => motor.update(Infinity, 1, 0, () => true), /Invalid/);
  assert.throws(() => new PlanarMotor(root, { speed: Infinity }), /Invalid/);
  assert.throws(() => new PlanarMotor(root, { maxStep: 1e-20 }), /Invalid/);
});
test("Native architectural signage stays bounded and refuses unsupported shaping", () => {
  const builder = new ArchitecturalParts("sign", "Sign");
  strokeLettering(builder, "ENNI COLE", { height: 0.6 });
  assert.ok(builder.asset.parts.length < 128);
  assert.ok(
    builder.asset.parts.every(
      (p) =>
        Math.abs(Math.hypot(...p.rotation) - 1) < 1e-8 && !p.shape.castShadow,
    ),
  );
  assert.throws(() => strokeLettering(builder, "🎩"), /Latin/);
  const arch = new ArchitecturalParts("arch", "Arch");
  arch.arch("rim", { radius: 2, segments: 20, color: [1, 1, 1] });
  assert.equal(arch.asset.parts.length, 20);
});

// Opening another package/document may reuse both its scene ID and revision zero.
// Cached editor geometry must follow the new data rather than retaining the old light positions.
test("Guide cache follows reopened scene identity even when IDs/revision match", async () => {
  const { AuthoringGuides } = await import(
    "../engine/penthouse/authoring-guides.js"
  );
  const { Camera } = await import("../engine/basement/camera.js");
  const renderer = {
    canvas: { clientWidth: 320, clientHeight: 240 },
    camera: new Camera(),
    lines: {
      create: () => ({
        segments: [],
        begin() {
          this.segments = [];
        },
        segment(a, b) {
          this.segments.push([...a], [...b]);
        },
        end() {},
        dispose() {},
      }),
    },
  };
  const guides = new AuthoringGuides(renderer),
    scene = {
      id: "reopened",
      entities: [],
      lights: [{ id: "lamp", position: [0, 0, 1] }],
    },
    options = {
      scene,
      selected: null,
      revision: 0,
      mode: "select",
      axis: "z",
      space: "world",
      grid: false,
      lights: true,
    };
  const layer = guides.layersFor(options)[0],
    before = layer.segments[0][0];
  const replacement = structuredClone(scene);
  replacement.lights[0].position[0] = 7;
  guides.layersFor({ ...options, scene: replacement });
  assert.equal(layer.segments[0][0] - before, 7);
  guides.dispose();
});
