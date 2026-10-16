/** Basement / transactional float-colour target allocation. Each owner records handles
 * before storage calls, so partial construction and normal disposal share one cleanup path. */
export class FloatTargets {
  constructor(gl) {
    this.gl = gl;
    this.textures = [];
    this.framebuffers = [];
    this.renderbuffers = [];
    this.disposed = false;
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
