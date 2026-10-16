/** Basement / one HDR scene and bounded bloom pyramid. Owns every GL target handle.
 * Construction is transactional; even refusal midway through allocation cleans partial work. */
import { bloomDimensions, bloomStorage } from "./bloom-settings.js";
export class BloomTargets {
  /** Require float colour and shared multisample support to preserve architectural AA. */
  constructor(gl, width, height, mode) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.mode = mode;
    this.textures = [];
    this.framebuffers = [];
    this.renderbuffers = [];
    this.disposed = false;
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
      const dimensions = bloomDimensions(width, height, mode);
      this.down = dimensions.map((d) => this.target(d.width, d.height));
      this.up = dimensions
        .slice(0, -1)
        .map((d) => this.target(d.width, d.height));
      this.bytes = bloomStorage(width, height, dimensions, this.samples);
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }
  /** Record immediately after allocation, before storage/attachment calls can fail. */
  framebuffer() {
    const f = this.gl.createFramebuffer();
    if (!f) throw new Error("HDR framebuffer allocation failed");
    this.framebuffers.push(f);
    return f;
  }
  /** Immutable one-level storage; float colour is linear-filtered and depth is nearest-filtered. */
  texture(format, width, height, filter) {
    const gl = this.gl,
      t = gl.createTexture();
    if (!t) throw new Error("HDR texture allocation failed");
    this.textures.push(t);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  /** No depth on the reduction pyramid; only the resolved scene supports guide depth. */
  target(width, height, depth = false) {
    const gl = this.gl,
      framebuffer = this.framebuffer(),
      texture = this.texture(gl.RGBA16F, width, height, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    const result = { framebuffer, texture, width, height };
    if (depth) {
      result.depth = this.texture(
        gl.DEPTH_COMPONENT24,
        width,
        height,
        gl.NEAREST,
      );
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D,
        result.depth,
        0,
      );
    }
    this.check();
    return result;
  }
  /** Check each complete attachment set before publishing this owned target group. */
  check() {
    if (
      this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !==
      this.gl.FRAMEBUFFER_COMPLETE
    )
      throw new Error("HDR framebuffer is incomplete");
  }
  /** Deletion is idempotent, including partially constructed targets. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const f of this.framebuffers) gl.deleteFramebuffer(f);
    for (const t of this.textures) gl.deleteTexture(t);
    for (const r of this.renderbuffers) gl.deleteRenderbuffer(r);
    this.framebuffers = [];
    this.textures = [];
    this.renderbuffers = [];
  }
}
