/** HDR bloom contracts: allocation-free defaults, validated atomic edits and bounded ownership. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BLOOM_PRESETS,
  matchingBloomPreset,
} from "../engine/basement/bloom-presets.js";
import { Bloom } from "../engine/basement/bloom.js";
import { HdrTargets } from "../engine/basement/hdr-targets.js";
import { Presentation } from "../engine/basement/presentation.js";
import { BloomTargets } from "../engine/basement/bloom-targets.js";
import {
  bloomDimensions,
  bloomSettings,
  BLOOM_PARAMETERS,
  bloomStorage,
} from "../engine/basement/bloom-settings.js";
test("Bloom settings validate atomically, mode off is allocation-free, disposal prevents resurrection", () => {
  const b = new Bloom({
      gl: {},
      stats: { programs: 0 },
      canvas: { width: 1, height: 1 },
    }),
    before = b.settings;
  for (const patch of [
    { mode: "ultra" },
    { strength: NaN },
    { exposure: 0 },
    { knee: 2 },
    { radius: 10 },
    { scatter: -1 },
    { threshold: Infinity },
    { typo: 1 },
    { constructor: 1 },
  ]) {
    assert.throws(() => b.configure(patch), RangeError);
    assert.equal(b.settings, before);
  }
  assert.equal(b.ensure(), false);
  assert.throws(() => b.configure({ exposure: 2 }), RangeError);
  assert.equal(b.inspect().targetBytes, 0);
  b.dispose();
  b.dispose();
  assert.throws(() => b.configure({ mode: "low" }), /disposed/);
});
test("Bloom pyramid has bounded quality/aspect/storage, including 1-pixel targets", () => {
  const low = bloomDimensions(3840, 2160, "low"),
    high = bloomDimensions(3840, 2160, "high");
  assert.equal(low.length, 6);
  assert.deepEqual(low[0], { width: 512, height: 288 });
  assert.equal(high.length, 7);
  assert.deepEqual(high[0], { width: 1024, height: 576 });
  assert.deepEqual(bloomDimensions(1, 1, "high"), [{ width: 1, height: 1 }]);
  assert.deepEqual(bloomDimensions(800, 600, "off"), []);
  assert.equal(bloomStorage([{ width: 1, height: 1 }]), 8);
  for (const d of bloomDimensions(100, 900, "low"))
    assert.ok(d.width >= 1 && d.height >= 1);
});
/** Track all classes of GPU handle; refuse both early and late attachment stages. */
function targetGL(refuseAt = Infinity) {
  const counts = { textures: 0, framebuffers: 0, renderbuffers: 0 };
  let checks = 0;
  const gl = {
    FRAMEBUFFER_COMPLETE: 1,
    RGBA16F: 2,
    DEPTH_COMPONENT24: 3,
    getExtension: () => ({}),
    getInternalformatParameter: () => [4],
    checkFramebufferStatus: () => (++checks >= refuseAt ? 0 : 1),
  };
  for (const [kind, key] of [
    ["Texture", "textures"],
    ["Framebuffer", "framebuffers"],
    ["Renderbuffer", "renderbuffers"],
  ]) {
    gl["create" + kind] = () => {
      counts[key]++;
      return {};
    };
    gl["delete" + kind] = () => counts[key]--;
  }
  for (const name of [
    "bindFramebuffer",
    "bindRenderbuffer",
    "bindTexture",
    "texStorage2D",
    "texParameteri",
    "framebufferTexture2D",
    "renderbufferStorageMultisample",
    "framebufferRenderbuffer",
  ])
    gl[name] = () => {};
  return { gl, counts };
}
test("HDR target refusal releases every partial texture/FBO/renderbuffer and successful disposal is idempotent", () => {
  for (const stage of [1, 2]) {
    const { gl, counts } = targetGL(stage);
    assert.throws(() => new HdrTargets(gl, 512, 384), /incomplete/);
    assert.deepEqual(counts, {
      textures: 0,
      framebuffers: 0,
      renderbuffers: 0,
    });
  }
  const { gl, counts } = targetGL();
  const t = new HdrTargets(gl, 512, 384);
  assert.equal(t.samples, 4);
  assert.equal(counts.textures, 2);
  const pyramid = new BloomTargets(gl, 512, 384, "low");
  pyramid.dispose();
  t.dispose();
  t.dispose();
  assert.deepEqual(counts, { textures: 0, framebuffers: 0, renderbuffers: 0 });
});
test("Unsupported HDR latches fallback without repeated allocation until explicit reconfiguration", () => {
  const { gl, counts } = targetGL();
  let calls = 0;
  gl.getExtension = () => {
    calls++;
    return null;
  };
  const b = new Presentation(
    { gl, stats: { programs: 0 }, canvas: { width: 320, height: 240 } },
    { mode: "hdr" },
  );
  assert.equal(b.prepare(false), false);
  assert.equal(b.prepare(false), false);
  assert.equal(calls, 1);
  assert.match(b.inspect().failure, /HDR/);
  assert.deepEqual(counts, { textures: 0, framebuffers: 0, renderbuffers: 0 });
  b.configure({ exposure: 2 });
  assert.equal(b.prepare(false), false);
  assert.equal(calls, 2);
  b.dispose();
});

/** Artistic range and UI bounds share one catalog; recipes remain ordinary immutable settings. */
test("Bloom recipes span subtle to full glow with independent, validated shaping controls", () => {
  for (const recipe of BLOOM_PRESETS) {
    const s = bloomSettings(recipe.settings);
    assert.equal(matchingBloomPreset(s), recipe.id);
    assert.ok(Object.isFrozen(recipe.settings));
  }
  const full = bloomSettings(BLOOM_PRESETS.at(-1).settings);
  assert.ok(full.strength > 3 && full.radius > 3 && full.haze > 0);
  assert.equal(matchingBloomPreset({ ...full, haze: 0.123 }), "custom");
  for (const { key, min, max } of BLOOM_PARAMETERS) {
    assert.equal(bloomSettings({ [key]: min })[key], min);
    assert.equal(bloomSettings({ [key]: max })[key], max);
    assert.throws(() => bloomSettings({ [key]: max + 1 }), RangeError);
    assert.throws(() => bloomSettings({ [key]: NaN }), RangeError);
  }
  assert.equal(
    bloomSettings().haze,
    0,
    "Default appearance stays conservative",
  );
});
