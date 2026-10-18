/** Freelancer / explicit authoring recipe for the first Enni Cole slice.
 * Run manually: node games/freelancer/content/author.js. Normal packaging reads project.json
 * without regenerating it, so Studio/hand edits remain authoritative. This recipe is a
 * reproducible starting composition, not game behavior or a second scene renderer. */
import { writeFile } from "node:fs/promises";
import { ArchitecturalParts } from "../../../engine/penthouse/architectural-parts.js";
import { strokeLettering } from "../../../engine/penthouse/stroke-lettering.js";
import { multiplyRotation } from "../../../engine/basement/rotation.js";
import { validateProject, upgradeProject } from "../../../engine/basement/project.js";
import { ASSEMBLY_GENERATORS } from "../../../engine/penthouse/assembly.js";
import { MESH_GENERATORS } from "../../../engine/penthouse/mesh-generators.js";

// Linear RGB: rose masonry, champagne metal, midnight framing and honey-lit displays.
const rose = [0.25, 0.065, 0.12],
  roseHi = [0.37, 0.12, 0.2],
  steel = [0.022, 0.025, 0.045],
  gold = [0.66, 0.39, 0.14],
  cream = [0.65, 0.52, 0.39],
  warm = [1, 0.52, 0.16],
  glass = [0.075, 0.04, 0.055],
  green = [0.026, 0.065, 0.045];
const assets = [],
  out = [],
  inside = [];
/** Each authored assembly stays under the shared 128-part budget. */
function kit(id, name) {
  const b = new ArchitecturalParts(id, name);
  assets.push(b.asset);
  return b;
}
/** Place shared assets with readable permanent IDs; yaw is degrees around Z. */
function put(
  list,
  id,
  asset,
  x,
  y,
  z = 0,
  yaw = 0,
  locked = false,
  tag = null,
) {
  list.push({
    id,
    name: assets.find((a) => a.id === asset).name,
    asset,
    position: [x, y, z],
    rotation: [
      0,
      0,
      Math.sin((yaw * Math.PI) / 360),
      Math.cos((yaw * Math.PI) / 360),
    ],
    scale: 1,
    locked,
    tag,
  });
}

// Ground layers have no colliders; the game's navigation bounds constrain the slice.
kit("street.foundation", "Midnight street").box(
  "road",
  [0, 0, -0.16],
  [60, 56, 0.3],
  [0.028, 0.023, 0.043],
);
const paving = kit("street.paving", "Champagne pavement");
paving.box("slab", [0, 0, -0.07], [44, 12, 0.12], [0.23, 0.19, 0.22]);
for (let x = -21; x <= 21; x += 3)
  paving.box(
    "joint-x" + x,
    [x, 0, -0.001],
    [0.025, 12, 0.008],
    [0.08, 0.065, 0.08],
    0,
    undefined,
    true,
  );
for (let y = -5; y <= 5; y += 2)
  paving.box(
    "joint-y" + y,
    [0, y, -0.001],
    [44, 0.025, 0.008],
    [0.08, 0.065, 0.08],
    0,
    undefined,
    true,
  );
paving
  .box("curb", [0, -6, -0.12], [44, 0.18, 0.3], cream)
  .box(
    "brass-seam",
    [0, -5.7, 0.003],
    [44, 0.025, 0.012],
    gold,
    0.25,
    undefined,
    true,
  );
const road = kit("street.markings", "Street seams");
for (let x = -27; x < 28; x += 5)
  road.box(
    "dash" + x,
    [x, 0, 0.002],
    [2, 0.08, 0.012],
    [0.45, 0.34, 0.24],
    0.15,
    undefined,
    true,
  );

// Solid enclosed mass starts behind the display recesses. Front windows face -Y.
const shell = kit("enni.shell", "Enni Cole · rose stone shell");
shell.box("core", [0, 8, 5.8], [31, 13.8, 11.6], rose).collider(0, 8, 31, 13.8);
shell
  .box("roof", [0, 7.5, 12.05], [32, 15, 0.35], steel)
  .box("parapet-front", [0, 0.05, 12.45], [32, 0.32, 0.65], steel);
shell
  .box("belt", [0, -0.18, 6.65], [31.8, 0.7, 0.35], roseHi)
  .box(
    "belt-gold",
    [0, -0.57, 6.8],
    [32, 0.08, 0.07],
    gold,
    0.4,
    undefined,
    true,
  );
shell.box(
  "frieze",
  [0, -0.1, 7],
  [31.9, 0.45, 0.12],
  gold,
  0.2,
  undefined,
  true,
);
for (const x of [-15.4, -11.2, -7, -3.2, 3.2, 7, 11.2, 15.4]) {
  shell
    .box("pilaster" + x, [x, -0.28, 3.1], [0.5, 0.7, 6.2], roseHi)
    .box("plinth" + x, [x, -0.32, 0.25], [0.74, 0.8, 0.5], cream)
    .box("capital" + x, [x, -0.32, 6.1], [0.8, 0.82, 0.22], gold);
  shell.box(
    "uplight" + x,
    [x, -0.76, 0.21],
    [0.25, 0.18, 0.16],
    warm,
    2,
    undefined,
    true,
  );
}
for (const x of [-15.35, -11.2, -7, -3.2, 3.2, 7, 11.2, 15.35])
  shell.box("upper-post" + x, [x, -0.31, 9.7], [0.25, 0.36, 4.4], steel);

const bay = kit("enni.display-bay", "Enni Cole · window bay");
bay
  .box("recess", [0, 0.4, 3.15], [3.45, 0.35, 5.55], glass)
  .box(
    "warm-back",
    [0, 0.18, 3.15],
    [3.05, 0.05, 5.1],
    [0.32, 0.12, 0.035],
    0.22,
    undefined,
    true,
  );
bay
  .box("floor", [0, -0.18, 0.38], [3.4, 1.1, 0.18], cream)
  .box("ceiling", [0, -0.1, 5.85], [3.5, 1.1, 0.18], steel);
for (const x of [-1.7, 0, 1.7])
  bay.box(
    "frame" + x,
    [x, -0.63, 3.1],
    [0.055, 0.08, 5.6],
    gold,
    0.15,
    undefined,
    true,
  );
for (const z of [0.5, 3.3, 5.9])
  bay.box("rail" + z, [0, -0.63, z], [3.5, 0.08, 0.055], steel);
for (const [i, x] of [-0.88, 0.88].entries()) {
  bay.box("pedestal" + i, [x, -0.18, 0.9], [0.85, 0.65, 0.9], [0.2, 0.12, 0.1]);
  bay.box(
    "display" + i,
    [x, -0.18, 1.9],
    [0.42, 0.3, 1.15],
    [0.46, 0.31, 0.21],
  );
  bay.box("head" + i, [x, -0.18, 2.68], [0.25, 0.25, 0.32], [0.69, 0.5, 0.29]);
  bay.box(
    "glint" + i,
    [x, -0.52, 4.6],
    [0.055, 0.035, 1.8],
    warm,
    1.8,
    undefined,
    true,
  );
}
bay.box(
  "display-light",
  [0, -0.48, 5.68],
  [3.1, 0.08, 0.035],
  warm,
  2,
  undefined,
  true,
);
const upper = kit("enni.upper-bay", "Enni Cole · upper showroom");
upper
  .box("back", [0, 0.3, 9.62], [3.6, 0.15, 4.2], [0.085, 0.06, 0.085], 0.15)
  .box(
    "amber-reflection",
    [0.7, 0.18, 9.3],
    [1.75, 0.04, 3.3],
    [0.32, 0.16, 0.085],
    0.3,
    undefined,
    true,
  );
for (const x of [-1.8, 0, 1.8])
  upper.box("mullion" + x, [x, -0.38, 9.7], [0.065, 0.15, 4.35], steel);
for (const z of [7.6, 9.65, 11.8])
  upper.box("transom" + z, [0, -0.38, z], [3.7, 0.15, 0.065], steel);
upper
  .box("pendant", [0, -0.12, 10.6], [0.07, 0.06, 1.2], gold)
  .box("lamp", [0, -0.12, 9.96], [0.42, 0.25, 0.12], warm, 2, undefined, true);
upper
  .box("showcase", [0, -0.08, 8.15], [2.5, 0.5, 0.7], [0.28, 0.16, 0.11])
  .box(
    "cornice-light",
    [0, -0.38, 11.65],
    [3.4, 0.06, 0.035],
    warm,
    1.2,
    undefined,
    true,
  );

// Entry projects in front of the facade. The arch consists of actual 3D trim segments.
const entry = kit("enni.entry", "Enni Cole · arched entrance");
entry
  .box("left-pier", [-2.8, -1.05, 3.5], [1.15, 1.9, 7], roseHi)
  .box("right-pier", [2.8, -1.05, 3.5], [1.15, 1.9, 7], roseHi)
  .box("name-panel", [0, -1, 7.1], [6.8, 1.95, 1.85], roseHi);
entry
  .box(
    "inner-glow",
    [0, -1.35, 3],
    [4.4, 0.12, 5.4],
    [0.5, 0.22, 0.06],
    0.45,
    undefined,
    true,
  )
  .box("door", [0, -2.02, 1.5], [3.8, 0.06, 3], glass, 0.18, undefined, true);
entry.arch("stone-arch", {
  y: -2.02,
  z: 3.1,
  radius: 2.25,
  width: 0.32,
  depth: 0.42,
  segments: 24,
  color: cream,
});
entry.arch("gold-arch", {
  y: -2.28,
  z: 3.1,
  radius: 2.1,
  width: 0.055,
  depth: 0.06,
  segments: 24,
  color: gold,
  emission: 0.8,
});
for (const x of [-2.25, 2.25])
  entry.box("jamb" + x, [x, -2.03, 1.55], [0.3, 0.4, 3.1], cream);
for (const x of [-1.9, 0, 1.9])
  entry.box(
    "door-frame" + x,
    [x, -2.08, 1.5],
    [0.06, 0.1, 3],
    gold,
    0.3,
    undefined,
    true,
  );
entry
  .box("canopy", [0, -2.6, 3.05], [4.5, 1.5, 0.18], steel)
  .box(
    "canopy-edge",
    [0, -3.3, 3.03],
    [4.5, 0.05, 0.07],
    gold,
    0.6,
    undefined,
    true,
  );
entry
  .box("threshold", [0, -2.4, 0.035], [4.5, 1.8, 0.07], cream)
  .collider(-2.8, -1.1, 1.2, 2)
  .collider(2.8, -1.1, 1.2, 2)
  // The closed door is a barrier; entering uses the authored interaction, not mesh clipping.
  .collider(0, -2.05, 4.4, 0.14);
entry
  .box("cornice", [0, -1.2, 8.2], [7.2, 2.4, 0.3], steel)
  .box(
    "entry-light",
    [0, -2.44, 8.05],
    [7.2, 0.08, 0.055],
    warm,
    1.8,
    undefined,
    true,
  );
const sign = kit("enni.sign", "Enni Cole · brass lettering");
strokeLettering(sign, "ENNI COLE", {
  height: 0.57,
  spacing: 0.28,
  width: 0.58,
  y: -2.01,
  z: 6.96,
  color: [1, 0.68, 0.3],
  emission: 1.6,
  thickness: 0.035,
});

// Projecting faceted upper showroom: warm curved frontage over the entry arch.
const crown = kit("enni.crown", "Enni Cole · curved upper showroom");
for (let i = 0; i < 9; i++) {
  const a = Math.PI + (i * Math.PI) / 9,
    b = Math.PI + ((i + 1) * Math.PI) / 9,
    r = 3.35;
  const x1 = r * Math.cos(a),
    y1 = -0.1 + 2.05 * Math.sin(a),
    x2 = r * Math.cos(b),
    y2 = -0.1 + 2.05 * Math.sin(b),
    angle = Math.atan2(y2 - y1, x2 - x1),
    q = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)],
    x = (x1 + x2) / 2,
    y = (y1 + y2) / 2,
    length = Math.hypot(x2 - x1, y2 - y1);
  crown.box(
    "pane" + i,
    [x, y, 10.2],
    [length, 0.12, 3.45],
    [0.21, 0.105, 0.065],
    0.35,
    q,
    true,
  );
  for (const z of [8.5, 10.2, 11.95])
    crown.box(
      "curved-rail" + i + "," + z,
      [x, y - 0.03, z],
      [length + 0.04, 0.16, 0.065],
      steel,
      0,
      q,
    );
  crown.box(
    "upright" + i,
    [x1, y1 - 0.04, 10.2],
    [0.055, 0.12, 3.5],
    gold,
    0.2,
    undefined,
    true,
  );
  crown.box("cap" + i, [x, y, 12.16], [length + 0.09, 0.6, 0.38], steel, 0, q);
}
crown
  .box(
    "showroom-pendant",
    [0, -1.2, 10.8],
    [0.6, 0.5, 0.15],
    warm,
    1.8,
    undefined,
    true,
  )
  .box("pendant-stem", [0, -1.2, 11.35], [0.055, 0.055, 1], gold);
// Freestanding street props are reusable placements, not baked into the building root.
const planter = kit("street.cypress", "Bronze cypress planter");
planter
  .box("foot", [0, 0, 0.12], [1.25, 1.25, 0.24], steel)
  .box("pot", [0, 0, 0.55], [1.12, 1.12, 0.7], gold)
  .box("soil", [0, 0, 0.94], [1, 1, 0.07], [0.04, 0.025, 0.02]);
for (let i = 0; i < 8; i++) {
  const size = 1.02 - i * 0.107;
  planter.box(
    "foliage" + i,
    [0, 0, 1.12 + i * 0.32],
    [size, size, 0.45],
    green,
  );
}
planter.collider(0, 0, 1.2, 1.2);
const lamp = kit("street.lantern", "Champagne street lantern");
lamp
  .box("base", [0, 0, 0.12], [0.65, 0.65, 0.24], steel)
  .box("foot", [0, 0, 0.5], [0.34, 0.34, 0.6], steel)
  .box("shaft", [0, 0, 2.4], [0.12, 0.12, 3.5], steel)
  .box("gold-collar", [0, 0, 3.7], [0.26, 0.26, 0.12], gold);
lamp
  .box("lantern", [0, 0, 4.15], [0.4, 0.4, 0.65], warm, 1.3, undefined, true)
  .box("roof", [0, 0, 4.57], [0.7, 0.7, 0.12], steel)
  .box("finial", [0, 0, 4.74], [0.09, 0.09, 0.28], gold);
for (const x of [-0.23, 0.23])
  for (const y of [-0.23, 0.23])
    lamp.box("bar" + x + "," + y, [x, y, 4.15], [0.035, 0.035, 0.75], steel);
lamp.collider(0, 0, 0.6, 0.6);
const bench = kit("street.bench", "Rosewood promenade bench");
bench
  .box("seat", [0, 0, 0.55], [2.5, 0.65, 0.15], [0.14, 0.065, 0.065])
  .box("back", [0, 0.25, 0.95], [2.5, 0.12, 0.7], [0.14, 0.065, 0.065]);
for (const x of [-0.95, 0.95])
  bench.box("leg" + x, [x, 0, 0.25], [0.15, 0.5, 0.5], gold);
bench.collider(0, 0, 2.5, 0.75);

// Street composition: one landmark, repeated window/prop assets, a promenade with uncluttered approach space.
put(out, "street:ground", "street.foundation", 0, 0, 0, 0, true);
put(out, "street:pavement", "street.paving", 0, -6, 0, 0, true);
put(out, "street:road-seams", "street.markings", 0, -18, 0, 0, true);
put(out, "enni:building", "enni.shell", 0, 0, 0, 0, true);
put(out, "enni:entrance", "enni.entry", 0, 0, 0, 0, true);
put(out, "enni:sign", "enni.sign", 0, 0, 0, 0, false);
put(out, "enni:crown", "enni.crown", 0, 0);
for (const x of [-13.3, -9.1, -5, 5, 9.1, 13.3]) {
  put(out, "enni:window:" + x, "enni.display-bay", x, 0);
  put(out, "enni:upper:" + x, "enni.upper-bay", x, 0);
}
for (const y of [2.6, 6.8, 11]) {
  put(out, "enni:side-window:" + y, "enni.display-bay", 16, y, 0, 90);
  put(out, "enni:side-upper:" + y, "enni.upper-bay", 16, y, 0, 90);
}
for (const [i, x, y] of [
  [0, -4, -3.2],
  [1, 4, -3.2],
  [2, -14, -7.8],
  [3, 14, -7.8],
])
  put(out, "street:planter:" + i, "street.cypress", x, y);
for (const [i, x, y] of [
  [0, -10, -10],
  [1, 10, -10],
  [2, -20, -10],
  [3, 20, -10],
])
  put(out, "street:lamp:" + i, "street.lantern", x, y);
put(out, "street:bench:west", "street.bench", -8, -6);
put(out, "street:bench:east", "street.bench", 8, -6);

// Interior: open cutaway vestibule, avoiding an opaque roof between camera and player.
const marble = kit("enni.marble", "Enni Cole · marble vestibule");
marble.box("floor", [0, 1, -0.12], [24, 25, 0.22], cream);
for (let x = -12; x <= 12; x += 2)
  marble.box(
    "seam-x" + x,
    [x, 1, -0.003],
    [0.022, 25, 0.012],
    [0.32, 0.25, 0.22],
    0,
    undefined,
    true,
  );
for (let y = -11; y <= 13; y += 2)
  marble.box(
    "seam-y" + y,
    [0, y, -0.003],
    [24, 0.022, 0.012],
    [0.32, 0.25, 0.22],
    0,
    undefined,
    true,
  );
for (const x of [-11.5, 11.5])
  marble.box(
    "border" + x,
    [x, 1, 0.003],
    [0.1, 24, 0.015],
    gold,
    0.15,
    undefined,
    true,
  );
marble
  .box("runner", [0, -7, 0.016], [3.5, 7, 0.025], rose)
  .box(
    "runner-left",
    [-1.65, -7, 0.033],
    [0.035, 6.7, 0.012],
    gold,
    0.2,
    undefined,
    true,
  )
  .box(
    "runner-right",
    [1.65, -7, 0.033],
    [0.035, 6.7, 0.012],
    gold,
    0.2,
    undefined,
    true,
  );
const walls = kit("enni.vestibule", "Enni Cole · vestibule walls");
walls
  .box("back", [0, 13, 3], [24, 0.5, 6], rose)
  .box("wall-left", [-12, 1, 1.25], [0.4, 24, 2.5], rose)
  .box("wall-right", [12, 1, 1.25], [0.4, 24, 2.5], rose)
  .collider(0, 13, 24, 0.5)
  .collider(-12, 1, 0.4, 24)
  .collider(12, 1, 0.4, 24);
for (const x of [-10, -6, 6, 10])
  walls
    .box("pilaster" + x, [x, 12.6, 3], [0.4, 0.6, 6], cream)
    .box("cap" + x, [x, 12.5, 5.8], [0.7, 0.8, 0.15], gold);
walls
  .box("back-cornice", [0, 12.5, 5.9], [24, 0.6, 0.18], gold)
  .box(
    "light-ribbon",
    [0, 12.16, 5.65],
    [23, 0.055, 0.05],
    warm,
    1.8,
    undefined,
    true,
  );
const medallion = kit("enni.medallion", "Enni Cole · floor medallion");
// Horizontal ring is authored as individual rotated bars, ordinary retained geometry.
for (let i = 0; i < 48; i++) {
  const a = (i * Math.PI) / 24;
  medallion.box(
    "ring" + i,
    [3.5 * Math.cos(a), 3.5 * Math.sin(a), 0.018],
    [0.46, 0.055, 0.022],
    gold,
    0.2,
    [0, 0, Math.sin((a + Math.PI / 2) / 2), Math.cos((a + Math.PI / 2) / 2)],
    true,
  );
}
const ec = kit("enni.monogram", "Enni Cole · monogram");
strokeLettering(ec, "EC", {
  height: 1.8,
  spacing: 0.3,
  width: 0.6,
  color: rose,
  emission: 0.1,
});
// Rotate the finished sign onto the floor with the shared quaternion contract.
for (const part of ec.asset.parts) {
  const [x, y, z] = part.position;
  part.position = [x, -z, y + 0.025];
  const rotation = [0, 0, 0, 1];
  multiplyRotation([Math.SQRT1_2, 0, 0, Math.SQRT1_2], part.rotation, rotation);
  part.rotation = rotation;
}
const counter = kit("enni.counter", "Enni Cole · concierge desk");
counter
  .box("body", [0, 0, 0.6], [4, 1.4, 1.2], rose)
  .box("top", [0, 0, 1.25], [4.2, 1.6, 0.12], cream)
  .box(
    "inlay",
    [0, -0.72, 0.7],
    [3.5, 0.025, 0.035],
    gold,
    0.3,
    undefined,
    true,
  )
  .collider(0, 0, 4.2, 1.6);
const chandelier = kit("enni.chandelier", "Enni Cole · chandelier");
chandelier.box("stem", [0, 0, 5], [0.06, 0.06, 1.2], gold);
for (let i = 0; i < 12; i++) {
  const a = (i * Math.PI) / 6,
    x = Math.cos(a) * 1.6,
    y = Math.sin(a) * 1.6;
  chandelier
    .box(
      "arm" + i,
      [x / 2, y / 2, 4.45],
      [1.65, 0.04, 0.04],
      gold,
      0,
      [0, 0, Math.sin(a / 2), Math.cos(a / 2)],
      true,
    )
    .box(
      "candle" + i,
      [x, y, 4.65],
      [0.07, 0.07, 0.4],
      warm,
      2,
      undefined,
      true,
    );
}
const interiorSign = kit("enni.interior-sign", "Enni Cole · welcome sign");
strokeLettering(interiorSign, "ENNI COLE", {
  height: 0.9,
  spacing: 0.22,
  y: 12.65,
  z: 3.8,
  color: gold,
  emission: 0.65,
});
put(inside, "interior:floor", "enni.marble", 0, 0, 0, 0, true);
put(inside, "interior:walls", "enni.vestibule", 0, 0, 0, 0, true);
put(inside, "interior:medallion", "enni.medallion", 0, 0);
put(inside, "interior:monogram", "enni.monogram", 0, -0.9);
put(inside, "interior:counter", "enni.counter", 0, 8);
put(inside, "interior:chandelier", "enni.chandelier", 0, 0);
put(inside, "interior:sign", "enni.interior-sign", 0, 0);
for (const x of [-9, 9])
  for (const y of [-5, 7])
    put(inside, "interior:planter:" + x + "," + y, "street.cypress", x, y);

/** Lighting is authored per scene; eight explicit slots match the current engine budget. */
function lights(values) {
  return values.map(([x, y, z, r, color], i) => ({
    id: "light:" + i,
    position: [x, y, z],
    radius: r,
    color,
  }));
}
const street = {
  id: "clinic-way",
  key: "freelancer:clinic-way",
  name: "Clinic Way · Enni Cole",
  ethereal: false,
  ambient: [0.25, 0.15, 0.29],
  sun: { direction: [-3, -4, 7], color: [0.24, 0.18, 0.28] },
  entities: out,
  lights: lights([
    [-3, -3, 2, 8, [3, 0.55, 0.95]],
    [3, -3, 2, 8, [3, 0.55, 0.95]],
    [-11, -2, 3, 8, [1.4, 0.65, 0.3]],
    [11, -2, 3, 8, [1.4, 0.65, 0.3]],
    [-10, -10, 4.1, 10, [1.7, 0.9, 0.4]],
    [10, -10, 4.1, 10, [1.7, 0.9, 0.4]],
    [0, -2, 5, 9, [1.3, 0.75, 0.35]],
    [0, -7, 7, 20, [0.22, 0.18, 0.5]],
  ]),
  navigation: { minX: -26, maxX: 26, minY: -24, maxY: 19 },
  spawn: [0, -9, 0.1],
  camera: {
    x: 0,
    y: 2,
    z: 3.6,
    azimuth: 0.32,
    elevation: 0.66,
    halfHeight: 16.5,
  },
  portals: [
    {
      id: "enni:door",
      anchor: "enni:entrance",
      offset: [0, -3.4, 0],
      radius: 2,
      targetScene: "enni-vestibule",
      targetPortal: "enni:exit",
      arrivalOffset: [0, 2, 0],
      label: "Enter Enni Cole",
    },
  ],
};
const interior = {
  id: "enni-vestibule",
  key: "freelancer:enni-vestibule",
  name: "Enni Cole · Marble Vestibule",
  ethereal: false,
  ambient: [0.34, 0.27, 0.24],
  sun: { direction: [-2, -4, 8], color: [0.3, 0.22, 0.14] },
  entities: inside,
  lights: lights([
    [0, 0, 4.65, 13, [2, 1.15, 0.5]],
    [-8, -6, 3, 8, [1, 0.6, 0.3]],
    [8, -6, 3, 8, [1, 0.6, 0.3]],
    [-8, 7, 3, 8, [1, 0.6, 0.3]],
    [8, 7, 3, 8, [1, 0.6, 0.3]],
    [0, 9, 4, 8, [1, 0.5, 0.23]],
    [-3, -9, 2, 6, [0.65, 0.3, 0.38]],
    [3, -9, 2, 6, [0.65, 0.3, 0.38]],
  ]),
  navigation: { minX: -11.4, maxX: 11.4, minY: -11, maxY: 12.4 },
  spawn: [0, -7, 0.1],
  camera: { x: 0, y: 1, z: 1.2, azimuth: 0, elevation: 0.86, halfHeight: 13.5 },
  portals: [
    {
      id: "enni:exit",
      anchor: "interior:floor",
      offset: [0, -9.5, 0],
      radius: 2,
      targetScene: "clinic-way",
      targetPortal: "enni:door",
      arrivalOffset: [0, -1, 0],
      label: "Return to Clinic Way",
    },
  ],
};
const legacyProject = {
  schemaVersion: 1,
  id: "freelancer.enni-slice.v1",
  name: "Freelancer · Enni Cole",
  assets,
  scenes: [street, interior],
};
const project=upgradeProject(legacyProject);
const building={id:'enni:origin',name:'Enni Cole',asset:null,parent:null,position:[0,0,0],rotation:[0,0,0,1],scale:1,locked:false};
project.scenes[0].entities.unshift(building);
for(const e of project.scenes[0].entities.slice(1))if(e.id.startsWith('enni:'))e.parent=building.id;
validateProject(project, { generators: ASSEMBLY_GENERATORS, meshGenerators: MESH_GENERATORS });
await writeFile(
  new URL("./project.json", import.meta.url),
  JSON.stringify(project, null, 2) + "\n",
);
console.log(
  "Authored",
  assets.length,
  "assets;",
  out.length,
  "street placements;",
  inside.length,
  "interior placements.",
);
