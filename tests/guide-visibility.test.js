/** Native-guide visibility and cache ownership: no World objects or temporary renderer bypass. */
import test from "node:test";
import assert from "node:assert/strict";
import { AuthoringGuides } from "../engine/penthouse/authoring-guides.js";
import { Camera } from "../engine/basement/camera.js";
test("Axes and selection bounds share bounded guide layers, cache world bounds and release on hide", () => {
  const live = new Set(),
    renderer = {
      camera: new Camera(),
      canvas: { clientWidth: 400, clientHeight: 700 },
      lines: {
        create(capacity) {
          const layer = {
            segments: [],
            begin() {
              this.segments = [];
            },
            segment(a, b, color) {
              this.segments.push({ a, b, color });
            },
            end() {
              assert.ok(this.segments.length * 2 <= capacity);
            },
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
    scene = { id: "scene", entities: [{ id: "actor" }], lights: [] };
  let resolutions = 0;
  const options = {
    scene,
    selected: "actor",
    revision: 1,
    mode: "select",
    axis: "z",
    space: "world",
    grid: false,
    lights: false,
    axes: true,
    outlines: true,
    selectionBounds: () => {
      resolutions++;
      return { min: [-1, -2, 0], max: [1, 2, 4] };
    },
  };
  const [ground, outline] = guides.layersFor(options);
  assert.equal(ground.segments.length, 3);
  assert.equal(outline.segments.length, 12);
  assert.equal(resolutions, 1);
  assert.deepEqual(
    ground.segments.map((s) => s.b),
    [
      [6, 0, 0.07],
      [0, 6, 0.07],
      [0, 0, 6.07],
    ],
  );
  for (const { a, b } of outline.segments) {
    assert.equal(a.filter((n, i) => n !== b[i]).length, 1);
    for (const p of [a, b])
      assert.ok(p.every((n, i) => n === [-1, -2, 0][i] || n === [1, 2, 4][i]));
  }
  const retainedEdges = outline.segments;
  renderer.camera.azimuth += 0.1;
  guides.layersFor(options);
  assert.equal(resolutions, 1, "camera motion must not rescan World bounds");
  assert.equal(
    outline.segments,
    retainedEdges,
    "world-space bounds must not reupload on camera motion",
  );
  guides.layersFor({ ...options, revision: 2 });
  assert.equal(resolutions, 2);
  guides.layersFor({ ...options, scene: { ...scene }, revision: 2 });
  assert.equal(
    resolutions,
    3,
    "new document identity invalidates cached bounds",
  );
  guides.layersFor({ ...options, axes: false, outlines: false });
  assert.equal(live.size, 0);
  guides.layersFor({ ...options, grid: true });
  assert.equal(guides.grid.segments.length, 125);
  assert.equal(live.size, 2);
  guides.clear();
  guides.dispose();
  assert.equal(live.size, 0);
});
