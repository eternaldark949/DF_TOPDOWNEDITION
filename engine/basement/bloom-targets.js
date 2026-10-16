/** Basement / effect-local bloom pyramid. Scene colour, depth and MSAA belong to Presentation. */
import { FloatTargets } from "./float-targets.js";
import { bloomDimensions, bloomStorage } from "./bloom-settings.js";
export class BloomTargets extends FloatTargets {
  constructor(gl, width, height, mode) {
    super(gl);
    this.width = width;
    this.height = height;
    this.mode = mode;
    try {
      const dimensions = bloomDimensions(width, height, mode);
      this.down = dimensions.map((d) => this.target(d.width, d.height));
      this.up = dimensions
        .slice(0, -1)
        .map((d) => this.target(d.width, d.height));
      this.bytes = bloomStorage(dimensions);
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }
}
