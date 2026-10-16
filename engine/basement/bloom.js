/** Basement / bloom filter. Borrows resolved scene colour during render; owns only its
 * reduction/reconstruction pyramid and programs. No HDR scene, exposure, compositor or scheduler. */
import { bloomSettings } from "./bloom-settings.js";
import { BloomTargets } from "./bloom-targets.js";
import { createProgram } from "./gl-program.js";
import { FULLSCREEN_VERTEX } from "./fullscreen-shaders.js";
import { BLOOM_DOWN, BLOOM_UP } from "./bloom-shaders.js";
export class Bloom {
  /** No targets/programs are allocated until a nonzero enabled filter is submitted. */
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.settings = bloomSettings(options);
    this.targets = null;
    this.programs = [];
    this.failure = null;
    this.ready = false;
    this.passes = 0;
    this.disposed = false;
  }
  /** Validated effect settings have no authority over scene exposure or frame targets. */
  configure(patch) {
    if (this.disposed) throw new Error("Bloom is disposed");
    const next = bloomSettings(patch, this.settings);
    if (next.mode !== this.settings.mode) this.releaseTargets();
    this.settings = next;
    this.failure = null;
    if (next.mode === "off") this.release();
  }
  /** Lazily allocate a quality-sized pyramid; any partial failure releases the entire filter. */
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
      if (!this.programs.length)
        for (const [fragment, names] of [
          [BLOOM_DOWN, ["uSource", "uExtract", "uThreshold", "uTinyHaze"]],
          [BLOOM_UP, ["uFine", "uCoarse", "uSpread", "uHazeSource", "uHaze"]],
        ]) {
          const program = createProgram(gl, FULLSCREEN_VERTEX, fragment),
            owned = { program, uniforms: {} };
          this.programs.push(owned);
          r.stats.programs++;
          owned.uniforms = Object.fromEntries(
            names.map((n) => [n, gl.getUniformLocation(program, n)]),
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
  /** Bind a borrowed input or owned intermediate to a filter sampler. */
  texture(unit, handle) {
    const gl = this.renderer.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, handle);
  }
  /** One fullscreen triangle updates an owned intermediate and submission accounting. */
  submit(target) {
    const r = this.renderer,
      gl = r.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.passes++;
    r.stats.draws++;
    r.totals.draws++;
  }
  /** Return a borrowed filtered texture, valid until reconfigure/resize/dispose. Never retain the source. */
  render(sceneTexture) {
    this.passes = 0;
    if (this.settings.strength === 0 || !this.ensure()) return null;
    const gl = this.renderer.gl,
      t = this.targets,
      s = this.settings,
      down = this.programs[0],
      up = this.programs[1];
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    let source = { texture: sceneTexture };
    gl.useProgram(down.program);
    gl.uniform1i(down.uniforms.uSource, 0);
    gl.uniform1f(down.uniforms.uTinyHaze, t.down.length === 1 ? s.haze : 0);
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
    gl.uniform1i(up.uniforms.uHazeSource, 2);
    // The smallest reduction already belongs to this filter. Haze borrows it directly.
    this.texture(2, t.down[t.down.length - 1].texture);
    gl.uniform2f(up.uniforms.uSpread, s.radius, s.scatter);
    for (let i = t.down.length - 2; i >= 0; i--) {
      gl.uniform1f(up.uniforms.uHaze, i === 0 ? s.haze : 0);
      this.texture(0, t.down[i].texture);
      this.texture(1, source.texture);
      this.submit(t.up[i]);
      source = t.up[i];
    }

    return source.texture;
  }
  /** Presentation failure prevents filtering; release any old effect targets without latching a false effect failure. */
  deactivate() {
    if (this.targets || this.programs.length) this.release();
    else {
      this.ready = false;
      this.passes = 0;
    }
  }
  /** Filter-only diagnostics deliberately exclude scene, resolve and final composition. */
  inspect() {
    const t = this.targets;
    return {
      ...this.settings,
      effectiveMode: this.ready ? this.settings.mode : "off",
      failure: this.failure,
      passes: this.passes,
      levels: t?.down.length ?? 0,
      width: t?.width ?? 0,
      height: t?.height ?? 0,
      targetBytes: t?.bytes ?? 0,
      textures: t?.textures.length ?? 0,
      framebuffers: t?.framebuffers.length ?? 0,
      programs: this.programs.length,
      accounting:
        "Bloom pyramid RGBA16F only; scene/MSAA/depth storage is reported by Presentation.",
    };
  }
  /** Quality/size changes discard textures but may reuse compiled filter programs. */
  releaseTargets() {
    this.targets?.dispose();
    this.targets = null;
    this.ready = false;
  }
  /** Off, failure and disposal share the same complete GL cleanup path. */
  release() {
    this.passes = 0;
    this.releaseTargets();
    for (const p of this.programs) {
      this.renderer.gl.deleteProgram(p.program);
      this.renderer.stats.programs--;
    }
    this.programs = [];
  }
  /** Forget lost-context handles; normal rendering recreates them lazily. */
  invalidate() {
    this.targets = null;
    this.programs = [];
    this.failure = null;
    this.ready = false;
    this.passes = 0;
  }
  /** Idempotent owner shutdown; configuration is no longer editable afterwards. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
  }
}
