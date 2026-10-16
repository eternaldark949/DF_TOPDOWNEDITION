/** Basement / shared image presentation: HDR scene ownership, resolve, exposure and final
 * composition. Effects borrow linear scene colour; this stage knows no effect or game type. */
import { HdrTargets } from "./hdr-targets.js";
import { createProgram } from "./gl-program.js";
import { FULLSCREEN_VERTEX } from "./fullscreen-shaders.js";
import { PRESENT_COMPOSITE } from "./presentation-shaders.js";
const BACKGROUND = Object.freeze([
  0.00011607027229163823, 0.00013073244809242254, 0.0005666143501070634,
]);
/** HDR can be explicitly requested without bloom; auto requests HDR when an effect needs it. */
export function presentationSettings(
  patch = {},
  previous = { mode: "auto", exposure: 1.25 },
) {
  const s = { ...previous, ...patch };
  if (
    Object.keys(patch).some((k) => !["mode", "exposure"].includes(k)) ||
    !["auto", "direct", "hdr"].includes(s.mode) ||
    !Number.isFinite(s.exposure) ||
    s.exposure < 0.05 ||
    s.exposure > 8
  )
    throw new RangeError("Invalid presentation mode/exposure");
  return Object.freeze(s);
}
export class Presentation {
  /** Inert until rendering needs HDR; exposure also works on the direct forward path. */
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.settings = presentationSettings(options);
    this.background = new Float32Array(3);
    this.updateExposure();
    this.targets = null;
    this.program = null;
    this.uniforms = null;
    this.failure = null;
    this.ready = false;
    this.passes = 0;
    this.disposed = false;
  }
  /** Apply validated display settings; an explicit edit also permits retry after HDR refusal. */
  configure(patch) {
    if (this.disposed) throw new Error("Presentation is disposed");
    this.settings = presentationSettings(patch, this.settings);
    this.updateExposure();
    this.failure = null;
    if (this.settings.mode === "direct") this.release();
  }
  /** Match the direct clear colour to the linear HDR background after exposure/encoding. */
  updateExposure() {
    for (let i = 0; i < 3; i++)
      this.background[i] = Math.pow(
        1 - Math.exp(-BACKGROUND[i] * this.settings.exposure),
        1 / 2.2,
      );
  }
  /** A failed allocation is retried only on explicit configuration or context restoration. */
  prepare(effectNeedsHDR) {
    const r = this.renderer,
      gl = r.gl;
    this.passes = 0;
    this.ready = false;
    if (
      this.settings.mode === "direct" ||
      (this.settings.mode === "auto" && !effectNeedsHDR)
    ) {
      this.release();
      return false;
    }
    if (this.disposed || this.failure) return false;
    try {
      if (
        this.targets &&
        (this.targets.width !== r.canvas.width ||
          this.targets.height !== r.canvas.height)
      ) {
        this.targets.dispose();
        this.targets = null;
      }
      if (!this.targets)
        this.targets = new HdrTargets(gl, r.canvas.width, r.canvas.height);
      if (!this.program) {
        this.program = createProgram(gl, FULLSCREEN_VERTEX, PRESENT_COMPOSITE);
        r.stats.programs++;
        this.uniforms = Object.fromEntries(
          ["uScene", "uAdditive", "uDepth", "uFinish"].map((n) => [
            n,
            gl.getUniformLocation(this.program, n),
          ]),
        );
      }
      this.ready = true;
      return true;
    } catch (error) {
      this.failure = error.message;
      this.release();
      return false;
    }
  }
  /** Bind and clear the scene target before the ordinary forward geometry pass. */
  begin() {
    if (!this.ready) return;
    const gl = this.renderer.gl,
      t = this.targets;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.multisample);
    gl.viewport(0, 0, t.width, t.height);
    gl.clearColor(...BACKGROUND, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
  /** Resolve once regardless of the number of effects that later borrow this colour/depth. */
  resolve() {
    const gl = this.renderer.gl,
      t = this.targets;
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
  }
  /** Current compositor accepts one additive radiance texture, not an effect implementation. */
  compose(additive = null, strength = 0) {
    const r = this.renderer,
      gl = r.gl,
      t = this.targets,
      u = this.uniforms;
    gl.useProgram(this.program);
    gl.uniform1i(u.uScene, 0);
    gl.uniform1i(u.uAdditive, 1);
    gl.uniform1i(u.uDepth, 2);
    gl.uniform2f(u.uFinish, additive ? strength : 0, this.settings.exposure);
    for (const [unit, texture] of [
      [0, t.scene.texture],
      [1, additive ?? t.scene.texture],
      [2, t.scene.depth],
    ]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, r.canvas.width, r.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.depthFunc(gl.ALWAYS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthFunc(gl.LEQUAL);
    this.passes++;
    r.stats.draws++;
    r.totals.draws++;
  }
  /** Restore state even if an effect/submission throws, before another host frame can run. */
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
  /** Snapshot only shared-stage resources; optional filters report their own budgets. */
  inspect() {
    const t = this.targets;
    return {
      ...this.settings,
      effectiveMode: this.ready ? "hdr" : "direct",
      failure: this.failure,
      passes: this.passes,
      width: t?.width ?? 0,
      height: t?.height ?? 0,
      samples: t?.samples ?? 0,
      targetBytes: t?.bytes ?? 0,
      textures: t?.textures.length ?? 0,
      framebuffers: t?.framebuffers.length ?? 0,
      renderbuffers: t?.renderbuffers.length ?? 0,
      programs: this.program ? 1 : 0,
      accounting:
        "Owned scene RGBA16F/depth24 including MSAA; effect targets are reported separately.",
    };
  }
  /** Release owned GL handles while retaining configuration and the failure latch. */
  release() {
    this.targets?.dispose();
    this.targets = null;
    if (this.program) {
      this.renderer.gl.deleteProgram(this.program);
      this.renderer.stats.programs--;
    }
    this.program = null;
    this.uniforms = null;
    this.ready = false;
    this.passes = 0;
  }
  /** Context loss invalidates handles without issuing deletes into the lost context. */
  invalidate() {
    this.targets = null;
    this.program = null;
    this.uniforms = null;
    this.failure = null;
    this.ready = false;
    this.passes = 0;
  }
  /** The renderer owns this stage and closes it exactly once. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
  }
}
