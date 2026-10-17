/** Surface extension and colour math contracts, including backwards compatible authoring. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createMaterial,
  updateMaterial,
  validateMaterial,
} from "../engine/basement/material.js";
import {
  colorDisplay,
  linearToSrgb,
  srgbToLinear,
  hsvToRgb,
  rgbToHsv,
} from "../engine/basement/color.js";
import {
  MATERIAL_PROPERTIES,
  readProperty,
} from "../engine/basement/properties.js";
import { ProjectDocument } from "../engine/basement/document.js";
import { ATRIUM_PROJECT } from "../examples/atrium/project.js";

test("Optional surface fields preserve old authored JSON and runtime defaults; updates retain array identity", () => {
  const source = {
      baseColor: [0.2, 0.1, 0.3],
      emissionColor: [1, 1, 1],
      emissionStrength: 0,
    },
    before = JSON.stringify(source);
  validateMaterial(source);
  const m = createMaterial(source);
  assert.equal(JSON.stringify(source), before);
  assert.equal(m.reflectivity, 0);
  assert.equal(m.specularSharpness, 0.5);
  for (const p of MATERIAL_PROPERTIES.filter(
    (p) => p.defaultValue !== undefined,
  ))
    assert.deepEqual(readProperty(source, p), m[p.key]);
  const tint = m.specularColor;
  updateMaterial(m, {
    ...source,
    specularColor: [1, 0.5, 0.1],
    reflectivity: 0.7,
    specularSharpness: 0.9,
  });
  assert.equal(m.specularColor, tint);
  assert.deepEqual(tint, [1, 0.5, 0.1]);
  const snapshot = JSON.stringify(m);
  assert.throws(() => updateMaterial(m, { ...source, reflectivity: NaN }));
  assert.equal(JSON.stringify(m), snapshot);
  updateMaterial(m, source);
  assert.equal(m.reflectivity, 0);
  assert.deepEqual(tint, [1, 1, 1]);
});
test("Surface ranges fail before document adoption; specular edits survive undo, redo and detached snapshots", () => {
  const doc = new ProjectDocument(ATRIUM_PROJECT),
    original = doc.snapshot();
  for (const patch of [
    { reflectivity: 1.01 },
    { reflectivity: null },
    { specularSharpness: -1 },
    { specularSharpness: Infinity },
    { specularColor: [1, 0, 2] },
    { specularColor: [1, 0] },
    { specularColor: null },
  ]) {
    assert.throws(() =>
      doc.edit("invalid", (p) => Object.assign(p.materials[0], patch)),
    );
    assert.deepEqual(doc.snapshot(), original);
  }
  doc.edit("Pearl", (p) =>
    Object.assign(p.materials[0], {
      reflectivity: 0.08,
      specularSharpness: 0.72,
      specularColor: [0.7, 0.8, 1],
    }),
  );
  const copy = doc.snapshot();
  copy.materials[0].specularColor[0] = 0;
  assert.equal(doc.data.materials[0].specularColor[0], 0.7);
  doc.undo();
  assert.deepEqual(doc.snapshot(), original);
  doc.redo();
  assert.equal(doc.data.materials[0].reflectivity, 0.08);
});
test("sRGB/linear and HSV conversions roundtrip hue and HDR energy without quantizing authored values", () => {
  for (const x of [0, 0.001, 0.0031308, 0.1, 0.5, 1, 8])
    assert.ok(Math.abs(srgbToLinear(linearToSrgb(x)) - x) < 1e-10);
  for (const rgb of [
    [1, 0, 0],
    [0.1, 0.8, 0.2],
    [0.2, 0.1, 0.8],
    [0, 0, 0],
    [1, 1, 1],
  ]) {
    const hsv = rgbToHsv(rgb, 230);
    const back = hsvToRgb(...hsv);
    rgb.forEach((n, i) => assert.ok(Math.abs(n - back[i]) < 1e-10));
  }
  assert.equal(rgbToHsv([0, 0, 0], 230)[0], 230);
  const linear = [4, 0.215, 1.345],
    d = colorDisplay(linear);
  assert.equal(d.gain, 4);
  d.rgb.forEach((n, i) =>
    assert.ok(Math.abs(srgbToLinear(n) * d.gain - linear[i]) < 1e-10),
  );
  assert.equal(colorDisplay([1, 0, 0]).hex, "#ff0000");
  assert.equal(colorDisplay([0, 0, 0]).hex, "#000000");
});
