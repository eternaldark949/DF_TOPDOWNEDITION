/** Basement / antialiased HDR scene and resolved depth. Independent of every post effect. */
import { FloatTargets } from "./float-targets.js";
export class HdrTargets extends FloatTargets {
  constructor(gl, width, height) {
    super(gl);
    this.width = width;
    this.height = height;
    try {
      if (!gl.getExtension("EXT_color_buffer_float"))
        throw new Error("HDR colour targets are unavailable");
      const colour = Array.from(
          gl.getInternalformatParameter(
            gl.RENDERBUFFER,
            gl.RGBA16F,
            gl.SAMPLES,
          ) ?? [],
        ),
        depth = Array.from(
          gl.getInternalformatParameter(
            gl.RENDERBUFFER,
            gl.DEPTH_COMPONENT24,
            gl.SAMPLES,
          ) ?? [],
        );
      this.samples = Math.max(
        0,
        ...colour.filter((n) => n >= 2 && n <= 4 && depth.includes(n)),
      );
      if (!this.samples)
        throw new Error("Antialiased HDR targets are unavailable");
      this.scene = this.target(width, height, true);
      this.multisample = this.framebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.multisample);
      for (const [format, attachment] of [
        [gl.RGBA16F, gl.COLOR_ATTACHMENT0],
        [gl.DEPTH_COMPONENT24, gl.DEPTH_ATTACHMENT],
      ]) {
        const rb = gl.createRenderbuffer();
        if (!rb) throw new Error("HDR renderbuffer allocation failed");
        this.renderbuffers.push(rb);
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorageMultisample(
          gl.RENDERBUFFER,
          this.samples,
          format,
          width,
          height,
        );
        gl.framebufferRenderbuffer(
          gl.FRAMEBUFFER,
          attachment,
          gl.RENDERBUFFER,
          rb,
        );
      }
      this.check();
      this.bytes = width * height * 12 * (this.samples + 1);
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }
}
