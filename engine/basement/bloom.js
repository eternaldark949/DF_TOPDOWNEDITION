/** Basement / renderer-owned HDR bloom. The existing renderer submits all passes.
 * Default is off and allocation-free. Unsupported HDR retains the antialiased direct path.
 * No scene/world references are retained, no independent frame loop or temporal history. */
import { bloomSettings, BLOOM_BACKGROUND } from "./bloom-settings.js";
import { BloomTargets } from "./bloom-targets.js";
import { createProgram } from "./gl-program.js";
import {
  BLOOM_VERTEX,
  BLOOM_DOWN,
  BLOOM_UP,
  BLOOM_COMPOSITE,
} from "./bloom-shaders.js";
export class Bloom {
  /** Retain settings only at construction; even enabled quality waits for an actual batch draw. */
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.disposed = false;
    this.settings = bloomSettings(options);
    this.background = new Float32Array(3);
    this.updateExposure();
    this.targets = null;
    this.programs = [];
    this.failure = null;
    this.ready = false;
    this.passes = 0;
  }
  /** Artist changes reuse storage; only size/quality changes replace targets. Explicit configure retries failures. */
  configure(patch) {
    if (this.disposed) throw new Error("Bloom is disposed");
    const next = bloomSettings(patch, this.settings);
    if (next.mode !== this.settings.mode) this.releaseTargets();
    this.settings = next;
    this.updateExposure();
    this.failure = null;
    if (next.mode === "off") this.release();
  }
  /** Recompute direct clear colour only when settings change, keeping exposure consistent with HDR. */
  updateExposure() {
    for (let i = 0; i < 3; i++)
      this.background[i] = Math.pow(
        1 - Math.exp(-BLOOM_BACKGROUND[i] * this.settings.exposure),
        1 / 2.2,
      );
  }
  /** Programs and immutable targets are lazy; failure is latched until configure/restore. */
  ensure() {
    const r = this.renderer,
      gl = r.gl,
      s = this.settings,
      w = r.canvas.width,
      h = r.canvas.height;
    this.ready = false;
    this.passes = 0;
    if (this.disposed || s.mode === "off" || this.failure) return false;
    try {
      if (
        this.targets &&
        (this.targets.width !== w ||
          this.targets.height !== h ||
          this.targets.mode !== s.mode)
      )
        this.releaseTargets();
      if (!this.targets) this.targets = new BloomTargets(gl, w, h, s.mode);
      if (!this.programs.length) {
        for (const [fragment, names] of [
          [BLOOM_DOWN, ["uSource", "uExtract", "uThreshold"]],
          [BLOOM_UP, ["uFine", "uCoarse", "uSpread"]],
          [BLOOM_COMPOSITE, ["uScene", "uBloom", "uDepth", "uFinish"]],
        ]) {
          const program = createProgram(gl, BLOOM_VERTEX, fragment);
          const owned = { program, uniforms: {} };
          this.programs.push(owned);
          r.stats.programs++;
          owned.uniforms = Object.fromEntries(
            names.map((n) => [n, gl.getUniformLocation(program, n)]),
          );
        }
      }
      this.ready = true;
      return true;
    } catch (error) {
      this.failure = error.message;
      this.release();
      return false;
    }
  }
  /** Called after AO/shadows restore their temporary bindings and before the forward material pass. */
  begin() {
    const gl = this.renderer.gl,
      t = this.targets;
    if (!this.ready) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.multisample);
    gl.viewport(0, 0, t.width, t.height);
    // Same background as direct rendering at default exposure, converted once to scene-linear values.
    gl.clearColor(...BLOOM_BACKGROUND, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
  /** Sampler-unit bindings are local to post passes; Renderer restores the active unit afterward. */
  texture(unit, handle) {
    const gl = this.renderer.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, handle);
  }
  /** Count real fullscreen draws alongside existing renderer submission counters. */
  submit(target) {
    const r = this.renderer,
      gl = r.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    gl.viewport(
      0,
      0,
      target?.width ?? r.canvas.width,
      target?.height ?? r.canvas.height,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.passes++;
    r.stats.draws++;
    r.totals.draws++;
  }
  /** Resolve MSAA colour/depth, reduce bright energy, reconstruct broad scales, then encode once. */
  finish() {
    if (!this.ready) return;
    const r = this.renderer,
      gl = r.gl,
      t = this.targets,
      s = this.settings;
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.multisample);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.scene.framebuffer);
    gl.blitFramebuffer(
      0,
      0,
      t.width,
      t.height,
      0,
      0,
      t.width,
      t.height,
      gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    const down = this.programs[0],
      up = this.programs[1],
      composite = this.programs[2];
    let source = t.scene;
    // Zero strength retains the HDR reference but skips every pyramid submission.
    if (s.strength > 0) {
      gl.useProgram(down.program);
      gl.uniform1i(down.uniforms.uSource, 0);
      gl.uniform2f(down.uniforms.uThreshold, s.threshold, s.knee);
      for (let i = 0; i < t.down.length; i++) {
        gl.uniform1i(down.uniforms.uExtract, i === 0 ? 1 : 0);
        this.texture(0, source.texture);
        this.submit(t.down[i]);
        source = t.down[i];
      }
      gl.useProgram(up.program);
      gl.uniform1i(up.uniforms.uFine, 0);
      gl.uniform1i(up.uniforms.uCoarse, 1);
      gl.uniform2f(up.uniforms.uSpread, s.radius, s.scatter);
      for (let i = t.down.length - 2; i >= 0; i--) {
        this.texture(0, t.down[i].texture);
        this.texture(1, source.texture);
        this.submit(t.up[i]);
        source = t.up[i];
      }
    }
    gl.useProgram(composite.program);
    gl.uniform1i(composite.uniforms.uScene, 0);
    gl.uniform1i(composite.uniforms.uBloom, 1);
    gl.uniform1i(composite.uniforms.uDepth, 2);
    gl.uniform2f(composite.uniforms.uFinish, s.strength, s.exposure);
    this.texture(0, t.scene.texture);
    this.texture(1, source.texture);
    this.texture(2, t.scene.depth);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.depthFunc(gl.ALWAYS);
    this.submit(null);
    gl.depthFunc(gl.LEQUAL);
  }
  /** Renderer calls this even after exceptions; overlays and subsequent frames see normal state. */
  reset() {
    const r = this.renderer,
      gl = r.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.viewport(0, 0, r.canvas.width, r.canvas.height);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
  }
  /** Estimates are separate from buffer counts and include MSAA renderbuffers, unlike default-FBO estimates. */
  inspect() {
    const t = this.targets;
    return {
      ...this.settings,
      effectiveMode: this.ready ? this.settings.mode : "off",
      failure: this.failure,
      passes: this.passes,
      width: t?.width ?? 0,
      height: t?.height ?? 0,
      samples: t?.samples ?? 0,
      levels: t?.down.length ?? 0,
      targetBytes: t?.bytes ?? 0,
      textures: t?.textures.length ?? 0,
      framebuffers: t?.framebuffers.length ?? 0,
      renderbuffers: t?.renderbuffers.length ?? 0,
      programs: this.programs.length,
      accounting:
        "Estimated RGBA16F (8) and padded depth24 (4) bytes/pixel, including owned MSAA samples; excludes driver overhead and default framebuffer.",
    };
  }
  releaseTargets() {
    this.targets?.dispose();
    this.targets = null;
    this.ready = false;
  }
  release() {
    this.passes = 0;
    this.releaseTargets();
    for (const p of this.programs) {
      this.renderer.gl.deleteProgram(p.program);
      this.renderer.stats.programs--;
    }
    this.programs = [];
  }
  /** Lost-context handles are invalid already; no deletion or counter adjustment against the new context. */
  invalidate() {
    this.targets = null;
    this.programs = [];
    this.failure = null;
    this.ready = false;
    this.passes = 0;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
  }
}
