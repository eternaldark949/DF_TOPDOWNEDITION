/** HDR bloom contracts: allocation-free defaults, validated atomic edits and bounded ownership. */
import test from "node:test";
import assert from "node:assert/strict";
import { Bloom } from "../engine/basement/bloom.js";
import { BloomTargets } from "../engine/basement/bloom-targets.js";
import {
  bloomDimensions,
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
  ]) {
    assert.throws(() => b.configure(patch), RangeError);
    assert.equal(b.settings, before);
  }
  assert.equal(b.ensure(), false);
  const dark = b.background.slice();
  b.configure({ exposure: 2 });
  b.background.forEach((v, i) => assert.ok(v > dark[i]));
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
  assert.equal(bloomStorage(1, 1, [{ width: 1, height: 1 }], 4), 68);
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
  for (const stage of [1, 2, 5, 12]) {
    const { gl, counts } = targetGL(stage);
    assert.throws(() => new BloomTargets(gl, 512, 384, "low"), /incomplete/);
    assert.deepEqual(counts, {
      textures: 0,
      framebuffers: 0,
      renderbuffers: 0,
    });
  }
  const { gl, counts } = targetGL();
  const t = new BloomTargets(gl, 512, 384, "low");
  assert.equal(t.samples, 4);
  assert.ok(counts.textures > 2);
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
  const b = new Bloom(
    { gl, stats: { programs: 0 }, canvas: { width: 320, height: 240 } },
    { mode: "low" },
  );
  assert.equal(b.ensure(), false);
  assert.equal(b.ensure(), false);
  assert.equal(calls, 1);
  assert.match(b.inspect().failure, /HDR/);
  assert.deepEqual(counts, { textures: 0, framebuffers: 0, renderbuffers: 0 });
  b.configure({ strength: 0.7 });
  assert.equal(b.ensure(), false);
  assert.equal(calls, 2);
  b.dispose();
});
